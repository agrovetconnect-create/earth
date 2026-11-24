/**
 * Per-user notification inbox tests.
 *
 * The suite runs against the process-local adapter (tests/run.ts pins the
 * database placeholders), so it proves that reads and mutations are always
 * scoped to the authenticated account and can never address another user's
 * row by guessing its id.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { notificationService } from '../src/services/notification.service.js';
import { communityPostService } from '../src/services/community-post.service.js';
import { userRepository } from '../src/repositories/user.repository.js';

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

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

const alice = crypto.randomUUID();
const bob = crypto.randomUUID();

await test('a notification is stored for exactly one recipient', async () => {
  const created = await notificationService.create({
    recipientUserId: alice,
    type: 'verification',
    title: 'Expert verification complete',
    body: 'Your observation ET-TEST-0001 received expert verification.',
    passportId: 'ET-TEST-0001',
  });
  assert.equal(created.read, false);
  assert.equal(created.passport_id, 'ET-TEST-0001');

  const aliceInbox = await notificationService.listForUser(alice);
  const bobInbox = await notificationService.listForUser(bob);
  assert.ok(aliceInbox.some((item) => item.id === created.id), 'recipient sees the notification');
  assert.ok(!bobInbox.some((item) => item.id === created.id), 'another account cannot see it');
});

await test('marking read is scoped to the owner of the notification', async () => {
  const created = await notificationService.create({
    recipientUserId: alice,
    type: 'reply',
    title: 'New reply to your comment',
    body: 'Eli Turner: “I agree.”',
    passportId: 'ET-TEST-0002',
  });

  const strangerUpdate = await notificationService.markRead(bob, created.id, true);
  assert.equal(strangerUpdate, null, 'a guessed id from another account is rejected');

  const unread = (await notificationService.listForUser(alice)).find((item) => item.id === created.id);
  assert.equal(unread?.read, false, 'the failed attempt left the row untouched');

  const updated = await notificationService.markRead(alice, created.id, true);
  assert.equal(updated?.read, true);
  const reopened = await notificationService.markRead(alice, created.id, false);
  assert.equal(reopened?.read, false, 'mark-unread is persisted too');
});

await test('dismiss and clear never touch another account', async () => {
  const aliceItem = await notificationService.create({
    recipientUserId: alice,
    type: 'visit',
    title: 'Site visit logged',
    body: 'A new visitor log was recorded.',
    siteId: 'G-012',
  });
  const bobItem = await notificationService.create({
    recipientUserId: bob,
    type: 'vote',
    title: 'New vote on community investigation',
    body: 'Your investigation received a vote.',
  });

  assert.equal(await notificationService.dismiss(bob, aliceItem.id), false);
  assert.ok(
    (await notificationService.listForUser(alice)).some((item) => item.id === aliceItem.id),
    'the other account could not dismiss it'
  );

  await notificationService.clear(alice);
  assert.equal((await notificationService.listForUser(alice)).length, 0, 'owner inbox is cleared');
  assert.ok(
    (await notificationService.listForUser(bob)).some((item) => item.id === bobItem.id),
    'the other account kept its notifications'
  );
});

await test('real event helpers create the right notification and skip self-notifications', async () => {
  const recipient = crypto.randomUUID();
  const actor = crypto.randomUUID();

  await notificationService.notifyComment({
    recipientUserId: recipient,
    actorUserId: actor,
    actorDisplayName: 'Eli Turner',
    passportId: 'ET-TEST-0003',
    commentId: 'comment-target-123',
    isReply: true,
    body: 'The next heatwave is the real challenge.',
  });
  await notificationService.notifyComment({
    recipientUserId: actor,
    actorUserId: actor,
    actorDisplayName: 'Eli Turner',
    passportId: 'ET-TEST-0003',
    commentId: 'comment-self-456',
    isReply: true,
    body: 'My own reply.',
  });
  await notificationService.notifyVerification({
    recipientUserId: recipient,
    passportId: 'ET-TEST-0003',
    status: 'expert_verified',
  });

  const inbox = await notificationService.listForUser(recipient);
  assert.equal(inbox.length, 2, 'only the two events for this account were recorded');
  assert.deepEqual(
    inbox.map((item) => item.type).sort(),
    ['reply', 'verification'],
    'comment and verification produce distinct notification types'
  );
  const replyNotification = inbox.find((item) => item.type === 'reply');
  assert.equal(replyNotification?.comment_id, 'comment-target-123', 'reply notification carries target comment_id');
  assert.equal(inbox.some((item) => item.body.includes('My own reply.')), false);
  assert.equal((await notificationService.listForUser(actor)).length, 0, 'no self-notification');
});

await test('replying to a Passport comment emits a notification pointing to the exact reply id', async () => {
  const firstUser = await userRepository.findOrCreateByEmail(`${crypto.randomUUID()}@gmail.com`);
  const secondUser = await userRepository.findOrCreateByEmail(`${crypto.randomUUID()}@gmail.com`);

  const parent = await communityPostService.createComment(
    'ET-DEMO-0005',
    {
      userId: firstUser.id,
      publicUserId: firstUser.public_user_id,
      displayName: 'Field Author',
      isDemo: false,
    },
    {
      body: 'Does this basalt show columnar jointing?',
      parent_comment_id: null,
    }
  );

  const reply = await communityPostService.createComment(
    'ET-DEMO-0005',
    {
      userId: secondUser.id,
      publicUserId: secondUser.public_user_id,
      displayName: 'Field Reviewer',
      isDemo: false,
    },
    {
      body: 'Yes, hexagonal cooling joints are visible on the east face.',
      parent_comment_id: parent.comment.comment_id,
    }
  );

  // notifyEventSafely runs the notification write asynchronously
  await new Promise((resolve) => setTimeout(resolve, 25));

  const firstInbox = await notificationService.listForUser(firstUser.id);
  const matched = firstInbox.find((item) => item.comment_id === reply.comment.comment_id);
  assert.ok(matched, 'parent author receives a notification with comment_id set to the reply');
  assert.equal(matched?.type, 'reply');
  assert.equal(matched?.passport_id, 'ET-DEMO-0005');
});

await test('staff can send an announcement to a selected user or to everyone', async () => {
  const first = await userRepository.findOrCreateByEmail(`${crypto.randomUUID()}@gmail.com`);
  const second = await userRepository.findOrCreateByEmail(`${crypto.randomUUID()}@gmail.com`);

  const direct = await notificationService.createStaffAnnouncement({
    title: 'Direct message',
    body: 'Please check your field notes.',
    recipientUserIds: [first.id],
    createdBy: 'owner@earthtalk.test',
  });
  assert.equal(direct.sent, 1);
  assert.equal(direct.recipients, 1);
  const directInbox = await notificationService.listForUser(first.id);
  assert.ok(directInbox.some((item) => item.type === 'announcement' && item.title === 'Direct message'));
  assert.equal((await notificationService.listForUser(second.id)).some((item) => item.title === 'Direct message'), false);

  const broadcast = await notificationService.createStaffAnnouncement({
    title: 'Platform notice',
    body: 'Earth Talk will be unavailable tonight.',
    broadcast: true,
    recipientUserIds: [],
    createdBy: 'owner@earthtalk.test',
  });
  assert.ok(broadcast.sent >= 2, 'every real account receives the broadcast');
  assert.ok(
    (await notificationService.listForUser(first.id)).some((item) => item.title === 'Platform notice'),
    'first account received the broadcast'
  );
  assert.ok(
    (await notificationService.listForUser(second.id)).some((item) => item.title === 'Platform notice'),
    'second account received the broadcast'
  );
});

await test('the migration and API enforce per-account ownership', () => {
  assert.ok(existsSync('supabase/migrations/048_user_notifications.sql'), 'migration exists');
  const migration = read('supabase/migrations/048_user_notifications.sql');
  assert.match(migration, /recipient_user_id uuid NOT NULL REFERENCES public\.users\(id\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /USING \(false\)/);
  assert.ok(existsSync('supabase/migrations/049_notification_announcement_type.sql'), 'announcement migration exists');
  assert.match(read('supabase/migrations/049_notification_announcement_type.sql'), /'announcement'/);

  const routes = read('src/routes/notifications.routes.ts');
  assert.match(routes, /requireUser/, 'every endpoint requires a verified session');
  assert.equal(/req\.body|bodyOf/.test(routes), false, 'no route accepts a user id from the client');

  const controller = read('src/controllers/notifications.controller.ts');
  assert.match(controller, /req\.viewer\.userId/g, 'the recipient always comes from the session');

  const staffRoutes = read('src/routes/staff.routes.ts');
  assert.match(staffRoutes, /\/api\/control\/notifications/, 'staff announcement endpoint is registered');
  const controlApi = read('web/src/services/controlApi.ts');
  assert.match(controlApi, /sendNotification/, 'Control Center client can send announcements');
});

await test('the browser inbox is API-backed and has no seeded notifications', () => {
  const service = read('web/src/services/notificationsApi.ts');
  assert.match(service, /\/api\/me\/notifications/, 'it calls the scoped endpoint');
  assert.equal(/credentials:\s*'include'/.test(service), false, 'requestJson handles the session cookie');

  const view = read('web/src/components/NotificationsView.tsx');
  assert.match(view, /fetchNotifications\(\)/, 'the view loads the signed-in user\'s inbox');
  assert.match(view, /viewer/, 'the view only renders for a signed-in contributor');
  assert.match(view, /handleOpenItem/, 'clicking a notification opens its target');
  assert.match(view, /item\.comment_id/, 'opening an observation passes target comment_id');
  assert.equal(/INITIAL_NOTIFICATIONS/.test(view), false, 'hardcoded demo notifications are gone');

  assert.ok(existsSync('supabase/migrations/053_notification_comment_target.sql'), 'comment_id migration exists');
  assert.match(read('supabase/migrations/053_notification_comment_target.sql'), /comment_id/);

  const app = read('web/src/App.tsx');
  assert.match(app, /viewer=\{viewer\}/, 'App passes the current user into the inbox');
  assert.match(app, /handleOpenNotificationObservation/, 'App routes clicked notifications to the target Passport message');
  assert.match(app, /targetCommentId=\{targetCommentId\}/, 'App passes targetCommentId into ObservationSideCard');

  const card = read('web/src/components/ObservationSideCard.tsx');
  assert.match(card, /setReplyTarget\(targetCommentId\)/, 'Passport opens inline reply for the target message');
  assert.match(card, /scrollIntoView/, 'Passport scrolls straight to the target message');

  const control = read('web/src/control/ControlCenter.tsx');
  assert.equal(/New Moderation Report/.test(control), false, 'control center has no fake alert feed');
  assert.match(control, /UserMessaging/, 'staff can reach the real messaging tools');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
