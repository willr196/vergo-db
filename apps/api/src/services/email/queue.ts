// Email queue using BullMQ for background processing with retries

import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../../env';
import { sendEmail } from './sender';
import type { SendEmailOptions, EmailType, EmailResult } from './types';

interface EmailJobData extends SendEmailOptions {
  emailType?: EmailType;
  userId?: string;
  clientId?: string;
  attemptNumber?: number;
}

interface EmailJobResult {
  success: boolean;
  emailId?: string;
  error?: string;
}

const QUEUE_NAME = 'email-queue';

// Queue configuration
const QUEUE_CONFIG = {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 1000, // 1s, 2s, 4s
    },
    removeOnComplete: {
      count: 1000, // Keep last 1000 completed jobs
      age: 24 * 3600, // Keep for 24 hours
    },
    removeOnFail: {
      count: 500, // Keep last 500 failed jobs
      age: 7 * 24 * 3600, // Keep for 7 days
    },
  },
};

// Worker configuration
const WORKER_CONFIG = {
  concurrency: 5,
  limiter: {
    max: 10,
    duration: 1000, // Max 10 emails per second
  },
};

class EmailQueue {
  private queue: Queue<EmailJobData, EmailJobResult> | null = null;
  private worker: Worker<EmailJobData, EmailJobResult> | null = null;
  private connection: Redis | null = null;
  private initialized = false;

  /**
   * Initialize the email queue
   * Call this on application startup
   */
  async initialize(): Promise<boolean> {
    if (!env.emailQueueEnabled) {
      console.log('[EMAIL QUEUE] Queue disabled, emails will be sent synchronously');
      return false;
    }

    if (!env.redisUrl) {
      console.warn('[EMAIL QUEUE] No REDIS_URL configured, falling back to sync');
      return false;
    }

    try {
      // Create Redis connection
      this.connection = new Redis(env.redisUrl, {
        maxRetriesPerRequest: null, // Required for BullMQ
        enableReadyCheck: false,
      });

      // Test connection
      await this.connection.ping();
      console.log('[EMAIL QUEUE] Redis connected');

      // Create queue
      this.queue = new Queue<EmailJobData, EmailJobResult>(QUEUE_NAME, {
        connection: this.connection,
        ...QUEUE_CONFIG,
      });

      // Create worker
      this.worker = new Worker<EmailJobData, EmailJobResult>(
        QUEUE_NAME,
        async (job: Job<EmailJobData, EmailJobResult>) => {
          return this.processEmail(job);
        },
        {
          connection: this.connection,
          ...WORKER_CONFIG,
        }
      );

      // Set up event handlers
      this.setupEventHandlers();

      this.initialized = true;
      console.log('[EMAIL QUEUE] Queue initialized successfully');
      return true;
    } catch (error) {
      console.error('[EMAIL QUEUE] Failed to initialize:', error);
      await this.cleanup();
      return false;
    }
  }

  private setupEventHandlers(): void {
    if (!this.worker) return;

    this.worker.on('completed', (job) => {
      console.log(`[EMAIL QUEUE] Job ${job.id} completed:`, job.returnvalue);
    });

    this.worker.on('failed', (job, error) => {
      console.error(`[EMAIL QUEUE] Job ${job?.id} failed:`, error.message);
    });

    this.worker.on('error', (error) => {
      console.error('[EMAIL QUEUE] Worker error:', error);
    });
  }

  /**
   * Process a single email job
   */
  private async processEmail(job: Job<EmailJobData, EmailJobResult>): Promise<EmailJobResult> {
    const { data } = job;
    const attemptNumber = job.attemptsMade + 1;

    console.log(`[EMAIL QUEUE] Processing job ${job.id}, attempt ${attemptNumber}/${job.opts.attempts || 3}`);

    try {
      const result = await sendEmail({
        to: data.to,
        subject: data.subject,
        html: data.html,
        replyTo: data.replyTo,
        tags: data.tags,
      });

      if (!result.success) {
        throw new Error(result.error || 'Email send failed');
      }

      return {
        success: true,
        emailId: result.id,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // If this is the last attempt, log the final failure
      if (attemptNumber >= (job.opts.attempts || 3)) {
        console.error(`[EMAIL QUEUE] Final attempt failed for job ${job.id}:`, errorMessage);
      }

      throw error; // Re-throw to trigger retry
    }
  }

  /**
   * Add an email to the queue
   * Falls back to sync send if queue is not available
   */
  async enqueue(options: EmailJobData): Promise<EmailResult> {
    // If queue is not available, send synchronously
    if (!this.initialized || !this.queue) {
      console.log('[EMAIL QUEUE] Queue not available, sending synchronously');
      return sendEmail(options);
    }

    try {
      const job = await this.queue.add('send-email', options, {
        // Override delay if scheduledAt is provided
        delay: options.scheduledAt
          ? Math.max(0, new Date(options.scheduledAt).getTime() - Date.now())
          : undefined,
      });

      console.log(`[EMAIL QUEUE] Email queued with job ID: ${job.id}`);

      return {
        id: job.id || '',
        success: true,
      };
    } catch (error) {
      console.error('[EMAIL QUEUE] Failed to enqueue, falling back to sync:', error);
      return sendEmail(options);
    }
  }

  /**
   * Add multiple emails to the queue in bulk
   */
  async enqueueBulk(emails: EmailJobData[]): Promise<EmailResult[]> {
    if (!this.initialized || !this.queue) {
      // Fall back to sequential sync sends
      console.log('[EMAIL QUEUE] Queue not available, sending synchronously');
      const results: EmailResult[] = [];
      for (const email of emails) {
        results.push(await sendEmail(email));
      }
      return results;
    }

    try {
      const jobs = emails.map((email) => ({
        name: 'send-email',
        data: email,
      }));

      const addedJobs = await this.queue.addBulk(jobs);

      console.log(`[EMAIL QUEUE] Bulk queued ${addedJobs.length} emails`);

      return addedJobs.map((job) => ({
        id: job.id || '',
        success: true,
      }));
    } catch (error) {
      console.error('[EMAIL QUEUE] Bulk enqueue failed:', error);
      // Fall back to sync
      const results: EmailResult[] = [];
      for (const email of emails) {
        results.push(await sendEmail(email));
      }
      return results;
    }
  }

  /**
   * Get queue stats
   */
  async getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  } | null> {
    if (!this.queue) return null;

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('[EMAIL QUEUE] Shutting down...');
    await this.cleanup();
    console.log('[EMAIL QUEUE] Shutdown complete');
  }

  private async cleanup(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }

    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }

    if (this.connection) {
      await this.connection.quit();
      this.connection = null;
    }

    this.initialized = false;
  }

  /**
   * Check if queue is available
   */
  isAvailable(): boolean {
    return this.initialized && this.queue !== null;
  }
}

// Singleton instance
export const emailQueue = new EmailQueue();

// Convenience function for enqueuing emails
export async function queueEmail(options: EmailJobData): Promise<EmailResult> {
  return emailQueue.enqueue(options);
}

// Convenience function for bulk enqueue
export async function queueEmails(emails: EmailJobData[]): Promise<EmailResult[]> {
  return emailQueue.enqueueBulk(emails);
}
