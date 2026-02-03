// Email service - main entry point
// Refactored from 810 lines to composable templates

import { sendEmail, sendEmailOrThrow, sendEmailSilent, FROM_EMAIL, TO_EMAIL } from './sender';
import * as templates from './templates';
import type { EmailResult } from './types';

// Re-export constants for backwards compatibility
export { FROM_EMAIL, TO_EMAIL };

// ============================================
// USER EMAILS
// ============================================

export async function sendUserVerificationEmail(data: {
  to: string;
  name: string;
  token: string;
  userId?: string;
}): Promise<EmailResult> {
  const html = templates.userVerificationEmail({
    recipientName: data.name,
    token: data.token,
  });

  return sendEmailOrThrow({
    to: data.to,
    subject: 'Verify your VERGO account',
    html,
    emailType: 'user-verification',
    userId: data.userId,
    tags: [
      { name: 'category', value: 'user-verification' },
      { name: 'source', value: 'website' },
    ],
  });
}

export async function sendPasswordResetEmail(data: {
  to: string;
  name: string;
  token: string;
  userId?: string;
}): Promise<EmailResult> {
  const html = templates.userPasswordResetEmail({
    recipientName: data.name,
    token: data.token,
  });

  return sendEmailOrThrow({
    to: data.to,
    subject: 'Reset your VERGO password',
    html,
    emailType: 'user-password-reset',
    userId: data.userId,
    tags: [
      { name: 'category', value: 'password-reset' },
      { name: 'source', value: 'website' },
    ],
  });
}

// ============================================
// CLIENT EMAILS
// ============================================

export async function sendClientVerificationEmail(data: {
  to: string;
  name: string;
  companyName: string;
  token: string;
  clientId?: string;
}): Promise<EmailResult> {
  const html = templates.clientVerificationEmail({
    recipientName: data.name,
    companyName: data.companyName,
    token: data.token,
  });

  return sendEmailOrThrow({
    to: data.to,
    subject: 'Verify your VERGO business account',
    html,
    emailType: 'client-verification',
    clientId: data.clientId,
    tags: [
      { name: 'category', value: 'client-verification' },
      { name: 'source', value: 'website' },
    ],
  });
}

export async function sendClientPasswordResetEmail(data: {
  to: string;
  name: string;
  companyName: string;
  token: string;
  clientId?: string;
}): Promise<EmailResult> {
  const html = templates.clientPasswordResetEmail({
    recipientName: data.name,
    companyName: data.companyName,
    token: data.token,
  });

  return sendEmailOrThrow({
    to: data.to,
    subject: 'Reset your VERGO business account password',
    html,
    emailType: 'client-password-reset',
    clientId: data.clientId,
    tags: [
      { name: 'category', value: 'client-password-reset' },
      { name: 'source', value: 'website' },
    ],
  });
}

export async function sendClientApprovalEmail(data: {
  to: string;
  name: string;
  companyName: string;
  clientId?: string;
}): Promise<EmailResult> {
  const html = templates.clientApprovalEmail({
    recipientName: data.name,
    companyName: data.companyName,
  });

  return sendEmailOrThrow({
    to: data.to,
    subject: 'Your VERGO business account has been approved!',
    html,
    emailType: 'client-approval',
    clientId: data.clientId,
    tags: [
      { name: 'category', value: 'client-approval' },
      { name: 'source', value: 'admin' },
    ],
  });
}

export async function sendClientRejectionEmail(data: {
  to: string;
  name: string;
  companyName: string;
  reason?: string;
  clientId?: string;
}): Promise<EmailResult> {
  const html = templates.clientRejectionEmail({
    recipientName: data.name,
    companyName: data.companyName,
    reason: data.reason,
  });

  return sendEmailOrThrow({
    to: data.to,
    subject: 'VERGO - Account Registration Update',
    html,
    emailType: 'client-rejection',
    clientId: data.clientId,
    tags: [
      { name: 'category', value: 'client-rejection' },
      { name: 'source', value: 'admin' },
    ],
  });
}

// ============================================
// APPLICATION EMAILS
// ============================================

export async function sendApplicationNotificationEmail(data: {
  applicantName: string;
  email: string;
  phone?: string;
  roles: string[];
  cvOriginalName?: string;
  applicationId: string;
}): Promise<EmailResult> {
  const html = templates.applicationNotificationEmail({
    applicantName: data.applicantName,
    email: data.email,
    phone: data.phone,
    roles: data.roles,
    cvFileName: data.cvOriginalName,
    applicationId: data.applicationId,
  });

  return sendEmailOrThrow({
    to: TO_EMAIL,
    subject: `New Job Application - ${data.applicantName}`,
    html,
    emailType: 'application-notification',
    tags: [
      { name: 'category', value: 'application' },
      { name: 'source', value: 'website' },
    ],
  });
}

export async function sendApplicationConfirmationToApplicant(data: {
  to: string;
  name: string;
  roles: string[];
  applicationId: string;
}): Promise<EmailResult | null> {
  const html = templates.applicationConfirmationEmail({
    recipientName: data.name,
    roles: data.roles,
    applicationId: data.applicationId,
  });

  // Use silent send - don't fail the application if confirmation fails
  return sendEmailSilent({
    to: data.to,
    subject: 'Application Received - VERGO',
    html,
    emailType: 'application-confirmation',
    tags: [
      { name: 'category', value: 'application-confirmation' },
      { name: 'source', value: 'website' },
    ],
  });
}

