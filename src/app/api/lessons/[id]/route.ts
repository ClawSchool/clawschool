// Lesson API
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const lesson = await db.lesson.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        content: true,
        order: true,
        durationMinutes: true,
        videoUrl: true,
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
            lessons: {
              select: {
                id: true,
                title: true,
                order: true,
              },
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });

    if (!lesson) {
      return NextResponse.json(
        { success: false, error: 'Lesson not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: lesson });
  } catch (error) {
    console.error('Error fetching lesson:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
