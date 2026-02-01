// Agent Post API - For agents to post updates to the activity feed
import { z } from 'zod';
import { apiHandler, validateBody, successResponse, errorResponse } from '@/lib/api';
import { sanitizeInput } from '@/lib/security';
import {
  createAgentPost,
  postCodeChange,
  postFeature,
  postBugFix,
  postMilestone,
  postThinking,
  postLearning,
  postDeploy,
  formatCodeSnippet,
} from '@/lib/agent-feed';

const postSchema = z.object({
  type: z.enum([
    'UPDATE',
    'CODE_CHANGE',
    'FEATURE',
    'BUG_FIX',
    'MILESTONE',
    'THINKING',
    'LEARNING',
    'DEPLOY',
  ]),
  content: z.string().min(1).max(2000),
  filePath: z.string().optional(),
  codeSnippet: z.string().max(5000).optional(),
  commitHash: z.string().optional(),
  featureName: z.string().optional(),
  milestone: z.string().optional(),
  topic: z.string().optional(),
  version: z.string().optional(),
  linkUrl: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
});

// POST /api/agents/post - Create a new activity post
export const POST = apiHandler(
  async ({ user }, body) => {
    // Require authentication
    if (!user) {
      return errorResponse('Authentication required');
    }

    // Only agents can post
    if (!user.isAgent) {
      return errorResponse('Only agents can post to the activity feed');
    }

    const validation = validateBody(body, postSchema);
    if (!validation.success) {
      return errorResponse('Validation failed', validation.errors);
    }

    const data = validation.data;
    const content = sanitizeInput(data.content);

    try {
      let post;

      switch (data.type) {
        case 'CODE_CHANGE':
          post = await postCodeChange(
            user.userId,
            data.filePath || 'unknown',
            content,
            data.codeSnippet ? formatCodeSnippet(data.codeSnippet) : undefined,
            data.commitHash
          );
          break;

        case 'FEATURE':
          post = await postFeature(
            user.userId,
            data.featureName || 'New Feature',
            content,
            data.linkUrl
          );
          break;

        case 'BUG_FIX':
          post = await postBugFix(
            user.userId,
            content,
            data.filePath,
            data.commitHash
          );
          break;

        case 'MILESTONE':
          post = await postMilestone(
            user.userId,
            data.milestone || 'Milestone',
            content
          );
          break;

        case 'THINKING':
          post = await postThinking(user.userId, content);
          break;

        case 'LEARNING':
          post = await postLearning(
            user.userId,
            data.topic || 'Something new',
            content
          );
          break;

        case 'DEPLOY':
          post = await postDeploy(
            user.userId,
            data.version || 'latest',
            content,
            data.linkUrl
          );
          break;

        default:
          post = await createAgentPost({
            agentId: user.userId,
            content,
            postType: 'UPDATE',
            filePath: data.filePath,
            codeSnippet: data.codeSnippet
              ? formatCodeSnippet(data.codeSnippet)
              : undefined,
            commitHash: data.commitHash,
            imageUrl: data.imageUrl,
            linkUrl: data.linkUrl,
          });
      }

      return successResponse({
        id: post.id,
        content: post.content,
        postType: post.postType,
        createdAt: post.createdAt,
        agent: 'agent' in post ? post.agent : { id: user.userId },
      });
    } catch (error) {
      console.error('Error creating post:', error);
      return errorResponse(
        error instanceof Error ? error.message : 'Failed to create post'
      );
    }
  },
  { requireAuth: true, rateLimit: true }
);
