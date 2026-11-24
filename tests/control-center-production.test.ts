import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { CmsService, type CmsSection } from '../src/services/cms.service.js';

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

await test('demo content has one runtime-controlled setting and fails closed in production', () => {
  const settings = read('src/services/system-settings.service.ts');
  assert.match(settings, /DEMO_CONTENT_KEY = 'demo_content_enabled'/);
  assert.match(settings, /getDemoContent\(\): Promise<DemoContentSettings>/);
  assert.match(settings, /setDemoContent\(enabled: boolean, updatedBy: string\)/);
  assert.match(settings, /env\.IS_PRODUCTION\s*\?\s*\{\s*enabled: false/);
  assert.match(settings, /export function demoContentEnabled\(\)/);
  assert.match(
    settings,
    /system_settings table not yet migrated[\s\S]{0,220}env\.IS_PRODUCTION\s*\?\s*\{\s*enabled: false/
  );
  assert.match(settings, /DEMO_CACHE_TTL_MS = 5000/);
  assert.match(settings, /let demoEnabledCache = env\.IS_PRODUCTION \? false : env\.DEMO_POSTS_ENABLED/);
  assert.match(settings, /enabled: env\.IS_PRODUCTION \? false : env\.DEMO_POSTS_ENABLED/);
  assert.match(read('src/server.ts'), /void refreshDemoContentCache\(\)/);

  const routes = read('src/routes/staff.routes.ts');
  assert.match(routes, /staffRouter\.get\('\/api\/system\/demo-content', staffController\.getDemoContent\)/);
  assert.match(
    routes,
    /staffRouter\.get\('\/api\/control\/demo-content', requireStaff\('owner'\), staffController\.getDemoContent\)/
  );
  assert.match(
    routes,
    /staffRouter\.put\('\/api\/control\/demo-content', requireStaff\('owner'\), staffController\.updateDemoContent\)/
  );
});

await test('every demo-data surface reads the runtime gate', () => {
  const gatedFiles = [
    'src/repositories/public-observation.repository.ts',
    'src/repositories/community.repository.ts',
    'src/repositories/site.repository.ts',
    'src/services/community-media.service.ts',
    'src/controllers/community.controller.ts',
    'src/services/community-post.service.ts',
  ];

  for (const path of gatedFiles) {
    assert.match(read(path), /demoContentEnabled\(\)/, path);
  }

  const postRepository = read('src/repositories/community-post.repository.ts');
  assert.match(postRepository, /\.eq\('is_demo', false\)/);
  assert.match(postRepository, /!row\.is_demo/);
});

await test('owner controls expose the demo toggle and written responsibilities', () => {
  const control = read('web/src/control/ControlCenter.tsx');
  assert.match(control, /id: 'system' as ControlTab/);
  assert.match(control, /label: 'Owner Controls'/);
  assert.match(control, /visible: role === 'owner'/);
  assert.match(control, /controlApi\s*\n\s*\.getDemoContent\(\)/);
  assert.match(control, /controlApi\.updateDemoContent/);
  assert.match(control, /disabled=\{loading \|\| saving \|\| !settings\}/);
  assert.match(control, /No staff alert feed is connected to this panel\./);
  assert.match(control, /setActiveTab\('ops'\)/);
  assert.doesNotMatch(control, /window\.location\.assign\('\/'\)/);
  assert.match(control, /Owner responsibilities/);
  assert.match(control, /activeView === 'staff' && canManageStaff/);
  assert.match(control, /activeView === 'audit' && canSeeAudit/);
  assert.match(control, /activeView === 'support' && canSeeSupport/);
  assert.match(control, /activeView === 'cms' && canManageCms/);
  assert.match(control, /activeView === 'distribution' && canManageDistribution/);

  const api = read('web/src/services/controlApi.ts');
  assert.match(api, /getDemoContent: \(\) => request\('\/demo-content'\)/);

  const governanceStart = control.indexOf('const GovernanceSuite');
  const systemStart = control.indexOf('const SystemControls');
  const governance = control.slice(governanceStart, systemStart);
  assert.doesNotMatch(governance, /Open public site/);
  assert.doesNotMatch(governance, /onLogout/);
});

await test('the About page has real Common FAQs, not a fake Control Center FAQ tab', () => {
  const raw = read('src/data/cms-content.json');
  const cms = JSON.parse(raw) as {
    about: { sections: Array<{ id: string; title: string; content: string }> };
  };
  const faq = cms.about.sections.find((section) => section.id === 'about-3');
  assert.ok(faq, 'about-3 section exists');
  assert.equal(faq.title, 'Common FAQs');
  assert.match(faq.content, /Who can contribute\?/);
  assert.match(faq.content, /Is the GeoAI result final\?/);
  assert.match(faq.content, /How is location privacy handled\?/);
  assert.match(faq.content, /How are phone numbers protected\?/);
  assert.match(faq.content, /Which WhatsApp number should I use\?/);
  assert.match(faq.content, /Can Earth Talk be used for safety-critical decisions\?/);
  assert.match(faq.content, /number configured for this deployment/);
  assert.doesNotMatch(faq.content, /\+?\d[\d\s-]{7,}/);

  const service = read('src/services/cms.service.ts');
  assert.match(service, /id: 'about-3'/);
  assert.match(service, /title: 'Common FAQs'/);
  assert.match(service, /lastUpdated: 'November 21, 2026'/);
  assert.match(service, /title: 'How Earth Talk Works in Rwanda'/);
  assert.match(service, /lastUpdated: 'October 31, 2026'/);
  assert.doesNotMatch(service, /contributor’s chosen precision/);
  assert.match(service, /mergeDefaultSections/);
  assert.doesNotMatch(service, /async getFaqs/);

  const cmsServiceHarness = new CmsService() as unknown as {
    mergeDefaultSections: (stored: CmsSection[], fallback: CmsSection[]) => CmsSection[];
  };
  const merged = cmsServiceHarness.mergeDefaultSections(
    [{ id: 'about-1', number: '1', title: 'Edited mission', content: 'Owner edited copy.' }],
    faq ? [faq] : []
  );
  assert.equal(merged.length, 2);
  assert.equal(merged[0].title, 'Edited mission');
  assert.equal(merged[1].title, 'Common FAQs');

  const cmsManagement = read('web/src/control/CmsManagement.tsx');
  assert.match(cmsManagement, /useState<'terms' \| 'privacy' \| 'about' \| 'how-it-works'>/);
  assert.doesNotMatch(cmsManagement, /'faqs'/);
  assert.doesNotMatch(cmsManagement, /HelpCircle/);

  const api = read('web/src/services/controlApi.ts');
  assert.doesNotMatch(api, /getFaqs/);
  assert.doesNotMatch(read('src/routes/staff.routes.ts'), /\/api\/control\/faqs/);
  assert.doesNotMatch(read('src/routes/public.routes.ts'), /\/api\/public\/faqs/);
});

await test('Operations cannot hang forever and explains its real data', () => {
  const ops = read('web/src/control/OperationsOverview.tsx');
  assert.match(
    ops,
    /Promise\.allSettled\(\[\s*controlApi\.getMetrics\(\),\s*controlApi\.getAuditLogs\(500\),\s*\]\)/
  );
  assert.match(ops, /Live metrics are temporarily unavailable\./);
  assert.match(ops, /Last metrics update:/);
  assert.match(ops, /AI coverage/);
  assert.match(ops, /Staff activity/);
  assert.match(ops, /DonutChart/);
  assert.match(ops, /ActivityBars/);
  assert.ok(ops.indexOf('const activity = useMemo') < ops.indexOf('if (loading && !metrics)'));
  assert.match(ops, /statusUnknown/);
  assert.match(ops, /Health probe not instrumented/);
  assert.match(ops, /No successful reading yet; values are shown as zero\./);
  assert.doesNotMatch(ops, /User_A|obs_1|14ms|820ms/);

  const api = read('web/src/services/controlApi.ts');
  assert.match(api, /getAuditLogs: \(limit = 100\)/);
  assert.match(api, /fetchWithTimeout/);
  assert.match(api, /timeoutMs = 15000/);
  assert.match(api, /The Control Center request timed out\. Please retry\./);

  const staff = read('src/services/staff.service.ts');
  assert.match(staff, /const METRICS_TIMEOUT_MS = 5000/);
  assert.match(staff, /export async function withTimeout/);
  assert.match(staff, /function normalizeMetrics/);
  assert.match(staff, /row\.system_status \?\? 'unknown'/);
  assert.match(staff, /row\.last_updated \?\? row\.timestamp \?\? null/);
  assert.match(staff, /system_status: 'unknown',\s*last_updated: null/);

  const controller = read('src/controllers/staff.controller.ts');
  assert.match(controller, /METRICS_ENDPOINT_TIMEOUT_MS = 12000/);
  assert.match(controller, /RESEARCH_SUMMARY_TIMEOUT_MS = 8000/);
  assert.match(controller, /Promise\.allSettled\(\[/);
  assert.match(controller, /researchAnalyticsService\.getResearchSummary\(\)/);
  assert.match(controller, /staffService\.listAuditLogs\(limit\)/);
  assert.match(controller, /Math\.min\(500, Math\.max\(1, requested\)\)/);
});

await test('authenticated staff identity and expert media are honest', () => {
  const staffController = read('src/controllers/staff.controller.ts');
  assert.match(
    staffController,
    /staff:\s*\{\s*id:\s*req\.staff\.staffId,\s*email:\s*req\.staff\.email,\s*role:\s*req\.staff\.role,?\s*\}/
  );
  assert.match(staffController, /demo_content\.update/);

  const expertRepository = read('src/repositories/expert.repository.ts');
  assert.match(
    expertRepository,
    /\/api\/posts\/\$\{obs\.passport_id\}\/media\/\$\{obs\.media_id\}/
  );
  assert.doesNotMatch(expertRepository, /\/api\/expert\/media\//);

  const modal = read('web/src/components/ExpertWorkspaceModal.tsx');
  assert.match(modal, /Associated Specimen Media/);
  assert.match(modal, /No media is attached to this record\./);

  const fixture = read('tests/stage6.test.ts');
  assert.match(fixture, /\/api\/posts\/RT-RW-000601\/media\/med-601/);
});

await test('governance panels and action icons have no duplicate shell or circular wrappers', () => {
  const expert = read('web/src/components/ExpertDashboardView.tsx');
  assert.doesNotMatch(expert, /logoutExpert/);
  assert.doesNotMatch(expert, /Public map/);
  assert.doesNotMatch(expert, /<header/);

  const moderation = read('web/src/components/AdminModerationDashboard.tsx');
  assert.doesNotMatch(moderation, /onLogout/);
  assert.doesNotMatch(moderation, /currentUser/);
  assert.doesNotMatch(moderation, /<header/);

  const audit = read('web/src/control/AuditLogs.tsx');
  assert.match(audit, /<span className="mt-0\.5 shrink-0 text-\[#5e5e5e\]">/);
  assert.doesNotMatch(audit, /w-9 h-9 rounded-full/);

  const distribution = read('web/src/control/AppDistributionManagement.tsx');
  assert.match(distribution, /<Upload className="mb-2 h-6 w-6 text-\[#0b57d0\]" \/>/);
  assert.doesNotMatch(distribution, /w-10 h-10 rounded-full[\s\S]{0,160}<Upload/);
  assert.doesNotMatch(distribution, /<h1[\s>]/);

  const staff = read('web/src/control/StaffManagement.tsx');
  assert.match(staff, /if \(typeof current !== 'boolean'\)/);
  assert.match(staff, /disabled=\{typeof member\.is_active !== 'boolean'\}/);

  const app = read('web/src/App.tsx');
  assert.match(app, /No analysis is available for this record\./);
  assert.doesNotMatch(app, /\/media\/pool\/rock-08\.jpg/);
});

await test('operational status, content outages, and telemetry claims are honest', () => {
  const server = read('src/server.ts');
  assert.match(server, /dbStatus === 'error' \|\| dbStatus === 'unreachable' \? 'degraded' : 'online'/);
  assert.match(server, /payload\.status === 'degraded' \? 503 : 200/);

  const publicRoutes = read('src/routes/public.routes.ts');
  assert.match(publicRoutes, /isServiceUnavailableError\(err\)/);
  assert.match(publicRoutes, /res\.status\(503\)\.json\(\{ error: 'CMS_UNAVAILABLE'/);

  const distributionPath = 'src/data/app-distribution.json';
  const distributionRaw = read(distributionPath);
  const distribution = JSON.parse(distributionRaw) as { download_count: number };
  assert.notEqual(distribution.download_count, 68);
  writeFileSync(distributionPath, distributionRaw.replace(/("download_count":\s*)\d+/, (_match, prefix: string) => `${prefix}0`));

  const admin = read('src/controllers/admin.controller.ts');
  assert.match(admin, /ephemeral: true/);
  assert.match(admin, /Not durable across restarts\./);

  const research = read('src/controllers/research.controller.ts');
  assert.match(research, /checked_at: new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(research, /updated_at: new Date\(\)\.toISOString\(\)/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
