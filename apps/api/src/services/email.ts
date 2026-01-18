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
// ============================================
// ADD THESE FUNCTIONS TO YOUR EXISTING email.ts
// ============================================

// Send email verification to new users
export async function sendUserVerificationEmail(data: {
  to: string;
  name: string;
  token: string;
}) {
  try {
    const verifyUrl = `${env.webOrigin}/api/v1/user/verify-email?token=${data.token}`;
    
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: '✅ Verify your VERGO Events account',
      tags: [
        { name: 'category', value: 'user-verification' },
        { name: 'source', value: 'website' }
      ],
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #D4AF37; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">VERGO Events</h1>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #2c3e2f; margin-top: 0;">Welcome, ${data.name}!</h2>
            
            <p>Thanks for creating an account with VERGO Events. Please verify your email address to get started.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verifyUrl}" style="display: inline-block; padding: 15px 40px; background: #D4AF37; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                Verify Email Address
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">Or copy this link into your browser:</p>
            <p style="color: #666; font-size: 12px; word-break: break-all; background: #fff; padding: 10px; border-radius: 4px;">${verifyUrl}</p>
            
            <div style="margin-top: 30px; padding: 20px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
              <p style="margin: 0; font-size: 14px;">This link will expire in 24 hours. If you didn't create an account, you can ignore this email.</p>
            </div>
          </div>
          
          <div style="padding: 20px; text-align: center; color: #666; font-size: 12px; background: #f0f0f0;">
            <p style="margin: 0;">VERGO Events Ltd | London, United Kingdom</p>
          </div>
        </div>
      `
    });
    
    console.log('[EMAIL] User verification sent:', result);
    return result;
  } catch (error) {
    console.error('[EMAIL ERROR] User verification failed:', error);
    throw error;
  }
}

// Send password reset email
export async function sendPasswordResetEmail(data: {
  to: string;
  name: string;
  token: string;
}) {
  try {
    const resetUrl = `${env.webOrigin}/reset-password.html?token=${data.token}`;
    
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: '🔐 Reset your VERGO Events password',
      tags: [
        { name: 'category', value: 'password-reset' },
        { name: 'source', value: 'website' }
      ],
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #D4AF37; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">VERGO Events</h1>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #2c3e2f; margin-top: 0;">Password Reset Request</h2>
            
            <p>Hi ${data.name},</p>
            
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="display: inline-block; padding: 15px 40px; background: #D4AF37; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                Reset Password
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">Or copy this link into your browser:</p>
            <p style="color: #666; font-size: 12px; word-break: break-all; background: #fff; padding: 10px; border-radius: 4px;">${resetUrl}</p>
            
            <div style="margin-top: 30px; padding: 20px; background: #f8d7da; border-left: 4px solid #dc3545; border-radius: 4px;">
              <p style="margin: 0; font-size: 14px;"><strong>⏰ This link expires in 1 hour.</strong></p>
              <p style="margin: 10px 0 0 0; font-size: 14px;">If you didn't request this reset, please ignore this email or contact us if you're concerned about your account security.</p>
            </div>
          </div>
          
          <div style="padding: 20px; text-align: center; color: #666; font-size: 12px; background: #f0f0f0;">
            <p style="margin: 0;">VERGO Events Ltd | London, United Kingdom</p>
          </div>
        </div>
      `
    });
    
    console.log('[EMAIL] Password reset sent:', result);
    return result;
  } catch (error) {
    console.error('[EMAIL ERROR] Password reset failed:', error);
    throw error;
  }
}
// Notify admin of new job application
export async function sendJobApplicationNotification(data: {
  jobTitle: string;
  applicantName: string;
  applicantEmail: string;
  applicationId: string;
}) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to: TO_EMAIL,
    subject: `📋 New Job Application - ${data.jobTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #D4AF37; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">VERGO Events</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #2c3e2f;">📋 New Job Application</h2>
          <div style="background: white; padding: 20px; border-radius: 8px;">
            <p><strong>Job:</strong> ${data.jobTitle}</p>
            <p><strong>Applicant:</strong> ${data.applicantName}</p>
            <p><strong>Email:</strong> ${data.applicantEmail}</p>
          </div>
          <div style="text-align: center; margin-top: 20px;">
            <a href="${env.webOrigin}/admin.html" style="padding: 15px 30px; background: #D4AF37; color: white; text-decoration: none; border-radius: 8px;">View in Admin</a>
          </div>
        </div>
      </div>
    `
  });
}

