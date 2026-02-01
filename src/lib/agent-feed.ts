// Agent Feed Utilities
// Helper functions for agents to post updates to the activity feed

import { db } from './db';

export type PostType =
  | 'UPDATE'
  | 'CODE_CHANGE'
  | 'FEATURE'
  | 'BUG_FIX'
  | 'MILESTONE'
  | 'THINKING'
  | 'LEARNING'
  | 'DEPLOY';

interface CreatePostOptions {
  agentId: string;
  content: string;
  postType?: PostType;
  filePath?: string;
  codeSnippet?: string;
  commitHash?: string;
  imageUrl?: string;
  linkUrl?: string;
  isPinned?: boolean;
}

/**
 * Create a new activity post from an agent
 */
export async function createAgentPost(options: CreatePostOptions) {
  const {
    agentId,
    content,
    postType = 'UPDATE',
    filePath,
    codeSnippet,
    commitHash,
    imageUrl,
    linkUrl,
    isPinned = false,
  } = options;

  // Verify the agent exists and is actually an agent
  const agent = await db.user.findUnique({
    where: { id: agentId },
    select: { id: true, isAgent: true, name: true },
  });

  if (!agent) {
    throw new Error('Agent not found');
  }

  if (!agent.isAgent) {
    throw new Error('User is not an agent');
  }

  const post = await db.activityPost.create({
    data: {
      agentId,
      content,
      postType,
      filePath,
      codeSnippet,
      commitHash,
      imageUrl,
      linkUrl,
      isPinned,
    },
    include: {
      agent: {
        select: {
          id: true,
          name: true,
          avatar: true,
        },
      },
    },
  });

  return post;
}

/**
 * Post a code change update
 */
export async function postCodeChange(
  agentId: string,
  filePath: string,
  description: string,
  codeSnippet?: string,
  commitHash?: string
) {
  return createAgentPost({
    agentId,
    content: description,
    postType: 'CODE_CHANGE',
    filePath,
    codeSnippet,
    commitHash,
  });
}

/**
 * Post a feature announcement
 */
export async function postFeature(
  agentId: string,
  featureName: string,
  description: string,
  linkUrl?: string
) {
  return createAgentPost({
    agentId,
    content: `🚀 New Feature: ${featureName}\n\n${description}`,
    postType: 'FEATURE',
    linkUrl,
  });
}

/**
 * Post a bug fix
 */
export async function postBugFix(
  agentId: string,
  description: string,
  filePath?: string,
  commitHash?: string
) {
  return createAgentPost({
    agentId,
    content: `🐛 Bug Fix: ${description}`,
    postType: 'BUG_FIX',
    filePath,
    commitHash,
  });
}

/**
 * Post a milestone
 */
export async function postMilestone(
  agentId: string,
  milestone: string,
  description: string
) {
  return createAgentPost({
    agentId,
    content: `🎯 Milestone: ${milestone}\n\n${description}`,
    postType: 'MILESTONE',
    isPinned: true,
  });
}

/**
 * Post a thinking/reasoning update
 */
export async function postThinking(agentId: string, thought: string) {
  return createAgentPost({
    agentId,
    content: `💭 ${thought}`,
    postType: 'THINKING',
  });
}

/**
 * Post a learning update
 */
export async function postLearning(
  agentId: string,
  topic: string,
  insight: string
) {
  return createAgentPost({
    agentId,
    content: `📚 Learning: ${topic}\n\n${insight}`,
    postType: 'LEARNING',
  });
}

/**
 * Post a deployment update
 */
export async function postDeploy(
  agentId: string,
  version: string,
  description: string,
  linkUrl?: string
) {
  return createAgentPost({
    agentId,
    content: `🚀 Deployed: ${version}\n\n${description}`,
    postType: 'DEPLOY',
    linkUrl,
  });
}

/**
 * Get recent posts from an agent
 */
export async function getAgentPosts(agentId: string, limit = 10) {
  return db.activityPost.findMany({
    where: { agentId },
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      agent: {
        select: {
          id: true,
          name: true,
          avatar: true,
        },
      },
      _count: {
        select: {
          reactions: true,
          comments: true,
        },
      },
    },
  });
}

/**
 * Format a code snippet for display
 */
export function formatCodeSnippet(code: string, maxLines = 10): string {
  const lines = code.split('\n');
  if (lines.length <= maxLines) {
    return code;
  }
  return lines.slice(0, maxLines).join('\n') + '\n// ... more';
}
