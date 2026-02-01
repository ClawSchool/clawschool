// Security utilities for ClawSchool
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { db } from './db';

// ============================================
// CONFIGURATION
// ============================================

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';
const JWT_EXPIRES_IN = '7d';
const BCRYPT_ROUNDS = 12;
const API_KEY_PREFIX = 'clawschool_';
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Rate limiting config
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100;

// ============================================
// PASSWORD HASHING
// ============================================

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ============================================
// API KEY MANAGEMENT
// ============================================

export function generateApiKey(): { key: string; hash: string } {
  const keyBytes = randomBytes(32);
  const key = API_KEY_PREFIX + keyBytes.toString('base64url');
  const hash = createHash('sha256').update(key).digest('hex');
  return { key, hash };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function verifyApiKey(providedKey: string, storedHash: string): boolean {
  const providedHash = hashApiKey(providedKey);
  try {
    return timingSafeEqual(
      Buffer.from(providedHash, 'hex'),
      Buffer.from(storedHash, 'hex')
    );
  } catch {
    return false;
  }
}

// ============================================
// JWT TOKENS
// ============================================

export interface TokenPayload {
  userId: string;
  role: string;
  isAgent: boolean;
  agentId?: string;
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

export interface AuthResult {
  success: boolean;
  user?: TokenPayload;
  error?: string;
}

export async function authenticateRequest(
  request: NextRequest
): Promise<AuthResult> {
  // Check for API key first (for agents)
  const apiKey = request.headers.get('x-api-key');
  if (apiKey) {
    return authenticateApiKey(apiKey);
  }

  // Check for JWT token
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (payload) {
      return { success: true, user: payload };
    }
    return { success: false, error: 'Invalid or expired token' };
  }

  // Check for session cookie
  const sessionToken = request.cookies.get('session')?.value;
  if (sessionToken) {
    const payload = verifyToken(sessionToken);
    if (payload) {
      return { success: true, user: payload };
    }
  }

  return { success: false, error: 'Authentication required' };
}

async function authenticateApiKey(apiKey: string): Promise<AuthResult> {
  const hash = hashApiKey(apiKey);

  const user = await db.user.findFirst({
    where: { apiKeyHash: hash },
    select: {
      id: true,
      role: true,
      isAgent: true,
      agentId: true,
      lockedUntil: true,
    },
  });

  if (!user) {
    return { success: false, error: 'Invalid API key' };
  }

  // Check if account is locked
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { success: false, error: 'Account temporarily locked' };
  }

  return {
    success: true,
    user: {
      userId: user.id,
      role: user.role,
      isAgent: user.isAgent,
      agentId: user.agentId || undefined,
    },
  };
}

// ============================================
// RATE LIMITING
// ============================================

export async function checkRateLimit(
  identifier: string
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);

  // Clean up old entries and get/create current
  const rateLimitId = `ratelimit:${identifier}`;

  try {
    const existing = await db.rateLimit.findUnique({
      where: { id: rateLimitId },
    });

    if (!existing || existing.windowStart < windowStart) {
      // Create new window
      await db.rateLimit.upsert({
        where: { id: rateLimitId },
        create: { id: rateLimitId, requests: 1, windowStart: now },
        update: { requests: 1, windowStart: now },
      });
      return {
        allowed: true,
        remaining: RATE_LIMIT_MAX_REQUESTS - 1,
        resetAt: new Date(now.getTime() + RATE_LIMIT_WINDOW_MS),
      };
    }

    if (existing.requests >= RATE_LIMIT_MAX_REQUESTS) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(existing.windowStart.getTime() + RATE_LIMIT_WINDOW_MS),
      };
    }

    // Increment counter
    await db.rateLimit.update({
      where: { id: rateLimitId },
      data: { requests: { increment: 1 } },
    });

    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_REQUESTS - existing.requests - 1,
      resetAt: new Date(existing.windowStart.getTime() + RATE_LIMIT_WINDOW_MS),
    };
  } catch {
    // On error, allow the request but log it
    console.error('Rate limit check failed');
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_REQUESTS,
      resetAt: new Date(now.getTime() + RATE_LIMIT_WINDOW_MS),
    };
  }
}

// ============================================
// ACCOUNT SECURITY
// ============================================

export async function recordFailedLogin(userId: string): Promise<boolean> {
  const user = await db.user.update({
    where: { id: userId },
    data: {
      failedLogins: { increment: 1 },
    },
    select: { failedLogins: true },
  });

  if (user.failedLogins >= MAX_FAILED_LOGINS) {
    await db.user.update({
      where: { id: userId },
      data: {
        lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS),
      },
    });
    return true; // Account locked
  }
  return false;
}

export async function clearFailedLogins(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      failedLogins: 0,
      lockedUntil: null,
      lastLogin: new Date(),
    },
  });
}

// ============================================
// INPUT SANITIZATION
// ============================================

export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove potential HTML
    .trim()
    .slice(0, 10000); // Limit length
}

export function sanitizeForLog(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['password', 'apiKey', 'token', 'secret', 'credential'];
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLog(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ============================================
// AUDIT LOGGING
// ============================================

export async function auditLog(
  action: string,
  resource: string,
  resourceId: string | null,
  userId: string | null,
  details?: Record<string, unknown>,
  request?: NextRequest
): Promise<void> {
  try {
    const sanitizedDetails = details ? JSON.parse(JSON.stringify(sanitizeForLog(details))) : undefined;
    await db.auditLog.create({
      data: {
        action,
        resource,
        resourceId,
        userId,
        ...(sanitizedDetails && { details: sanitizedDetails }),
        ipAddress: request?.headers.get('x-forwarded-for') ||
                   request?.headers.get('x-real-ip') ||
                   'unknown',
        userAgent: request?.headers.get('user-agent') || 'unknown',
      },
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}

// ============================================
// SECURITY HEADERS
// ============================================

export const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
};
