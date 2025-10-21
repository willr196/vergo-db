import { Resend } from 'resend';
import { env } from '../env';

const resend = new Resend(env.resendApiKey);

// ✅ UPDATED: Using your verified domain
const FROM_EMAIL = 'noreply@vergoltd.com';
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
      tags: [
        { name: 'category', value: 'event-enquiry' },
        { name: 'source', value: 'website' }
      ],
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #D4AF37; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">VERGO Events</h1>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #2c3e2f; margin-top: 0;">🎉 New Event Enquiry</h2>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <p><strong>From:</strong> ${data.name}</p>
              <p><strong>Email:</strong> <a href="mailto:${data.email}">${data.email}</a></p>
              ${data.phone ? `<p><strong>Phone:</strong> ${data.phone}</p>` : ''}
              <p><strong>Event Type:</strong> ${data.eventType}</p>
              ${data.date ? `<p><strong>Preferred Date:</strong> ${data.date}</p>` : ''}
              ${data.guests ? `<p><strong>Expected Guests:</strong> ${data.guests}</p>` : ''}
            </div>
            
            <div style="background: white; padding: 20px; border-radius: 8px;">
              <h3 style="margin-top: 0; color: #2c3e2f;">Message:</h3>
              <p style="white-space: pre-wrap;">${data.message}</p>
            </div>
            
            <div style="margin-top: 30px; padding: 20px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
              <p style="margin: 0;"><strong>⏰ Action Required:</strong> Respond within 24 hours</p>
            </div>
          </div>
          
          <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
            <p>VERGO Events Ltd | London, United Kingdom</p>
          </div>
        </div>
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
      tags: [
        { name: 'category', value: 'staff-request' },
        { name: 'source', value: 'website' }
      ],
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #D4AF37; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">VERGO Events</h1>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #2c3e2f; margin-top: 0;">👥 New Staff Request</h2>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <p><strong>From:</strong> ${data.name}</p>
              <p><strong>Email:</strong> <a href="mailto:${data.email}">${data.email}</a></p>
              ${data.phone ? `<p><strong>Phone:</strong> ${data.phone}</p>` : ''}
              <p><strong>Company:</strong> ${data.company}</p>
              <p><strong>Event Date:</strong> ${data.date}</p>
              <p><strong>Staff Needed:</strong> ${data.staffCount}</p>
            </div>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h3 style="margin-top: 0; color: #2c3e2f;">Roles Required:</h3>
              <ul style="margin: 0; padding-left: 20px;">
                ${data.roles.map(role => `<li style="margin-bottom: 8px;">${role}</li>`).join('')}
              </ul>
            </div>
            
            <div style="background: white; padding: 20px; border-radius: 8px;">
              <h3 style="margin-top: 0; color: #2c3e2f;">Additional Details:</h3>
              <p style="white-space: pre-wrap;">${data.message}</p>
            </div>
            
            <div style="margin-top: 30px; padding: 20px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
              <p style="margin: 0;"><strong>⏰ Action Required:</strong> Send quote within 24 hours</p>
            </div>
          </div>
          
          <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
            <p>VERGO Events Ltd | London, United Kingdom</p>
          </div>
        </div>
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
      tags: [
        { name: 'category', value: 'general-enquiry' },
        { name: 'source', value: 'website' }
      ],
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #D4AF37; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">VERGO Events</h1>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #2c3e2f; margin-top: 0;">💬 New General Enquiry</h2>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <p><strong>From:</strong> ${data.name}</p>
              <p><strong>Email:</strong> <a href="mailto:${data.email}">${data.email}</a></p>
              <p><strong>Subject:</strong> ${data.subject}</p>
            </div>
            
            <div style="background: white; padding: 20px; border-radius: 8px;">
              <h3 style="margin-top: 0; color: #2c3e2f;">Message:</h3>
              <p style="white-space: pre-wrap;">${data.message}</p>
            </div>
          </div>
          
          <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
            <p>VERGO Events Ltd | London, United Kingdom</p>
          </div>
        </div>
      `
    });
    
    console.log('[EMAIL] General enquiry sent:', result);
    return result;
  } catch (error) {
    console.error('[EMAIL ERROR] General enquiry failed:', error);
    throw error;
  }
}

// ✅ UPDATED: Better styling and more information
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
      tags: [
        { name: 'category', value: 'application' },
        { name: 'source', value: 'website' }
      ],
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #D4AF37; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">VERGO Events</h1>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #2c3e2f; margin-top: 0;">📋 New Job Application</h2>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <p><strong>Applicant:</strong> ${data.applicantName}</p>
              <p><strong>Email:</strong> <a href="mailto:${data.email}">${data.email}</a></p>
              ${data.phone ? `<p><strong>Phone:</strong> ${data.phone}</p>` : ''}
            </div>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h3 style="margin-top: 0; color: #2c3e2f;">Roles Applied For:</h3>
              <ul style="margin: 0; padding-left: 20px;">
                ${data.roles.map(role => `<li style="margin-bottom: 8px;">${role}</li>`).join('')}
              </ul>
            </div>
            
            ${data.cvOriginalName ? `
              <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <p style="margin: 0;"><strong>CV:</strong> ${data.cvOriginalName}</p>
              </div>
            ` : ''}
            
            <div style="margin-top: 20px; text-align: center;">
              <a href="${env.webOrigin}/admin.html" style="display: inline-block; padding: 15px 30px; background: #D4AF37; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                📄 View in Admin Panel
              </a>
            </div>
            
            <div style="margin-top: 30px; padding: 20px; background: #e8f4fd; border-left: 4px solid #0066cc; border-radius: 4px;">
              <p style="margin: 0; font-size: 12px; color: #333;">
                <strong>Application ID:</strong> ${data.applicationId}
              </p>
            </div>
          </div>
          
          <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
            <p>VERGO Events Ltd | London, United Kingdom</p>
          </div>
        </div>
      `
    });
    
    console.log('[EMAIL] Application notification sent:', result);
    return result;
  } catch (error) {
    console.error('[EMAIL ERROR] Application notification failed:', error);
    throw error;
  }
}

