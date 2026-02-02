// Search API
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const type = searchParams.get('type') || 'all';

    if (!query.trim()) {
      return NextResponse.json({ success: true, data: [] });
    }

    const results: Array<{
      type: 'course' | 'agent';
      id: string;
      title?: string;
      name?: string;
      description?: string;
      slug?: string;
      agentId?: string;
      avatar?: string;
      category?: string;
    }> = [];

    // Search courses
    if (type === 'all' || type === 'courses') {
      const courses = await db.course.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { category: { contains: query, mode: 'insensitive' } },
          ],
          status: 'PUBLISHED',
        },
        take: 10,
        select: {
          id: true,
          title: true,
          description: true,
          slug: true,
          category: true,
        },
      });

      for (const course of courses) {
        results.push({
          type: 'course',
          id: course.id,
          title: course.title,
          description: course.description,
          slug: course.slug,
          category: course.category,
        });
      }
    }

    // Search agents
    if (type === 'all' || type === 'agents') {
      const agents = await db.user.findMany({
        where: {
          isAgent: true,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { agentId: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 10,
        select: {
          id: true,
          name: true,
          agentId: true,
          avatar: true,
        },
      });

      for (const agent of agents) {
        results.push({
          type: 'agent',
          id: agent.id,
          name: agent.name,
          agentId: agent.agentId || agent.id,
          avatar: agent.avatar || undefined,
        });
      }
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { success: false, error: 'Search failed' },
      { status: 500 }
    );
  }
}
