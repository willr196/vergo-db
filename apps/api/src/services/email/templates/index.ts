// Email template builders for each email type

import { env } from '../../../env';
import type { EmailTemplateData } from '../types';
import {
  safe,
  composeEmail,
  emailBody,
  sectionHeading,
  contentCard,
  accentCard,
  primaryButton,
  infoBox,
  listItems,
  orderedList,
  detailRow,
  emailLink,
  linkDisplay,
  paragraph,
} from './components';

// ============================================
// USER EMAILS
// ============================================

export const userVerificationEmail = (data: EmailTemplateData): string => {
  const verifyUrl = data.verifyUrl || `${env.webOrigin}/api/v1/user/verify-email?token=${encodeURIComponent(data.token || '')}`;

  return composeEmail({
    body: emailBody(`
      ${sectionHeading(`Welcome, ${data.recipientName}!`)}
      ${paragraph('Thanks for creating an account with VERGO. Please verify your email address to get started.')}
      ${primaryButton('Verify Email Address', verifyUrl)}
      ${linkDisplay(verifyUrl, 'Or copy this link into your browser:')}
      ${infoBox('<p style="margin: 0; font-size: 14px;">This link will expire in 24 hours. If you didn\'t create an account, you can ignore this email.</p>', 'warning')}
    `),
  });
};

export const userPasswordResetEmail = (data: EmailTemplateData): string => {
  const resetUrl = data.resetUrl || `${env.webOrigin}/reset-password.html?token=${encodeURIComponent(data.token || '')}`;

  return composeEmail({
    body: emailBody(`
      ${sectionHeading('Password Reset Request')}
      <p>Hi ${safe(data.recipientName)},</p>
      ${paragraph('We received a request to reset your password. Click the button below to create a new password:')}
      ${primaryButton('Reset Password', resetUrl)}
      ${linkDisplay(resetUrl, 'Or copy this link into your browser:')}
      ${infoBox(`
        <p style="margin: 0; font-size: 14px;"><strong>This link expires in 1 hour.</strong></p>
        <p style="margin: 10px 0 0 0; font-size: 14px;">If you didn't request this reset, please ignore this email or contact us if you're concerned about your account security.</p>
      `, 'danger')}
    `),
  });
};

// ============================================
// CLIENT EMAILS
// ============================================

export const clientVerificationEmail = (data: EmailTemplateData): string => {
  const verifyUrl = data.verifyUrl || `${env.webOrigin}/api/v1/clients/verify-email?token=${encodeURIComponent(data.token || '')}`;

  return composeEmail({
    body: emailBody(`
      ${sectionHeading(`Welcome, ${data.recipientName}!`)}
      <p>Thanks for registering <strong>${safe(data.companyName)}</strong> with VERGO.</p>
      ${paragraph('Please verify your email address to continue with your registration.')}
      ${primaryButton('Verify Email Address', verifyUrl)}
      ${linkDisplay(verifyUrl, 'Or copy this link into your browser:')}
      ${infoBox(`
        <h4 style="margin: 0 0 10px 0; color: #0066cc;">What happens next?</h4>
        ${orderedList([
          'Click the button above to verify your email',
          'Our team will review your registration',
          'Once approved, you\'ll receive an email confirmation',
          'Log in and start requesting staffing quotes!',
        ])}
      `, 'info')}
      ${infoBox(`
        <p style="margin: 0; font-size: 14px;"><strong>This link expires in 24 hours.</strong></p>
        <p style="margin: 10px 0 0 0; font-size: 14px;">If you didn't register for a business account, you can safely ignore this email.</p>
      `, 'warning')}
    `),
  });
};

export const clientPasswordResetEmail = (data: EmailTemplateData): string => {
  const resetUrl = data.resetUrl || `${env.webOrigin}/reset-password.html?token=${encodeURIComponent(data.token || '')}&type=client`;

  return composeEmail({
    body: emailBody(`
      ${sectionHeading('Password Reset Request')}
      <p>Hi ${safe(data.recipientName)},</p>
      <p>We received a request to reset the password for your <strong>${safe(data.companyName)}</strong> business account.</p>
      ${paragraph('Click the button below to create a new password:')}
      ${primaryButton('Reset Password', resetUrl)}
      ${linkDisplay(resetUrl, 'Or copy this link into your browser:')}
      ${infoBox(`
        <p style="margin: 0; font-size: 14px;"><strong>This link expires in 1 hour.</strong></p>
        <p style="margin: 10px 0 0 0; font-size: 14px;">If you didn't request this reset, please ignore this email or contact us if you're concerned about your account security.</p>
      `, 'danger')}
    `),
  });
};

