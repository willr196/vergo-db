// Email service - main entry point
// Refactored from 810 lines to composable templates

import { env } from '../../env';
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

export async function sendNewClientRegistrationNotification(data: {
  companyName: string;
  contactName: string;
  email: string;
  industry?: string | null;
  clientId?: string;
}): Promise<EmailResult> {
  const html = templates.clientRegistrationNotificationEmail({
    companyName: data.companyName,
    contactName: data.contactName,
    email: data.email,
    industry: data.industry ?? undefined,
  });

  return sendEmailOrThrow({
    to: TO_EMAIL,
    replyTo: data.email,
    subject: `New client registration - ${data.companyName}`,
    html,
    emailType: 'client-registration-notification',
    clientId: data.clientId,
    tags: [
      { name: 'category', value: 'client-registration' },
      { name: 'source', value: 'website' },
    ],
  });
}

export async function sendJobSubmissionNotification(data: {
  companyName: string;
  posterEmail: string;
  jobTitle: string;
  roleName: string;
  location: string;
  payRate?: number | null;
  externalUrl?: string | null;
}): Promise<EmailResult> {
  const html = templates.jobSubmissionNotificationEmail({
    companyName: data.companyName,
    email: data.posterEmail,
    jobTitle: data.jobTitle,
    roleName: data.roleName,
    jobLocation: data.location,
    payRate: data.payRate ?? undefined,
    externalUrl: data.externalUrl ?? undefined,
  });

  return sendEmailOrThrow({
    to: TO_EMAIL,
    replyTo: data.posterEmail,
    subject: `📋 New Job Listing Submitted - ${data.companyName}`,
    html,
    emailType: 'job-submission-notification',
    tags: [
      { name: 'category', value: 'job-submission' },
      { name: 'source', value: 'website' },
    ],
  });
}

export async function sendJobApprovalEmail(data: {
  to: string;
  jobTitle: string;
  jobId: string;
}): Promise<EmailResult> {
  const html = templates.jobApprovalEmail({
    jobTitle: data.jobTitle,
    jobUrl: `${env.webOrigin}/jobs/${encodeURIComponent(data.jobId)}`,
  });

  return sendEmailOrThrow({
    to: data.to,
    subject: 'Your job listing is now live on VERGO',
    html,
    emailType: 'job-approval',
    tags: [
      { name: 'category', value: 'job-approval' },
      { name: 'source', value: 'admin' },
    ],
  });
}

export async function sendJobRejectionEmail(data: {
  to: string;
  jobTitle: string;
  reason?: string;
}): Promise<EmailResult> {
  const html = templates.jobRejectionEmail({
    jobTitle: data.jobTitle,
    reason: data.reason,
  });

  return sendEmailOrThrow({
    to: data.to,
    subject: 'Update on your VERGO job listing',
    html,
    emailType: 'job-rejection',
    tags: [
      { name: 'category', value: 'job-rejection' },
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
// SHIFT OUTCOME EMAILS
// ============================================

export async function sendShiftConfirmedEmail(data: {
  to: string;
  name: string;
  jobTitle: string;
  roleName?: string;
  eventDate?: Date | string | null;
  location?: string;
  venue?: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  payRate?: number | null;
  payType?: string | null;
}): Promise<EmailResult> {
  const html = templates.shiftConfirmedEmail({
    recipientName: data.name,
    jobTitle: data.jobTitle,
    roleName: data.roleName,
    eventDate: data.eventDate,
    jobLocation: data.location,
    venue: data.venue ?? undefined,
    shiftStart: data.shiftStart ?? undefined,
    shiftEnd: data.shiftEnd ?? undefined,
    payRate: data.payRate ?? undefined,
    payType: data.payType ?? undefined,
  });

  return sendEmailSilent({
    to: data.to,
    subject: `✅ You're confirmed: ${data.jobTitle}`,
    html,
    emailType: 'shift-confirmed',
    tags: [
      { name: 'category', value: 'shift-confirmed' },
      { name: 'source', value: 'admin' },
    ],
  }) as Promise<EmailResult>;
}

export async function sendShiftNotSelectedEmail(data: {
  to: string;
  name: string;
  jobTitle: string;
}): Promise<EmailResult> {
  const html = templates.shiftNotSelectedEmail({
    recipientName: data.name,
    jobTitle: data.jobTitle,
  });

  return sendEmailSilent({
    to: data.to,
    subject: `Update on your application: ${data.jobTitle}`,
    html,
    emailType: 'shift-not-selected',
    tags: [
      { name: 'category', value: 'shift-not-selected' },
      { name: 'source', value: 'admin' },
    ],
  }) as Promise<EmailResult>;
}

// ============================================
// ROSTER EMAILS
// ============================================

export async function sendRosterApprovalEmail(data: {
  to: string;
  name: string;
  email: string;
  tempPassword?: string;
}): Promise<EmailResult> {
  const html = templates.rosterApprovalEmail({
    recipientName: data.name,
    email: data.email,
    tempPassword: data.tempPassword,
  });

  return sendEmailSilent({
    to: data.to,
    subject: '\u{1F389} Welcome to the VERGO Roster!',
    html,
    emailType: 'roster-approval',
    tags: [
      { name: 'category', value: 'roster-approval' },
      { name: 'source', value: 'admin' },
    ],
  }) as Promise<EmailResult>;
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

export async function sendJobInviteEmail(data: {
  to: string;
  workerName: string;
  jobTitle: string;
  roleName: string;
  eventDate: Date | null;
  location: string;
  shiftStart?: string;
  shiftEnd?: string;
  adminNote?: string;
  inviteId: string;
}): Promise<EmailResult> {
  const html = templates.jobInviteEmail({
    recipientName: data.workerName,
    jobTitle: data.jobTitle,
    roleName: data.roleName,
    eventDate: data.eventDate,
    jobLocation: data.location,
    shiftStart: data.shiftStart,
    shiftEnd: data.shiftEnd,
    adminNote: data.adminNote,
  });

  return sendEmailSilent({
    to: data.to,
    subject: `You've been invited to a VERGO shift — ${data.jobTitle}`,
    html,
    emailType: 'job-invite',
    tags: [
      { name: 'category', value: 'job-invite' },
      { name: 'source', value: 'admin' },
    ],
  }) as Promise<EmailResult>;
}

export async function sendBookingReviewRequestEmail(data: {
  to: string;
  clientName: string;
  staffName: string;
  eventDate: Date;
  bookingId: string;
}): Promise<EmailResult> {
  const html = templates.bookingReviewRequestEmail({
    recipientName: data.clientName,
    staffName: data.staffName,
    eventDate: data.eventDate,
  });

  return sendEmailSilent({
    to: data.to,
    subject: 'How did your VERGO event go? Leave a quick review',
    html,
    emailType: 'booking-review-request',
    tags: [
      { name: 'category', value: 'booking-review-request' },
      { name: 'source', value: 'automated' },
    ],
  }) as Promise<EmailResult>;
}
