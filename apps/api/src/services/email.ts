import { Resend } from 'resend';

// You'll need to add RESEND_API_KEY to your env.ts
const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = 'VERGO Events wrobb@vergoltd.com'; 
const TO_EMAIL = 'wrobb@vergoltd.com';

export async function sendEventEnquiryEmail(data: {
  name: string;
  email: string;
  phone?: string;
  eventType: string;
  date?: string;
  guests?: number;
  message: string;
}) {
  await resend.emails.send({
    from: FROM_EMAIL,
    to: TO_EMAIL,
    replyTo: data.email,
    subject: `🎉 New Event Enquiry - ${data.eventType}`,
    html: `
      <h2>New Event Enquiry</h2>
      <p><strong>From:</strong> ${data.name} (${data.email})</p>
      ${data.phone ? `<p><strong>Phone:</strong> ${data.phone}</p>` : ''}
      <p><strong>Event Type:</strong> ${data.eventType}</p>
      ${data.date ? `<p><strong>Date:</strong> ${data.date}</p>` : ''}
      ${data.guests ? `<p><strong>Guests:</strong> ${data.guests}</p>` : ''}
      <hr>
      <p><strong>Message:</strong></p>
      <p>${data.message.replace(/\n/g, '<br>')}</p>
    `
  });
}

export async function sendStaffRequestEmail(data: {
  name: string;
  email: string;
  phone?: string;
  company: string;
  roles: string[];
  date: string;
  staffCount: number;
  message: string;
}) {
  await resend.emails.send({
    from: FROM_EMAIL,
    to: TO_EMAIL,
    replyTo: data.email,
    subject: `👥 New Staff Request - ${data.company}`,
    html: `
      <h2>New Staff Request</h2>
      <p><strong>From:</strong> ${data.name} (${data.email})</p>
      ${data.phone ? `<p><strong>Phone:</strong> ${data.phone}</p>` : ''}
      <p><strong>Company:</strong> ${data.company}</p>
      <p><strong>Event Date:</strong> ${data.date}</p>
      <p><strong>Staff Needed:</strong> ${data.staffCount}</p>
      <p><strong>Roles Required:</strong></p>
      <ul>
        ${data.roles.map(role => `<li>${role}</li>`).join('')}
      </ul>
      <hr>
      <p><strong>Additional Details:</strong></p>
      <p>${data.message.replace(/\n/g, '<br>')}</p>
    `
  });
}

export async function sendGeneralEnquiryEmail(data: {
  name: string;
  email: string;
  subject: string;
  message: string;
}) {
  await resend.emails.send({
    from: FROM_EMAIL,
    to: TO_EMAIL,
    replyTo: data.email,
    subject: `💬 ${data.subject}`,
    html: `
      <h2>New General Enquiry</h2>
      <p><strong>From:</strong> ${data.name} (${data.email})</p>
      <p><strong>Subject:</strong> ${data.subject}</p>
      <hr>
      <p><strong>Message:</strong></p>
      <p>${data.message.replace(/\n/g, '<br>')}</p>
    `
  });
}