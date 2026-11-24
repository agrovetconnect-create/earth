import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { systemSettingsService } from '../src/services/system-settings.service.js';

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

await test('maintenance mode starts disabled', async () => {
  const settings = await systemSettingsService.getMaintenanceMode();
  assert.equal(settings.enabled, false);
  assert.equal(settings.message, '');
});

await test('a template supplies the banner message', async () => {
  const settings = await systemSettingsService.setMaintenanceMode(
    { enabled: true, template: 'scheduled' },
    'owner@earthtalk.test'
  );
  assert.equal(settings.enabled, true);
  assert.equal(settings.template, 'scheduled');
  assert.match(settings.message, /scheduled maintenance/i);

  const stored = await systemSettingsService.getMaintenanceMode();
  assert.equal(stored.enabled, true);
  assert.equal(stored.message, settings.message);
});

await test('a custom message is required when maintenance is enabled', async () => {
  await assert.rejects(
    systemSettingsService.setMaintenanceMode(
      { enabled: true, template: 'custom', message: '   ' },
      'owner@earthtalk.test'
    ),
    /maintenance message is required/i
  );
});

await test('maintenance mode can be turned off again', async () => {
  const settings = await systemSettingsService.setMaintenanceMode(
    { enabled: false, template: 'custom', message: '' },
    'owner@earthtalk.test'
  );
  assert.equal(settings.enabled, false);
  assert.equal(settings.message, '');
});

await test('maintenance settings and UI are wired end to end', () => {
  assert.ok(existsSync('supabase/migrations/050_system_settings.sql'), 'migration exists');
  const migration = readFileSync('supabase/migrations/050_system_settings.sql', 'utf8');
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /USING \(false\)/);

  const routes = readFileSync('src/routes/staff.routes.ts', 'utf8');
  assert.match(routes, /\/api\/system\/maintenance/);
  assert.match(routes, /\/api\/control\/maintenance/);
  assert.match(routes, /staffRouter\.get\('\/api\/control\/maintenance'/);

  const app = readFileSync('web/src/App.tsx', 'utf8');
  assert.match(app, /fetchMaintenanceMode\(\)/);
  assert.match(app, /Maintenance:/);
});

await test('the Control Center governance routes are registered', () => {
  const expertRoutes = readFileSync('src/routes/expert.routes.ts', 'utf8');
  assert.match(
    expertRoutes,
    /expertRouter\.get\('\/api\/expert\/audit-logs',\s*requireSuperAdmin,\s*expertController\.getAuditLogs\)/
  );

  const expertApi = readFileSync('web/src/services/expertApi.ts', 'utf8');
  assert.match(expertApi, /\/api\/expert\/audit-logs/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
