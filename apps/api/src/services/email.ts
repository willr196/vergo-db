// Re-export all email functions from the new modular email service
// This maintains backward compatibility with existing imports

export {
  FROM_EMAIL,
  TO_EMAIL,
  // User emails
  sendUserVerificationEmail,
  sendPasswordResetEmail,
  // Client emails
  sendClientVerificationEmail,
  sendClientPasswordResetEmail,
  sendClientApprovalEmail,
  sendClientRejectionEmail,
  sendNewClientRegistrationNotification,
  // Application emails
  sendApplicationNotificationEmail,
  sendApplicationConfirmationToApplicant,
  sendJobSubmissionNotification,
  sendJobApprovalEmail,
  sendJobRejectionEmail,
  sendJobApplicationNotification,
  sendJobApplicationConfirmation,
  // Roster emails
  sendRosterApprovalEmail,
  // Enquiry emails
  sendStaffRequestEmail,
  sendGeneralEnquiryEmail,
  // Reminder emails
  sendQuoteFollowupEmail,
  sendApplicationReviewReminder,
  sendShiftReminderEmail,
} from './email/index';
