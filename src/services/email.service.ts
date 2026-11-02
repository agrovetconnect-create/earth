import { Resend } from 'resend';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export function isEmailConfigured(): boolean {
  const key = (env.EMAIL_API_KEY ?? '').trim();
  return (
    key.length > 0 &&
    !key.includes('not_configured') &&
    !key.includes('placeholder')
  );
}

const resend = isEmailConfigured() ? new Resend(env.EMAIL_API_KEY) : null;

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Sends a professional branded email.
 *
 * In development without Resend credentials, logs to the console so local OTP
 * flows can be exercised. In production without Resend credentials, fails
 * closed (`false`) without logging any OTP or claiming the email was sent.
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const from = env.EMAIL_FROM;

  if (!resend) {
    if (env.IS_PRODUCTION) {
      logger.error('Email service is not configured in production; email could not be delivered');
      return false;
    }
    logger.info('[development] Email service is not configured. Logging email locally:', {
      from,
      to: options.to,
      subject: options.subject,
      text: options.text || 'HTML content omitted',
    });
    return true;
  }

  try {
    const { error } = await resend.emails.send({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    if (error) {
      logger.error('Failed to send email via Resend:', { error, to: options.to });
      return false;
    }

    return true;
  } catch (err) {
    logger.error('Error sending email:', { error: String(err), to: options.to });
    return false;
  }
}

/**
 * Generates the official Earth Talk branded verification email template.
 */
export function getEarthTalkVerificationEmailTemplate(code: string, displayName?: string | null): string {
  const name = displayName?.trim() || 'Contributor';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Earth Talk Verification Code</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f9fafb; }
        .container { max-width: 520px; margin: 30px auto; padding: 32px 24px; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
        .header { text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f3f4f6; margin-bottom: 24px; }
        .brand { font-size: 26px; font-weight: 800; color: #059669; letter-spacing: 1.5px; text-decoration: none; margin: 0; }
        .tagline { font-size: 13px; color: #6b7280; margin-top: 4px; font-weight: 500; }
        .title { font-size: 20px; font-weight: 700; color: #111827; margin-top: 0; margin-bottom: 16px; }
        .code-box { background-color: #f3f4f6; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0; border: 1px solid #e5e7eb; }
        .code { font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #059669; }
        .warning { color: #dc2626; font-size: 13px; font-weight: 600; margin-top: 16px; }
        .footer { text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #f3f4f6; font-size: 12px; color: #9ca3af; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="brand">EARTH TALK</div>
          <div class="tagline">Every Earth Feature Has a Story.</div>
        </div>
        <div class="content">
          <h1 class="title">Verify Your Account</h1>
          <p>Hello <strong>${name}</strong>,</p>
          <p>Welcome to Earth Talk!</p>
          <p>To complete your sign-in, enter the verification code below:</p>
          <div class="code-box">
            <span class="code">${code}</span>
          </div>
          <p>This code expires in <strong>10 minutes</strong>.</p>
          <p style="color: #6b7280; font-size: 14px;">If you did not request this verification, you can safely ignore this email.</p>
          <p class="warning">For your security, never share this code with anyone.</p>
        </div>
        <div class="footer">
          <p><strong>Earth Talk</strong> &bull; Every Earth Feature Has a Story.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generates a branded OTP email template.
 */
export function getOTPTemplate(code: string, purpose: string): string {
  const purposeText = purpose === 'registration' 
    ? 'creating your Earth Talk account' 
    : 'verifying your identity';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify your Earth Talk Account</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #1f2937; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
        .header { text-align: center; margin-bottom: 32px; }
        .logo { font-size: 24px; font-weight: bold; color: #10b981; text-decoration: none; }
        .content { background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 32px; }
        .title { font-size: 20px; font-weight: 600; margin-bottom: 16px; text-align: center; }
        .code-container { background-color: #f3f4f6; border-radius: 6px; padding: 24px; text-align: center; margin: 24px 0; }
        .code { font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #059669; }
        .footer { text-align: center; margin-top: 32px; font-size: 14px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <a href="${env.CONTROL_CENTER_URL}" class="logo">EARTH TALK</a>
        </div>
        <div class="content">
          <h1 class="title">Verify your email</h1>
          <p>You are almost there! Please use the following code to complete ${purposeText}:</p>
          <div class="code-container">
            <span class="code">${code}</span>
          </div>
          <p>This code will expire in 10 minutes. If you did not request this, please ignore this email.</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Earth Talk. Rwanda's GeoAI Platform.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
