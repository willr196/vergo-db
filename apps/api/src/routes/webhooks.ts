// Webhook handlers for external services

import { Router, raw } from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { env } from '../env';

const router = Router();
const prisma = new PrismaClient();

// Resend webhook signature verification
function verifyResendSignature(
  payload: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Resend webhook event types
type ResendEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.complained'
  | 'email.bounced'
  | 'email.opened'
  | 'email.clicked';

interface ResendWebhookEvent {
  type: ResendEventType;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    click?: { link: string };
  };
}

// Map Resend event types to our EmailStatus enum
const eventToStatus: Record<ResendEventType, string> = {
  'email.sent': 'SENT',
  'email.delivered': 'DELIVERED',
  'email.delivery_delayed': 'SENT', // Keep as SENT, but log the delay
  'email.complained': 'COMPLAINED',
  'email.bounced': 'BOUNCED',
  'email.opened': 'OPENED',
  'email.clicked': 'CLICKED',
};

/**
 * POST /api/v1/webhooks/resend
 * Resend email delivery webhook
 */
router.post('/resend', raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Get signature from headers
    const signature = req.headers['resend-signature'] as string;

    if (!signature) {
      console.warn('[WEBHOOK] Missing resend-signature header');
      return res.status(401).json({ error: 'Missing signature' });
    }

    // Parse signature header (format: t=timestamp,v1=signature)
    const parts = signature.split(',');
    const timestampPart = parts.find(p => p.startsWith('t='));
    const signaturePart = parts.find(p => p.startsWith('v1='));

    if (!timestampPart || !signaturePart) {
      console.warn('[WEBHOOK] Invalid signature format');
      return res.status(401).json({ error: 'Invalid signature format' });
    }

    const timestamp = timestampPart.slice(2);
    const sig = signaturePart.slice(3);

    // Verify webhook signature
    if (!env.resendWebhookSecret) {
      if (env.nodeEnv === 'production') {
        console.error('[WEBHOOK] RESEND_WEBHOOK_SECRET is required in production');
        return res.status(500).json({ error: 'Webhook verification not configured' });
      }
      console.warn('[WEBHOOK] No webhook secret configured, skipping verification (dev only)');
    } else {
      const payload = req.body.toString();
      const isValid = verifyResendSignature(payload, sig, timestamp, env.resendWebhookSecret);

      if (!isValid) {
        console.warn('[WEBHOOK] Invalid signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Parse the webhook payload
    const event: ResendWebhookEvent = JSON.parse(req.body.toString());

    console.log('[WEBHOOK] Received Resend event:', event.type, event.data.email_id);

    // Find the email record by Resend ID
    const email = await prisma.email.findUnique({
      where: { resendId: event.data.email_id },
    });

    if (!email) {
      // Email not found - this might be an email sent before tracking was enabled
      console.log('[WEBHOOK] Email not found for Resend ID:', event.data.email_id);
      return res.json({ received: true, tracked: false });
    }

    // Create event record
    await prisma.emailEvent.create({
      data: {
        emailId: email.id,
        eventType: event.type,
        payload: event as object,
        createdAt: new Date(event.created_at),
      },
    });

    // Update email status (only upgrade status, never downgrade)
    const newStatus = eventToStatus[event.type];
    const statusPriority: Record<string, number> = {
      'QUEUED': 0,
      'SENT': 1,
      'DELIVERED': 2,
      'OPENED': 3,
      'CLICKED': 4,
      'BOUNCED': 5,
      'COMPLAINED': 6,
      'FAILED': 7,
    };

    const currentPriority = statusPriority[email.status] ?? 0;
    const newPriority = statusPriority[newStatus] ?? 0;

    // Only update if new status has higher priority (or is a terminal state like BOUNCED)
    if (newPriority > currentPriority || ['BOUNCED', 'COMPLAINED'].includes(newStatus)) {
      await prisma.email.update({
        where: { id: email.id },
        data: { status: newStatus as any },
      });
      console.log('[WEBHOOK] Updated email status:', email.id, '->', newStatus);
    }

    res.json({ received: true, tracked: true });
  } catch (error) {
    console.error('[WEBHOOK] Error processing Resend webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/v1/webhooks/health
 * Webhook health check
 */
router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    webhooks: {
      resend: {
        configured: !!env.resendWebhookSecret,
      },
    },
  });
});

export default router;
