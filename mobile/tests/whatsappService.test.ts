import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWhatsAppUrl,
  buildObservationWhatsAppShareUrl,
  isWhatsAppConfigured,
  getConfiguredWhatsAppNumber,
  WHATSAPP_MESSAGES,
} from '../services/whatsapp.ts';

test('builds valid WhatsApp URLs and pre-filled message templates', () => {
  const defaultUrl = buildWhatsAppUrl();
  assert.ok(defaultUrl.startsWith('https://wa.me/'));
  assert.ok(defaultUrl.includes('START'));

  const helpUrl = buildWhatsAppUrl(WHATSAPP_MESSAGES.HELP);
  assert.ok(helpUrl.includes('HELP'));

  const shareUrl = buildObservationWhatsAppShareUrl('ET-RW-100200', 'Volcanic Basalt Outcrop');
  assert.ok(shareUrl.includes('ET-RW-100200'));
  assert.ok(shareUrl.includes('Volcanic'));
});

test('handles configured WhatsApp recipient phone numbers safely', () => {
  const digits = getConfiguredWhatsAppNumber();
  assert.equal(typeof digits, 'string');
  assert.equal(typeof isWhatsAppConfigured(), 'boolean');
});
