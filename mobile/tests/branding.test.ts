import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
<<<<<<< HEAD
const appJsonPath = fs.existsSync(path.join(root, 'app.json')) ? path.join(root, 'app.json') : path.join(root, 'mobile', 'app.json');
const assetBase = fs.existsSync(path.join(root, 'app.json')) ? root : path.join(root, 'mobile');
const app = JSON.parse(fs.readFileSync(appJsonPath, 'utf8')) as {
  expo: {
    icon: string;
    plugins: unknown[];
    web?: { favicon?: string };
    android: { adaptiveIcon?: { foregroundImage?: string } };
  };
};

test('Earth Talk icon, splash and launcher assets referenced by Expo configuration are valid PNGs', () => {
  const splash = app.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen');
  assert.ok(Array.isArray(splash));
  const splashOptions = splash[1] as {
    image?: string;
    imageWidth?: number;
    dark?: { image?: string; backgroundColor?: string };
  };

  const referenced = [
    app.expo.icon,
    app.expo.android.adaptiveIcon?.foregroundImage,
    app.expo.web?.favicon,
    splashOptions.image,
    splashOptions.dark?.image,
  ].filter((asset): asset is string => Boolean(asset));

  for (const asset of referenced) {
    const bytes = fs.readFileSync(path.join(assetBase, asset));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${asset} must be PNG`);
  }

  assert.equal(splashOptions.imageWidth, 280);
  assert.equal(splashOptions.dark?.image, './assets/images/logo-no-subtitle.png');
  assert.equal(splashOptions.dark?.backgroundColor, '#141B17');
});

test('Animated splash screen assets, gradient overlay stops, and transition timings are valid', async () => {
  const bgBytes = fs.readFileSync(path.join(assetBase, './assets/images/splash-bg.jpg'));
  // Valid JPEG SOI marker (0xFF, 0xD8, 0xFF)
  assert.deepEqual([...bgBytes.subarray(0, 3)], [0xff, 0xd8, 0xff], 'splash-bg.jpg must be a valid JPEG');
  assert.ok(bgBytes.length > 50_000, 'splash-bg.jpg should be a high-resolution backdrop');

  const markBytes = fs.readFileSync(path.join(assetBase, './assets/images/icon.png'));
  assert.deepEqual([...markBytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'icon.png must be PNG');
  assert.ok(markBytes.readUInt32BE(16) > 256, 'icon.png width');
  assert.ok(markBytes.readUInt32BE(20) > 256, 'icon.png height');

  const { buildSplashGradientBands, SPLASH_GRADIENT_STOPS, SPLASH_TIMING } = await import('../utils/splashConfig.ts');
  const bands = buildSplashGradientBands(36);
  assert.equal(bands.length, 36);
  assert.equal(bands[0], 'rgba(6, 22, 30, 0.240)');
  assert.equal(bands[bands.length - 1], 'rgba(4, 14, 20, 0.940)');
  assert.ok(SPLASH_GRADIENT_STOPS[0]!.a < SPLASH_GRADIENT_STOPS[SPLASH_GRADIENT_STOPS.length - 1]!.a);
  assert.ok(SPLASH_TIMING.minDisplayMs >= 2000 && SPLASH_TIMING.maxHydrationWaitMs > SPLASH_TIMING.minDisplayMs);
});
=======
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')) as { expo: { icon: string; plugins: unknown[]; android: { adaptiveIcon: { foregroundImage: string; backgroundImage: string; monochromeImage: string } } } };

test('Earth Talk splash and launcher assets referenced by Expo configuration are valid square PNGs', () => {
  const referenced = [app.expo.icon, './assets/images/splash-icon.png', './assets/images/splash-icon-dark.png', app.expo.android.adaptiveIcon.foregroundImage, app.expo.android.adaptiveIcon.backgroundImage, app.expo.android.adaptiveIcon.monochromeImage, './assets/images/favicon.png'];
  for (const asset of referenced) {
    const bytes = fs.readFileSync(path.join(root, asset));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${asset} must be PNG`);
    assert.equal(bytes.readUInt32BE(16), 1024, `${asset} width`);
    assert.equal(bytes.readUInt32BE(20), 1024, `${asset} height`);
  }
  const splash = app.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen');
  assert.ok(Array.isArray(splash));
  const splashOptions = splash[1] as { imageWidth?: number; dark?: { image?: string; backgroundColor?: string } };
  assert.equal(splashOptions.imageWidth, 190);
  assert.equal(splashOptions.dark?.image, './assets/images/splash-icon-dark.png');
  assert.equal(splashOptions.dark?.backgroundColor, '#141B17');
});
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
