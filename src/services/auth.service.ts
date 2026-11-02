import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
<<<<<<< HEAD
import { checkDistributedRateLimit } from '../utils/rate-limiter.js';
import { shortHash } from '../utils/hash.js';
import { isServiceUnavailableError } from '../utils/service-error.js';
import { whatsappService } from './whatsapp.service.js';
import { userRepository } from '../repositories/user.repository.js';
import { communityPostRepository } from '../repositories/community-post.repository.js';
=======
import { checkRateLimit } from '../utils/rate-limiter.js';
import { whatsappService } from './whatsapp.service.js';
import { userRepository, type CreateVia } from '../repositories/user.repository.js';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
import type { UserRow, VerificationCodeRecord } from '../types/community-posts.types.js';
import type { PublicUserIdentity } from '../types/community-posts.types.js';
import {
  generateVerificationCode,
  hashCodeForPhone,
  hashRequestIp,
  issueUserSession,
  normalizePhoneNumber,
  phoneHashFromInput,
  revokeUserSession,
  verifyCodeForPhone,
<<<<<<< HEAD
  hashCodeForEmail,
  verifyCodeForEmail,
  type Viewer,
} from '../utils/user-auth.js';
import { verificationChallengeRepository } from '../repositories/verification-challenge.repository.js';
import { sendEmail, getOTPTemplate, getEarthTalkVerificationEmailTemplate, isEmailConfigured } from './email.service.js';
import { profileService } from './profile.service.js';
import { userAvatarRepository } from '../repositories/user-avatar.repository.js';
=======
  type Viewer,
} from '../utils/user-auth.js';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
import type { Request } from 'express';

/**
 * WhatsApp verification login.
 *
 * The flow is deliberately boring:
 *   1. `requestCode` hashes the number, invalidates any live code, stores a
 *      scrypt hash of a six digit code with an expiry and an attempt limit, and
 *      asks WhatsApp to deliver it.
 *   2. `verifyCode` loads the most recent record, checks expiry, consumption
 *      and attempts before comparing hashes, then consumes the record and
 *      finds-or-creates the account.
 *
 * What never happens: the code is never returned in an HTTP response, never
 * logged outside development, and a second request never leaves an older code
 * usable. A phone number is never written anywhere except as the one-way hash
 * already used to identify a WhatsApp sender.
 */

export type AuthErrorCode =
  | 'INVALID_PHONE'
<<<<<<< HEAD
  | 'INVALID_EMAIL'
  | 'INVALID_REQUEST'
  | 'PHONE_ALREADY_LINKED'
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  | 'RATE_LIMITED'
  | 'DELIVERY_FAILED'
  | 'INVALID_CODE'
  | 'CODE_EXPIRED'
  | 'CODE_ALREADY_USED'
  | 'TOO_MANY_ATTEMPTS'
  | 'PROFILE_UPDATE_FAILED'
  | 'DISPLAY_NAME_LOCKED';

/**
 * How long a verified account must wait between public-name changes. The
 * browser store applies the same window to local accounts; this is the server
 * half, so a scripted caller cannot sidestep it.
 */
export const DISPLAY_NAME_EDIT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The signed-in identity as the auth endpoints publish it: the public face plus
 * the one field the client needs to grey out the rename control, which is not
 * part of the identity other readers see.
 */
export interface SessionUserIdentity extends PublicUserIdentity {
  display_name_updated_at: string | null;
<<<<<<< HEAD
  email: string | null;
  is_whatsapp_linked: boolean;
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
}

export interface AuthFailure {
  ok: false;
  status: number;
  code: AuthErrorCode;
  error: string;
}

export interface RequestCodeSuccess {
  ok: true;
  /**
   * `whatsapp` when Meta accepted the message, `development_console` when the
   * code was written to the server console because no WhatsApp credentials are
   * configured. The client is told which happened so it never invents a step.
   */
  delivery: 'whatsapp' | 'development_console';
  message: string;
  /** How long the delivered code stays valid, in seconds. */
  expiresInSeconds: number;
}

export interface VerifyCodeSuccess {
  ok: true;
  token: string;
  expiresAt: string;
  user: SessionUserIdentity;
}

export type RequestCodeResult = RequestCodeSuccess | AuthFailure;
export type VerifyCodeResult = VerifyCodeSuccess | AuthFailure;

function failure(
  status: number,
  code: AuthErrorCode,
  error: string
): AuthFailure {
  return { ok: false, status, code, error };
}

function identityOf(user: UserRow): PublicUserIdentity {
  return {
    public_user_id: user.public_user_id,
    display_name: user.display_name,
    is_demo: user.is_demo,
  };
}

