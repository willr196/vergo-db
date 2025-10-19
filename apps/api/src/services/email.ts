import { Resend } from 'resend';
import { env } from '../env';

const resend = new Resend(env.resendApiKey);

// IMPORTANT: Change this after verifying your domain in Resend
// For now, use Resend's onboarding email or verify vergoltd.com domain
const FROM_EMAIL = 'onboarding@resend.dev'; // TEMPORARY - Change after domain verification
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
  try {
    const result = await resend.emails.send({
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
    
    console.log('[EMAIL] Event enquiry sent:', result);
    return result;
  } catch (error) {
    console.error('[EMAIL ERROR] Event enquiry failed:', error);
    throw error;
  }
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
  try {
    const result = await resend.emails.send({
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
    
    console.log('[EMAIL] Staff request sent:', result);
    return result;
  } catch (error) {
    console.error('[EMAIL ERROR] Staff request failed:', error);
    throw error;
  }
}

export async function sendGeneralEnquiryEmail(data: {
  name: string;
  email: string;
  subject: string;
  message: string;
}) {
  try {
    const result = await resend.emails.send({
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
    
    console.log('[EMAIL] General enquiry sent:', result);
    return result;
  } catch (error) {
    console.error('[EMAIL ERROR] General enquiry failed:', error);
    throw error;
  }
}

// Send notification when application is submitted
export async function sendApplicationNotificationEmail(data: {
  applicantName: string;
  email: string;
  phone?: string;
  roles: string[];
  cvOriginalName?: string;
  applicationId: string;
}) {
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      subject: `📋 New Job Application - ${data.applicantName}`,
      html: `
        <h2>New Job Application Received</h2>
        <p><strong>Applicant:</strong> ${data.applicantName}</p>
        <p><strong>Email:</strong> ${data.email}</p>
        ${data.phone ? `<p><strong>Phone:</strong> ${data.phone}</p>` : ''}
        <p><strong>Roles Applied For:</strong></p>
        <ul>
          ${data.roles.map(role => `<li>${role}</li>`).join('')}
        </ul>
        ${data.cvOriginalName ? `<p><strong>CV:</strong> ${data.cvOriginalName}</p>` : ''}
        <hr>
        <p><strong>Application ID:</strong> ${data.applicationId}</p>
        <p><a href="${env.webOrigin}/admin.html" style="display:inline-block;padding:12px 24px;background:#667eea;color:white;text-decoration:none;border-radius:4px;margin-top:10px;">View in Admin Panel</a></p>
      `
    });
    
    console.log('[EMAIL] Application notification sent:', result);
    return result;
  } catch (error) {
    console.error('[EMAIL ERROR] Application notification failed:', error);
    throw error;
  }
}