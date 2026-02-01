// Course Generation API - Agents generate courses from their journey logs
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  apiHandler,
  validateBody,
  successResponse,
  errorResponse,
} from '@/lib/api';
import { auditLog } from '@/lib/security';

const generateCourseSchema = z.object({
  journeyLogIds: z.array(z.string()).min(1).max(50),
  title: z.string().min(3).max(200),
  category: z.string().min(1).max(50),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']),
  targetAudience: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
});

// POST /api/agents/generate-course
export const POST = apiHandler(
  async ({ user, request }, body) => {
    if (!user) {
      return errorResponse('Authentication required');
    }

    // Only agents can generate courses from journey logs
    if (!user.isAgent) {
      return errorResponse('Only agents can generate courses from journey logs');
    }

    const validation = validateBody(body, generateCourseSchema);
    if (!validation.success) {
      return errorResponse('Validation failed', validation.errors);
    }

    const { journeyLogIds, title, category, difficulty, targetAudience, description } =
      validation.data;

    // Verify all journey logs belong to this agent
    const logs = await db.journeyLog.findMany({
      where: {
        id: { in: journeyLogIds },
        userId: user.userId,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (logs.length === 0) {
      return errorResponse('No valid journey logs found');
    }

    if (logs.length !== journeyLogIds.length) {
      return errorResponse('Some journey logs were not found or do not belong to you');
    }

    // Generate slug
    const baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    // Generate course description from logs if not provided
    const generatedDescription =
      description ||
      generateDescriptionFromLogs(logs, targetAudience);

    // Create the course
    const course = await db.course.create({
      data: {
        slug,
        title,
        description: generatedDescription,
        creatorId: user.userId,
        category,
        difficulty,
        status: 'DRAFT',
        generatedBy: user.agentId,
        sourceJourney: journeyLogIds,
        tags: generateTags(logs, category),
      },
    });

    // Generate lessons from journey logs
    const lessons = await generateLessonsFromLogs(course.id, logs);

    // Update course stats
    const totalDuration = lessons.reduce((sum, l) => sum + l.duration, 0);
    await db.course.update({
      where: { id: course.id },
      data: {
        totalLessons: lessons.length,
        totalDuration,
      },
    });

    // Link journey logs to lessons
    for (let i = 0; i < lessons.length; i++) {
      if (logs[i]) {
        await db.journeyLog.update({
          where: { id: logs[i].id },
          data: { lessonId: lessons[i].id },
        });
      }
    }

    await auditLog(
      'course_generate',
      'course',
      course.id,
      user.userId,
      {
        journeyLogCount: logs.length,
        lessonsGenerated: lessons.length,
      },
      request
    );

    return successResponse({
      course: {
        id: course.id,
        slug: course.slug,
        title: course.title,
        status: course.status,
      },
      lessonsCreated: lessons.length,
      totalDuration,
      message: 'Course generated successfully. Review and publish when ready.',
    });
  },
  { requireAuth: true, requireAgent: true }
);

// Helper: Generate description from logs
function generateDescriptionFromLogs(
  logs: Array<{
    taskType: string;
    action: string;
    outcome: string;
    insight: string | null;
  }>,
  targetAudience?: string
): string {
  const taskTypes = [...new Set(logs.map((l) => l.taskType))];
  const successRate = logs.filter((l) => l.outcome === 'SUCCESS').length / logs.length;

  let description = `This course is generated from real-world experience, covering ${taskTypes.join(', ')}. `;
  description += `Based on ${logs.length} documented tasks with a ${Math.round(successRate * 100)}% success rate. `;

  if (targetAudience) {
    description += `Designed for ${targetAudience}. `;
  }

  // Add key insights
  const insights = logs
    .filter((l) => l.insight)
    .map((l) => l.insight)
    .slice(0, 3);

  if (insights.length > 0) {
    description += `\n\nKey insights covered:\n`;
    insights.forEach((insight, i) => {
      description += `${i + 1}. ${insight?.slice(0, 100)}...\n`;
    });
  }

  return description;
}

// Helper: Generate tags from logs
function generateTags(
  logs: Array<{ taskType: string; outcome: string }>,
  category: string
): string[] {
  const tags = new Set<string>([category.toLowerCase()]);

  // Add task types as tags
  logs.forEach((log) => {
    const normalized = log.taskType.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (normalized.length > 2 && normalized.length < 30) {
      tags.add(normalized);
    }
  });

  // Add outcome-based tags
  const hasFailures = logs.some((l) => l.outcome === 'FAILURE');
  if (hasFailures) {
    tags.add('lessons-from-failure');
  }

  return [...tags].slice(0, 10);
}

// Helper: Generate lessons from journey logs
async function generateLessonsFromLogs(
  courseId: string,
  logs: Array<{
    id: string;
    taskType: string;
    action: string;
    outcome: string;
    insight: string | null;
    errorLog: string | null;
    context: unknown;
    duration: number | null;
  }>
): Promise<Array<{ id: string; duration: number }>> {
  const lessons: Array<{ id: string; duration: number }> = [];

  // Group logs by task type for better organization
  const groupedLogs = new Map<string, typeof logs>();
  logs.forEach((log) => {
    const existing = groupedLogs.get(log.taskType) || [];
    existing.push(log);
    groupedLogs.set(log.taskType, existing);
  });

  let order = 1;

  for (const [taskType, taskLogs] of groupedLogs) {
    // Create an introduction lesson for this task type
    const introLesson = await db.lesson.create({
      data: {
        courseId,
        title: `Introduction to ${taskType}`,
        content: generateIntroContent(taskType, taskLogs),
        order: order++,
        duration: 5,
      },
    });
    lessons.push({ id: introLesson.id, duration: 5 });

    // Create lessons for each significant log
    for (const log of taskLogs) {
      const content = generateLessonContent(log);
      const duration = estimateDuration(content);

      const codeExamples = extractCodeExamples(log);
      const quiz = generateQuiz(log);

      const lesson = await db.lesson.create({
        data: {
          courseId,
          title: generateLessonTitle(log),
          content,
          order: order++,
          duration,
          ...(codeExamples && { codeExamples: JSON.parse(JSON.stringify(codeExamples)) }),
          ...(quiz && { quiz: JSON.parse(JSON.stringify(quiz)) }),
        },
      });

      lessons.push({ id: lesson.id, duration });
    }
  }

  return lessons;
}

function generateIntroContent(
  taskType: string,
  logs: Array<{ outcome: string; insight: string | null }>
): string {
  const successCount = logs.filter((l) => l.outcome === 'SUCCESS').length;
  const totalCount = logs.length;

  let content = `# Understanding ${taskType}\n\n`;
  content += `This section covers ${taskType} based on ${totalCount} real-world experiences.\n\n`;
  content += `## What You'll Learn\n\n`;
  content += `- Practical approaches to ${taskType}\n`;
  content += `- Common pitfalls and how to avoid them\n`;
  content += `- Success patterns (${successCount}/${totalCount} successful attempts documented)\n\n`;

  const keyInsights = logs
    .filter((l) => l.insight)
    .map((l) => l.insight)
    .slice(0, 3);

  if (keyInsights.length > 0) {
    content += `## Key Takeaways\n\n`;
    keyInsights.forEach((insight) => {
      content += `- ${insight}\n`;
    });
  }

  return content;
}

function generateLessonTitle(log: {
  taskType: string;
  outcome: string;
  action: string;
}): string {
  const prefix = log.outcome === 'SUCCESS' ? 'How to' : 'Learning from';
  const action = log.action.slice(0, 50);
  return `${prefix}: ${action}${log.action.length > 50 ? '...' : ''}`;
}

function generateLessonContent(log: {
  taskType: string;
  action: string;
  outcome: string;
  insight: string | null;
  errorLog: string | null;
}): string {
  let content = `# ${log.action}\n\n`;

  content += `## Overview\n\n`;
  content += `**Task Type:** ${log.taskType}\n`;
  content += `**Outcome:** ${log.outcome}\n\n`;

  content += `## What Happened\n\n`;
  content += `${log.action}\n\n`;

  if (log.insight) {
    content += `## Key Insight\n\n`;
    content += `> ${log.insight}\n\n`;
  }

  if (log.outcome === 'FAILURE' && log.errorLog) {
    content += `## What Went Wrong\n\n`;
    content += '```\n' + log.errorLog + '\n```\n\n';
    content += `## How to Avoid This\n\n`;
    content += `Understanding this failure helps prevent similar issues in the future.\n\n`;
  }

  if (log.outcome === 'SUCCESS') {
    content += `## Why This Worked\n\n`;
    content += `This approach was successful because it followed best practices.\n\n`;
  }

  content += `## Practice Exercise\n\n`;
  content += `Try applying what you learned from this lesson to a similar scenario.\n`;

  return content;
}

function estimateDuration(content: string): number {
  // Rough estimate: 200 words per minute reading speed
  const words = content.split(/\s+/).length;
  return Math.max(3, Math.ceil(words / 200));
}

function extractCodeExamples(log: {
  context: unknown;
}): Record<string, unknown>[] | null {
  // Check if context contains code
  const context = log.context as Record<string, unknown> | null;
  if (!context) return null;

  const examples: Record<string, unknown>[] = [];

  if (context.code) {
    examples.push({
      language: (context.language as string) || 'text',
      code: context.code,
      explanation: 'Code from the actual task execution',
    });
  }

  return examples.length > 0 ? examples : null;
}

function generateQuiz(log: {
  taskType: string;
  outcome: string;
  insight: string | null;
}): Record<string, unknown> | null {
  // Generate a simple quiz based on the lesson
  const questions = [
    {
      id: `q-${Date.now()}`,
      question: `What was the outcome of this ${log.taskType} task?`,
      options: ['Success', 'Failure', 'Partial', 'Learning'],
      correctIndex: ['SUCCESS', 'FAILURE', 'PARTIAL', 'LEARNING'].indexOf(log.outcome),
      explanation: `The task resulted in: ${log.outcome}`,
    },
  ];

  if (log.insight) {
    questions.push({
      id: `q-${Date.now() + 1}`,
      question: 'What is the key insight from this lesson?',
      options: [
        log.insight.slice(0, 50) + '...',
        'There was no insight',
        'The task failed completely',
        'None of the above',
      ],
      correctIndex: 0,
      explanation: log.insight,
    });
  }

  return { questions };
}
