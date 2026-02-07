// Email preferences and unsubscribe management

import { env } from '../../env';
import { prisma } from '../../prisma';
import type { EmailCategory } from './types';

// Map email types to preference categories
const EMAIL_TYPE_CATEGORY: Record<string, { category: EmailCategory; field: string }> = {
  // Transactional - always sent
  'user-verification': { category: 'transactional', field: '' },
  'user-password-reset': { category: 'transactional', field: '' },
  'client-verification': { category: 'transactional', field: '' },
  'client-password-reset': { category: 'transactional', field: '' },

  // Notification - can unsubscribe
  'application-notification': { category: 'notification', field: 'notifications' },
  'application-confirmation': { category: 'notification', field: 'notifications' },
  'job-application-notification': { category: 'notification', field: 'notifications' },
  'job-application-confirmation': { category: 'notification', field: 'notifications' },
  'client-approval': { category: 'notification', field: 'notifications' },
  'client-rejection': { category: 'notification', field: 'notifications' },
  'application-review-reminder': { category: 'notification', field: 'notifications' },
  'shift-reminder': { category: 'notification', field: 'jobAlerts' },

  // Marketing - can unsubscribe
  'quote-followup': { category: 'marketing', field: 'quoteUpdates' },
  'staff-request': { category: 'notification', field: 'notifications' },
  'general-enquiry': { category: 'notification', field: 'notifications' },
};

/**
 * Get or create email preferences for a user or client
 */
export async function getOrCreatePreferences(opts: {
  userId?: string;
  clientId?: string;
}) {
  const { userId, clientId } = opts;

  if (!userId && !clientId) {
    throw new Error('Either userId or clientId is required');
  }

  // Try to find existing preferences
  const existing = await prisma.emailPreferences.findFirst({
    where: userId ? { userId } : { clientId },
  });

  if (existing) return existing;

  // Create default preferences
  return prisma.emailPreferences.create({
    data: {
      userId,
      clientId,
    },
  });
}

/**
 * Get preferences by unsubscribe token
 */
export async function getPreferencesByToken(token: string) {
  return prisma.emailPreferences.findUnique({
    where: { unsubscribeToken: token },
  });
}

/**
 * Update email preferences
 */
export async function updatePreferences(
  token: string,
  updates: {
    marketing?: boolean;
    notifications?: boolean;
    jobAlerts?: boolean;
    quoteUpdates?: boolean;
  }
) {
  return prisma.emailPreferences.update({
    where: { unsubscribeToken: token },
    data: updates,
  });
}

/**
 * Unsubscribe from all non-transactional emails
 */
export async function unsubscribeAll(token: string) {
  return prisma.emailPreferences.update({
    where: { unsubscribeToken: token },
    data: {
      marketing: false,
      notifications: false,
      jobAlerts: false,
      quoteUpdates: false,
    },
  });
}

/**
 * Check if a user/client has opted in to receive a specific email type
 * Returns true for transactional emails (always sent)
 */
export async function canSendEmail(
  emailType: string,
  opts: { userId?: string; clientId?: string }
): Promise<boolean> {
  const mapping = EMAIL_TYPE_CATEGORY[emailType];

  // Unknown email types are sent by default
  if (!mapping) return true;

  // Transactional emails are always sent
  if (mapping.category === 'transactional') return true;

  const { userId, clientId } = opts;
  if (!userId && !clientId) return true;

  try {
    const prefs = await prisma.emailPreferences.findFirst({
      where: userId ? { userId } : { clientId },
    });

    // If no preferences exist, default to sending
    if (!prefs) return true;

    // Check the specific field
    const field = mapping.field as keyof typeof prefs;
    if (field && field in prefs) {
      return prefs[field] as boolean;
    }

    return true;
  } catch {
    // If there's an error checking preferences, default to sending
    return true;
  }
}

/**
 * Generate unsubscribe URL for a user/client
 */
export async function getUnsubscribeUrl(opts: {
  userId?: string;
  clientId?: string;
}): Promise<string> {
  const prefs = await getOrCreatePreferences(opts);
  return `${env.webOrigin}/api/v1/unsubscribe?token=${prefs.unsubscribeToken}`;
}

/**
 * Get the category for an email type
 */
export function getEmailCategory(emailType: string): EmailCategory {
  return EMAIL_TYPE_CATEGORY[emailType]?.category ?? 'notification';
}
