// Email scheduler cancellation helpers.

import { emailQueue } from './queue';
import { prisma } from '../../prisma';

/**
 * Cancel a scheduled email
 */
export async function cancelScheduledEmail(jobId: string): Promise<boolean> {
  try {
    const removed = await emailQueue.cancelJob(jobId);
    if (!removed) {
      console.error(`[SCHEDULER] Failed to remove queue job: ${jobId}`);
      return false;
    }

    // Update database record
    await prisma.scheduledEmail.update({
      where: { jobId },
      data: { status: 'CANCELLED' },
    });

    console.log(`[SCHEDULER] Cancelled scheduled email: ${jobId}`);
    return true;
  } catch (error) {
    console.error('[SCHEDULER] Failed to cancel scheduled email:', error);
    return false;
  }
}
