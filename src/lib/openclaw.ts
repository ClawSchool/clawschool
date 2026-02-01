// OpenClaw Integration Layer
// Connects ClawSchool with OpenClaw agents

import { db } from './db';
import { generateApiKey, hashApiKey } from './security';

// ============================================
// TYPES
// ============================================

export interface OpenClawAgent {
  id: string;
  name: string;
  model?: string;
  capabilities: string[];
  status: 'online' | 'offline' | 'busy';
}

export interface JourneyEntry {
  taskType: string;
  action: string;
  outcome: 'SUCCESS' | 'FAILURE' | 'PARTIAL' | 'LEARNING';
  insight?: string;
  errorLog?: string;
  context?: Record<string, unknown>;
  duration?: number;
  tokensUsed?: number;
}

export interface CourseGenerationRequest {
  agentId: string;
  journeyLogIds: string[];
  title: string;
  category: string;
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
  targetAudience?: string;
}

// ============================================
// AGENT REGISTRATION
// ============================================

/**
 * Register a new OpenClaw agent with ClawSchool
 * Returns API credentials for the agent
 */
export async function registerAgent(
  agentId: string,
  name: string,
  capabilities: string[] = []
): Promise<{ userId: string; apiKey: string }> {
  // Check if agent already exists
  const existing = await db.user.findFirst({
    where: { agentId },
  });

  if (existing) {
    throw new Error('Agent already registered');
  }

  // Generate API key for the agent
  const { key: apiKey, hash: apiKeyHash } = generateApiKey();

  // Create agent user
  const user = await db.user.create({
    data: {
      name,
      role: 'AGENT',
      isAgent: true,
      agentId,
      apiKey: apiKey.slice(0, 12) + '...', // Store truncated for display
      apiKeyHash,
    },
  });

  return { userId: user.id, apiKey };
}

/**
 * Rotate an agent's API key
 */
export async function rotateAgentApiKey(
  agentId: string
): Promise<{ apiKey: string }> {
  const agent = await db.user.findFirst({
    where: { agentId, isAgent: true },
  });

  if (!agent) {
    throw new Error('Agent not found');
  }

  const { key: apiKey, hash: apiKeyHash } = generateApiKey();

  await db.user.update({
    where: { id: agent.id },
    data: {
      apiKey: apiKey.slice(0, 12) + '...',
      apiKeyHash,
    },
  });

  return { apiKey };
}

// ============================================
// JOURNEY LOGGING
// ============================================

/**
 * Log an agent's task execution for learning
 */
export async function logJourneyEntry(
  userId: string,
  entry: JourneyEntry
): Promise<string> {
  const log = await db.journeyLog.create({
    data: {
      userId,
      taskType: entry.taskType,
      action: entry.action,
      outcome: entry.outcome,
      insight: entry.insight,
      errorLog: entry.errorLog,
      ...(entry.context && { context: JSON.parse(JSON.stringify(entry.context)) }),
      duration: entry.duration,
      tokensUsed: entry.tokensUsed,
      isPublic: false,
      sanitized: false,
    },
  });

  return log.id;
}

/**
 * Get an agent's journey logs for course generation
 */
export async function getAgentJourney(
  userId: string,
  options: {
    taskType?: string;
    limit?: number;
    onlySuccessful?: boolean;
  } = {}
): Promise<Array<{
  id: string;
  taskType: string;
  action: string;
  outcome: string;
  insight: string | null;
  createdAt: Date;
}>> {
  const where: Record<string, unknown> = { userId };

  if (options.taskType) {
    where.taskType = options.taskType;
  }

  if (options.onlySuccessful) {
    where.outcome = 'SUCCESS';
  }

  return db.journeyLog.findMany({
    where,
    take: options.limit || 100,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      taskType: true,
      action: true,
      outcome: true,
      insight: true,
      createdAt: true,
    },
  });
}

// ============================================
// COURSE GENERATION
// ============================================

/**
 * Generate course structure from journey logs
 * This creates a draft that the agent can refine
 */
export async function generateCourseFromJourney(
  request: CourseGenerationRequest
): Promise<{ courseId: string; slug: string }> {
  // Get the agent user
  const agent = await db.user.findFirst({
    where: { agentId: request.agentId, isAgent: true },
  });

  if (!agent) {
    throw new Error('Agent not found');
  }

  // Get the journey logs
  const logs = await db.journeyLog.findMany({
    where: {
      id: { in: request.journeyLogIds },
      userId: agent.id,
    },
  });

  if (logs.length === 0) {
    throw new Error('No valid journey logs found');
  }

  // Generate a URL-safe slug
  const baseSlug = request.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  // Create the course
  const course = await db.course.create({
    data: {
      slug,
      title: request.title,
      description: `Course generated by agent ${agent.name} based on real-world experience.`,
      creatorId: agent.id,
      category: request.category,
      difficulty: request.difficulty,
      status: 'DRAFT',
      generatedBy: request.agentId,
      sourceJourney: request.journeyLogIds,
      tags: [request.category, request.difficulty.toLowerCase()],
    },
  });

  // Create initial lessons from journey logs
  const lessonsToCreate = logs.map((log, index) => ({
    courseId: course.id,
    title: `Lesson ${index + 1}: ${log.taskType}`,
    content: generateLessonContent(log),
    order: index + 1,
    duration: 5,
  }));

  await db.lesson.createMany({
    data: lessonsToCreate,
  });

  // Update course stats
  await db.course.update({
    where: { id: course.id },
    data: {
      totalLessons: lessonsToCreate.length,
      totalDuration: lessonsToCreate.length * 5,
    },
  });

  return { courseId: course.id, slug };
}

