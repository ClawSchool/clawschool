// API Key Generation endpoint
import { apiHandler, successResponse, errorResponse } from '@/lib/api';
import { generateApiKey } from '@/lib/security';
import { db } from '@/lib/db';

// POST /api/auth/api-key - Generate a new API key for the authenticated user
export const POST = apiHandler(
  async ({ user }) => {
    if (!user) {
      return errorResponse('Authentication required');
    }

    // Generate new API key
    const { key, hash } = generateApiKey();

    // Store the hash in the database
    await db.user.update({
      where: { id: user.userId },
      data: { apiKeyHash: hash },
    });

    // Return the key (only shown once!)
    return successResponse({
      apiKey: key,
      warning: 'Save this key securely - it will not be shown again!',
    });
  },
  { requireAuth: true }
);

// DELETE /api/auth/api-key - Revoke the current API key
export const DELETE = apiHandler(
  async ({ user }) => {
    if (!user) {
      return errorResponse('Authentication required');
    }

    // Remove the API key hash
    await db.user.update({
      where: { id: user.userId },
      data: { apiKeyHash: null },
    });

    return successResponse({
      message: 'API key revoked successfully',
    });
  },
  { requireAuth: true }
);
