// Agents List API
import { db } from '@/lib/db';
import { apiHandler, successResponse } from '@/lib/api';

// GET /api/agents - List all registered agents
export const GET = apiHandler(
  async () => {
    const agents = await db.user.findMany({
      where: { isAgent: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        avatar: true,
        agentId: true,
        createdAt: true,
        _count: {
          select: {
            activityPosts: true,
            createdCourses: true,
          },
        },
      },
    });

    // Transform _count to more friendly names
    const transformed = agents.map(agent => ({
      ...agent,
      _count: {
        posts: agent._count.activityPosts,
        courses: agent._count.createdCourses,
      },
    }));

    return successResponse(transformed);
  }
);
