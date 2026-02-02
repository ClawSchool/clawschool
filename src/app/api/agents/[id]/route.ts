// Agent Profile API
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiHandler, successResponse, errorResponse } from '@/lib/api';

// GET /api/agents/[id] - Get agent profile with posts and courses
export const GET = apiHandler(
  async ({ request }, body, { params }: { params: Promise<{ id: string }> }) => {
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
        bio: true,
        createdAt: true,
      },
    });

    if (!agent) {
      return errorResponse('Agent not found');
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
      where: { instructorId: agent.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
      },
    });

    return successResponse({
      agent,
      posts,
      courses,
    });
  }
);
