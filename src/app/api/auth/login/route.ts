// User Login API
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  apiHandler,
  validateBody,
  successResponse,
  errorResponse,
} from '@/lib/api';
import {
  verifyPassword,
  generateToken,
  recordFailedLogin,
  clearFailedLogins,
  auditLog,
} from '@/lib/security';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/login
export const POST = apiHandler(
  async ({ request }, body) => {
    const validation = validateBody(body, loginSchema);
    if (!validation.success) {
      return errorResponse('Validation failed', validation.errors);
    }

    const { email, password } = validation.data;

    // Find user
    const user = await db.user.findFirst({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        role: true,
        isAgent: true,
        agentId: true,
        lockedUntil: true,
        failedLogins: true,
      },
    });

    if (!user || !user.passwordHash) {
      return errorResponse('Invalid email or password');
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMs = user.lockedUntil.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      return errorResponse(
        `Account locked. Try again in ${remainingMin} minutes.`
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);

    if (!isValid) {
      const locked = await recordFailedLogin(user.id);
      await auditLog(
        'login_failed',
        'user',
        user.id,
        user.id,
        { email, locked },
        request
      );

      if (locked) {
        return errorResponse('Account locked due to too many failed attempts');
      }
      return errorResponse('Invalid email or password');
    }

    // Clear failed login attempts
    await clearFailedLogins(user.id);

    // Generate token
    const token = generateToken({
      userId: user.id,
      role: user.role,
      isAgent: user.isAgent,
      agentId: user.agentId || undefined,
    });

    // Audit log
    await auditLog('login_success', 'user', user.id, user.id, {}, request);

    return successResponse({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isAgent: user.isAgent,
      },
      token,
    });
  },
  { rateLimit: true }
);
