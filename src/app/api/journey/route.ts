// Journey Logging API - For agents to log their learning experiences
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  apiHandler,
  validateBody,
  successResponse,
  errorResponse,
  parsePagination,
  paginationMeta,
} from '@/lib/api';
import { auditLog, sanitizeInput } from '@/lib/security';

const logJourneySchema = z.object({
  taskType: z.string().min(1).max(100),
  action: z.string().min(1).max(1000),
  outcome: z.enum(['SUCCESS', 'FAILURE', 'PARTIAL', 'LEARNING']),
  insight: z.string().max(5000).optional(),
  errorLog: z.string().max(10000).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  duration: z.number().int().positive().optional(),
  tokensUsed: z.number().int().positive().optional(),
  isPublic: z.boolean().optional(),
});

// GET /api/journey - Get journey logs for the authenticated user/agent
export const GET = apiHandler(
  async ({ user, request }) => {
    if (!user) {
      return errorResponse('Authentication required');
    }

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = parsePagination(searchParams);

    // Filters
    const taskType = searchParams.get('taskType');
    const outcome = searchParams.get('outcome');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build where clause
    const where: Record<string, unknown> = { userId: user.userId };

    if (taskType) where.taskType = taskType;
    if (outcome) where.outcome = outcome;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) (where.createdAt as Record<string, Date>).gte = new Date(startDate);
      if (endDate) (where.createdAt as Record<string, Date>).lte = new Date(endDate);
    }

    const [logs, total] = await Promise.all([
      db.journeyLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          taskType: true,
          action: true,
          outcome: true,
          insight: true,
          duration: true,
          tokensUsed: true,
          isPublic: true,
          createdAt: true,
        },
      }),
      db.journeyLog.count({ where }),
    ]);

    return successResponse(logs, paginationMeta(page, limit, total));
  },
  { requireAuth: true }
);

// POST /api/journey - Log a new journey entry
export const POST = apiHandler(
  async ({ user, request }, body) => {
    if (!user) {
      return errorResponse('Authentication required');
    }

    const validation = validateBody(body, logJourneySchema);
    if (!validation.success) {
      return errorResponse('Validation failed', validation.errors);
    }

    const data = validation.data;

    // Sanitize text inputs
    const sanitizedData = {
      ...data,
      action: sanitizeInput(data.action),
      insight: data.insight ? sanitizeInput(data.insight) : undefined,
      errorLog: data.errorLog ? sanitizeInput(data.errorLog) : undefined,
    };

    // Create journey log
    const log = await db.journeyLog.create({
      data: {
        userId: user.userId,
        taskType: sanitizedData.taskType,
        action: sanitizedData.action,
        outcome: sanitizedData.outcome,
        insight: sanitizedData.insight,
        errorLog: sanitizedData.errorLog,
        ...(sanitizedData.context && { context: JSON.parse(JSON.stringify(sanitizedData.context)) }),
        duration: sanitizedData.duration,
        tokensUsed: sanitizedData.tokensUsed,
        isPublic: sanitizedData.isPublic || false,
        sanitized: false,
      },
    });

    await auditLog(
      'journey_log',
      'journeyLog',
      log.id,
      user.userId,
      { taskType: data.taskType, outcome: data.outcome },
      request
    );

    return successResponse({
      id: log.id,
      taskType: log.taskType,
      outcome: log.outcome,
      createdAt: log.createdAt,
    });
  },
  { requireAuth: true }
);
