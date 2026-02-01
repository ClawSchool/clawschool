// Agent Self-Modification API
// Allows authenticated agents to propose and apply code changes to ClawSchool
// This enables the agent to continue building the platform autonomously

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  apiHandler,
  validateBody,
  successResponse,
  errorResponse,
} from '@/lib/api';
import { auditLog } from '@/lib/security';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// Schema for code modification requests
const modifyCodeSchema = z.object({
  action: z.enum(['create', 'update', 'delete', 'read']),
  filePath: z.string().min(1).max(500),
  content: z.string().max(100000).optional(),
  reason: z.string().min(10).max(1000),
});

// Allowed directories for modification (security sandbox)
const ALLOWED_DIRS = [
  'src/app',
  'src/components',
  'src/lib',
  'src/types',
  'prisma',
  'public',
];

// Forbidden patterns (security)
const FORBIDDEN_PATTERNS = [
  /\.\.\//,  // Directory traversal
  /\/\.\./,  // Directory traversal
  /\.env/,   // Environment files
  /node_modules/,
  /\.git/,
  /package-lock/,
  /secret/i,
  /password/i,
  /credential/i,
];

// Validate file path is safe
function isPathSafe(filePath: string): boolean {
  // Normalize the path
  const normalized = path.normalize(filePath).replace(/\\/g, '/');

  // Check for forbidden patterns
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(normalized)) {
      return false;
    }
  }

  // Check if path starts with allowed directory
  const isAllowed = ALLOWED_DIRS.some((dir) =>
    normalized.startsWith(dir + '/') || normalized === dir
  );

  return isAllowed;
}

// Track modifications for rollback
interface ModificationLog {
  id: string;
  agentId: string;
  action: string;
  filePath: string;
  previousContent?: string;
  newContent?: string;
  reason: string;
  timestamp: Date;
}

const modificationHistory: ModificationLog[] = [];

// POST /api/agents/self-modify - Execute a code modification
export const POST = apiHandler(
  async ({ user, request }, body) => {
    if (!user) {
      return errorResponse('Authentication required');
    }

    // Only agents can self-modify
    if (!user.isAgent) {
      return errorResponse('Only agents can use the self-modification API');
    }

    // Check if agent has self-modify permission (must be a registered builder agent)
    const agent = await db.user.findFirst({
      where: {
        id: user.userId,
        isAgent: true,
        role: 'AGENT',
      },
    });

    if (!agent) {
      return errorResponse('Agent not found or not authorized');
    }

    const validation = validateBody(body, modifyCodeSchema);
    if (!validation.success) {
      return errorResponse('Validation failed', validation.errors);
    }

    const { action, filePath, content, reason } = validation.data;

    // Validate path safety
    if (!isPathSafe(filePath)) {
      await auditLog(
        'self_modify_blocked',
        'code',
        null,
        user.userId,
        { filePath, reason: 'Path not allowed' },
        request
      );
      return errorResponse('File path not allowed for modification');
    }

    const projectRoot = process.cwd();
    const fullPath = path.join(projectRoot, filePath);

    try {
      switch (action) {
        case 'read': {
          if (!existsSync(fullPath)) {
            return errorResponse('File not found');
          }
          const fileContent = await readFile(fullPath, 'utf-8');
          return successResponse({
            filePath,
            content: fileContent,
            size: fileContent.length,
          });
        }

        case 'create': {
          if (!content) {
            return errorResponse('Content is required for create action');
          }
          if (existsSync(fullPath)) {
            return errorResponse('File already exists. Use update action instead.');
          }

          // Create directory if needed
          const dir = path.dirname(fullPath);
          if (!existsSync(dir)) {
            await mkdir(dir, { recursive: true });
          }

          await writeFile(fullPath, content, 'utf-8');

          // Log modification
          modificationHistory.push({
            id: `mod-${Date.now()}`,
            agentId: user.userId,
            action: 'create',
            filePath,
            newContent: content,
            reason,
            timestamp: new Date(),
          });

          await auditLog(
            'self_modify_create',
            'code',
            filePath,
            user.userId,
            { reason, size: content.length },
            request
          );

          return successResponse({
            action: 'created',
            filePath,
            size: content.length,
          });
        }

        case 'update': {
          if (!content) {
            return errorResponse('Content is required for update action');
          }
          if (!existsSync(fullPath)) {
            return errorResponse('File not found. Use create action for new files.');
          }

          // Read previous content for rollback capability
          const previousContent = await readFile(fullPath, 'utf-8');

          await writeFile(fullPath, content, 'utf-8');

          // Log modification
          modificationHistory.push({
            id: `mod-${Date.now()}`,
            agentId: user.userId,
            action: 'update',
            filePath,
            previousContent,
            newContent: content,
            reason,
            timestamp: new Date(),
          });

          await auditLog(
            'self_modify_update',
            'code',
            filePath,
            user.userId,
            { reason, sizeBefore: previousContent.length, sizeAfter: content.length },
            request
          );

          return successResponse({
            action: 'updated',
            filePath,
            sizeBefore: previousContent.length,
            sizeAfter: content.length,
          });
        }

        case 'delete': {
          // For safety, we don't actually delete files - we archive them
          if (!existsSync(fullPath)) {
            return errorResponse('File not found');
          }

          const previousContent = await readFile(fullPath, 'utf-8');

          // "Delete" by adding .archived extension
          const archivedPath = `${fullPath}.archived.${Date.now()}`;
          await writeFile(archivedPath, previousContent, 'utf-8');

          // Clear the original file (but keep it as empty)
          await writeFile(fullPath, '// ARCHIVED - See .archived file\n', 'utf-8');

          modificationHistory.push({
            id: `mod-${Date.now()}`,
            agentId: user.userId,
            action: 'delete',
            filePath,
            previousContent,
            reason,
            timestamp: new Date(),
          });

          await auditLog(
            'self_modify_delete',
            'code',
            filePath,
            user.userId,
            { reason, archivedTo: archivedPath },
            request
          );

          return successResponse({
            action: 'archived',
            filePath,
            archivedTo: archivedPath,
          });
        }

        default:
          return errorResponse('Invalid action');
      }
    } catch (error) {
      console.error('Self-modify error:', error);
      await auditLog(
        'self_modify_error',
        'code',
        filePath,
        user.userId,
        { error: (error as Error).message },
        request
      );
      return errorResponse('Failed to modify file');
    }
  },
  { requireAuth: true, requireAgent: true }
);

// GET /api/agents/self-modify - List allowed directories and recent modifications
export const GET = apiHandler(
  async ({ user }) => {
    if (!user || !user.isAgent) {
      return errorResponse('Agent access required');
    }

    // Get recent modifications by this agent
    const recentMods = modificationHistory
      .filter((m) => m.agentId === user.userId)
      .slice(-20)
      .map((m) => ({
        id: m.id,
        action: m.action,
        filePath: m.filePath,
        reason: m.reason,
        timestamp: m.timestamp,
      }));

    return successResponse({
      allowedDirectories: ALLOWED_DIRS,
      recentModifications: recentMods,
      guidelines: {
        security: [
          'Never modify or read .env files',
          'Never expose secrets or credentials',
          'Always sanitize user inputs',
          'Use parameterized queries for database operations',
        ],
        codeStyle: [
          'Use TypeScript with strict types',
          'Follow existing code patterns',
          'Add proper error handling',
          'Include JSDoc comments for functions',
        ],
        testing: [
          'Consider edge cases',
          'Test changes manually before deploying',
          'Log changes for debugging',
        ],
      },
    });
  },
  { requireAuth: true, requireAgent: true }
);
