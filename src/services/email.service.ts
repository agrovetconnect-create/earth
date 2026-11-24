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

function senderAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match?.[1] || from).trim();
}

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
      replyTo: senderAddress(from),
      subject: options.subject,
      html: options.html,
      text: options.text,
      headers: {
        'X-Entity-Ref-ID': 'earth-talk-transactional',
        'X-Mailer': 'Earth Talk',
      },
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function resolveEmailAssetBaseUrl(): string {
  const candidates = [env.APP_URL, process.env.APP_URL, env.CONTROL_CENTER_URL, 'http://localhost:3000'];
  for (const raw of candidates) {
    const trimmed = (raw || '').trim();
    if (!trimmed) continue;
    try {
      const origin = new URL(trimmed).origin;
      if (origin !== 'http://localhost:3000' || trimmed === 'http://localhost:3000') {
        return origin;
      }
    } catch {
      // try next candidate
    }
  }
  return 'http://localhost:3000';
}

/**
 * Generates the official Earth Talk branded verification email template.
 */
export function getEarthTalkVerificationEmailTemplate(
  code: string,
  displayName?: string | null,
  assetBaseUrl?: string,
  expiresInMinutes = 10
): string {
  const name = escapeHtml(displayName?.trim() || 'Contributor');
  const baseUrl = assetBaseUrl || resolveEmailAssetBaseUrl();
  const logoUrl = `${baseUrl}/logo_withsubtitle.png`;
  const heroUrl = `${baseUrl}/media/pool/field-01.jpg`;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Earth Talk Verification Code</title>
</head>
<body style="margin: 0; padding: 32px 12px; background-color: #eef2f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1f2937;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; margin: 0 auto; border-collapse: collapse;">
    <tr>
      <td style="padding: 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; border-radius: 12px; overflow: hidden; background-color: #1e3442; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.14);">
          <!-- Brand Header -->
          <tr>
            <td style="background-color: #ffffff; padding: 18px 28px; text-align: center; border-bottom: 1px solid #e2e8f0;">
              <a href="${baseUrl}/" style="text-decoration: none; display: inline-block;">
                <img src="${logoUrl}" alt="Earth Talk" style="height: 44px; width: auto; display: block; margin: 0 auto; border: 0;" />
              </a>
              <div style="font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #059669; margin-top: 6px;">EARTH TALK</div>
            </td>
          </tr>

          <!-- Scenic Geological Hero Banner -->
          <tr>
            <td style="padding: 0; line-height: 0; background-color: #162833;">
              <img src="${heroUrl}" alt="Earth Talk geological field site" width="100%" style="width: 100%; max-width: 100%; height: 190px; object-fit: cover; display: block; margin: 0 auto; border: 0;" />
            </td>
          </tr>

          <!-- Deep Slate Editorial Body -->
          <tr>
            <td style="background-color: #1e3442; padding: 36px 34px 38px; text-align: center;">
              <h1 style="margin: 0 0 14px; font-family: Georgia, 'Times New Roman', serif; font-size: 28px; line-height: 1.25; font-weight: 700; color: #f4c563;">
                Verify Your Account
              </h1>

              <p style="margin: 0 0 14px; font-size: 15px; line-height: 1.65; color: #f5e6c4;">
                Hello <strong>${name}</strong>,
              </p>

              <p style="margin: 0 auto 24px; max-width: 430px; font-size: 14px; line-height: 1.65; color: #e2e8f0;">
                Enter the 6-digit verification code below to confirm your identity and access your Earth Talk contributor workspace.
              </p>

              <!-- Verification Code Box -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 340px; margin: 0 auto 22px; border-collapse: collapse;">
                <tr>
                  <td style="background-color: #13242e; border: 1px solid #355466; border-radius: 10px; padding: 18px 20px; text-align: center;">
                    <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 9px; color: #f4c563; display: inline-block; padding-left: 9px;">${escapeHtml(code)}</span>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 8px; font-size: 13px; color: #f5e6c4;">
                This code expires in <strong>${expiresInMinutes} minutes</strong>.
              </p>

              <p style="margin: 0; font-size: 12px; font-weight: 600; color: #fca5a5;">
                Never share this code with anyone. Earth Talk staff will never ask for it.
              </p>
            </td>
          </tr>

          <!-- Dark Footer Bar -->
          <tr>
            <td style="background-color: #14232d; padding: 18px 28px; text-align: center; border-top: 1px solid #284252;">
              <p style="margin: 0 0 6px; font-size: 12px; color: #cbd5e1;">
                <strong>Earth Talk</strong> &bull; Every Earth Feature Has a Story.
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                <a href="${baseUrl}/" style="color: #94a3b8; text-decoration: none;">Explore Map</a>
                &nbsp;&middot;&nbsp;
                <a href="${baseUrl}/?view=about" style="color: #94a3b8; text-decoration: none;">About &amp; Guide</a>
                &nbsp;&middot;&nbsp;
                <a href="${baseUrl}/privacy" style="color: #94a3b8; text-decoration: none;">Privacy Policy</a>
              </p>
            </td>
          </tr>
        </table>

        <!-- Quiet Legal Colophon -->
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
          <tr>
            <td style="padding: 18px 16px 0; text-align: center; font-size: 11px; line-height: 1.5; color: #64748b;">
              <p style="margin: 0 0 4px;">&copy; ${year} Earth Talk. All rights reserved.</p>
              <p style="margin: 0;">GeoAI, GIS &amp; citizen geoscience platform &bull; <a href="${baseUrl}/terms" style="color: #64748b; text-decoration: underline;">Terms</a> &bull; <a href="${baseUrl}/privacy" style="color: #64748b; text-decoration: underline;">Privacy</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Generates a pro editorial HTML Welcome Email sent after first verification.
 */
export function getWelcomeEmailTemplate(
  displayName?: string | null,
  assetBaseUrl?: string
): string {
  const name = escapeHtml(displayName?.trim() || 'Contributor');
  const baseUrl = assetBaseUrl || resolveEmailAssetBaseUrl();
  const logoUrl = `${baseUrl}/logo_withsubtitle.png`;
  const heroUrl = `${baseUrl}/media/pool/field-01.jpg`;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Earth Talk</title>
</head>
<body style="margin: 0; padding: 32px 12px; background-color: #eef2f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1f2937;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; margin: 0 auto; border-collapse: collapse;">
    <tr>
      <td style="padding: 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; border-radius: 12px; overflow: hidden; background-color: #1e3442; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.14);">
          <!-- Brand Header -->
          <tr>
            <td style="background-color: #ffffff; padding: 18px 28px; text-align: center; border-bottom: 1px solid #e2e8f0;">
              <a href="${baseUrl}/" style="text-decoration: none; display: inline-block;">
                <img src="${logoUrl}" alt="Earth Talk" style="height: 44px; width: auto; display: block; margin: 0 auto; border: 0;" />
              </a>
            </td>
          </tr>

          <!-- Scenic Geological Hero Banner -->
          <tr>
            <td style="padding: 0; line-height: 0; background-color: #162833;">
              <img src="${heroUrl}" alt="Earth Talk geological field landscape" width="100%" style="width: 100%; max-width: 100%; height: 215px; object-fit: cover; display: block; margin: 0 auto; border: 0;" />
            </td>
          </tr>

          <!-- Deep Slate Editorial Body -->
          <tr>
            <td style="background-color: #1e3442; padding: 38px 34px 40px; text-align: center;">
              <h1 style="margin: 0 0 16px; font-family: Georgia, 'Times New Roman', serif; font-size: 30px; line-height: 1.25; font-weight: 700; color: #f4c563;">
                Welcome to Earth Talk
              </h1>

              <p style="margin: 0 0 14px; font-size: 15px; line-height: 1.65; color: #f5e6c4;">
                Hello <strong>${name}</strong>,
              </p>

              <p style="margin: 0 auto 16px; max-width: 440px; font-size: 14px; line-height: 1.7; color: #f5e6c4;">
                Your Google account is verified. Earth Talk is your field workspace for mapping rock and mineral observations, opening structured Geoscience Passports, and collaborating on community investigations across Rwanda.
              </p>

              <p style="margin: 0 auto 26px; max-width: 440px; font-size: 14px; line-height: 1.65; color: #dbeafe;">
                We are grateful to have you contributing to open, verifiable earth science.
              </p>

              <!-- Primary Action CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto 28px; border-collapse: collapse;">
                <tr>
                  <td style="border-radius: 6px; background-color: #f27c2c; text-align: center;">
                    <a href="${baseUrl}/" style="display: inline-block; padding: 13px 30px; font-size: 12px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: #ffffff; text-decoration: none; border-radius: 6px;">
                      Open Earth Talk
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Three Core Capabilities Strip -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; table-layout: fixed; background-color: #172a36; border: 1px solid #2c4859; border-radius: 8px;">
                <tr>
                  <td width="33%" style="padding: 14px 8px; box-sizing: border-box; word-break: break-word; text-align: center; vertical-align: top; border-right: 1px solid #2c4859;">
                    <div style="font-size: 12px; font-weight: 700; color: #f4c563; margin-bottom: 4px;">Map Observations</div>
                    <div style="font-size: 11px; line-height: 1.45; color: #cbd5e1;">Pin outcrops, minerals &amp; field sites</div>
                  </td>
                  <td width="34%" style="padding: 14px 8px; box-sizing: border-box; word-break: break-word; text-align: center; vertical-align: top; border-right: 1px solid #2c4859;">
                    <div style="font-size: 12px; font-weight: 700; color: #f4c563; margin-bottom: 4px;">GeoAI Passports</div>
                    <div style="font-size: 11px; line-height: 1.45; color: #cbd5e1;">Structured visual &amp; field records</div>
                  </td>
                  <td width="33%" style="padding: 14px 8px; box-sizing: border-box; word-break: break-word; text-align: center; vertical-align: top;">
                    <div style="font-size: 12px; font-weight: 700; color: #f4c563; margin-bottom: 4px;">Open Science</div>
                    <div style="font-size: 11px; line-height: 1.45; color: #cbd5e1;">Community &amp; expert verification</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Dark Footer Bar -->
          <tr>
            <td style="background-color: #14232d; padding: 18px 28px; text-align: center; border-top: 1px solid #284252;">
              <p style="margin: 0 0 6px; font-size: 12px; color: #cbd5e1;">
                <strong>Earth Talk</strong> &bull; Every Earth Feature Has a Story.
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                <a href="${baseUrl}/" style="color: #94a3b8; text-decoration: none;">Explore Map</a>
                &nbsp;&middot;&nbsp;
                <a href="${baseUrl}/?view=about" style="color: #94a3b8; text-decoration: none;">About &amp; Guide</a>
                &nbsp;&middot;&nbsp;
                <a href="${baseUrl}/privacy" style="color: #94a3b8; text-decoration: none;">Privacy Policy</a>
              </p>
            </td>
          </tr>
        </table>

        <!-- Quiet Legal Colophon -->
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
          <tr>
            <td style="padding: 18px 16px 0; text-align: center; font-size: 11px; line-height: 1.5; color: #64748b;">
              <p style="margin: 0 0 4px;">&copy; ${year} Earth Talk. All rights reserved.</p>
              <p style="margin: 0;">GeoAI, GIS &amp; citizen geoscience platform &bull; <a href="${baseUrl}/terms" style="color: #64748b; text-decoration: underline;">Terms</a> &bull; <a href="${baseUrl}/privacy" style="color: #64748b; text-decoration: underline;">Privacy</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Generates a branded OTP email template.
 */
export function getOTPTemplate(
  code: string,
  purpose: string,
  assetBaseUrl?: string,
  expiresInMinutes = 10
): string {
  const purposeText = purpose === 'registration'
    ? 'creating your Earth Talk account'
    : 'verifying your identity';
  const baseUrl = assetBaseUrl || resolveEmailAssetBaseUrl();
  const logoUrl = `${baseUrl}/logo_withsubtitle.png`;
  const heroUrl = `${baseUrl}/media/pool/field-01.jpg`;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your Earth Talk Account</title>
</head>
<body style="margin: 0; padding: 32px 12px; background-color: #eef2f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1f2937;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; margin: 0 auto; border-collapse: collapse;">
    <tr>
      <td style="padding: 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; border-radius: 12px; overflow: hidden; background-color: #1e3442; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.14);">
          <tr>
            <td style="background-color: #ffffff; padding: 18px 28px; text-align: center; border-bottom: 1px solid #e2e8f0;">
              <a href="${baseUrl}/" style="text-decoration: none; display: inline-block;">
                <img src="${logoUrl}" alt="Earth Talk" style="height: 44px; width: auto; display: block; margin: 0 auto; border: 0;" />
              </a>
              <div style="font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #059669; margin-top: 6px;">EARTH TALK</div>
            </td>
          </tr>
          <tr>
            <td style="padding: 0; line-height: 0; background-color: #162833;">
              <img src="${heroUrl}" alt="Earth Talk geological field site" width="100%" style="width: 100%; max-width: 100%; height: 175px; object-fit: cover; display: block; margin: 0 auto; border: 0;" />
            </td>
          </tr>
          <tr>
            <td style="background-color: #1e3442; padding: 34px 32px 36px; text-align: center;">
              <h1 style="margin: 0 0 14px; font-family: Georgia, 'Times New Roman', serif; font-size: 26px; line-height: 1.25; font-weight: 700; color: #f4c563;">
                Verify your email
              </h1>
              <p style="margin: 0 auto 22px; max-width: 420px; font-size: 14px; line-height: 1.65; color: #e2e8f0;">
                Use the code below to finish ${purposeText}:
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 340px; margin: 0 auto 20px; border-collapse: collapse;">
                <tr>
                  <td style="background-color: #13242e; border: 1px solid #355466; border-radius: 10px; padding: 18px 20px; text-align: center;">
                    <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 9px; color: #f4c563; display: inline-block; padding-left: 9px;">${escapeHtml(code)}</span>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 13px; color: #f5e6c4;">This code expires in <strong>${expiresInMinutes} minutes</strong>.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #14232d; padding: 18px 28px; text-align: center; border-top: 1px solid #284252; font-size: 12px; color: #cbd5e1;">
              <p style="margin: 0;">&copy; ${year} <strong>Earth Talk</strong> &bull; Every Earth Feature Has a Story.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