<<<<<<< HEAD
async function sessionUserOf(user: UserRow): Promise<SessionUserIdentity> {
  const isLinked = await userRepository.isWhatsAppLinked(user.id);
  return {
    ...identityOf(user),
    display_name_updated_at: user.display_name_updated_at ?? null,
    email: user.email ?? null,
    is_whatsapp_linked: isLinked,
=======
function sessionUserOf(user: UserRow): SessionUserIdentity {
  return {
    ...identityOf(user),
    display_name_updated_at: user.display_name_updated_at ?? null,
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  };
}

function codeMessage(delivery: 'whatsapp' | 'development_console', ttlSeconds: number): string {
  if (delivery === 'development_console') {
    return 'Earth Talk is running without WhatsApp credentials. The code was written to the server console.';
  }
  return `A six digit code was sent to your WhatsApp number. It expires in ${ttlSeconds} seconds.`;
}

/**
 * Creates and delivers a verification code.
 *
 * Rate limits are enforced twice: once per phone hash so one number cannot be
 * spammed, and once per address so one address cannot spray many numbers.
 */
export async function requestCode(
  phoneInput: string,
  req: Request
): Promise<RequestCodeResult> {
  const phoneHash = phoneHashFromInput(phoneInput ?? '');
  if (!phoneHash) {
    return failure(
      400,
      'INVALID_PHONE',
      'Enter your full WhatsApp number with country code, for example +250 78 123 45 67.'
    );
  }

  const ipHash = hashRequestIp(req);
<<<<<<< HEAD
  const phoneAllowed = await checkDistributedRateLimit(
    `auth_request:${phoneHash}`,
    env.AUTH_REQUEST_RATE_LIMIT_PER_MINUTE
  );
  const ipAllowed = await checkDistributedRateLimit(
    `auth_ip:${ipHash}`,
    env.AUTH_IP_RATE_LIMIT_PER_MINUTE
  );
  if (!phoneAllowed || !ipAllowed) {
=======
  if (
    !checkRateLimit(`auth_request:${phoneHash}`, env.AUTH_REQUEST_RATE_LIMIT_PER_MINUTE) ||
    !checkRateLimit(`auth_ip:${ipHash}`, env.AUTH_IP_RATE_LIMIT_PER_MINUTE)
  ) {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    return failure(
      429,
      'RATE_LIMITED',
      'Too many sign-in attempts. Wait a minute before requesting another code.'
    );
  }

  const digits = normalizePhoneNumber(phoneInput) ?? '';
  const code = generateVerificationCode();
  const now = Date.now();

  // A new request invalidates every earlier code, so an intercepted older
  // message can never be replayed after the user asks for a fresh one.
  await userRepository.consumeOutstandingCodes(phoneHash);

  const record: VerificationCodeRecord = {
    id: crypto.randomUUID(),
    phone_hash: phoneHash,
    code_hash: hashCodeForPhone(code, phoneHash),
    purpose: 'whatsapp_login',
    expires_at: new Date(now + env.AUTH_CODE_TTL_SECONDS * 1000).toISOString(),
    attempts: 0,
    max_attempts: env.AUTH_CODE_MAX_ATTEMPTS,
    consumed_at: null,
    requested_ip_hash: ipHash,
    delivery: null,
    created_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
  };

  const message =
    `Your Earth Talk sign-in code is ${code}. ` +
    `It expires in ${env.AUTH_CODE_TTL_SECONDS} seconds. ` +
    'Never share this code. Earth Talk staff will never ask for it.';

  const response = await whatsappService.sendTextMessage(digits, message);

  if (response) {
    record.delivery = 'whatsapp';
    await userRepository.saveVerificationCode(record);
    logger.info('Verification code delivered over WhatsApp', { phone_hash: phoneHash });
    return { ok: true, delivery: 'whatsapp', message: codeMessage('whatsapp', env.AUTH_CODE_TTL_SECONDS), expiresInSeconds: env.AUTH_CODE_TTL_SECONDS };
  }

  if (!env.IS_PRODUCTION) {
    // Development only. The code is echoed to the server console so the login
    // flow can be exercised without WhatsApp credentials; it is never placed
    // in an HTTP response, and production takes the branch below instead.
    record.delivery = 'development_console';
    await userRepository.saveVerificationCode(record);
    logger.info(
      `[development] WhatsApp sign-in code for this process: ${code} (phone hash ${phoneHash})`,
      { phone_hash: phoneHash }
    );
    return {
      ok: true,
      delivery: 'development_console',
      message: codeMessage('development_console', env.AUTH_CODE_TTL_SECONDS),
      expiresInSeconds: env.AUTH_CODE_TTL_SECONDS,
    };
  }

  // Production with unreachable WhatsApp: record the failure, invalidate the
  // code so nothing can be verified that was never delivered, and tell the
  // user the truth instead of pretending a message was sent.
  record.delivery = 'failed';
  record.consumed_at = new Date().toISOString();
  await userRepository.saveVerificationCode(record);
  logger.error('Verification code could not be delivered over WhatsApp', { phone_hash: phoneHash });
  return failure(
    503,
    'DELIVERY_FAILED',
    'The sign-in code could not be sent right now. Please try again in a few minutes.'
  );
}

/** Checks a submitted code and, when it matches, opens a session. */
export async function verifyCode(
  phoneInput: string,
  submittedCode: string,
  req: Request
): Promise<VerifyCodeResult> {
  const phoneHash = phoneHashFromInput(phoneInput ?? '');
  if (!phoneHash) {
    return failure(400, 'INVALID_PHONE', 'That phone number is not valid.');
  }

  const code = String(submittedCode ?? '').trim();
  if (!/^\d{6}$/.test(code)) {
    return failure(400, 'INVALID_CODE', 'Enter the six digit code from your WhatsApp message.');
  }

<<<<<<< HEAD
  const verifyAllowed = await checkDistributedRateLimit(
    `auth_verify:${phoneHash}`,
    env.AUTH_REQUEST_RATE_LIMIT_PER_MINUTE
  );
  if (!verifyAllowed) {
=======
  const ipHash = hashRequestIp(req);
  if (!checkRateLimit(`auth_verify:${phoneHash}`, env.AUTH_REQUEST_RATE_LIMIT_PER_MINUTE)) {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    return failure(
      429,
      'RATE_LIMITED',
      'Too many attempts. Wait a minute before trying the code again.'
    );
  }

  const record = await userRepository.findLatestVerificationCode(phoneHash);
  if (!record) {
    return failure(400, 'INVALID_CODE', 'No active code for this number. Request a new one.');
  }

  if (record.consumed_at) {
    return failure(400, 'CODE_ALREADY_USED', 'This code has already been used. Request a new one.');
  }

  if (new Date(record.expires_at).getTime() <= Date.now()) {
    await userRepository.updateVerificationCode(phoneHash, record.id, {
      consumed_at: new Date().toISOString(),
    });
    return failure(400, 'CODE_EXPIRED', 'This code has expired. Request a new one.');
  }

  if (record.attempts >= record.max_attempts) {
    await userRepository.updateVerificationCode(phoneHash, record.id, {
      consumed_at: new Date().toISOString(),
    });
    return failure(429, 'TOO_MANY_ATTEMPTS', 'Too many incorrect attempts. Request a new code.');
  }

  if (!verifyCodeForPhone(code, phoneHash, record.code_hash)) {
    const attempts = record.attempts + 1;
    await userRepository.updateVerificationCode(phoneHash, record.id, { attempts });
    if (attempts >= record.max_attempts) {
      await userRepository.updateVerificationCode(phoneHash, record.id, {
        consumed_at: new Date().toISOString(),
      });
      return failure(429, 'TOO_MANY_ATTEMPTS', 'Too many incorrect attempts. Request a new code.');
    }
    const remaining = record.max_attempts - attempts;
    return failure(
      400,
      'INVALID_CODE',
      `That code is not correct. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
    );
  }

  // Consume before issuing the session so the code is single use even if the
  // session write below fails.
  await userRepository.updateVerificationCode(phoneHash, record.id, {
    consumed_at: new Date().toISOString(),
  });

  let user: UserRow;
  try {
    user = await userRepository.findOrCreateByPhoneHash(phoneHash, 'web');
    await userRepository.linkWhatsAppIdentity(user.id, phoneHash);
  } catch (err) {
    logger.error('Could not open an account after a valid code', { error: String(err) });
    return failure(
      503,
      'DELIVERY_FAILED',
      'Your code was correct, but the account could not be opened right now. Please try again.'
    );
  }

  const session = await issueUserSession(user, {
    ip: req.ip,
    userAgent: String(req.headers['user-agent'] ?? ''),
  });

  return {
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
<<<<<<< HEAD
    user: await sessionUserOf(user),
  };
}

/**
 * Creates and delivers a verification code via email.
 */
export async function requestEmailCode(
  email: string,
  purpose: 'registration' | 'account_linking' | 'password_reset',
  req: Request
): Promise<any> {
  const cleanEmail = String(email ?? '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.endsWith('@gmail.com') || !/^[^\s@]+@gmail\.com$/.test(cleanEmail)) {
    return failure(400, 'INVALID_EMAIL', 'Please enter a valid @gmail.com address.');
  }

  const validPurpose =
    purpose === 'account_linking' || purpose === 'password_reset' ? purpose : 'registration';

  const ipHash = hashRequestIp(req);
  const emailHash = shortHash(cleanEmail);
  const emailAllowed = await checkDistributedRateLimit(
    `email_request:${emailHash}`,
    env.AUTH_REQUEST_RATE_LIMIT_PER_MINUTE
  );
  const ipAllowed = await checkDistributedRateLimit(
    `auth_ip:${ipHash}`,
    env.AUTH_IP_RATE_LIMIT_PER_MINUTE
  );
  if (!emailAllowed || !ipAllowed) {
    return failure(429, 'RATE_LIMITED', 'Too many sign-in attempts. Wait a minute before requesting another code.');
  }

  await userRepository.consumeOutstandingEmailCodes(cleanEmail);

  const code = generateVerificationCode();
  const ttlSeconds = 10 * 60;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const codeId = await userRepository.saveEmailVerificationCode({
    email: cleanEmail,
    code_hash: hashCodeForEmail(code, cleanEmail),
    purpose: validPurpose,
    expires_at: expiresAt,
    max_attempts: env.AUTH_CODE_MAX_ATTEMPTS,
  });

  const html = getOTPTemplate(code, validPurpose);
  const sent = await sendEmail({
    to: cleanEmail,
    subject: `Earth Talk Verification Code: ${code}`,
    html,
    text: `Your Earth Talk verification code is: ${code}. It expires in 10 minutes.`,
  });

  if (!sent) {
    await userRepository.consumeEmailCode(codeId);
    return failure(503, 'DELIVERY_FAILED', 'Could not send the verification email. Please try again.');
  }

  const delivery = isEmailConfigured() ? 'email' : 'development_console';
  return {
    ok: true,
    delivery,
    expires_in_seconds: ttlSeconds,
    message:
      delivery === 'development_console'
        ? 'Earth Talk is running without email credentials. The verification code was written to the server console.'
        : 'Verification code sent to your email.',
  };
}

/**
 * Verifies an email code and opens a session.
 */
export async function verifyEmailCode(
  email: string,
  submittedCode: string,
  req: Request
): Promise<VerifyCodeResult> {
  const cleanEmail = String(email ?? '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.endsWith('@gmail.com') || !/^[^\s@]+@gmail\.com$/.test(cleanEmail)) {
    return failure(400, 'INVALID_EMAIL', 'Please enter a valid @gmail.com address.');
  }

  const code = String(submittedCode ?? '').trim();
  if (!/^\d{6}$/.test(code)) {
    return failure(400, 'INVALID_CODE', 'Enter the six digit code from your email.');
  }

  const emailHash = shortHash(cleanEmail);
  const verifyAllowed = await checkDistributedRateLimit(
    `email_verify:${emailHash}`,
    env.AUTH_REQUEST_RATE_LIMIT_PER_MINUTE
  );
  if (!verifyAllowed) {
    return failure(
      429,
      'RATE_LIMITED',
      'Too many attempts. Wait a minute before trying the code again.'
    );
  }

  const record = await userRepository.findLatestEmailCode(cleanEmail);
  if (!record) {
    return failure(400, 'INVALID_CODE', 'No active code for this email. Request a new one.');
  }

  if (record.consumed_at) {
    return failure(400, 'CODE_ALREADY_USED', 'This code has already been used. Request a new one.');
  }

  if (new Date(record.expires_at).getTime() <= Date.now()) {
    await userRepository.consumeEmailCode(record.id);
    return failure(400, 'CODE_EXPIRED', 'This code has expired. Request a new one.');
  }

  const maxAttempts = record.max_attempts || env.AUTH_CODE_MAX_ATTEMPTS;
  const currentAttempts = record.attempts || 0;
  if (currentAttempts >= maxAttempts) {
    await userRepository.consumeEmailCode(record.id);
    return failure(429, 'TOO_MANY_ATTEMPTS', 'Too many incorrect attempts. Request a new code.');
  }

  if (!verifyCodeForEmail(code, cleanEmail, record.code_hash)) {
    const nextAttempts = currentAttempts + 1;
    await userRepository.updateEmailCode(cleanEmail, record.id, {
      attempts: nextAttempts,
      ...(nextAttempts >= maxAttempts ? { consumed_at: new Date().toISOString() } : {}),
    });
    if (nextAttempts >= maxAttempts) {
      return failure(429, 'TOO_MANY_ATTEMPTS', 'Too many incorrect attempts. Request a new code.');
    }
    const remaining = maxAttempts - nextAttempts;
    return failure(
      400,
      'INVALID_CODE',
      `That code is not correct. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
    );
  }

  await userRepository.consumeEmailCode(record.id);

  let user: UserRow;
  try {
    user = await userRepository.findOrCreateByEmail(cleanEmail);
    await userRepository.setEmailVerified(user.id);
    await profileService.syncGoogleProfile(user.id, {
      email: cleanEmail,
      displayName: user.display_name,
    });
  } catch (err) {
    if (isServiceUnavailableError(err)) throw err;
    logger.error('Account creation failed', { error: String(err) });
    return failure(503, 'PROFILE_UPDATE_FAILED', 'The account could not be opened right now. Please try again.');
  }

  const session = await issueUserSession(user, {
    ip: req.ip,
    userAgent: String(req.headers['user-agent'] ?? ''),
  });

  return {
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    user: await sessionUserOf(user),
  };
}

export function maskEmail(email: string): string {
  const clean = String(email || '').trim().toLowerCase();
  const [local, domain] = clean.split('@');
  if (!local || !domain) return clean;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

export interface GoogleAuthStepUpRequired {
  ok: true;
  verification_required: true;
  challenge_id: string;
  email: string;
  masked_email: string;
  purpose: 'first_login' | 'inactivity_reauth' | 'security_step_up';
  expires_in_seconds: number;
  message: string;
}

export interface GoogleAuthVerifiedSuccess {
  ok: true;
  verification_required: false;
  token: string;
  expiresAt: string;
  user: SessionUserIdentity;
}

export type GoogleAuthResult = GoogleAuthVerifiedSuccess | GoogleAuthStepUpRequired | AuthFailure;

/**
 * Handles Google OAuth authenticated users, evaluating conditional verification rules:
 * 1. First-time user (no profile or email_verified_at is null) -> Step-up email verification required.
 * 2. Returning user within inactivity period (<= REAUTHENTICATION_INACTIVITY_DAYS) -> Active session granted directly.
 * 3. Returning user after inactivity period (> REAUTHENTICATION_INACTIVITY_DAYS) -> Step-up email verification required.
 */
export async function syncGoogleOAuthUser(
  googleUser: {
    id?: string;
    email: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  },
  req: Request
): Promise<GoogleAuthResult> {
  const cleanEmail = String(googleUser.email ?? '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.endsWith('@gmail.com') || !/^[^\s@]+@gmail\.com$/.test(cleanEmail)) {
    return failure(400, 'INVALID_EMAIL', 'Only @gmail.com accounts are supported.');
  }

  let user: UserRow;
  try {
    user = await userRepository.findOrCreateByEmail(cleanEmail);
  } catch (err) {
    if (isServiceUnavailableError(err)) throw err;
    logger.error('Google OAuth user creation failed', { error: String(err) });
    return failure(503, 'PROFILE_UPDATE_FAILED', 'The account could not be opened right now. Please try again.');
  }

  // Fetch or create initial profile shell
  const existingProfile = await profileService.getProfile(user.id) || await profileService.getProfileByEmail(cleanEmail);

  // Evaluate inactivity & first-time rules
  const inactivityDays = env.REAUTHENTICATION_INACTIVITY_DAYS || 30;
  const inactivityMs = inactivityDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const lastActivity = existingProfile?.last_successful_activity_at ? Date.parse(existingProfile.last_successful_activity_at) : 0;

  const isFirstTime = !existingProfile || !existingProfile.email_verified_at;
  const isInactive = !lastActivity || (now - lastActivity) > inactivityMs;

  const needsVerification = isFirstTime || isInactive;

  if (!needsVerification && existingProfile) {
    // Returning active user within inactivity window!
    await userRepository.setEmailVerified(user.id);
    const profile = await profileService.syncGoogleProfile(user.id, {
      email: cleanEmail,
      displayName: googleUser.displayName,
      avatarUrl: googleUser.avatarUrl,
    });
    await profileService.updateVerificationTimestamps(user.id, {
      markLogin: true,
      markActivity: true,
    });

    if (profile.name_source === 'google' && profile.display_name && profile.display_name !== user.display_name) {
      await userRepository.updateDisplayName(user.id, profile.display_name);
      user.display_name = profile.display_name;
    }

    const session = await issueUserSession(user, {
      ip: req.ip,
      userAgent: String(req.headers['user-agent'] ?? ''),
    });

    return {
      ok: true,
      verification_required: false,
      token: session.token,
      expiresAt: session.expiresAt,
      user: await sessionUserOf(user),
    };
  }

  // Step-up verification IS required!
  const purpose = isFirstTime ? 'first_login' : 'inactivity_reauth';

  // Rate-limiting check for email challenge generation
  const ipHash = hashRequestIp(req);
  const emailHash = shortHash(cleanEmail);
  const emailAllowed = await checkDistributedRateLimit(`google_otp:${emailHash}`, env.AUTH_REQUEST_RATE_LIMIT_PER_MINUTE);
  const ipAllowed = await checkDistributedRateLimit(`auth_ip:${ipHash}`, env.AUTH_IP_RATE_LIMIT_PER_MINUTE);
  if (!emailAllowed || !ipAllowed) {
    return failure(429, 'RATE_LIMITED', 'Too many verification code requests. Please wait a minute before trying again.');
  }

  await verificationChallengeRepository.invalidateOutstandingChallenges(cleanEmail);

  const code = generateVerificationCode();
  const ttlSeconds = 10 * 60; // 10 minutes
  const expiresAt = new Date(now + ttlSeconds * 1000).toISOString();

  const challenge = await verificationChallengeRepository.createChallenge({
    user_id: user.id,
    email: cleanEmail,
    otp_hash: hashCodeForEmail(code, cleanEmail),
    purpose,
    attempts: 0,
    max_attempts: env.AUTH_CODE_MAX_ATTEMPTS || 5,
    expires_at: expiresAt,
    consumed: false,
  });

  const html = getEarthTalkVerificationEmailTemplate(code, googleUser.displayName || user.display_name);
  const emailSent = await sendEmail({
    to: cleanEmail,
    subject: 'Your Earth Talk Verification Code',
    html,
    text: `Your Earth Talk verification code is: ${code}. It expires in 10 minutes.`,
  });

  if (!emailSent && env.IS_PRODUCTION && isEmailConfigured()) {
    return failure(503, 'DELIVERY_FAILED', 'Could not deliver the verification email to your Google account.');
  }

  if (!isEmailConfigured() && !env.IS_PRODUCTION) {
    logger.info(`[development] Google conditional OTP code for ${cleanEmail}: ${code} (challengeId: ${challenge.id})`);
  }

  return {
    ok: true,
    verification_required: true,
    challenge_id: challenge.id,
    email: cleanEmail,
    masked_email: maskEmail(cleanEmail),
    purpose,
    expires_in_seconds: ttlSeconds,
    message: 'Verification code sent to your Google account email.',
  };
}

/**
 * Verifies a 6-digit email verification code for a pending Google authentication challenge.
 */
export async function verifyGoogleChallenge(
  challengeId: string,
  submittedCode: string,
  req: Request,
  googleUserMeta?: { displayName?: string | null; avatarUrl?: string | null }
): Promise<VerifyCodeResult> {
  const cleanId = String(challengeId ?? '').trim();
  if (!cleanId) {
    return failure(400, 'INVALID_REQUEST', 'Missing challenge identifier.');
  }

  const code = String(submittedCode ?? '').trim();
  if (!/^\d{6}$/.test(code)) {
    return failure(400, 'INVALID_CODE', 'Enter the 6-digit verification code sent to your email.');
  }

  const rateAllowed = await checkDistributedRateLimit(`verify_challenge:${cleanId}`, env.AUTH_REQUEST_RATE_LIMIT_PER_MINUTE);
  if (!rateAllowed) {
    return failure(429, 'RATE_LIMITED', 'Too many attempts. Wait a minute before trying the code again.');
  }

  const challenge = await verificationChallengeRepository.findChallengeById(cleanId);
  if (!challenge) {
    return failure(400, 'INVALID_CODE', 'No active verification challenge found. Please sign in with Google again.');
  }

  if (challenge.consumed) {
    return failure(400, 'CODE_ALREADY_USED', 'This verification code has already been used. Request a new code.');
  }

  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    await verificationChallengeRepository.updateChallenge(cleanId, { consumed: true });
    return failure(400, 'CODE_EXPIRED', 'This verification code has expired. Request a new code.');
  }

  if (challenge.attempts >= challenge.max_attempts) {
    await verificationChallengeRepository.updateChallenge(cleanId, { consumed: true });
    return failure(429, 'TOO_MANY_ATTEMPTS', 'Too many incorrect attempts. Request a new verification code.');
  }

  if (!verifyCodeForEmail(code, challenge.email, challenge.otp_hash)) {
    const nextAttempts = challenge.attempts + 1;
    const isMax = nextAttempts >= challenge.max_attempts;
    await verificationChallengeRepository.updateChallenge(cleanId, {
      attempts: nextAttempts,
      consumed: isMax,
    });
    if (isMax) {
      return failure(429, 'TOO_MANY_ATTEMPTS', 'Too many incorrect attempts. Request a new verification code.');
    }
    const remaining = challenge.max_attempts - nextAttempts;
    return failure(
      400,
      'INVALID_CODE',
      `That code is not correct. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
    );
  }

  // Consume challenge
  await verificationChallengeRepository.updateChallenge(cleanId, { consumed: true });

  let user = await userRepository.findUserById(challenge.user_id);
  if (!user) {
    user = await userRepository.findOrCreateByEmail(challenge.email);
  }

  await userRepository.setEmailVerified(user.id);

  // Sync Google profile details while preserving custom changes
  const profile = await profileService.syncGoogleProfile(user.id, {
    email: challenge.email,
    displayName: googleUserMeta?.displayName,
    avatarUrl: googleUserMeta?.avatarUrl,
  });

  // Mark timestamps
  await profileService.updateVerificationTimestamps(user.id, {
    markVerified: true,
    markLogin: true,
    markActivity: true,
    markStepUp: true,
  });

  if (profile.name_source === 'google' && profile.display_name && profile.display_name !== user.display_name) {
    await userRepository.updateDisplayName(user.id, profile.display_name);
    user.display_name = profile.display_name;
  }

  const session = await issueUserSession(user, {
    ip: req.ip,
    userAgent: String(req.headers['user-agent'] ?? ''),
  });

  return {
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    user: await sessionUserOf(user),
  };
}

/**
 * Resends a verification code for an active Google authentication challenge.
 */
export async function resendGoogleChallenge(
  challengeId: string,
  req: Request
): Promise<any> {
  const cleanId = String(challengeId ?? '').trim();
  if (!cleanId) {
    return failure(400, 'INVALID_REQUEST', 'Missing challenge identifier.');
  }

  const existing = await verificationChallengeRepository.findChallengeById(cleanId);
  if (!existing) {
    return failure(400, 'INVALID_REQUEST', 'No active challenge found for resend. Sign in with Google again.');
  }

  const emailHash = shortHash(existing.email);
  const allowed = await checkDistributedRateLimit(`resend_challenge:${emailHash}`, env.AUTH_REQUEST_RATE_LIMIT_PER_MINUTE);
  if (!allowed) {
    return failure(429, 'RATE_LIMITED', 'Please wait a minute before requesting another code.');
  }

  await verificationChallengeRepository.invalidateOutstandingChallenges(existing.email);

  const now = Date.now();
  const code = generateVerificationCode();
  const ttlSeconds = 10 * 60;
  const expiresAt = new Date(now + ttlSeconds * 1000).toISOString();

  const user = await userRepository.findUserById(existing.user_id);
  const newChallenge = await verificationChallengeRepository.createChallenge({
    user_id: existing.user_id,
    email: existing.email,
    otp_hash: hashCodeForEmail(code, existing.email),
    purpose: existing.purpose,
    attempts: 0,
    max_attempts: env.AUTH_CODE_MAX_ATTEMPTS || 5,
    expires_at: expiresAt,
    consumed: false,
  });

  const html = getEarthTalkVerificationEmailTemplate(code, user?.display_name);
  await sendEmail({
    to: existing.email,
    subject: 'Your Earth Talk Verification Code',
    html,
    text: `Your Earth Talk verification code is: ${code}. It expires in 10 minutes.`,
  });

  if (!isEmailConfigured() && !env.IS_PRODUCTION) {
    logger.info(`[development] Resent Google OTP code for ${existing.email}: ${code} (challengeId: ${newChallenge.id})`);
  }

  return {
    ok: true,
    challenge_id: newChallenge.id,
    expires_in_seconds: ttlSeconds,
    message: 'Verification code resent to your Google account email.',
  };
}

/**
 * Restores original Google profile photo and clears custom uploaded avatar.
 */
export async function restoreGoogleAvatar(viewer: Viewer): Promise<any> {
  await userAvatarRepository.clearAvatar(viewer.userId);
  const profile = await profileService.restoreGoogleAvatar(viewer.userId);
  return { ok: true, profile };
}

=======
    user: sessionUserOf(user),
  };
}

>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
/** Signs the caller out by revoking the presented token. */
export async function signOut(token: string | undefined): Promise<{ ok: true }> {
  await revokeUserSession(token);
  return { ok: true };
}

/**
<<<<<<< HEAD
 * Initiates linking a WhatsApp number to an existing account.
 *
 * A WhatsApp-only user row (`existing && !existing.email`) is allowed to proceed
 * so a contributor who used WhatsApp first can claim and merge their prior
 * WhatsApp submissions after verifying ownership of the number. Only a number
 * already bound to a different email account is rejected with 409.
 */
export async function linkWhatsApp(
  viewer: Viewer,
  phoneInput: string,
  req: Request
): Promise<any> {
  const phoneHash = phoneHashFromInput(phoneInput ?? '');
  if (!phoneHash) {
    return failure(400, 'INVALID_PHONE', 'Enter a valid WhatsApp number with country code.');
  }

  const ipHash = hashRequestIp(req);
  const linkAllowed = await checkDistributedRateLimit(
    `link_wa:${phoneHash}`,
    env.AUTH_REQUEST_RATE_LIMIT_PER_MINUTE
  );
  const ipAllowed = await checkDistributedRateLimit(
    `auth_ip:${ipHash}`,
    env.AUTH_IP_RATE_LIMIT_PER_MINUTE
  );
  if (!linkAllowed || !ipAllowed) {
    return failure(429, 'RATE_LIMITED', 'Too many linking attempts. Wait a minute before trying again.');
  }

  const existing = await userRepository.findUserByPhoneHash(phoneHash);
  if (existing && existing.id !== viewer.userId && Boolean(existing.email)) {
    return failure(
      409,
      'PHONE_ALREADY_LINKED',
      'This WhatsApp number is already linked to another Earth Talk account.'
    );
  }

  await userRepository.consumeOutstandingCodes(phoneHash);

  const digits = normalizePhoneNumber(phoneInput) ?? '';
  const code = generateVerificationCode();
  const now = Date.now();

  const record: VerificationCodeRecord = {
    id: crypto.randomUUID(),
    phone_hash: phoneHash,
    code_hash: hashCodeForPhone(code, phoneHash),
    purpose: 'account_linking',
    expires_at: new Date(now + env.AUTH_CODE_TTL_SECONDS * 1000).toISOString(),
    attempts: 0,
    max_attempts: env.AUTH_CODE_MAX_ATTEMPTS,
    consumed_at: null,
    requested_ip_hash: ipHash,
    delivery: null,
    created_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
  };

  const message =
    `Your Earth Talk WhatsApp linking code is ${code}. ` +
    `It expires in ${env.AUTH_CODE_TTL_SECONDS} seconds. Never share this code.`;
  const response = await whatsappService.sendTextMessage(digits, message);

  if (response) {
    record.delivery = 'whatsapp';
    await userRepository.saveVerificationCode(record);
    return {
      ok: true,
      delivery: 'whatsapp',
      expires_in_seconds: env.AUTH_CODE_TTL_SECONDS,
      message: 'Linking code sent to your WhatsApp.',
    };
  }

  if (!env.IS_PRODUCTION) {
    record.delivery = 'development_console';
    await userRepository.saveVerificationCode(record);
    logger.info(
      `[development] WhatsApp linking code for this process: ${code} (phone hash ${phoneHash})`,
      { phone_hash: phoneHash }
    );
    return {
      ok: true,
      delivery: 'development_console',
      expires_in_seconds: env.AUTH_CODE_TTL_SECONDS,
      message: codeMessage('development_console', env.AUTH_CODE_TTL_SECONDS),
    };
  }

  record.delivery = 'failed';
  record.consumed_at = new Date().toISOString();
  await userRepository.saveVerificationCode(record);
  return failure(503, 'DELIVERY_FAILED', 'Could not send the linking code right now. Please try again shortly.');
}

/**
 * Finalizes linking after code verification.
 */
export async function verifyLinkWhatsApp(
  viewer: Viewer,
  phoneInput: string,
  submittedCode: string
): Promise<any> {
  const phoneHash = phoneHashFromInput(phoneInput ?? '');
  if (!phoneHash) return failure(400, 'INVALID_PHONE', 'Invalid phone number.');

  const code = String(submittedCode ?? '').trim();
  if (!/^\d{6}$/.test(code)) {
    return failure(400, 'INVALID_CODE', 'Enter the six digit linking code.');
  }

  const verifyLinkAllowed = await checkDistributedRateLimit(
    `link_wa_verify:${phoneHash}`,
    env.AUTH_REQUEST_RATE_LIMIT_PER_MINUTE
  );
  if (!verifyLinkAllowed) {
    return failure(429, 'RATE_LIMITED', 'Too many attempts. Wait a minute before trying again.');
  }

  const record = await userRepository.findLatestVerificationCode(phoneHash);
  if (!record) {
    return failure(400, 'INVALID_CODE', 'No active linking code found.');
  }
  if (record.consumed_at) {
    return failure(400, 'CODE_ALREADY_USED', 'This linking code has already been used.');
  }
  if (new Date(record.expires_at).getTime() <= Date.now()) {
    await userRepository.updateVerificationCode(phoneHash, record.id, {
      consumed_at: new Date().toISOString(),
    });
    return failure(400, 'CODE_EXPIRED', 'This linking code has expired.');
  }
  if (record.attempts >= record.max_attempts) {
    await userRepository.updateVerificationCode(phoneHash, record.id, {
      consumed_at: new Date().toISOString(),
    });
    return failure(429, 'TOO_MANY_ATTEMPTS', 'Too many incorrect attempts. Request a new code.');
  }

  if (!verifyCodeForPhone(code, phoneHash, record.code_hash)) {
    const attempts = record.attempts + 1;
    await userRepository.updateVerificationCode(phoneHash, record.id, {
      attempts,
      ...(attempts >= record.max_attempts ? { consumed_at: new Date().toISOString() } : {}),
    });
    if (attempts >= record.max_attempts) {
      return failure(429, 'TOO_MANY_ATTEMPTS', 'Too many incorrect attempts. Request a new code.');
    }
    return failure(400, 'INVALID_CODE', 'Incorrect linking code.');
  }

  await userRepository.updateVerificationCode(phoneHash, record.id, {
    consumed_at: new Date().toISOString(),
  });

  // Re-check that another email account did not claim this phone hash concurrently
  const existingUser = await userRepository.findUserByPhoneHash(phoneHash);
  if (existingUser && existingUser.id !== viewer.userId) {
    if (existingUser.email) {
      return failure(
        409,
        'PHONE_ALREADY_LINKED',
        'This WhatsApp number is already linked to another Earth Talk account.'
      );
    }
    await userRepository.mergeWhatsAppAccountIntoUser(existingUser.id, viewer.userId, phoneHash);
  }

  await userRepository.linkWhatsAppIdentity(viewer.userId, phoneHash);

  const user = await userRepository.findUserById(viewer.userId);
  if (user && !user.phone_hash) {
    await userRepository.setUserPhoneHash(viewer.userId, phoneHash);
  }

  // Link any unowned WhatsApp observations matching this phone hash to the account
  const unlinked = await communityPostRepository.listObservationsBySourceHash(phoneHash);
  for (const obs of unlinked) {
    if (!obs.owner_user_id) {
      await communityPostRepository.linkOwner(obs.passport_id, viewer.userId);
    }
  }

  const refreshed = await userRepository.findUserById(viewer.userId);
  return {
    ok: true,
    message: 'WhatsApp account successfully linked.',
    user: refreshed ? await sessionUserOf(refreshed) : undefined,
  };
}

/**
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
 * Updates the caller's public name. The account id never changes.
 *
 * A name may be changed once every seven days. The window is enforced here, on
 * the server, because a client-side clock is a suggestion, not a rule. Saving
 * the same name (including clearing an already-clear name) is a no-op and does
 * not consume the window.
 */
export async function updateProfile(
  viewer: Viewer,
  displayName: string | null
): Promise<{ ok: true; user: SessionUserIdentity } | AuthFailure> {
  const current = await userRepository.findUserById(viewer.userId);
  if (!current) {
    return failure(
      503,
      'PROFILE_UPDATE_FAILED',
      'Your profile could not be updated right now. Please try again.'
    );
  }

  const clean = displayName === null ? null : displayName.trim().slice(0, 60) || null;

  if (clean === (current.display_name ?? null)) {
<<<<<<< HEAD
    return { ok: true, user: await sessionUserOf(current) };
=======
    return { ok: true, user: sessionUserOf(current) };
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }

  const changedAt = current.display_name_updated_at ? Date.parse(current.display_name_updated_at) : 0;
  const availableAt = changedAt > 0 ? changedAt + DISPLAY_NAME_EDIT_INTERVAL_MS : 0;
  if (availableAt > Date.now()) {
    const daysRemaining = Math.max(1, Math.ceil((availableAt - Date.now()) / (24 * 60 * 60 * 1000)));
    return failure(
      429,
      'DISPLAY_NAME_LOCKED',
      `A display name can be changed once every 7 days. Your name can change again in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`
    );
  }

  const updated = await userRepository.updateDisplayName(viewer.userId, clean);
  if (!updated) {
    return failure(
      503,
      'PROFILE_UPDATE_FAILED',
      'Your profile could not be updated right now. Please try again.'
    );
  }
<<<<<<< HEAD
  return { ok: true, user: await sessionUserOf(updated) };
=======
  return { ok: true, user: sessionUserOf(updated) };
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
}
