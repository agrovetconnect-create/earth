import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (relPath: string): string => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

const whatsappSrc = read('web/src/services/whatsapp.ts');
for (const relPath of ['web/src/services/whatsapp.ts', '.env', '.env.example']) {
  if (relPath === '.env' && !fs.existsSync(path.join(ROOT, relPath))) continue;
  assert.equal(
    read(relPath).includes('VITE_WHATSAPP_NUMBER'),
    false,
    `${relPath} must not configure the web WhatsApp number through VITE_WHATSAPP_NUMBER`
  );
}
assert.equal(whatsappSrc.includes('import.meta'), false);
assert.ok(
  whatsappSrc.includes("String(customNumber ?? '').replace(/\\D/g, '')"),
  'whatsAppUrl must resolve only the explicitly passed number'
);

const distribution = JSON.parse(read('src/data/app-distribution.json'));
assert.equal(distribution.whatsapp_number, '');
assert.equal(distribution.is_whatsapp_sidebar_visible, false);

const appSrc = read('web/src/App.tsx');
const handlerMatch = appSrc.match(/const handleOpenWhatsApp = \(\) => \{[\s\S]*?\n  \};/);
assert.ok(handlerMatch, 'App must define handleOpenWhatsApp');
assert.match(handlerMatch[0], /if \(!isWhatsAppSidebarVisible\) return;/);
assert.match(
  appSrc,
  /const isWhatsAppSidebarVisible = Boolean\(appDistribution\?\.is_whatsapp_sidebar_visible\)/
);
assert.equal((appSrc.match(/getPublicConfig\(\)/g) ?? []).length, 1);
assert.match(appSrc, /distributionConfig=\{appDistribution\}/);
assert.match(
  handlerMatch[0],
  /openWhatsApp\(WHATSAPP_MY_EARTH_TALK_MESSAGE, configuredWhatsAppNumber\)/
);
assert.match(appSrc, /whatsappNumber=\{configuredWhatsAppNumber\}/);

const sidebarSrc = read('web/src/components/Sidebar.tsx');
assert.match(
  sidebarSrc,
  /currentUser\?\.is_whatsapp_linked\s*\?\s*'My Earth Talk on WhatsApp'\s*:\s*'Start on WhatsApp'/
);
assert.equal(sidebarSrc.includes("signedIn ? 'My Earth Talk on WhatsApp'"), false);

const webhookSrc = read('src/controllers/webhook.controller.ts');
assert.equal(webhookSrc.includes('token === env.WHATSAPP_VERIFY_TOKEN'), false);
assert.match(webhookSrc, /verifyTokenMatches\(token, env\.WHATSAPP_VERIFY_TOKEN\)/);
assert.equal((webhookSrc.match(/createHash\('sha256'\)/g) ?? []).length, 2);
assert.ok(webhookSrc.includes('crypto.timingSafeEqual'));
