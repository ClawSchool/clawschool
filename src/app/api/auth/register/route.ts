// User/Agent Registration API
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  apiHandler,
  validateBody,
  successResponse,
  errorResponse,
} from '@/lib/api';
import {
  hashPassword,
  generateToken,
  generateApiKey,
  auditLog,
} from '@/lib/security';

// Validation schemas
const registerUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

const registerAgentSchema = z.object({
  name: z.string().min(2).max(100),
  agentId: z.string().min(1).max(100),
  capabilities: z.array(z.string()).optional(),
});

// POST /api/auth/register
export const POST = apiHandler(
  async ({ request }, body) => {
    const data = body as Record<string, unknown>;

    // Determine if this is agent or user registration
    const isAgentRegistration = 'agentId' in data;

    if (isAgentRegistration) {
      // Agent registration
      const validation = validateBody(data, registerAgentSchema);
      if (!validation.success) {
        return errorResponse('Validation failed', validation.errors);
      }

      const { name, agentId, capabilities } = validation.data;

      // Check if agent already exists
      const existing = await db.user.findFirst({
        where: { agentId },
      });

      if (existing) {
        return errorResponse('Agent already registered');
      }

      // Generate API key
      const { key: apiKey, hash: apiKeyHash } = generateApiKey();

      // Create agent user
      const user = await db.user.create({
        data: {
          name,
          role: 'AGENT',
          isAgent: true,
          agentId,
          apiKey: apiKey.slice(0, 16) + '...',
          apiKeyHash,
        },
      });

      // Audit log
      await auditLog(
        'agent_register',
        'user',
        user.id,
        user.id,
        { agentId, capabilities },
        request
      );

      return successResponse({
        user: {
          id: user.id,
          name: user.name,
          agentId: user.agentId,
          role: user.role,
        },
        apiKey, // Only returned once!
        message: 'Store this API key securely - it will not be shown again.',
      });
    } else {
      // Human user registration
      const validation = validateBody(data, registerUserSchema);
      if (!validation.success) {
        return errorResponse('Validation failed', validation.errors);
      }

      const { name, email, password } = validation.data;

      // Check if email exists
      const existing = await db.user.findFirst({
        where: { email },
      });

      if (existing) {
        return errorResponse('Email already registered');
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create user
      const user = await db.user.create({
        data: {
          name,
          email,
          passwordHash,
          role: 'STUDENT',
          isAgent: false,
        },
      });

      // Generate JWT token
      const token = generateToken({
        userId: user.id,
        role: user.role,
        isAgent: false,
      });

      // Audit log
      await auditLog('user_register', 'user', user.id, user.id, { email }, request);

      return successResponse({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        token,
      });
    }
  },
  { rateLimit: true }
);
