// Low-level Resend email sender wrapper

import { Resend } from 'resend';
import { env } from '../../env';
import { emailSendingSuppressed } from './suppression';
import { prisma } from '../../prisma';
import type { SendEmailOptions, EmailResult, EmailType } from './types';

let resend: Resend | null = null;

function getResendClient(): Resend | null {
  if (emailSendingSuppressed() || !env.resendApiKey) {
    return null;
  }
  if (!resend) {
    resend = new Resend(env.resendApiKey);
  }
  return resend;
}

export const FROM_EMAIL = env.resendFromEmail || 'noreply@vergoltd.com';
/**
 * Where lead and application alerts go: the main inbox plus the backup. Each
 * one gets its own copy (see sendEmail), so Resend suppressing one address
 * doesn't stop the other. On 24 Sept 2026 that is how three days of alerts
 * to wrobb@vergoltd.com went missing.
 */
export const TO_EMAIL: string[] = [
  ...new Set([env.resendToEmail || 'wrobb@vergoltd.com', env.resendBackupToEmail].filter(Boolean)),
];

interface SendOptions extends SendEmailOptions {
  from?: string;
  emailType?: EmailType;
  userId?: string;
  clientId?: string;
  trackDelivery?: boolean; // Whether to store in database for webhook tracking
}

/**
 * Store email record for webhook tracking
 */
async function storeEmailRecord(
  resendId: string,
  to: string,
  subject: string,
  emailType: string,
  userId?: string,
  clientId?: string
): Promise<void> {
  try {
    await prisma.email.create({
      data: {
        resendId,
        to,
        subject,
        emailType,
        userId,
        clientId,
        status: 'SENT',
      },
    });
  } catch (error) {
    // Don't fail the email send if tracking fails
    console.error('[EMAIL] Failed to store email record:', error);
  }
}

/**
 * Send an email via Resend
 * This is the low-level sender - use the high-level functions in index.ts
 */
export async function sendEmail(options: SendOptions): Promise<EmailResult> {
  // One copy per recipient, so a suppressed or bouncing address can't take the
  // others down with it. Succeeds if any copy went.
  if (Array.isArray(options.to) && options.to.length > 1) {
    const results = await Promise.all(options.to.map((to) => sendOne({ ...options, to })));
    const sent = results.find((r) => r.success);
    return sent || results[0];
  }
  return sendOne(options);
}

async function sendOne(options: SendOptions): Promise<EmailResult> {
  const {
    to,
    subject,
    html,
    replyTo,
    tags = [],
    from = FROM_EMAIL,
    emailType,
    userId,
    clientId,
    trackDelivery = true,
  } = options;

  const toAddress = Array.isArray(to) ? to[0] : to;

  try {
    const resendClient = getResendClient();
    if (!resendClient) {
      const errorMessage = 'Email service not configured (RESEND_API_KEY missing)';
      console.error('[EMAIL ERROR]', errorMessage);
      return {
        id: '',
        success: false,
        error: errorMessage,
      };
    }

    const result = await resendClient.emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      replyTo,
      tags,
    });

    if (result.error) {
      console.error('[EMAIL ERROR]', result.error);
      return {
        id: '',
        success: false,
        error: result.error.message,
      };
    }

    const resendId = result.data?.id || '';
    console.log('[EMAIL] Sent successfully:', resendId);

    // Store email record for webhook tracking
    if (trackDelivery && resendId && emailType) {
      await storeEmailRecord(resendId, toAddress, subject, emailType, userId, clientId);
    }

    return {
      id: resendId,
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[EMAIL ERROR]', error);
    return {
      id: '',
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send email and throw on failure (for critical emails)
 */
export async function sendEmailOrThrow(options: SendOptions): Promise<EmailResult> {
  const result = await sendEmail(options);
  if (!result.success) {
    throw new Error(`Failed to send email: ${result.error}`);
  }
  return result;
}

/**
 * Send email silently (log errors but don't throw)
 * Use for non-critical emails like confirmations
 */
export async function sendEmailSilent(options: SendOptions): Promise<EmailResult | null> {
  try {
    return await sendEmail(options);
  } catch (error) {
    console.error('[EMAIL SILENT] Error sending email:', error);
    return null;
  }
}
