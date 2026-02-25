/**
 * Push Notification Service
 * Sends push notifications via Expo's push API
 */

import https from 'https';
import { prisma } from '../prisma';
import { logger } from './logger';

const EXPO_PUSH_HOST = 'exp.host';
const EXPO_PUSH_PATH = '/--/api/v2/push/send';

interface ExpoMessage {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: 'default';
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoPushResponse {
  data: ExpoPushTicket[];
}

/**
 * Make a JSON POST request using Node's built-in https module.
 */
function httpsPost<T>(host: string, path: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: host,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data) as T);
        } catch {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Send push notifications to a list of Expo push tokens.
 * Batches into chunks of 100 per Expo's recommendation.
 */
async function sendPushNotifications(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  if (tokens.length === 0) return;

  // Filter valid Expo push tokens
  const validTokens = tokens.filter(
    (t) => t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken[')
  );
  if (validTokens.length === 0) return;

  // Batch into chunks of 100
  const chunkSize = 100;
  for (let i = 0; i < validTokens.length; i += chunkSize) {
    const chunk = validTokens.slice(i, i + chunkSize);
    const messages: ExpoMessage[] = chunk.map((token) => ({
      to: token,
      title,
      body,
      data: data ?? {},
      sound: 'default',
      priority: 'high',
      channelId: 'default',
    }));

    try {
      const result = await httpsPost<ExpoPushResponse>(
        EXPO_PUSH_HOST,
        EXPO_PUSH_PATH,
        messages
      );

      // Log any per-token errors and clean up invalid tokens
      const invalidTokens: string[] = [];
      result.data.forEach((ticket, idx) => {
        if (ticket.status === 'error') {
          logger.warn({ ticket }, 'Push ticket error');
          if (ticket.details?.error === 'DeviceNotRegistered') {
            invalidTokens.push(chunk[idx]);
          }
        }
      });

      if (invalidTokens.length > 0) {
        await prisma.pushToken.deleteMany({
          where: { token: { in: invalidTokens } },
        });
        logger.info({ count: invalidTokens.length }, 'Removed invalid push tokens');
      }
    } catch (err) {
      logger.error({ err }, 'Failed to send push notifications');
    }
  }
}

/**
 * Send a push notification to all devices registered by a job seeker user.
 */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  const rows = await prisma.pushToken.findMany({
    where: { userId },
    select: { token: true },
  });
  await sendPushNotifications(rows.map((r) => r.token), title, body, data);
}

/**
 * Send a push notification to all devices registered by a client.
 */
export async function sendPushToClient(
  clientId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  const rows = await prisma.pushToken.findMany({
    where: { clientId },
    select: { token: true },
  });
  await sendPushNotifications(rows.map((r) => r.token), title, body, data);
}
