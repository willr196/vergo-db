/**
 * Telling a worker's phone what the office just did in VERGO Ops: a shift
 * offered or booked, moved, or cancelled, and documents waiting to be agreed.
 *
 * Push only, through the app's registered devices. Every function answers
 * whether the worker has the app at all (a registered device), so Ops can
 * tell the office to text them instead. Sending happens after the change has
 * committed and never fails the request; a past shift is never notified.
 *
 * Shift pushes use the type the app already opens a shift for
 * ('shift_request' + bookingId), so builds from before this still route them.
 */

import { prisma } from '../prisma';
import { sendPushToUser } from '../services/notifications';
import { logger } from '../services/logger';
import { dateKey, londonDateKey } from './time';

type Sender = (userId: string, title: string, body: string, data: Record<string, unknown>) => Promise<void>;
let send: Sender = sendPushToUser;

/** Tests swap the sender to see what would have gone out. */
export function setWorkerPushSender(sender: Sender | null) {
  send = sender ?? sendPushToUser;
}

export type ShiftNotice = 'offered' | 'booked' | 'changed' | 'cancelled';

export interface Notified {
  /** The worker has the app on at least one device, so the push went to it. */
  hasApp: boolean;
}

async function hasApp(userId: string) {
  return (await prisma.pushToken.count({ where: { userId } })) > 0;
}

function fire(userId: string, title: string, body: string, data: Record<string, unknown>) {
  send(userId, title, body, data).catch((err) => logger.error({ err, userId, type: data.type }, '[OPS PUSH] send failed'));
}

const dayLabel = (d: Date) => new Date(`${dateKey(d)}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' });

const TITLES: Record<ShiftNotice, string> = {
  offered: 'New shift offer',
  booked: 'You are booked',
  changed: 'Your shift has changed',
  cancelled: 'Shift cancelled',
};

/** One push per worker shift row. Rows on past days are skipped. */
export async function notifyShifts(notice: ShiftNotice, assignmentIds: string[]): Promise<Map<string, Notified>> {
  const out = new Map<string, Notified>();
  if (!assignmentIds.length) return out;
  const rows = await prisma.booking.findMany({
    where: { id: { in: assignmentIds } },
    select: { id: true, staffId: true, eventDate: true, shiftStart: true, shiftEnd: true, role: true, venue: true, location: true },
  });
  const today = londonDateKey(new Date());
  for (const row of rows) {
    const app = await hasApp(row.staffId);
    out.set(row.id, { hasApp: app });
    if (!app || dateKey(row.eventDate) < today) continue;
    const where = row.venue || row.location;
    const what = `${row.role ? `${row.role}, ` : ''}${dayLabel(row.eventDate)} ${row.shiftStart}–${row.shiftEnd}${where ? ` at ${where}` : ''}`;
    const body = notice === 'offered' ? `${what}. Tap to accept or decline.`
      : notice === 'booked' ? `${what}. It is in your shifts.`
      : notice === 'changed' ? `Now ${what}. Tap to see the details.`
      : `${what} is no longer going ahead.`;
    fire(row.staffId, TITLES[notice], body, { type: 'shift_request', bookingId: row.id, notice });
  }
  return out;
}

/** The KID or agreement is waiting in My documents. */
export async function notifyDocumentsWaiting(userId: string): Promise<Notified> {
  const app = await hasApp(userId);
  if (app) {
    fire(userId, 'Documents to read and agree', 'VERGO has sent you your employment documents. Open My documents to read and agree them.', { type: 'documents' });
  }
  return { hasApp: app };
}
