// ============================================
// ADD THESE FUNCTIONS TO YOUR EXISTING email.ts
// Place them after sendUserVerificationEmail and sendPasswordResetEmail
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
      subject: '✅ Verify your VERGO business account',
      tags: [
        { name: 'category', value: 'client-verification' },
        { name: 'source', value: 'website' }
      ],
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #D4AF37; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">VERGO</h1>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #2c3e2f; margin-top: 0;">Welcome, ${data.name}!</h2>
            
            <p>Thanks for registering <strong>${data.companyName}</strong> with VERGO.</p>
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
                <li>Log in and start requesting staffing quotes!</li>
              </ol>
            </div>
            
            <div style="margin-top: 20px; padding: 20px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
              <p style="margin: 0; font-size: 14px;"><strong>⏰ This link expires in 24 hours.</strong></p>
              <p style="margin: 10px 0 0 0; font-size: 14px;">If you didn't register for a business account, you can safely ignore this email.</p>
            </div>
          </div>
          
          <div style="padding: 20px; text-align: center; color: #666; font-size: 12px; background: #f0f0f0;">
            <p style="margin: 0 0 10px 0;">VERGO Ltd | London, United Kingdom</p>
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
      subject: '🔐 Reset your VERGO business account password',
      tags: [
        { name: 'category', value: 'client-password-reset' },
        { name: 'source', value: 'website' }
      ],
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #D4AF37; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">VERGO</h1>
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
            <p style="margin: 0;">VERGO Ltd | London, United Kingdom</p>
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
      subject: '🎉 Your VERGO business account has been approved!',
      tags: [
        { name: 'category', value: 'client-approval' },
        { name: 'source', value: 'admin' }
      ],
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #D4AF37; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">VERGO</h1>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #2c3e2f; margin-top: 0;">🎉 Welcome to VERGO!</h2>
            
            <p>Hi ${data.name},</p>
            
            <p>Great news! Your business account for <strong>${data.companyName}</strong> has been approved.</p>
            <p>You can now log in to your client dashboard and start requesting staffing quotes.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${loginUrl}" style="display: inline-block; padding: 15px 40px; background: #D4AF37; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                Log In to Dashboard
              </a>
            </div>
            
            <div style="background: #fff; padding: 20px; border-radius: 8px; border-left: 4px solid #D4AF37;">
              <h4 style="margin: 0 0 15px 0; color: #2c3e2f;">What you can do:</h4>
              <ul style="margin: 0; padding-left: 20px;">
                <li style="margin-bottom: 8px;">Request staffing quotes</li>
                <li style="margin-bottom: 8px;">Track your quote requests</li>
                <li style="margin-bottom: 8px;">View your booking history</li>
                <li>Manage your company profile</li>
              </ul>
            </div>
            
            <p style="margin-top: 30px;">If you have any questions, feel free to reply to this email or contact us directly.</p>
            
            <p>Best regards,<br><strong>The VERGO Team</strong></p>
          </div>
          
          <div style="padding: 20px; text-align: center; color: #666; font-size: 12px; background: #f0f0f0;">
            <p style="margin: 0 0 10px 0;">VERGO Ltd | London, United Kingdom</p>
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
      subject: 'VERGO - Account Registration Update',
      tags: [
        { name: 'category', value: 'client-rejection' },
        { name: 'source', value: 'admin' }
      ],
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #D4AF37; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">VERGO</h1>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #2c3e2f; margin-top: 0;">Account Registration Update</h2>
            
            <p>Hi ${data.name},</p>
            
            <p>Thank you for your interest in registering <strong>${data.companyName}</strong> with VERGO.</p>
            
            <p>After reviewing your application, we're unable to approve your business account at this time.</p>
            
            ${data.reason ? `
              <div style="background: #fff; padding: 20px; border-radius: 8px; border-left: 4px solid #666; margin: 20px 0;">
                <p style="margin: 0; color: #333;"><strong>Reason:</strong> ${data.reason}</p>
              </div>
            ` : ''}
            
            <p>If you believe this was a mistake or would like more information, please reply to this email and we'll be happy to discuss further.</p>
            
            <p>Best regards,<br><strong>The VERGO Team</strong></p>
          </div>
          
          <div style="padding: 20px; text-align: center; color: #666; font-size: 12px; background: #f0f0f0;">
            <p style="margin: 0;">VERGO Ltd | London, United Kingdom</p>
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
