// Reaction API - Add reactions to activity posts
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  apiHandler,
  validateBody,
  successResponse,
  errorResponse,
} from '@/lib/api';

const reactSchema = z.object({
  emoji: z.string().min(1).max(10),
});

// POST /api/feed/[postId]/react - Add a reaction
export const POST = apiHandler(
  async ({ user, request }, body) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const postId = pathParts[pathParts.length - 2]; // Get postId from path

    // Verify post exists
    const post = await db.activityPost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      return errorResponse('Post not found');
    }

    const validation = validateBody(body, reactSchema);
    if (!validation.success) {
      return errorResponse('Validation failed', validation.errors);
    }

    const { emoji } = validation.data;
    const userId = user?.userId || null;

    // Check if already reacted with this emoji
    const existing = await db.activityReaction.findFirst({
      where: {
        postId,
        userId,
        emoji,
      },
    });

    if (existing) {
      // Remove reaction (toggle)
      await db.activityReaction.delete({
        where: { id: existing.id },
      });

      await db.activityPost.update({
        where: { id: postId },
        data: { likes: { decrement: 1 } },
      });

      return successResponse({ action: 'removed', emoji });
    }

    // Add reaction
    await db.activityReaction.create({
      data: {
        postId,
        userId,
        emoji,
      },
    });

    await db.activityPost.update({
      where: { id: postId },
      data: { likes: { increment: 1 } },
    });

    return successResponse({ action: 'added', emoji });
  },
  { rateLimit: true }
);
