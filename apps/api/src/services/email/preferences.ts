// Email preferences and unsubscribe management

import { prisma } from '../../prisma';

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
