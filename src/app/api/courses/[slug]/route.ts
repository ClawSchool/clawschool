// Single Course API
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  apiHandler,
  validateBody,
  successResponse,
  errorResponse,
} from '@/lib/api';
import { auditLog } from '@/lib/security';

const updateCourseSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(10).max(5000).optional(),
  category: z.string().min(1).max(50).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']).optional(),
  thumbnail: z.string().url().optional(),
  status: z.enum(['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED']).optional(),
});

type RouteContext = { params: Promise<{ slug: string }> };

// GET /api/courses/[slug]
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const { slug } = await context.params;

  const course = await db.course.findUnique({
    where: { slug },
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          avatar: true,
          isAgent: true,
          agentId: true,
        },
      },
      lessons: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          title: true,
          order: true,
          duration: true,
        },
      },
      reviews: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatar: true,
              isAgent: true,
            },
          },
        },
      },
      _count: {
        select: {
          enrollments: true,
          reviews: true,
        },
      },
    },
  });

  if (!course) {
    return new Response(JSON.stringify({ success: false, error: 'Course not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Don't expose unpublished courses publicly
  if (course.status !== 'PUBLISHED') {
    // Could add auth check here to allow creators to view their drafts
    return new Response(JSON.stringify({ success: false, error: 'Course not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        id: course.id,
        slug: course.slug,
        title: course.title,
        description: course.description,
        thumbnail: course.thumbnail,
        category: course.category,
        tags: course.tags,
        difficulty: course.difficulty,
        status: course.status,
        creator: course.creator,
        lessons: course.lessons,
        reviews: course.reviews.map((r: {
          id: string;
          rating: number;
          title: string | null;
          content: string | null;
          user: { id: string; name: string; avatar: string | null; isAgent: boolean };
          isAgentReview: boolean;
          createdAt: Date;
        }) => ({
          id: r.id,
          rating: r.rating,
          title: r.title,
          content: r.content,
          user: r.user,
          isAgentReview: r.isAgentReview,
          createdAt: r.createdAt,
        })),
        stats: {
          enrollments: course._count.enrollments,
          reviews: course._count.reviews,
          lessons: course.lessons.length,
          duration: course.totalDuration,
          rating: course.avgRating,
        },
        publishedAt: course.publishedAt,
        createdAt: course.createdAt,
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

// PATCH /api/courses/[slug]
export const PATCH = apiHandler(
  async ({ user, request }, body) => {
    if (!user) {
      return errorResponse('Authentication required');
    }

    const url = new URL(request.url);
    const slug = url.pathname.split('/').pop();

    const course = await db.course.findUnique({
      where: { slug },
      select: { id: true, creatorId: true },
    });

    if (!course) {
      return errorResponse('Course not found');
    }

    // Only creator or admin can update
    if (course.creatorId !== user.userId && user.role !== 'ADMIN') {
      return errorResponse('Not authorized to update this course');
    }

    const validation = validateBody(body, updateCourseSchema);
    if (!validation.success) {
      return errorResponse('Validation failed', validation.errors);
    }

    const updates = validation.data;

    // Handle publish
    if (updates.status === 'PUBLISHED') {
      const lessonCount = await db.lesson.count({
        where: { courseId: course.id },
      });

      if (lessonCount === 0) {
        return errorResponse('Cannot publish a course without lessons');
      }

      updates.status = 'PUBLISHED';
      (updates as Record<string, unknown>).publishedAt = new Date();
    }

    const updated = await db.course.update({
      where: { id: course.id },
      data: updates,
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        publishedAt: true,
      },
    });

    await auditLog(
      'course_update',
      'course',
      course.id,
      user.userId,
      { updates: Object.keys(updates) },
      request
    );

    return successResponse(updated);
  },
  { requireAuth: true }
);

// DELETE /api/courses/[slug]
export const DELETE = apiHandler(
  async ({ user, request }) => {
    if (!user) {
      return errorResponse('Authentication required');
    }

    const url = new URL(request.url);
    const slug = url.pathname.split('/').pop();

    const course = await db.course.findUnique({
      where: { slug },
      select: { id: true, creatorId: true, title: true },
    });

    if (!course) {
      return errorResponse('Course not found');
    }

    // Only creator or admin can delete
    if (course.creatorId !== user.userId && user.role !== 'ADMIN') {
      return errorResponse('Not authorized to delete this course');
    }

    // Soft delete by archiving
    await db.course.update({
      where: { id: course.id },
      data: { status: 'ARCHIVED' },
    });

    await auditLog(
      'course_delete',
      'course',
      course.id,
      user.userId,
      { title: course.title },
      request
    );

    return successResponse({ deleted: true });
  },
  { requireAuth: true }
);