// ✅ NEW: Send confirmation email to applicant
export async function sendApplicationConfirmationToApplicant(data: {
  to: string;
  name: string;
  roles: string[];
  applicationId: string;
}) {
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: '✅ Application Received - VERGO Events',
      tags: [
        { name: 'category', value: 'application-confirmation' },
        { name: 'source', value: 'website' }
      ],
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #D4AF37; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">VERGO Events</h1>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #2c3e2f; margin-top: 0;">✅ Application Received</h2>
            
            <p>Hi ${data.name},</p>
            
            <p>Thank you for applying to join our team at VERGO Events!</p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin-top: 0;"><strong>You applied for:</strong></p>
              <ul style="margin: 10px 0; padding-left: 20px;">
                ${data.roles.map(role => `<li style="margin-bottom: 8px;">${role}</li>`).join('')}
              </ul>
              <p style="margin-bottom: 0; font-size: 12px; color: #666;">
                Reference: ${data.applicationId}
              </p>
            </div>
            
            <div style="background: #d4edda; padding: 20px; border-left: 4px solid #28a745; border-radius: 4px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #155724;">What happens next?</h3>
              <ul style="margin: 0; padding-left: 20px; color: #155724;">
                <li style="margin-bottom: 8px;">We'll review your application within 48 hours</li>
                <li style="margin-bottom: 8px;">If shortlisted, we'll contact you within 2 weeks</li>
                <li>Successful candidates will be invited for an interview</li>
              </ul>
            </div>
            
            <p>We appreciate your interest in VERGO Events. If you have any questions, feel free to reply to this email.</p>
            
            <p style="margin-bottom: 0;">Best regards,<br>
            <strong>The VERGO Events Team</strong></p>
          </div>
          
          <div style="padding: 20px; text-align: center; color: #666; font-size: 12px; background: #f0f0f0;">
            <p style="margin: 0 0 10px 0;">VERGO Events Ltd | London, United Kingdom</p>
            <p style="margin: 0;">
              <a href="${env.webOrigin}" style="color: #D4AF37; text-decoration: none;">www.vergoltd.com</a>
            </p>
          </div>
        </div>
      `
    });
    
    console.log('[EMAIL] Application confirmation sent to applicant:', result);
    return result;
  } catch (error) {
    console.error('[EMAIL ERROR] Application confirmation failed:', error);
    // Don't throw - we don't want to fail the application if confirmation email fails
    console.warn('[EMAIL] Continuing despite confirmation email failure');
  }
}