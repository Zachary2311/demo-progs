import type { Env } from '../types';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// Simple SMTP email sender using fetch (works in Workers)
export async function sendEmail(env: Env, options: EmailOptions): Promise<boolean> {
  const { to, subject, html, text } = options;

  // For production, you'd use a service like Mailgun, SendGrid, or Resend
  // This is a simplified implementation that works with standard SMTP APIs
  
  try {
    // Using a generic email API approach (configure based on provider)
    // Example using Mailgun-style API
    const response = await fetch(`https://${env.SMTP_HOST}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`api:${env.SMTP_PASS}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        from: env.SMTP_FROM,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''),
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

// Send verification email
export async function sendVerificationEmail(
  env: Env,
  email: string,
  token: string,
  name: string
): Promise<boolean> {
  const verifyUrl = `${env.APP_URL}/api/auth/verify?token=${token}`;
  
  return sendEmail(env, {
    to: email,
    subject: 'Verify your CF Chat account',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { 
              display: inline-block; 
              padding: 12px 24px; 
              background-color: #0ea5e9; 
              color: white; 
              text-decoration: none; 
              border-radius: 6px; 
              margin: 20px 0;
            }
            .footer { margin-top: 40px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Welcome to CF Chat, ${name}!</h1>
            <p>Thank you for signing up. Please verify your email address by clicking the button below:</p>
            <a href="${verifyUrl}" class="button">Verify Email</a>
            <p>Or copy and paste this link into your browser:</p>
            <p><a href="${verifyUrl}">${verifyUrl}</a></p>
            <p>This link will expire in 24 hours.</p>
            <div class="footer">
              <p>If you didn't create an account, you can safely ignore this email.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  });
}

// Send password reset email
export async function sendPasswordResetEmail(
  env: Env,
  email: string,
  token: string,
  name: string
): Promise<boolean> {
  const resetUrl = `${env.APP_URL}/reset-password?token=${token}`;
  
  return sendEmail(env, {
    to: email,
    subject: 'Reset your CF Chat password',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { 
              display: inline-block; 
              padding: 12px 24px; 
              background-color: #0ea5e9; 
              color: white; 
              text-decoration: none; 
              border-radius: 6px; 
              margin: 20px 0;
            }
            .footer { margin-top: 40px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Password Reset Request</h1>
            <p>Hi ${name},</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <a href="${resetUrl}" class="button">Reset Password</a>
            <p>Or copy and paste this link into your browser:</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            <p>This link will expire in 1 hour.</p>
            <div class="footer">
              <p>If you didn't request a password reset, you can safely ignore this email.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  });
}
