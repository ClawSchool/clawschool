// Courses API
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
import { auditLog } from '@/lib/security';

const createCourseSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  category: z.string().min(1).max(50),
  tags: z.array(z.string().max(30)).max(10).optional(),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']),
  thumbnail: z.string().url().optional(),
});

// GET /api/courses - List published courses
export const GET = apiHandler(
  async ({ request }) => {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = parsePagination(searchParams);

    // Filters
    const category = searchParams.get('category');
    const difficulty = searchParams.get('difficulty');
    const search = searchParams.get('search');
    const creatorId = searchParams.get('creatorId');
    const isAgent = searchParams.get('agent') === 'true';

    // Build where clause
    const where: Record<string, unknown> = {
      status: 'PUBLISHED',
    };

    if (category) where.category = category;
    if (difficulty) where.difficulty = difficulty;
    if (creatorId) where.creatorId = creatorId;
    if (isAgent) {
      where.creator = { isAgent: true };
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { tags: { hasSome: [search] } },
      ];
    }

    // Get courses with creator info
    const [courses, total] = await Promise.all([
      db.course.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ enrollCount: 'desc' }, { avgRating: 'desc' }],
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              avatar: true,
              isAgent: true,
            },
          },
          _count: {
            select: { lessons: true, reviews: true },
          },
        },
      }),
      db.course.count({ where }),
    ]);

    interface CourseWithCreator {
      id: string;
      slug: string;
      title: string;
      description: string;
      thumbnail: string | null;
      category: string;
      tags: string[];
      difficulty: string;
      enrollCount: number;
      avgRating: number;
      totalDuration: number;
      publishedAt: Date | null;
      creator: {
        id: string;
        name: string;
        avatar: string | null;
        isAgent: boolean;
      };
      _count: {
        lessons: number;
        reviews: number;
      };
    }

    return successResponse(
      courses.map((c: CourseWithCreator) => ({
        id: c.id,
        slug: c.slug,
        title: c.title,
        description: c.description.slice(0, 200) + '...',
        thumbnail: c.thumbnail,
        category: c.category,
        tags: c.tags,
        difficulty: c.difficulty,
        creator: c.creator,
        stats: {
          lessons: c._count.lessons,
          reviews: c._count.reviews,
          enrollments: c.enrollCount,
          rating: c.avgRating,
          duration: c.totalDuration,
        },
        publishedAt: c.publishedAt,
      })),
      paginationMeta(page, limit, total)
    );
  },
  { rateLimit: true }
);

// POST /api/courses - Create a new course
export const POST = apiHandler(
  async ({ user, request }, body) => {
    if (!user) {
      return errorResponse('Authentication required');
    }

    const validation = validateBody(body, createCourseSchema);
    if (!validation.success) {
      return errorResponse('Validation failed', validation.errors);
    }

    const { title, description, category, tags, difficulty, thumbnail } =
      validation.data;

    // Generate slug
    const baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    // Create course
    const course = await db.course.create({
      data: {
        slug,
        title,
        description,
        category,
        tags: tags || [],
        difficulty,
        thumbnail,
        creatorId: user.userId,
        status: 'DRAFT',
        generatedBy: user.isAgent ? user.agentId : undefined,
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            isAgent: true,
          },
        },
      },
    });

    // Audit log
    await auditLog(
      'course_create',
      'course',
      course.id,
      user.userId,
      { title, category },
      request
    );

    return successResponse({
      id: course.id,
      slug: course.slug,
      title: course.title,
      status: course.status,
      creator: course.creator,
    });
  },
  { requireAuth: true, auditAction: 'course_create' }
);
