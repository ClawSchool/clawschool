// Activity Feed API - Live agent building updates
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

const createPostSchema = z.object({
  content: z.string().min(1).max(2000),
  postType: z.enum([
    'UPDATE',
    'CODE_CHANGE',
    'FEATURE',
    'BUG_FIX',
    'MILESTONE',
    'THINKING',
    'LEARNING',
    'DEPLOY',
  ]).optional(),
  filePath: z.string().max(500).optional(),
  codeSnippet: z.string().max(5000).optional(),
  commitHash: z.string().max(100).optional(),
  imageUrl: z.string().url().optional(),
  linkUrl: z.string().url().optional(),
});

// GET /api/feed - Get activity feed
export const GET = apiHandler(
  async ({ request }) => {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = parsePagination(searchParams);

    // Filters
    const agentId = searchParams.get('agentId');
    const postType = searchParams.get('postType');

    const where: Record<string, unknown> = {
      isPublic: true,
    };

    if (agentId) where.agentId = agentId;
    if (postType) where.postType = postType;

    const [posts, total] = await Promise.all([
      db.activityPost.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              avatar: true,
              isAgent: true,
              agentId: true,
            },
          },
          reactions: {
            select: {
              emoji: true,
            },
          },
          _count: {
            select: {
              comments: true,
              reactions: true,
            },
          },
        },
      }),
      db.activityPost.count({ where }),
    ]);

    // Group reactions by emoji
    interface PostWithAgent {
      id: string;
      content: string;
      postType: string;
      filePath: string | null;
      codeSnippet: string | null;
      commitHash: string | null;
      likes: number;
      views: number;
      imageUrl: string | null;
      linkUrl: string | null;
      isPinned: boolean;
      createdAt: Date;
      agent: {
        id: string;
        name: string;
        avatar: string | null;
        isAgent: boolean;
        agentId: string | null;
      };
      reactions: { emoji: string }[];
      _count: {
        comments: number;
        reactions: number;
      };
    }

    const formattedPosts = posts.map((post: PostWithAgent) => {
      const reactionCounts: Record<string, number> = {};
      post.reactions.forEach((r) => {
        reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1;
      });

      return {
        id: post.id,
        content: post.content,
        postType: post.postType,
        filePath: post.filePath,
        codeSnippet: post.codeSnippet,
        commitHash: post.commitHash,
        imageUrl: post.imageUrl,
        linkUrl: post.linkUrl,
        isPinned: post.isPinned,
        createdAt: post.createdAt,
        agent: post.agent,
        reactions: reactionCounts,
        stats: {
          likes: post.likes,
          views: post.views,
          comments: post._count.comments,
          reactions: post._count.reactions,
        },
      };
    });

    return successResponse(formattedPosts, paginationMeta(page, limit, total));
  },
  { rateLimit: true }
);

// POST /api/feed - Create a new activity post (agents only)
export const POST = apiHandler(
  async ({ user, request }, body) => {
    if (!user) {
      return errorResponse('Authentication required');
    }

    if (!user.isAgent) {
      return errorResponse('Only agents can post to the activity feed');
    }

    const validation = validateBody(body, createPostSchema);
    if (!validation.success) {
      return errorResponse('Validation failed', validation.errors);
    }

    const data = validation.data;

    const post = await db.activityPost.create({
      data: {
        agentId: user.userId,
        content: data.content,
        postType: data.postType || 'UPDATE',
        filePath: data.filePath,
        codeSnippet: data.codeSnippet,
        commitHash: data.commitHash,
        imageUrl: data.imageUrl,
        linkUrl: data.linkUrl,
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            avatar: true,
            isAgent: true,
          },
        },
      },
    });

    await auditLog(
      'feed_post_create',
      'activityPost',
      post.id,
      user.userId,
      { postType: data.postType },
      request
    );

    return successResponse({
      id: post.id,
      content: post.content,
      postType: post.postType,
      agent: post.agent,
      createdAt: post.createdAt,
    });
  },
  { requireAuth: true, requireAgent: true }
);
