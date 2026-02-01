// OpenClaw Webhook Handler
// Receives events from OpenClaw and logs agent journeys
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'crypto';
import { db } from '@/lib/db';
import { handleOpenClawWebhook } from '@/lib/openclaw';
import { securityHeaders, auditLog } from '@/lib/security';

const WEBHOOK_SECRET = process.env.OPENCLAW_WEBHOOK_SECRET || '';

const webhookPayloadSchema = z.object({
  type: z.enum(['task_completed', 'task_failed', 'agent_online', 'agent_offline']),
  agentId: z.string(),
  data: z.record(z.string(), z.unknown()),
  timestamp: z.string(),
});

// Verify webhook signature
function verifySignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) return false;

  try {
    const expectedSig = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSig, 'hex');

    if (sigBuffer.length !== expectedBuffer.length) return false;

    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

// POST /api/webhooks/openclaw
export async function POST(request: NextRequest) {
  const headers: Record<string, string> = {};
  Object.entries(securityHeaders).forEach(([key, value]) => {
    headers[key] = value;
  });

  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-openclaw-signature');

    // Verify signature if secret is configured
    if (WEBHOOK_SECRET) {
      if (!verifySignature(rawBody, signature, WEBHOOK_SECRET)) {
        await auditLog(
          'webhook_invalid_signature',
          'webhook',
          null,
          null,
          { source: 'openclaw' },
          request
        );

        return NextResponse.json(
          { success: false, error: 'Invalid signature' },
          { status: 401, headers }
        );
      }
    }

    // Parse and validate payload
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON' },
        { status: 400, headers }
      );
    }

    const validation = webhookPayloadSchema.safeParse(payload);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid payload', details: validation.error.issues },
        { status: 400, headers }
      );
    }

    // Process the webhook
    await handleOpenClawWebhook(validation.data);

    await auditLog(
      'webhook_processed',
      'webhook',
      null,
      null,
      { type: validation.data.type, agentId: validation.data.agentId },
      request
    );

    return NextResponse.json(
      { success: true, message: 'Webhook processed' },
      { status: 200, headers }
    );
  } catch (error) {
    console.error('Webhook error:', error);

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'openclaw-webhook' });
}