export const clientApprovalEmail = (data: EmailTemplateData): string => {
  const loginUrl = `${env.webOrigin}/client-login.html`;

  return composeEmail({
    body: emailBody(`
      ${sectionHeading('Welcome to VERGO!', '🎉')}
      <p>Hi ${safe(data.recipientName)},</p>
      <p>Great news! Your business account for <strong>${safe(data.companyName)}</strong> has been approved.</p>
      ${paragraph('You can now log in to your client dashboard and start requesting staffing quotes.')}
      ${primaryButton('Log In to Dashboard', loginUrl)}
      ${contentCard(`
        <h4 style="margin: 0 0 15px 0; color: #2c3e2f;">What you can do:</h4>
        ${listItems([
          'Request staffing quotes',
          'Track your quote requests',
          'View your booking history',
          'Manage your company profile',
        ])}
      `)}
      ${paragraph('If you have any questions, feel free to reply to this email or contact us directly.')}
      <p>Best regards,<br><strong>The VERGO Team</strong></p>
    `),
  });
};

export const clientRejectionEmail = (data: EmailTemplateData): string => {
  return composeEmail({
    body: emailBody(`
      ${sectionHeading('Account Registration Update')}
      <p>Hi ${safe(data.recipientName)},</p>
      <p>Thank you for your interest in registering <strong>${safe(data.companyName)}</strong> with VERGO.</p>
      ${paragraph('After reviewing your application, we\'re unable to approve your business account at this time.')}
      ${data.reason ? infoBox(`<p style="margin: 0; color: #333;"><strong>Reason:</strong> ${safe(data.reason)}</p>`, 'info') : ''}
      ${paragraph('If you believe this was a mistake or would like more information, please reply to this email and we\'ll be happy to discuss further.')}
      <p>Best regards,<br><strong>The VERGO Team</strong></p>
    `),
  });
};

// ============================================
// APPLICATION EMAILS
// ============================================

export const applicationNotificationEmail = (data: EmailTemplateData): string => {
  const adminUrl = `${env.webOrigin}/admin.html`;

  return composeEmail({
    body: emailBody(`
      ${sectionHeading('New Job Application', '📋')}
      ${contentCard(`
        ${detailRow('Applicant', data.applicantName)}
        ${detailRow('Email', data.email)}
        ${data.phone ? detailRow('Phone', data.phone) : ''}
      `)}
      ${data.roles?.length ? contentCard(`
        <h3 style="margin-top: 0; color: #2c3e2f;">Roles Applied For:</h3>
        ${listItems(data.roles)}
      `) : ''}
      ${data.cvFileName ? contentCard(`<p style="margin: 0;"><strong>CV:</strong> ${safe(data.cvFileName)}</p>`) : ''}
      ${primaryButton('📄 View in Admin Panel', adminUrl)}
      ${infoBox(`<p style="margin: 0; font-size: 12px; color: #333;"><strong>Application ID:</strong> ${safe(data.applicationId)}</p>`, 'info')}
    `),
  });
};

export const applicationConfirmationEmail = (data: EmailTemplateData): string => {
  return composeEmail({
    body: emailBody(`
      ${sectionHeading('Application Received', '✅')}
      <p>Hi ${safe(data.recipientName)},</p>
      ${paragraph('Thank you for applying to join our team at VERGO!')}
      ${contentCard(`
        <p style="margin-top: 0;"><strong>You applied for:</strong></p>
        ${listItems(data.roles || [])}
        <p style="margin-bottom: 0; font-size: 12px; color: #666;">Reference: ${safe(data.applicationId)}</p>
      `)}
      ${infoBox(`
        <h3 style="margin-top: 0; color: #155724;">What happens next?</h3>
        ${listItems([
          'We\'ll review your application within 48 hours',
          'If shortlisted, we\'ll contact you within 2 weeks',
          'Successful candidates will be invited for an interview',
        ])}
      `, 'success')}
      ${paragraph('We appreciate your interest in VERGO. If you have any questions, feel free to reply to this email.')}
      <p style="margin-bottom: 0;">Best regards,<br><strong>The VERGO Team</strong></p>
    `),
  });
};

export const jobApplicationNotificationEmail = (data: EmailTemplateData): string => {
  const adminUrl = `${env.webOrigin}/admin.html`;

  return composeEmail({
    body: emailBody(`
      ${sectionHeading('New Job Application', '📋')}
      ${contentCard(`
        ${detailRow('Job', data.jobTitle)}
        ${detailRow('Applicant', data.applicantName)}
        ${detailRow('Email', data.email)}
      `)}
      ${primaryButton('View in Admin', adminUrl)}
    `),
  });
};