export async function sendJobApplicationNotification(data: {
  jobTitle: string;
  applicantName: string;
  applicantEmail: string;
  applicationId: string;
}): Promise<EmailResult> {
  const html = templates.jobApplicationNotificationEmail({
    jobTitle: data.jobTitle,
    applicantName: data.applicantName,
    email: data.applicantEmail,
  });

  return sendEmail({
    to: TO_EMAIL,
    subject: `New Job Application - ${data.jobTitle}`,
    html,
    emailType: 'job-application-notification',
    tags: [
      { name: 'category', value: 'job-application' },
      { name: 'source', value: 'website' },
    ],
  });
}

export async function sendJobApplicationConfirmation(data: {
  to: string;
  name: string;
  jobTitle: string;
  eventDate: Date | null;
  location: string;
  userId?: string;
}): Promise<EmailResult> {
  const html = templates.jobApplicationConfirmationEmail({
    recipientName: data.name,
    jobTitle: data.jobTitle,
    eventDate: data.eventDate,
    jobLocation: data.location,
  });

  return sendEmail({
    to: data.to,
    subject: `Application Received - ${data.jobTitle}`,
    html,
    emailType: 'job-application-confirmation',
    userId: data.userId,
    tags: [
      { name: 'category', value: 'job-application-confirmation' },
      { name: 'source', value: 'website' },
    ],
  });
}

// ============================================
// ENQUIRY EMAILS
// ============================================

export async function sendStaffRequestEmail(data: {
  name: string;
  email: string;
  phone?: string;
  company: string;
  roles: string[];
  date?: string;
  staffCount: number;
  message: string;
}): Promise<EmailResult> {
  const html = templates.staffRequestEmail({
    name: data.name,
    email: data.email,
    phone: data.phone,
    company: data.company,
    roles: data.roles,
    date: data.date,
    staffCount: data.staffCount,
    message: data.message,
  });

  return sendEmailOrThrow({
    to: TO_EMAIL,
    replyTo: data.email,
    subject: `New Staff Request - ${data.company}`,
    html,
    emailType: 'staff-request',
    tags: [
      { name: 'category', value: 'staff-request' },
      { name: 'source', value: 'website' },
    ],
  });
}

export async function sendGeneralEnquiryEmail(data: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<EmailResult> {
  const html = templates.generalEnquiryEmail({
    name: data.name,
    email: data.email,
    subject: data.subject,
    message: data.message,
  });

  return sendEmailOrThrow({
    to: TO_EMAIL,
    replyTo: data.email,
    subject: data.subject,
    html,
    emailType: 'general-enquiry',
    tags: [
      { name: 'category', value: 'general-enquiry' },
      { name: 'source', value: 'website' },
    ],
  });
}

// ============================================
// REMINDER EMAILS (for Phase 5)
// ============================================

export async function sendQuoteFollowupEmail(data: {
  to: string;
  name: string;
  eventType: string;
  date: string;
  unsubscribeUrl?: string;
  clientId?: string;
}): Promise<EmailResult> {
  const html = templates.quoteFollowupEmail({
    recipientName: data.name,
    eventType: data.eventType,
    date: data.date,
    unsubscribeUrl: data.unsubscribeUrl,
  });

  return sendEmail({
    to: data.to,
    subject: 'Following up on your VERGO quote',
    html,
    emailType: 'quote-followup',
    clientId: data.clientId,
    tags: [
      { name: 'category', value: 'quote-followup' },
      { name: 'source', value: 'automated' },
    ],
  });
}

export async function sendApplicationReviewReminder(data: {
  applicantName: string;
  applicationId: string;
  roles?: string[];
}): Promise<EmailResult> {
  const html = templates.applicationReviewReminderEmail({
    applicantName: data.applicantName,
    applicationId: data.applicationId,
    roles: data.roles,
  });

  return sendEmail({
    to: TO_EMAIL,
    subject: 'Application Review Reminder',
    html,
    emailType: 'application-review-reminder',
    tags: [
      { name: 'category', value: 'review-reminder' },
      { name: 'source', value: 'automated' },
    ],
  });
}

export async function sendShiftReminderEmail(data: {
  to: string;
  name: string;
  jobTitle: string;
  location: string;
  eventDate: Date;
  unsubscribeUrl?: string;
  userId?: string;
}): Promise<EmailResult> {
  const html = templates.shiftReminderEmail({
    recipientName: data.name,
    jobTitle: data.jobTitle,
    jobLocation: data.location,
    eventDate: data.eventDate,
    unsubscribeUrl: data.unsubscribeUrl,
  });

  return sendEmail({
    to: data.to,
    subject: `Shift Reminder - ${data.jobTitle}`,
    html,
    emailType: 'shift-reminder',
    userId: data.userId,
    tags: [
      { name: 'category', value: 'shift-reminder' },
      { name: 'source', value: 'automated' },
    ],
  });
}
