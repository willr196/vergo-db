import { env } from '../env';

type EmailMode = 'resend' | 'log' | 's3';
const MODE = (env.emailMode as EmailMode) ?? 'resend';

async function deliver(kind: string, subject: string, html: string, text: string) {
  if (MODE === 'log') {
    const fs = await import('node:fs/promises');
    const line = JSON.stringify({ ts: new Date().toISOString(), kind, subject, html, text }) + '\n';
    await fs.appendFile('/tmp/contact-queue.jsonl', line).catch(() => {});
    return { ok: true, mode: 'log' as const };
  }

  if (MODE === 's3') {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({ region: env.s3Region });
    const key = `contact/${new Date().toISOString()}-${kind}.json`;
    await s3.send(new PutObjectCommand({
      Bucket: env.s3Bucket,
      Key: key,
      Body: Buffer.from(JSON.stringify({ subject, html, text }, null, 2)),
      ContentType: 'application/json',
    }));
    return { ok: true, mode: 's3' as const, key };
  }

  if (!env.resendApiKey) {
    const fs = await import('node:fs/promises');
    const line = JSON.stringify({ ts: new Date().toISOString(), kind, subject, html, text, warn: 'RESEND_API_KEY missing' }) + '\n';
    await fs.appendFile('/tmp/contact-queue.jsonl', line).catch(() => {});
    return { ok: true, mode: 'log' as const, warn: 'RESEND_API_KEY missing' };
  }

  const { Resend } = await import('resend');
  const resend = new Resend(env.resendApiKey);
  const FROM_EMAIL = 'onboarding@resend.dev';
  const TO_EMAIL = 'wrobb@vergoltd.com';

  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to: [TO_EMAIL],
    subject,
    html,
    text,
  });
  return { ok: true, mode: 'resend' as const, result };
}

export async function sendEventEnquiryEmail(data: {
  name: string;
  email: string;
  phone?: string;
  eventType: string;
  date?: string;
  attendees?: string;
  budget?: string;
  message?: string;
}) {
  const subject = `Event Enquiry – ${data.name} (${data.email})`;
  const text = `
Event enquiry
-------------
Name: ${data.name}
Email: ${data.email}
Phone: ${data.phone ?? '-'}
Event Type: ${data.eventType}
Date: ${data.date ?? '-'}
Attendees: ${data.attendees ?? '-'}
Budget: ${data.budget ?? '-'}
Message:
${data.message ?? '-'}
`.trim();
  const html = text.replace(/\n/g, '<br/>');
  return deliver('event-enquiry', subject, html, text);
}

export async function sendStaffRequestEmail(data: {
  name: string;
  email: string;
  phone?: string;
  company: string;
  roles: string[];
  startDate?: string;
  endDate?: string;
  location?: string;
  message?: string;
}) {
  const subject = `Staff Request – ${data.company} (${data.name})`;
  const text = `
Staff request
-------------
Name: ${data.name}
Company: ${data.company}
Email: ${data.email}
Phone: ${data.phone ?? '-'}
Roles: ${data.roles.join(', ')}
Start: ${data.startDate ?? '-'}
End: ${data.endDate ?? '-'}
Location: ${data.location ?? '-'}
Message:
${data.message ?? '-'}
`.trim();
  const html = text.replace(/\n/g, '<br/>');
  return deliver('staff-request', subject, html, text);
}

export async function sendGeneralEnquiryEmail(data: {
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
}) {
  const subject = `General Enquiry – ${data.subject ?? 'No subject'} (${data.name})`;
  const text = `
General enquiry
---------------
Name: ${data.name}
Email: ${data.email}
Phone: ${data.phone ?? '-'}
Subject: ${data.subject ?? '-'}
Message:
${data.message}
`.trim();
  const html = text.replace(/\n/g, '<br/>');
  return deliver('general', subject, html, text);
}
