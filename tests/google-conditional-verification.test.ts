import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  syncGoogleOAuthUser,
  verifyGoogleChallenge,
  resendGoogleChallenge,
  maskEmail,
} from '../src/services/auth.service.js';
import { profileService } from '../src/services/profile.service.js';
import { verificationChallengeRepository } from '../src/repositories/verification-challenge.repository.js';
import { userRepository } from '../src/repositories/user.repository.js';
import { getEarthTalkVerificationEmailTemplate } from '../src/services/email.service.ts';
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

  it('getEarthTalkVerificationEmailTemplate includes Earth Talk logo, platform name, code, and expiry', () => {
    const html = getEarthTalkVerificationEmailTemplate('849201', 'Geology Researcher');
    assert.ok(html.includes('EARTH TALK'));
    assert.ok(html.includes('Verify Your Account'));
    assert.ok(html.includes('Hello <strong>Geology Researcher</strong>'));
    assert.ok(html.includes('849201'));
    assert.ok(html.includes('This code expires in <strong>10 minutes</strong>.'));
    assert.ok(html.includes('Every Earth Feature Has a Story.'));
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

  it('Case B: Returning active user within inactivity window bypasses step-up verification', async () => {
    const email = 'active.returning.user@gmail.com';
    const user = await userRepository.findOrCreateByEmail(email);
    await userRepository.setEmailVerified(user.id);

    // Set up existing profile with recent activity (1 day ago)
    await profileService.syncGoogleProfile(user.id, {
      email,
      displayName: 'Active Returner',
      avatarUrl: null,
    });
    await profileService.updateVerificationTimestamps(user.id, {
      markVerified: true,
      markLogin: true,
      markActivity: true,
    });

    // Authenticate with Google
    const res = await syncGoogleOAuthUser(
      { email, displayName: 'Active Returner', avatarUrl: null },
      mockReq
    );

    assert.equal(res.ok, true);
    if (!res.ok || !('verification_required' in res)) {
      assert.fail('Expected GoogleAuthResult response');
    }

    assert.equal(res.verification_required, false);
    if ('token' in res) {
      assert.ok(res.token);
      assert.ok(res.user);
      assert.equal(res.user.email, email);
    }
  });

  it('Case C: Returning inactive user after REAUTHENTICATION_INACTIVITY_DAYS requires step-up verification', async () => {
    const email = 'inactive.user.test@gmail.com';
    const user = await userRepository.findOrCreateByEmail(email);
    await userRepository.setEmailVerified(user.id);

    // Set up existing profile with old activity (40 days ago, > 30 days default)
    const oldTimestamp = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    await profileService.syncGoogleProfile(user.id, {
      email,
      displayName: 'Inactive User',
      avatarUrl: null,
    });

    // Set old activity timestamp on profile
    const existingProfile = await profileService.getProfile(user.id);
    if (existingProfile) {
      existingProfile.email_verified_at = oldTimestamp;
      existingProfile.last_successful_activity_at = oldTimestamp;
    }

    // Authenticate with Google
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
});
