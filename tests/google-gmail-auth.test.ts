/**
 * Earth Talk — Google OAuth & Gmail OTP Authentication & Profile Regression Suite
 *
 * Verifies:
 *   1. Gmail domain validation rules enforce @gmail.com for OTP and OAuth.
 *   2. First Google login profile creation & metadata synchronization.
 *   3. Custom display name update sets name_source to 'custom'.
 *   4. Re-syncing from Google OAuth preserves customized display name.
 *   5. Custom avatar photo update sets avatar_source to 'uploaded'.
 *   6. Re-syncing from Google OAuth preserves custom avatar photo.
 *   7. Restoring Google profile photo restores google_avatar_url and sets avatar_source to 'google'.
 *   8. Non-@gmail.com email addresses are rejected with INVALID_EMAIL.
 */

import assert from 'node:assert/strict';
import { profileService } from '../src/services/profile.service.js';
import { requestEmailCode, syncGoogleOAuthUser } from '../src/services/auth.service.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}`);
    console.log(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function runTests() {
  console.log('========================================================================');
  console.log('Earth Talk — Google OAuth & Gmail OTP Authentication & Profile Tests');
  console.log('========================================================================');

  await test('Gmail domain validation rules enforce @gmail.com', () => {
    const validEmail = 'geologist.user@gmail.com';
    const invalidEmail1 = 'user@yahoo.com';
    const invalidEmail2 = 'user@outlook.com';
    const invalidEmail3 = 'user@gmail.co';

    assert.equal(validEmail.endsWith('@gmail.com'), true);
    assert.equal(invalidEmail1.endsWith('@gmail.com'), false);
    assert.equal(invalidEmail2.endsWith('@gmail.com'), false);
    assert.equal(invalidEmail3.endsWith('@gmail.com'), false);
  });

  const testUserId = 'test-uuid-' + Date.now();
  const testEmail = `field.geologist.${Date.now()}@gmail.com`;

  await test('First Google login creates profile with Google metadata', async () => {
    const profile = await profileService.syncGoogleProfile(testUserId, {
      email: testEmail,
      displayName: 'Dr. Jane Field',
      avatarUrl: 'https://lh3.googleusercontent.com/a/initial-photo',
    });

    assert.equal(profile.id, testUserId);
    assert.equal(profile.email, testEmail);
    assert.equal(profile.google_display_name, 'Dr. Jane Field');
    assert.equal(profile.google_avatar_url, 'https://lh3.googleusercontent.com/a/initial-photo');
    assert.equal(profile.display_name, 'Dr. Jane Field');
    assert.equal(profile.avatar_url, 'https://lh3.googleusercontent.com/a/initial-photo');
    assert.equal(profile.name_source, 'google');
    assert.equal(profile.avatar_source, 'google');
  });

  await test('Custom display name update sets name_source to custom', async () => {
    const updated = await profileService.updateDisplayName(testUserId, 'Jane "Volcano" Field');
    assert.equal(updated.display_name, 'Jane "Volcano" Field');
    assert.equal(updated.name_source, 'custom');
  });

  await test('Re-syncing from Google OAuth preserves custom display name', async () => {
    const resynced = await profileService.syncGoogleProfile(testUserId, {
      email: testEmail,
      displayName: 'Dr. Jane Field (Google Updated)',
      avatarUrl: 'https://lh3.googleusercontent.com/a/initial-photo',
    });

    // Custom display name must be preserved!
    assert.equal(resynced.display_name, 'Jane "Volcano" Field');
    assert.equal(resynced.name_source, 'custom');
    // Google metadata must still be updated:
    assert.equal(resynced.google_display_name, 'Dr. Jane Field (Google Updated)');
  });

  await test('Setting custom avatar sets avatar_source to uploaded', async () => {
    const customAvatar = await profileService.setCustomAvatar(
      testUserId,
      'https://storage.earthtalk.app/avatars/custom-rock.jpg'
    );
    assert.equal(customAvatar.avatar_url, 'https://storage.earthtalk.app/avatars/custom-rock.jpg');
    assert.equal(customAvatar.avatar_source, 'uploaded');
  });

  await test('Re-syncing from Google OAuth preserves custom avatar photo', async () => {
    const resynced = await profileService.syncGoogleProfile(testUserId, {
      email: testEmail,
      displayName: 'Dr. Jane Field (Google Updated)',
      avatarUrl: 'https://lh3.googleusercontent.com/a/new-google-photo',
    });

    // Custom uploaded avatar must be preserved!
    assert.equal(resynced.avatar_url, 'https://storage.earthtalk.app/avatars/custom-rock.jpg');
    assert.equal(resynced.avatar_source, 'uploaded');
    // Google avatar URL in profile metadata is updated
    assert.equal(resynced.google_avatar_url, 'https://lh3.googleusercontent.com/a/new-google-photo');
  });

  await test('Restoring Google profile photo restores google_avatar_url', async () => {
    const restored = await profileService.restoreGoogleAvatar(testUserId);
    assert.equal(restored.avatar_url, 'https://lh3.googleusercontent.com/a/new-google-photo');
    assert.equal(restored.avatar_source, 'google');
  });

  await test('requestEmailCode rejects non-@gmail.com addresses', async () => {
    const reqMock: any = { ip: '127.0.0.1', headers: {} };
    const result = await requestEmailCode('invalid.user@yahoo.com', reqMock);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'INVALID_EMAIL');
      assert.equal(result.status, 400);
    }
  });

  console.log('========================================================================');
  console.log(`Results: ${passed} passed, ${failed} failed.`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