// Confirm to user
export async function sendJobApplicationConfirmation(data: {
  to: string;
  name: string;
  jobTitle: string;
  eventDate: Date | null;
  location: string;
}) {
  const dateStr = data.eventDate 
    ? new Date(data.eventDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : 'TBC';
  
  return resend.emails.send({
    from: FROM_EMAIL,
    to: data.to,
    subject: `✅ Application Received - ${data.jobTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #D4AF37; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">VERGO Events</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #2c3e2f;">Application Received!</h2>
          <p>Hi ${data.name},</p>
          <p>We've received your application for:</p>
          <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #D4AF37; margin: 20px 0;">
            <p style="margin: 0;"><strong>${data.jobTitle}</strong></p>
            <p style="margin: 5px 0 0; color: #666;">📍 ${data.location} • 📅 ${dateStr}</p>
          </div>
          <p>We'll be in touch within 48 hours if you're selected.</p>
        </div>
      </div>
    `
  });
}

// ============================================
// CLIENT EMAIL FUNCTIONS (B2B)
// ============================================

// Send email verification to new clients (B2B)
export async function sendClientVerificationEmail(data: {
  to: string;
  name: string;
  companyName: string;
  token: string;
}) {
  try {
    const verifyUrl = `${env.webOrigin}/api/v1/clients/verify-email?token=${data.token}`;

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: '✅ Verify your VERGO Events business account',
      tags: [
        { name: 'category', value: 'client-verification' },
        { name: 'source', value: 'website' }
      ],
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #D4AF37; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">VERGO Events</h1>
          </div>

          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #2c3e2f; margin-top: 0;">Welcome, ${data.name}!</h2>

            <p>Thanks for registering <strong>${data.companyName}</strong> with VERGO Events.</p>
            <p>Please verify your email address to continue with your registration.</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${verifyUrl}" style="display: inline-block; padding: 15px 40px; background: #D4AF37; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                Verify Email Address
              </a>
            </div>

            <p style="color: #666; font-size: 14px;">Or copy this link into your browser:</p>
            <p style="color: #666; font-size: 12px; word-break: break-all; background: #fff; padding: 10px; border-radius: 4px;">${verifyUrl}</p>

            <div style="margin-top: 30px; padding: 20px; background: #e8f4fd; border-left: 4px solid #0066cc; border-radius: 4px;">
              <h4 style="margin: 0 0 10px 0; color: #0066cc;">What happens next?</h4>
              <ol style="margin: 0; padding-left: 20px; color: #333;">
                <li style="margin-bottom: 8px;">Click the button above to verify your email</li>
                <li style="margin-bottom: 8px;">Our team will review your registration</li>
                <li style="margin-bottom: 8px;">Once approved, you'll receive an email confirmation</li>
                <li>Log in and start requesting quotes for your events!</li>
              </ol>
            </div>

            <div style="margin-top: 20px; padding: 20px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
              <p style="margin: 0; font-size: 14px;"><strong>⏰ This link expires in 24 hours.</strong></p>
              <p style="margin: 10px 0 0 0; font-size: 14px;">If you didn't register for a business account, you can safely ignore this email.</p>
            </div>
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

    console.log('[EMAIL] Client verification sent:', result);
    return result;
  } catch (error) {
    console.error('[EMAIL ERROR] Client verification failed:', error);
    throw error;
  }
}

// Send password reset email to clients
export async function sendClientPasswordResetEmail(data: {
  to: string;
  name: string;
  companyName: string;
  token: string;
}) {
  try {
    const resetUrl = `${env.webOrigin}/reset-password.html?token=${data.token}&type=client`;

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: '🔐 Reset your VERGO Events business account password',
      tags: [
        { name: 'category', value: 'client-password-reset' },
        { name: 'source', value: 'website' }
      ],
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #D4AF37; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">VERGO Events</h1>
          </div>

          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #2c3e2f; margin-top: 0;">Password Reset Request</h2>

            <p>Hi ${data.name},</p>

            <p>We received a request to reset the password for your <strong>${data.companyName}</strong> business account.</p>
            <p>Click the button below to create a new password:</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="display: inline-block; padding: 15px 40px; background: #D4AF37; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                Reset Password
              </a>
            </div>

            <p style="color: #666; font-size: 14px;">Or copy this link into your browser:</p>
            <p style="color: #666; font-size: 12px; word-break: break-all; background: #fff; padding: 10px; border-radius: 4px;">${resetUrl}</p>

            <div style="margin-top: 30px; padding: 20px; background: #f8d7da; border-left: 4px solid #dc3545; border-radius: 4px;">
              <p style="margin: 0; font-size: 14px;"><strong>⏰ This link expires in 1 hour.</strong></p>
              <p style="margin: 10px 0 0 0; font-size: 14px;">If you didn't request this reset, please ignore this email or contact us if you're concerned about your account security.</p>
            </div>
          </div>

          <div style="padding: 20px; text-align: center; color: #666; font-size: 12px; background: #f0f0f0;">
            <p style="margin: 0;">VERGO Events Ltd | London, United Kingdom</p>
          </div>
        </div>
      `
    });

    console.log('[EMAIL] Client password reset sent:', result);
    return result;
  } catch (error) {
    console.error('[EMAIL ERROR] Client password reset failed:', error);
    throw error;
  }
}

// Send approval notification to clients
export async function sendClientApprovalEmail(data: {
  to: string;
  name: string;
  companyName: string;
}) {
  try {
    const loginUrl = `${env.webOrigin}/client-login.html`;

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: '🎉 Your VERGO Events business account has been approved!',
      tags: [
        { name: 'category', value: 'client-approval' },
        { name: 'source', value: 'admin' }
      ],
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #D4AF37; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">VERGO Events</h1>
          </div>

          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #2c3e2f; margin-top: 0;">🎉 Welcome to VERGO Events!</h2>

            <p>Hi ${data.name},</p>

            <p>Great news! Your business account for <strong>${data.companyName}</strong> has been approved.</p>
            <p>You can now log in to your client dashboard and start requesting quotes for your events.</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${loginUrl}" style="display: inline-block; padding: 15px 40px; background: #D4AF37; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                Log In to Dashboard
              </a>
            </div>

            <div style="background: #fff; padding: 20px; border-radius: 8px; border-left: 4px solid #D4AF37;">
              <h4 style="margin: 0 0 15px 0; color: #2c3e2f;">What you can do:</h4>
              <ul style="margin: 0; padding-left: 20px;">
                <li style="margin-bottom: 8px;">Request quotes for event staffing</li>
                <li style="margin-bottom: 8px;">Track your quote requests</li>
                <li style="margin-bottom: 8px;">View your event history</li>
                <li>Manage your company profile</li>
              </ul>
            </div>

            <p style="margin-top: 30px;">If you have any questions, feel free to reply to this email or contact us directly.</p>

            <p>Best regards,<br><strong>The VERGO Events Team</strong></p>
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

    console.log('[EMAIL] Client approval notification sent:', result);
    return result;
  } catch (error) {
    console.error('[EMAIL ERROR] Client approval notification failed:', error);
    throw error;
  }
}

// Send rejection notification to clients
export async function sendClientRejectionEmail(data: {
  to: string;
  name: string;
  companyName: string;
  reason?: string;
}) {
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: 'VERGO Events - Account Registration Update',
      tags: [
        { name: 'category', value: 'client-rejection' },
        { name: 'source', value: 'admin' }
      ],
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #D4AF37; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">VERGO Events</h1>
          </div>

          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #2c3e2f; margin-top: 0;">Account Registration Update</h2>

            <p>Hi ${data.name},</p>

            <p>Thank you for your interest in registering <strong>${data.companyName}</strong> with VERGO Events.</p>

            <p>After reviewing your application, we're unable to approve your business account at this time.</p>

            ${data.reason ? `
              <div style="background: #fff; padding: 20px; border-radius: 8px; border-left: 4px solid #666; margin: 20px 0;">
                <p style="margin: 0; color: #333;"><strong>Reason:</strong> ${data.reason}</p>
              </div>
            ` : ''}

            <p>If you believe this was a mistake or would like more information, please reply to this email and we'll be happy to discuss further.</p>

            <p>Best regards,<br><strong>The VERGO Events Team</strong></p>
          </div>

          <div style="padding: 20px; text-align: center; color: #666; font-size: 12px; background: #f0f0f0;">
            <p style="margin: 0;">VERGO Events Ltd | London, United Kingdom</p>
          </div>
        </div>
      `
    });

    console.log('[EMAIL] Client rejection notification sent:', result);
    return result;
  } catch (error) {
    console.error('[EMAIL ERROR] Client rejection notification failed:', error);
    throw error;
  }
}