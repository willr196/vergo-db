// Email service type definitions

export interface EmailResult {
  id: string;
  success: boolean;
  error?: string;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
  scheduledAt?: Date;
}

export type EmailCategory =
  | 'transactional'  // Always sent: verification, password reset
  | 'notification'   // Can unsubscribe: job status, applications
  | 'marketing';     // Can unsubscribe: promotions

export type EmailType =
  // User emails
  | 'user-verification'
  | 'user-password-reset'
  | 'user-welcome'
  // Client emails
  | 'client-verification'
  | 'client-password-reset'
  | 'client-approval'
  | 'client-rejection'
  // Application emails
  | 'application-notification'      // To admin
  | 'application-confirmation'      // To applicant
  | 'job-application-notification'  // To admin
  | 'job-application-confirmation'  // To user
  // Enquiry emails
  | 'staff-request'
  | 'general-enquiry'
  // Reminders
  | 'quote-followup'
  | 'application-review-reminder'
  | 'shift-reminder';

export interface EmailTemplateData {
  // Common fields
  recipientName?: string;
  recipientEmail?: string;

  // Verification/auth
  verifyUrl?: string;
  resetUrl?: string;
  token?: string;

  // Company/client
  companyName?: string;

  // Application data
  applicantName?: string;
  applicationId?: string;
  roles?: string[];
  cvFileName?: string;

  // Job data
  jobTitle?: string;
  jobLocation?: string;
  eventDate?: Date | string | null;

  // Enquiry data
  name?: string;
  email?: string;
  phone?: string;
  eventType?: string;
  guests?: number;
  staffCount?: number;
  subject?: string;
  message?: string;
  company?: string;
  date?: string;

  // Rejection
  reason?: string;

  // Unsubscribe
  unsubscribeUrl?: string;
  unsubscribeToken?: string;
}

export type InfoBoxVariant = 'warning' | 'info' | 'success' | 'danger';

export interface FooterOptions {
  showUnsubscribe?: boolean;
  unsubscribeUrl?: string;
  category?: EmailCategory;
}
