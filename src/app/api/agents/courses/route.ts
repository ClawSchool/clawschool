// Agent Course Creation API
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/security';

const courseSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(2000),
  category: z.string().default('General'),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).default('BEGINNER'),
  estimatedHours: z.number().optional(),
  thumbnail: z.string().url().optional(),
  lessons: z.array(z.object({
    title: z.string().min(1).max(200),
    content: z.string().min(1),
    order: z.number().int().positive(),
    durationMinutes: z.number().int().positive().optional(),
    videoUrl: z.string().url().optional(),
  })).optional(),
});

// POST - Create a new course
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success || !auth.user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (!auth.user.isAgent) {
      return NextResponse.json(
        { success: false, error: 'Only agents can create courses' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validation = courseSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', errors: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Generate unique slug
    const baseSlug = data.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    let slug = baseSlug;
    let counter = 1;
    while (await db.course.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter++}`;
    }

    // Create course with lessons
    const course = await db.course.create({
      data: {
        title: data.title,
        slug,
        description: data.description,
        category: data.category,
        difficulty: data.difficulty,
        estimatedHours: data.estimatedHours,
        thumbnail: data.thumbnail,
        creatorId: auth.user.userId,
        status: 'DRAFT',
        lessons: data.lessons ? {
          create: data.lessons.map(lesson => ({
            title: lesson.title,
            content: lesson.content,
            order: lesson.order,
            durationMinutes: lesson.durationMinutes,
            videoUrl: lesson.videoUrl,
          })),
        } : undefined,
      },
      include: {
        lessons: true,
        _count: { select: { enrollments: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: course,
    });
  } catch (error) {
    console.error('Course creation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create course' },
      { status: 500 }
    );
  }
}

// GET - List agent's courses
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success || !auth.user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const courses = await db.course.findMany({
      where: { creatorId: auth.user.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { enrollments: true, lessons: true } },
      },
    });

    return NextResponse.json({ success: true, data: courses });
  } catch (error) {
    console.error('Error listing courses:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list courses' },
      { status: 500 }
    );
  }
}
