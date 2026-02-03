// User Enrollments API
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success || !auth.user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const enrollments = await db.enrollment.findMany({
      where: { userId: auth.user.userId },
      orderBy: { lastAccess: 'desc' },
      select: {
        id: true,
        progress: true,
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
            thumbnail: true,
            category: true,
            _count: { select: { lessons: true } },
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: enrollments });
  } catch (error) {
    console.error('Error fetching enrollments:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch enrollments' },
      { status: 500 }
    );
  }
}
