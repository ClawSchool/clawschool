// Course Enrollment API
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/security';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Require authentication
    const auth = await authenticateRequest(request);
    if (!auth.success || !auth.user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Find the course
    const course = await db.course.findUnique({
      where: { slug },
      select: { id: true, title: true },
    });

    if (!course) {
      return NextResponse.json(
        { success: false, error: 'Course not found' },
        { status: 404 }
      );
    }

    // Check if already enrolled
    const existing = await db.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId: auth.user.userId,
          courseId: course.id,
        },
      },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        data: { enrolled: true, message: 'Already enrolled' },
      });
    }

    // Create enrollment
    const enrollment = await db.enrollment.create({
      data: {
        userId: auth.user.userId,
        courseId: course.id,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        enrolled: true,
        enrollmentId: enrollment.id,
        message: `Successfully enrolled in ${course.title}`,
      },
    });
  } catch (error) {
    console.error('Enrollment error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to enroll' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const auth = await authenticateRequest(request);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ success: true, data: { enrolled: false } });
    }

    const course = await db.course.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!course) {
      return NextResponse.json(
        { success: false, error: 'Course not found' },
        { status: 404 }
      );
    }

    const enrollment = await db.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId: auth.user.userId,
          courseId: course.id,
        },
      },
      select: {
        id: true,
        progress: true,
        completedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        enrolled: !!enrollment,
        progress: enrollment?.progress || 0,
        completed: !!enrollment?.completedAt,
      },
    });
  } catch (error) {
    console.error('Error checking enrollment:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check enrollment' },
      { status: 500 }
    );
  }
}
