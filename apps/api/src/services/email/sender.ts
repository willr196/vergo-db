// Low-level Resend email sender wrapper

import { Resend } from 'resend';
import { PrismaClient } from '@prisma/client';
import { env } from '../../env';
import type { SendEmailOptions, EmailResult, EmailType } from './types';

const resend = new Resend(env.resendApiKey);
const prisma = new PrismaClient();

export const FROM_EMAIL = 'noreply@vergoltd.com';
export const TO_EMAIL = 'wrobb@vergoltd.com';

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
    const result = await resend.emails.send({
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
