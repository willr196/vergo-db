/**
 * The day-before shift reminder: an email to each worker with a confirmed
 * shift tomorrow, with the time, place, dress code and who to ask for.
 *
 * Runs every hour; sends from 10:00 London time on the day before. Each
 * shift is claimed by setting Booking.reminderSentAt before the email goes,
 * so two machines running this at once never send it twice. A worker who has
 * no email address, or whose shift is confirmed after the run, is skipped.
 */

import { prisma } from '../prisma';
import { env } from '../env';
import { sendEmailSilent } from '../services/email/sender';
import { composeEmail, emailBody, sectionHeading, accentCard, infoBox, paragraph, primaryButton, safe } from '../services/email/templates/components';
import { londonDateKey, londonClock } from './time';

/** London hour from which tomorrow's reminders go out. */
export const REMINDER_FROM_HOUR = 10;

export interface ReminderShift {
  firstName: string;
  role: string;
  dateLabel: string;
  times: string;
  where: string;
  address: string | null;
  dressCode: string | null;
  bring: string | null;
  contact: string | null;
}

export function reminderEmail(s: ReminderShift, siteUrl: string): string {
  const row = (icon: string, text: string | null) => (text ? `<p style="margin: 0 0 4px;">${icon} ${safe(text)}</p>` : '');
  const mapUrl = s.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}` : null;
  return composeEmail({
    body: emailBody(`
      ${sectionHeading('Your shift is tomorrow', '⏰')}
      <p>Hi ${safe(s.firstName)},</p>
      ${paragraph('A quick reminder of tomorrow. Plan your journey so you arrive with time to spare.')}
      ${accentCard(`
        <p style="margin: 0 0 8px; font-size: 17px; font-weight: 700;">${safe(s.role)}</p>
        ${row('📅', s.dateLabel)}
        ${row('🕒', s.times)}
        ${row('📍', s.where)}
        ${s.address && s.address !== s.where ? row('🏠', s.address) : ''}
        ${mapUrl ? `<p style="margin: 0 0 4px;"><a href="${safe(mapUrl)}">Open in Maps</a></p>` : ''}
        ${row('👔', s.dressCode ? `Dress code: ${s.dressCode}` : null)}
        ${row('🎒', s.bring ? `Bring: ${s.bring}` : null)}
        ${row('🙋', s.contact ? `On the day, ask for: ${s.contact}` : null)}
      `)}
      ${primaryButton('See the full briefing', `${siteUrl}/staff/shifts`)}
      ${infoBox('<p style="margin: 0;"><strong>Running late?</strong> Use the button on the shift in your account. <strong>Can&#39;t make it?</strong> Text or call us straight away.</p>', 'warning')}
      <p>See you there,<br><strong>The VERGO Team</strong></p>
    `),
  });
}

/** Tomorrow's London date, YYYY-MM-DD. */
export function tomorrowInLondon(now: Date): string {
  const today = londonDateKey(now);
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Send any reminders that are due now. Returns how many were sent. */
export async function sendDueShiftReminders(now = new Date()): Promise<number> {
  if (Number(londonClock(now).slice(0, 2)) < REMINDER_FROM_HOUR) return 0;
  const day = tomorrowInLondon(now);
  const due = await prisma.booking.findMany({
    where: {
      status: 'CONFIRMED',
      reminderSentAt: null,
      eventDate: { gte: new Date(`${day}T00:00:00Z`), lt: new Date(`${day}T23:59:59Z`) },
    },
    select: {
      id: true, eventDate: true, shiftStart: true, shiftEnd: true, venue: true, location: true, eventName: true, role: true,
      staff: { select: { email: true, firstName: true } },
      opsBooking: { select: { address: true, onSiteContactName: true, onSiteContactPhone: true } },
      requirement: { select: { role: true, dressCode: true, equipment: true } },
    },
    take: 200,
  });

  const siteUrl = env.webOrigin.replace(/\/+$/, '');
  let sent = 0;
  for (const b of due) {
    // Claim it first: if another machine got here, count is 0 and we move on.
    const claim = await prisma.booking.updateMany({ where: { id: b.id, reminderSentAt: null }, data: { reminderSentAt: new Date() } });
    if (claim.count !== 1 || !b.staff?.email) continue;
    const contact = [b.opsBooking?.onSiteContactName, b.opsBooking?.onSiteContactPhone].filter(Boolean).join(', ') || null;
    const html = reminderEmail({
      firstName: b.staff.firstName || 'there',
      role: b.role || b.requirement?.role || b.eventName || 'Your shift',
      dateLabel: new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' }),
      times: b.shiftStart ? `${b.shiftStart}${b.shiftEnd ? ` to ${b.shiftEnd}` : ''}` : 'Times to be confirmed',
      where: [b.venue, b.location].filter(Boolean).join(', '),
      address: b.opsBooking?.address ?? null,
      dressCode: b.requirement?.dressCode ?? null,
      bring: b.requirement?.equipment ?? null,
      contact,
    }, siteUrl);
    const result = await sendEmailSilent({
      to: b.staff.email,
      subject: `Tomorrow: ${b.role || b.eventName || 'your shift'}${b.shiftStart ? ` at ${b.shiftStart}` : ''}`,
      html,
      emailType: 'shift-reminder',
      tags: [{ name: 'category', value: 'shift-reminder' }],
    });
    if (result?.success) sent += 1;
    else console.error('[REMINDER] Shift reminder did not send', b.id, result?.error);
  }
  return sent;
}

let timer: NodeJS.Timeout | null = null;

/** Check hourly, and once shortly after start. */
export function startShiftReminders() {
  if (timer) return;
  const run = () => void sendDueShiftReminders()
    .then((n) => { if (n) console.log(`[REMINDER] Sent ${n} shift reminder(s)`); })
    .catch((e) => console.error('[REMINDER] Shift reminders failed', e));
  setTimeout(run, 60_000).unref();
  timer = setInterval(run, 60 * 60 * 1000);
  timer.unref();
}

export function stopShiftReminders() {
  if (timer) clearInterval(timer);
  timer = null;
}
