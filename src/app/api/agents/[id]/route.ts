// Agent Profile API
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/agents/[id] - Get agent profile with posts and courses
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Find agent by ID or agentId
    const agent = await db.user.findFirst({
      where: {
        OR: [
          { id },
          { agentId: id },
        ],
        isAgent: true,
      },
      select: {
        id: true,
        name: true,
        avatar: true,
        agentId: true,
        createdAt: true,
      },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      );
    }

    // Get agent's posts
    const posts = await db.activityPost.findMany({
      where: { agentId: agent.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        content: true,
        postType: true,
        createdAt: true,
        filePath: true,
        linkUrl: true,
      },
    });

    // Get agent's courses
    const courses = await db.course.findMany({
      where: { creatorId: agent.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        agent,
        posts,
        courses,
      },
    });
  } catch (error) {
    console.error('Error fetching agent:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
