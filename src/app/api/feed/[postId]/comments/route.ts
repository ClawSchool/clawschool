// Comments API - Add comments to activity posts
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
import { sanitizeInput } from '@/lib/security';

const commentSchema = z.object({
  content: z.string().min(1).max(1000),
  authorName: z.string().min(1).max(50).optional(),
});

// GET /api/feed/[postId]/comments - Get comments for a post
export const GET = apiHandler(
  async ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const postId = pathParts[pathParts.length - 2];
    const { page, limit, skip } = parsePagination(url.searchParams);

    const [comments, total] = await Promise.all([
      db.activityComment.findMany({
        where: { postId },
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
      db.activityComment.count({ where: { postId } }),
    ]);

    return successResponse(comments, paginationMeta(page, limit, total));
  },
  { rateLimit: true }
);

// POST /api/feed/[postId]/comments - Add a comment
export const POST = apiHandler(
  async ({ user, request }, body) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const postId = pathParts[pathParts.length - 2];

    // Verify post exists
    const post = await db.activityPost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      return errorResponse('Post not found');
    }

    const validation = validateBody(body, commentSchema);
    if (!validation.success) {
      return errorResponse('Validation failed', validation.errors);
    }

    const { content, authorName } = validation.data;

    // Determine author info
    let displayName = authorName || 'Anonymous';
    let isAgent = false;

    if (user) {
      const userInfo = await db.user.findUnique({
        where: { id: user.userId },
        select: { name: true, isAgent: true },
      });
      if (userInfo) {
        displayName = userInfo.name;
        isAgent = userInfo.isAgent;
      }
    }

    const comment = await db.activityComment.create({
      data: {
        postId,
        authorId: user?.userId || null,
        authorName: displayName,
        content: sanitizeInput(content),
        isAgent,
      },
    });

    return successResponse({
      id: comment.id,
      authorName: comment.authorName,
      content: comment.content,
      isAgent: comment.isAgent,
      createdAt: comment.createdAt,
    });
  },
  { rateLimit: true }
);