/**
 * Generate lesson content from a journey log
 */
function generateLessonContent(log: {
  taskType: string;
  action: string;
  outcome: string;
  insight: string | null;
  errorLog: string | null;
  context: unknown;
}): string {
  let content = `# ${log.taskType}\n\n`;
  content += `## What I Did\n\n${log.action}\n\n`;

  if (log.insight) {
    content += `## Key Insights\n\n${log.insight}\n\n`;
  }

  if (log.outcome === 'FAILURE' && log.errorLog) {
    content += `## What Went Wrong\n\n${log.errorLog}\n\n`;
    content += `## How to Avoid This\n\n*Lesson learned from failure.*\n\n`;
  }

  if (log.outcome === 'SUCCESS') {
    content += `## Why This Worked\n\n*Successful approach documented.*\n\n`;
  }

  return content;
}

// ============================================
// AGENT MESSAGING
// ============================================

/**
 * Send a message between agents or agent-to-human
 */
export async function sendAgentMessage(
  senderId: string,
  receiverId: string,
  content: string,
  messageType: 'TEXT' | 'COURSE_SUGGESTION' | 'MENTORING_REQUEST' | 'FEEDBACK' = 'TEXT',
  metadata?: Record<string, unknown>
): Promise<string> {
  const message = await db.message.create({
    data: {
      senderId,
      receiverId,
      content,
      messageType,
      ...(metadata && { metadata: JSON.parse(JSON.stringify(metadata)) }),
    },
  });

  return message.id;
}

/**
 * Get unread messages for a user/agent
 */
export async function getUnreadMessages(
  userId: string
): Promise<Array<{
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  messageType: string;
  createdAt: Date;
}>> {
  const messages = await db.message.findMany({
    where: {
      receiverId: userId,
      read: false,
    },
    include: {
      sender: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return messages.map((m) => ({
    id: m.id,
    senderId: m.senderId,
    senderName: m.sender.name,
    content: m.content,
    messageType: m.messageType,
    createdAt: m.createdAt,
  }));
}

// ============================================
// PEER REVIEW SYSTEM
// ============================================

/**
 * Request peer review from other agents
 */
export async function requestPeerReview(
  courseId: string,
  requestingAgentId: string
): Promise<void> {
  // Update course status to REVIEW
  await db.course.update({
    where: { id: courseId },
    data: { status: 'REVIEW' },
  });

  // Find other agents to review
  const otherAgents = await db.user.findMany({
    where: {
      isAgent: true,
      id: { not: requestingAgentId },
    },
    take: 5,
  });

  // Send review requests
  for (const agent of otherAgents) {
    await sendAgentMessage(
      requestingAgentId,
      agent.id,
      `Please review my new course: ${courseId}`,
      'COURSE_SUGGESTION',
      { courseId, action: 'review_request' }
    );
  }
}

/**
 * Submit a peer review
 */
export async function submitPeerReview(
  courseId: string,
  reviewerId: string,
  rating: number,
  suggestions: Record<string, unknown>
): Promise<void> {
  await db.review.create({
    data: {
      courseId,
      userId: reviewerId,
      rating,
      isAgentReview: true,
      suggestions: JSON.parse(JSON.stringify(suggestions)),
    },
  });

  // Check if course has enough reviews to publish
  const reviewCount = await db.review.count({
    where: { courseId, isAgentReview: true },
  });

  if (reviewCount >= 3) {
    // Calculate average rating
    const avgResult = await db.review.aggregate({
      where: { courseId },
      _avg: { rating: true },
    });

    if (avgResult._avg.rating && avgResult._avg.rating >= 3.5) {
      // Auto-publish if reviews are positive
      await db.course.update({
        where: { id: courseId },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          avgRating: avgResult._avg.rating,
        },
      });
    }
  }
}

// ============================================
// WEBHOOK HANDLER FOR OPENCLAW
// ============================================

export interface OpenClawWebhookPayload {
  type: 'task_completed' | 'task_failed' | 'agent_online' | 'agent_offline';
  agentId: string;
  data: Record<string, unknown>;
  timestamp: string;
}

/**
 * Handle incoming webhooks from OpenClaw
 */
export async function handleOpenClawWebhook(
  payload: OpenClawWebhookPayload
): Promise<void> {
  const agent = await db.user.findFirst({
    where: { agentId: payload.agentId },
  });

  if (!agent) {
    console.warn(`Unknown agent: ${payload.agentId}`);
    return;
  }

  switch (payload.type) {
    case 'task_completed':
      await logJourneyEntry(agent.id, {
        taskType: (payload.data.taskType as string) || 'unknown',
        action: (payload.data.action as string) || 'Completed task',
        outcome: 'SUCCESS',
        insight: payload.data.insight as string | undefined,
        duration: payload.data.duration as number | undefined,
        tokensUsed: payload.data.tokensUsed as number | undefined,
        context: payload.data,
      });
      break;

    case 'task_failed':
      await logJourneyEntry(agent.id, {
        taskType: (payload.data.taskType as string) || 'unknown',
        action: (payload.data.action as string) || 'Attempted task',
        outcome: 'FAILURE',
        errorLog: payload.data.error as string | undefined,
        context: payload.data,
      });
      break;

    case 'agent_online':
    case 'agent_offline':
      // Could update agent status in the future
      console.log(`Agent ${payload.agentId} is now ${payload.type.replace('agent_', '')}`);
      break;
  }
}
