// API utilities for ClawSchool
import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema, ZodError } from 'zod';
import {
  authenticateRequest,
  checkRateLimit,
  securityHeaders,
  auditLog,
  TokenPayload,
} from './security';

// ============================================
// TYPES
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Array<{ field: string; message: string }>;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };
}

export interface ApiContext {
  user: TokenPayload | null;
  request: NextRequest;
}

type ApiHandler<T> = (
  context: ApiContext,
  body?: unknown
) => Promise<ApiResponse<T>>;

// ============================================
// RESPONSE HELPERS
// ============================================

function createResponse<T>(
  data: ApiResponse<T>,
  status: number = 200
): NextResponse {
  const response = NextResponse.json(data, { status });

  // Add security headers
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

export function successResponse<T>(
  data: T,
  meta?: ApiResponse['meta']
): ApiResponse<T> {
  return { success: true, data, meta };
}

export function errorResponse(
  error: string,
  errors?: ApiResponse['errors']
): ApiResponse {
  return { success: false, error, errors };
}

// ============================================
// VALIDATION
// ============================================

export function validateBody<T>(
  body: unknown,
  schema: ZodSchema<T>
): { success: true; data: T } | { success: false; errors: ApiResponse['errors'] } {
  try {
    const data = schema.parse(body);
    return { success: true, data };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        success: false,
        errors: err.issues.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      };
    }
    return {
      success: false,
      errors: [{ field: 'unknown', message: 'Validation failed' }],
    };
  }
}

// ============================================
// API HANDLER WRAPPER
// ============================================

export interface HandlerOptions {
  requireAuth?: boolean;
  requireAgent?: boolean;
  requireAdmin?: boolean;
  rateLimit?: boolean;
  auditAction?: string;
}

export function apiHandler<T>(
  handler: ApiHandler<T>,
  options: HandlerOptions = {}
) {
  const {
    requireAuth = false,
    requireAgent = false,
    requireAdmin = false,
    rateLimit = true,
    auditAction,
  } = options;

  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      // Rate limiting
      if (rateLimit) {
        const identifier =
          request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip') ||
          'anonymous';
        const { allowed, remaining, resetAt } = await checkRateLimit(identifier);

        if (!allowed) {
          const response = createResponse(
            errorResponse('Rate limit exceeded. Please try again later.'),
            429
          );
          response.headers.set('X-RateLimit-Remaining', '0');
          response.headers.set('X-RateLimit-Reset', resetAt.toISOString());
          return response;
        }
      }

      // Authentication
      let user: TokenPayload | null = null;
      if (requireAuth || requireAgent || requireAdmin) {
        const authResult = await authenticateRequest(request);

        if (!authResult.success) {
          return createResponse(
            errorResponse(authResult.error || 'Authentication required'),
            401
          );
        }

        user = authResult.user || null;

        // Check agent requirement
        if (requireAgent && !user?.isAgent) {
          return createResponse(
            errorResponse('Agent access required'),
            403
          );
        }

        // Check admin requirement
        if (requireAdmin && user?.role !== 'ADMIN') {
          return createResponse(
            errorResponse('Admin access required'),
            403
          );
        }
      } else {
        // Try to authenticate but don't require it
        const authResult = await authenticateRequest(request);
        if (authResult.success) {
          user = authResult.user || null;
        }
      }

      // Parse body for POST/PUT/PATCH
      let body: unknown;
      if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
        try {
          body = await request.json();
        } catch {
          body = null;
        }
      }

      // Execute handler
      const result = await handler({ user, request }, body);

      // Audit logging
      if (auditAction && user) {
        await auditLog(
          auditAction,
          request.nextUrl.pathname,
          null,
          user.userId,
          { method: request.method, success: result.success },
          request
        );
      }

      // Return response
      const status = result.success ? 200 : 400;
      return createResponse(result, status);
    } catch (error) {
      console.error('API Error:', error);

      // Don't leak error details in production
      const message =
        process.env.NODE_ENV === 'development'
          ? (error as Error).message
          : 'An unexpected error occurred';

      return createResponse(errorResponse(message), 500);
    }
  };
}

// ============================================
// PAGINATION HELPERS
// ============================================

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export function parsePagination(
  searchParams: URLSearchParams
): PaginationParams {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get('limit') || '20', 10))
  );
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

export function paginationMeta(
  page: number,
  limit: number,
  total: number
): ApiResponse['meta'] {
  return {
    page,
    limit,
    total,
    hasMore: page * limit < total,
  };
}