export const jobApplicationConfirmationEmail = (data: EmailTemplateData): string => {
  const dateStr = data.eventDate
    ? new Date(data.eventDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : 'TBC';

  return composeEmail({
    body: emailBody(`
      ${sectionHeading('Application Received!')}
      <p>Hi ${safe(data.recipientName)},</p>
      ${paragraph('We\'ve received your application for:')}
      ${accentCard(`
        <p style="margin: 0;"><strong>${safe(data.jobTitle)}</strong></p>
        <p style="margin: 5px 0 0; color: #666;">📍 ${safe(data.jobLocation)} • 📅 ${safe(dateStr)}</p>
      `)}
      ${paragraph('We\'ll be in touch within 48 hours if you\'re selected.')}
    `),
  });
};

// ============================================
// ENQUIRY EMAILS
// ============================================

export const staffRequestEmail = (data: EmailTemplateData): string => {
  return composeEmail({
    body: emailBody(`
      ${sectionHeading('New Staff Request', '👥')}
      ${contentCard(`
        ${detailRow('From', data.name)}
        <p><strong>Email:</strong> ${emailLink(data.email || '')}</p>
        ${data.phone ? detailRow('Phone', data.phone) : ''}
        ${detailRow('Company', data.company)}
        ${data.date ? detailRow('Event Date', data.date) : '<p><strong>Event Date:</strong> TBC / Flexible</p>'}
        ${detailRow('Staff Needed', data.staffCount)}
      `)}
      ${data.roles?.length ? contentCard(`
        <h3 style="margin-top: 0; color: #2c3e2f;">Roles Required:</h3>
        ${listItems(data.roles)}
      `) : ''}
      ${contentCard(`
        <h3 style="margin-top: 0; color: #2c3e2f;">Additional Details:</h3>
        <p style="white-space: pre-wrap;">${safe(data.message)}</p>
      `)}
      ${infoBox('<p style="margin: 0;"><strong>⏰ Action Required:</strong> Send quote within 24 hours</p>', 'warning')}
    `),
  });
};

export const generalEnquiryEmail = (data: EmailTemplateData): string => {
  return composeEmail({
    body: emailBody(`
      ${sectionHeading('New General Enquiry', '💬')}
      ${contentCard(`
        ${detailRow('From', data.name)}
        <p><strong>Email:</strong> ${emailLink(data.email || '')}</p>
        ${detailRow('Subject', data.subject)}
      `)}
      ${contentCard(`
        <h3 style="margin-top: 0; color: #2c3e2f;">Message:</h3>
        <p style="white-space: pre-wrap;">${safe(data.message)}</p>
      `)}
    `),
  });
};

// ============================================
// REMINDER EMAILS (Phase 5)
// ============================================

export const quoteFollowupEmail = (data: EmailTemplateData): string => {
  return composeEmail({
    body: emailBody(`
      ${sectionHeading('Following up on your quote')}
      <p>Hi ${safe(data.recipientName)},</p>
      ${paragraph('We sent you a quote a few days ago and wanted to check if you have any questions.')}
      ${contentCard(`
        ${detailRow('Event', data.eventType)}
        ${detailRow('Date', data.date)}
      `)}
      ${paragraph('Please reply to this email if you\'d like to discuss the quote or proceed with booking.')}
      <p>Best regards,<br><strong>The VERGO Team</strong></p>
    `),
    footer: { showUnsubscribe: true, unsubscribeUrl: data.unsubscribeUrl },
  });
};

export const applicationReviewReminderEmail = (data: EmailTemplateData): string => {
  const adminUrl = `${env.webOrigin}/admin.html`;

  return composeEmail({
    body: emailBody(`
      ${sectionHeading('Application Review Reminder', '⏰')}
      ${paragraph('The following application has been pending review for 48 hours:')}
      ${contentCard(`
        ${detailRow('Applicant', data.applicantName)}
        ${detailRow('Application ID', data.applicationId)}
        ${data.roles?.length ? `<p><strong>Roles:</strong> ${data.roles.join(', ')}</p>` : ''}
      `)}
      ${primaryButton('Review Application', adminUrl)}
    `),
  });
};

export const shiftReminderEmail = (data: EmailTemplateData): string => {
  const dateStr = data.eventDate
    ? new Date(data.eventDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : 'TBC';

  return composeEmail({
    body: emailBody(`
      ${sectionHeading('Shift Reminder', '📅')}
      <p>Hi ${safe(data.recipientName)},</p>
      ${paragraph('This is a reminder about your upcoming shift:')}
      ${accentCard(`
        <p style="margin: 0;"><strong>${safe(data.jobTitle)}</strong></p>
        <p style="margin: 5px 0 0; color: #666;">📍 ${safe(data.jobLocation)}</p>
        <p style="margin: 5px 0 0; color: #666;">📅 ${safe(dateStr)}</p>
      `)}
      ${paragraph('Please arrive 15 minutes before your shift start time.')}
      <p>See you there!<br><strong>The VERGO Team</strong></p>
    `),
    footer: { showUnsubscribe: true, unsubscribeUrl: data.unsubscribeUrl },
  });
};
