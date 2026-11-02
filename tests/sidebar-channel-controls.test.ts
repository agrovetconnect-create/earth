import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { appDistributionService } from '../src/services/app-distribution.service.js';
import { appDistributionController } from '../src/controllers/app-distribution.controller.js';

const ROOT = process.cwd();
const CONFIG_PATH = path.resolve(ROOT, 'src/data/app-distribution.json');

function createMockRes() {
  const res: any = {
    statusCode: 200,
    jsonBody: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.jsonBody = body;
      return this;
    },
  };
  return res;
}

describe('Earth Talk — Sidebar Channel Visibility & Dedicated Web Photo Upload', () => {
  let originalConfigRaw: string | null = null;

  before(() => {
    if (fs.existsSync(CONFIG_PATH)) {
      originalConfigRaw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    }
  });

  after(() => {
    if (originalConfigRaw !== null) {
      fs.writeFileSync(CONFIG_PATH, originalConfigRaw, 'utf-8');
      (appDistributionService as any).configCache = null;
    }
  });

  it('defaults Start on WhatsApp and Get app sidebar visibility to false when off', async () => {
    (appDistributionService as any).configCache = null;
    const res = createMockRes();
    await appDistributionController.getConfig({} as any, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.jsonBody.is_whatsapp_sidebar_visible, false);
    assert.equal(res.jsonBody.is_get_app_sidebar_visible, false);
  });

  it('allows authorized staff (owner/ops/security) to toggle sidebar visibility and sanitize WhatsApp number', async () => {
    const updateReq: any = {
      staff: {
        staffId: 'super_admin',
        email: 'owner@earthtalk.rw',
        role: 'owner',
      },
      body: {
        is_whatsapp_sidebar_visible: true,
        is_get_app_sidebar_visible: true,
        whatsapp_number: '+250 (788) 123-456',
      },
    };
    const updateRes = createMockRes();
    await appDistributionController.updateConfig(updateReq, updateRes);

    assert.equal(updateRes.statusCode, 200);
    assert.equal(updateRes.jsonBody.success, true);
    assert.equal(updateRes.jsonBody.config.is_whatsapp_sidebar_visible, true);
    assert.equal(updateRes.jsonBody.config.is_get_app_sidebar_visible, true);
    assert.equal(updateRes.jsonBody.config.whatsapp_number, '250788123456');

    // Public config immediately reflects the updated state
    const publicRes = createMockRes();
    await appDistributionController.getConfig({} as any, publicRes);
    assert.equal(publicRes.jsonBody.is_whatsapp_sidebar_visible, true);
    assert.equal(publicRes.jsonBody.is_get_app_sidebar_visible, true);
    assert.equal(publicRes.jsonBody.whatsapp_number, '250788123456');

    // Turning channels off hides them again
    const turnOffReq: any = {
      staff: {
        staffId: 'super_admin',
        email: 'ops@earthtalk.rw',
        role: 'ops',
      },
      body: {
        is_whatsapp_sidebar_visible: false,
        is_get_app_sidebar_visible: false,
      },
    };
    const turnOffRes = createMockRes();
    await appDistributionController.updateConfig(turnOffReq, turnOffRes);
    assert.equal(turnOffRes.statusCode, 200);
    assert.equal(turnOffRes.jsonBody.config.is_whatsapp_sidebar_visible, false);
    assert.equal(turnOffRes.jsonBody.config.is_get_app_sidebar_visible, false);
  });

  it('decouples Web Photo Upload from Start on WhatsApp modal and gates sidebar buttons', () => {
    const whatsappModalSrc = fs.readFileSync(
      path.resolve(ROOT, 'web/src/components/WhatsAppCtaModal.tsx'),
      'utf-8'
    );
    assert.equal(
      whatsappModalSrc.includes('onOpenWebUpload'),
      false,
      'WhatsAppCtaModal must not carry onOpenWebUpload'
    );
    assert.equal(
      whatsappModalSrc.includes('Upload Photo & Supporting Media'),
      false,
      'WhatsAppCtaModal must not contain the Web upload button'
    );

    const sidebarSrc = fs.readFileSync(
      path.resolve(ROOT, 'web/src/components/Sidebar.tsx'),
      'utf-8'
    );
    assert.equal(
      sidebarSrc.includes('showWhatsApp && ('),
      true,
      'Sidebar must conditionally render Start on WhatsApp only when showWhatsApp is true'
    );
    assert.equal(
      sidebarSrc.includes('showGetApp && ('),
      true,
      'Sidebar must conditionally render Get app only when showGetApp is true'
    );
    assert.equal(
      sidebarSrc.includes('onClick={onOpenWebUpload}'),
      true,
      'Sidebar must provide direct access to Web Photo & Supporting Media upload'
    );
  });
});
