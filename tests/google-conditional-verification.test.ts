import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  syncGoogleOAuthUser,
  verifyGoogleChallenge,
  resendGoogleChallenge,
  maskEmail,
} from '../src/services/auth.service.js';
import { profileService } from '../src/services/profile.service.js';
import { verificationChallengeRepository } from '../src/repositories/verification-challenge.repository.js';
import { userRepository } from '../src/repositories/user.repository.js';
import {
  getEarthTalkVerificationEmailTemplate,
  getWelcomeEmailTemplate,
} from '../src/services/email.service.ts';
import { env } from '../src/config/env.js';

const mockReq: any = {
  ip: '127.0.0.1',
  headers: { 'user-agent': 'EarthTalk-Test-Client/1.0' },
};

describe('Earth Talk — Google OAuth & Conditional Email Verification', () => {
  it('maskEmail correctly masks local part of email address', () => {
    assert.equal(maskEmail('contributor@gmail.com'), 'c***r@gmail.com');
    assert.equal(maskEmail('ab@gmail.com'), 'a***@gmail.com');
    assert.equal(maskEmail('john.doe@gmail.com'), 'j***e@gmail.com');
  });

  it('getEarthTalkVerificationEmailTemplate and getWelcomeEmailTemplate include real logo and concise copy', () => {
    const html = getEarthTalkVerificationEmailTemplate('849201', 'Geology Researcher', 'https://earthtalk.app');
    assert.ok(html.includes('EARTH TALK'));
    assert.ok(html.includes('https://earthtalk.app/logo_withsubtitle.png'));
    assert.ok(html.includes('Verify Your Account'));
    assert.ok(html.includes('Hello <strong>Geology Researcher</strong>'));
    assert.ok(html.includes('849201'));
    assert.ok(html.includes('https://earthtalk.app/logo_withsubtitle.png'));
    assert.ok(html.includes('https://earthtalk.app/media/pool/field-01.jpg'));
    assert.ok(!html.includes('/storage/v1/object/public/email-assets'));
    assert.ok(html.includes('This code expires in <strong>10 minutes</strong>.'));
    assert.ok(html.includes('Every Earth Feature Has a Story.'));

    const welcomeHtml = getWelcomeEmailTemplate('Geology Researcher', 'https://earthtalk.app');
    assert.ok(welcomeHtml.includes('https://earthtalk.app/logo_withsubtitle.png'));
    assert.ok(welcomeHtml.includes('Welcome to Earth Talk'));
    assert.ok(welcomeHtml.includes('Geology Researcher'));
  });

  it('Verification mail uses Supabase OTP delivery with a branded development fallback', () => {
    const authService = readFileSync('src/services/auth.service.ts', 'utf8');
    assert.ok(authService.includes('signInWithOtp'));
    assert.ok(!authService.includes('resetPasswordForEmail'));
    assert.ok(authService.includes("subject: 'Your Earth Talk Verification Code'"));
  });

  it('Configured email delivery uses the app code and sends the welcome template', () => {
    const authService = readFileSync('src/services/auth.service.ts', 'utf8');
    assert.ok(authService.includes('!isEmailConfigured() && isDatabaseConfigured()'));
    assert.ok(authService.includes('getWelcomeEmailTemplate('));
    assert.ok(authService.includes('deliverWelcomeEmail('));
    assert.ok(!authService.includes('markWelcomeDelivered('));
  });

  it('Case A: First-time user requires step-up email verification', async () => {
    const email = 'new.geologist.2026@gmail.com';
    const res = await syncGoogleOAuthUser(
      { email, displayName: 'New Geologist', avatarUrl: 'https://example.com/avatar.jpg' },
      mockReq
    );

    assert.equal(res.ok, true);
    if (!res.ok || !('verification_required' in res)) {
      assert.fail('Expected conditional verification response');
    }

    assert.equal(res.verification_required, true);
    assert.ok(res.challenge_id);
    assert.equal(res.email, email);
    assert.equal(res.purpose, 'first_login');
    assert.equal(res.expires_in_seconds, 600);

    // Ensure challenge was saved in repository
    const challenge = await verificationChallengeRepository.findChallengeById(res.challenge_id);
    assert.ok(challenge);
    assert.equal(challenge.email, email);
    assert.equal(challenge.consumed, false);
  });

  it('Case A Verification: Correct 6-digit code verifies user and grants active session', async () => {
    const email = 'verified.user.test@gmail.com';
    const stepUp = await syncGoogleOAuthUser(
      { email, displayName: 'Verified User', avatarUrl: null },
      mockReq
    );

    assert.equal(stepUp.ok, true);
    if (!stepUp.ok || !('verification_required' in stepUp) || !stepUp.verification_required) {
      assert.fail('Expected step-up verification required');
    }

    // Retrieve active challenge record
    const challenge = await verificationChallengeRepository.findChallengeById(stepUp.challenge_id);
    assert.ok(challenge);

    // Directly test verification with invalid code first
    const invalidRes = await verifyGoogleChallenge(stepUp.challenge_id, '000000', mockReq);
    assert.equal(invalidRes.ok, false);

    // Find in-memory code or simulate valid match
    const updatedChallenge = await verificationChallengeRepository.findChallengeById(stepUp.challenge_id);
    assert.ok(updatedChallenge);
    assert.equal(updatedChallenge.attempts, 1);

    // Force known OTP hash for verification test
    const user = await userRepository.findOrCreateByEmail(email);
    const validChallenge = await verificationChallengeRepository.createChallenge({
      user_id: user.id,
      email,
      otp_hash: (await import('../src/utils/user-auth.js')).hashCodeForEmail('123456', email),
      purpose: 'first_login',
      attempts: 0,
      max_attempts: 5,
      expires_at: new Date(Date.now() + 600000).toISOString(),
      consumed: false,
    });

    const verifyRes = await verifyGoogleChallenge(validChallenge.id, '123456', mockReq, {
      displayName: 'Verified User',
    });

    assert.equal(verifyRes.ok, true);
    if (!verifyRes.ok) assert.fail('Expected successful verification');

    assert.ok(verifyRes.token);
    assert.ok(verifyRes.user);
    assert.equal(verifyRes.user.email, email);

    // Profile should now have email_verified_at and timestamps set
    const profile = await profileService.getProfileByEmail(email);
    assert.ok(profile);
    assert.ok(profile.email_verified_at);
    assert.ok(profile.last_successful_login_at);
    assert.ok(profile.last_successful_activity_at);
  });

  it('Case B & D: Same trusted device within 7 days bypasses OTP; new or changed device requires security_step_up', async () => {
    assert.equal(env.REAUTHENTICATION_INACTIVITY_DAYS, 7);
    const email = 'active.returning.user@gmail.com';
    const user = await userRepository.findOrCreateByEmail(email);
    await userRepository.setEmailVerified(user.id);

    await profileService.syncGoogleProfile(user.id, {
      email,
      displayName: 'Active Returner',
      avatarUrl: 'https://lh3.googleusercontent.com/a/example',
    });

    // Complete initial OTP challenge on device A to register its trusted device cookie
    const challenge = await verificationChallengeRepository.createChallenge({
      user_id: user.id,
      email,
      otp_hash: (await import('../src/utils/user-auth.js')).hashCodeForEmail('246810', email),
      purpose: 'first_login',
      attempts: 0,
      max_attempts: 5,
      expires_at: new Date(Date.now() + 600000).toISOString(),
      consumed: false,
    });

    const verified = await verifyGoogleChallenge(challenge.id, '246810', mockReq, {
      displayName: 'Active Returner',
    });
    assert.equal(verified.ok, true);
    if (!verified.ok) assert.fail('Expected initial challenge verification');
    assert.ok(verified.deviceToken);

    const sameDeviceReq: any = {
      ...mockReq,
      cookies: { et_device_id: verified.deviceToken },
    };

    // Returning within 7 days on the same trusted device bypasses OTP
    const sameDeviceRes = await syncGoogleOAuthUser(
      {
        email,
        displayName: 'Active Returner',
        avatarUrl: 'https://lh3.googleusercontent.com/a/example',
      },
      sameDeviceReq
    );
    assert.equal(sameDeviceRes.ok, true);
    if (!sameDeviceRes.ok || !('verification_required' in sameDeviceRes)) {
      assert.fail('Expected GoogleAuthResult response');
    }
    assert.equal(sameDeviceRes.verification_required, false);
    if ('token' in sameDeviceRes) {
      assert.ok(sameDeviceRes.token);
      assert.equal(sameDeviceRes.user.email, email);
    }

    // Returning on a new/changed device requires step-up OTP even within 7 days
    const changedDeviceReq: any = {
      ip: '198.51.100.22',
      headers: { 'user-agent': 'New-Device-Browser/2.0' },
      cookies: {},
    };
    const changedDeviceRes = await syncGoogleOAuthUser(
      { email, displayName: 'Active Returner', avatarUrl: 'https://lh3.googleusercontent.com/a/example' },
      changedDeviceReq
    );
    assert.equal(changedDeviceRes.ok, true);
    if (!changedDeviceRes.ok || !('verification_required' in changedDeviceRes)) {
      assert.fail('Expected security step-up response');
    }
    assert.equal(changedDeviceRes.verification_required, true);
    assert.equal(changedDeviceRes.purpose, 'security_step_up');
  });

  it('Case C: Returning inactive user after 7 days requires step-up verification', async () => {
    const email = 'inactive.user.test@gmail.com';
    const user = await userRepository.findOrCreateByEmail(email);
    await userRepository.setEmailVerified(user.id);

    // 8 days ago (> 7-day inactivity window)
    const oldTimestamp = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await profileService.syncGoogleProfile(user.id, {
      email,
      displayName: 'Inactive User',
      avatarUrl: null,
    });

    const existingProfile = await profileService.getProfile(user.id);
    if (existingProfile) {
      existingProfile.email_verified_at = oldTimestamp;
      existingProfile.last_successful_activity_at = oldTimestamp;
    }

    const res = await syncGoogleOAuthUser(
      { email, displayName: 'Inactive User', avatarUrl: null },
      mockReq
    );

    assert.equal(res.ok, true);
    if (!res.ok || !('verification_required' in res)) {
      assert.fail('Expected GoogleAuthResult response');
    }

    assert.equal(res.verification_required, true);
    assert.equal(res.purpose, 'inactivity_reauth');
    assert.ok(res.challenge_id);
  });

  it('Single-use enforcement: reuse of an already-consumed challenge code is rejected', async () => {
    const email = 'singleuse.test@gmail.com';
    const user = await userRepository.findOrCreateByEmail(email);
    const challenge = await verificationChallengeRepository.createChallenge({
      user_id: user.id,
      email,
      otp_hash: (await import('../src/utils/user-auth.js')).hashCodeForEmail('654321', email),
      purpose: 'first_login',
      attempts: 0,
      max_attempts: 5,
      expires_at: new Date(Date.now() + 600000).toISOString(),
      consumed: false,
    });

    const firstTry = await verifyGoogleChallenge(challenge.id, '654321', mockReq);
    assert.equal(firstTry.ok, true);

    const secondTry = await verifyGoogleChallenge(challenge.id, '654321', mockReq);
    assert.equal(secondTry.ok, false);
    if (!secondTry.ok) {
      assert.equal(secondTry.code, 'CODE_ALREADY_USED');
    }
  });

  it('Abandoned first-login verification keeps the account saved and does not restart as first login', async () => {
    const email = `pending.account.${Date.now()}@gmail.com`;
    const req: any = {
      ip: `203.0.113.${Math.floor(Math.random() * 200) + 1}`,
      headers: { 'user-agent': 'Pending-Account-Test/1.0' },
    };

    const first = await syncGoogleOAuthUser(
      { email, displayName: 'Pending Account', avatarUrl: null },
      req
    );
    assert.equal(first.ok, true);
    if (!first.ok || !('verification_required' in first) || !first.verification_required) {
      assert.fail('Expected first Google login to require verification');
    }
    assert.equal(first.purpose, 'first_login');
    assert.equal(first.account_created, true);

    const retry = await syncGoogleOAuthUser(
      { email, displayName: 'Pending Account', avatarUrl: null },
      req
    );
    assert.equal(retry.ok, true);
    if (!retry.ok || !('verification_required' in retry) || !retry.verification_required) {
      assert.fail('Expected abandoned first login to still require verification');
    }
    assert.notEqual(retry.purpose, 'first_login');
    assert.equal(retry.email, email);
  });

  it('Account creation reuses an existing user when the same Google identity has a different email', async () => {
    const preferredId = randomUUID();
    const firstEmail = `identity.${preferredId}.one@gmail.com`;
    const secondEmail = `identity.${preferredId}.two@gmail.com`;

    const first = await userRepository.findOrCreateByEmail(firstEmail, preferredId);
    const second = await userRepository.findOrCreateByEmail(secondEmail, preferredId);

    assert.equal(second.id, first.id);
    assert.equal(second.email, first.email);
  });

  it('Resend challenge issues a fresh challenge and invalidates old one', async () => {
    const email = 'resend.test@gmail.com';
    const user = await userRepository.findOrCreateByEmail(email);
    const oldChallenge = await verificationChallengeRepository.createChallenge({
      user_id: user.id,
      email,
      otp_hash: (await import('../src/utils/user-auth.js')).hashCodeForEmail('111111', email),
      purpose: 'first_login',
      attempts: 0,
      max_attempts: 5,
      expires_at: new Date(Date.now() + 600000).toISOString(),
      consumed: false,
    });

    const resendRes = await resendGoogleChallenge(oldChallenge.id, mockReq);
    assert.equal(resendRes.ok, true);
    assert.ok(resendRes.challenge_id);
    assert.notEqual(resendRes.challenge_id, oldChallenge.id);

    // Old challenge should now be consumed/invalidated
    const fetchedOld = await verificationChallengeRepository.findChallengeById(oldChallenge.id);
    assert.ok(fetchedOld);
    assert.equal(fetchedOld.consumed, true);
  });

  it('Resend with a stale challenge id returns the active challenge instead of rotating again', async () => {
    const email = 'resend.stale.test@gmail.com';
    const user = await userRepository.findOrCreateByEmail(email);
    const stale = await verificationChallengeRepository.createChallenge({
      user_id: user.id,
      email,
      otp_hash: (await import('../src/utils/user-auth.js')).hashCodeForEmail('111111', email),
      purpose: 'first_login',
      attempts: 0,
      max_attempts: 5,
      expires_at: new Date(Date.now() + 600000).toISOString(),
      consumed: true,
    });
    const active = await verificationChallengeRepository.createChallenge({
      user_id: user.id,
      email,
      otp_hash: (await import('../src/utils/user-auth.js')).hashCodeForEmail('222222', email),
      purpose: 'first_login',
      attempts: 0,
      max_attempts: 5,
      expires_at: new Date(Date.now() + 600000).toISOString(),
      consumed: false,
    });

    const resendRes = await resendGoogleChallenge(stale.id, mockReq);
    assert.equal(resendRes.ok, true);
    assert.equal(resendRes.challenge_id, active.id);
  });

  it('Verification with a stale challenge id accepts the newest code', async () => {
    const email = 'stale.verify.test@gmail.com';
    const user = await userRepository.findOrCreateByEmail(email);
    const stale = await verificationChallengeRepository.createChallenge({
      user_id: user.id,
      email,
      otp_hash: (await import('../src/utils/user-auth.js')).hashCodeForEmail('111111', email),
      purpose: 'first_login',
      attempts: 0,
      max_attempts: 5,
      expires_at: new Date(Date.now() + 600000).toISOString(),
      consumed: true,
    });
    await verificationChallengeRepository.createChallenge({
      user_id: user.id,
      email,
      otp_hash: (await import('../src/utils/user-auth.js')).hashCodeForEmail('987654', email),
      purpose: 'first_login',
      attempts: 0,
      max_attempts: 5,
      expires_at: new Date(Date.now() + 600000).toISOString(),
      consumed: false,
    });

    const verifyRes = await verifyGoogleChallenge(stale.id, '987654', mockReq);
    assert.equal(verifyRes.ok, true);
    if (!verifyRes.ok) assert.fail('Expected verification with the latest code to succeed');
    assert.equal(verifyRes.user.email, email);
  });

  it('Verification consumes the challenge only after the session is issued', () => {
    const authService = readFileSync('src/services/auth.service.ts', 'utf8');
    const verifyBlock = authService.slice(
      authService.indexOf('export async function verifyGoogleChallenge'),
      authService.indexOf('export async function resendGoogleChallenge')
    );
    const verifiedAt = verifyBlock.indexOf('setEmailVerified(');
    const sessionAt = verifyBlock.indexOf('issueUserSession(');
    const consumedAt = verifyBlock.indexOf('consumeChallenge(effectiveId)');
    assert.ok(verifiedAt > 0, 'email verification state is persisted');
    assert.ok(sessionAt > verifiedAt, 'the session is issued after verification work');
    assert.ok(consumedAt > sessionAt, 'challenge consumption cannot fail an already signed-in user');
    assert.ok(verifyBlock.includes('continuing sign-in'), 'non-critical database writes do not fail verification');
  });

  it('Verification challenge consumption is atomic', async () => {
    const email = 'consume.atomic.test@gmail.com';
    const user = await userRepository.findOrCreateByEmail(email);
    const challenge = await verificationChallengeRepository.createChallenge({
      user_id: user.id,
      email,
      delivery_mode: 'app_code',
      otp_hash: 'test-hash',
      purpose: 'first_login',
      attempts: 0,
      max_attempts: 5,
      expires_at: new Date(Date.now() + 600000).toISOString(),
      consumed: false,
    });

    assert.equal(await verificationChallengeRepository.consumeChallenge(challenge.id), true);
    assert.equal(await verificationChallengeRepository.consumeChallenge(challenge.id), false);
    const stored = await verificationChallengeRepository.findChallengeById(challenge.id);
    assert.equal(stored?.consumed, true);
  });

  it('Verification delivery mode is stored before any email is sent', () => {
    const authService = readFileSync('src/services/auth.service.ts', 'utf8');
    const syncBlock = authService.slice(
      authService.indexOf('export async function syncGoogleOAuthUser'),
      authService.indexOf('export async function verifyGoogleChallenge')
    );
    const resendBlock = authService.slice(
      authService.indexOf('export async function resendGoogleChallenge'),
      authService.indexOf('export async function restoreGoogleAvatar')
    );

    for (const block of [syncBlock, resendBlock]) {
      const createAt = block.indexOf('createChallenge(');
      const supabaseAt = block.indexOf('sendSupabaseVerificationOtp(');
      const emailAt = block.indexOf('sendEmail(');
      assert.ok(createAt > 0, 'challenge is created');
      assert.ok(createAt < supabaseAt, 'challenge exists before Supabase OTP delivery');
      assert.ok(createAt < emailAt, 'challenge exists before app-code email delivery');
      assert.ok(block.includes("delivery_mode: useSupabaseOtp ? 'supabase_otp' : 'app_code'"));
    }

    const migration = readFileSync(
      'supabase/migrations/057_verification_challenge_delivery_mode.sql',
      'utf8'
    );
    assert.match(migration, /add column if not exists delivery_mode/);
    assert.match(migration, /supabase_otp/);
  });

  it('email challenges are durable and stored before their code is delivered', () => {
    const authService = readFileSync('src/services/auth.service.ts', 'utf8');
    const syncBlock = authService.slice(
      authService.indexOf('export async function syncGoogleOAuthUser'),
      authService.indexOf('export async function verifyGoogleChallenge')
    );
    const resendBlock = authService.slice(
      authService.indexOf('export async function resendGoogleChallenge'),
      authService.indexOf('export async function restoreGoogleAvatar')
    );

    for (const block of [syncBlock, resendBlock]) {
      const createAt = block.indexOf('createChallenge(');
      const sendAt = block.indexOf('sendEmail(');
      assert.ok(createAt > 0, 'challenge is created');
      assert.ok(sendAt > 0, 'email is sent');
      assert.ok(createAt < sendAt, 'challenge is stored before the code is emailed');
    }

    const repository = readFileSync('src/repositories/verification-challenge.repository.ts', 'utf8');
    assert.match(repository, /throw this\.databaseFailure/);

    const repair = readFileSync('supabase/migrations/046_verification_challenge_fk.sql', 'utf8');
    assert.match(repair, /DROP CONSTRAINT verification_challenges_user_id_fkey/);
    assert.match(repair, /REFERENCES public\.users\(id\)/);
  });
});
