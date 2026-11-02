import assert from 'node:assert/strict';
import test from 'node:test';
import { computeResponsiveMetrics } from '../utils/responsiveMetrics.ts';

test('compact 320px phone adjusts padding, drawer width, and tab bar cleanly', () => {
  const metrics = computeResponsiveMetrics({
    width: 320,
    height: 568,
    insets: { top: 20, bottom: 0, left: 0, right: 0 },
  });

  assert.equal(metrics.isCompactPhone, true);
  assert.equal(metrics.isTablet, false);
  assert.equal(metrics.isLandscape, false);
  assert.equal(metrics.horizontalPadding, 12);
  assert.equal(metrics.contentMaxWidth, undefined);
  assert.ok(metrics.drawerWidth <= 280 && metrics.drawerWidth >= 252);
  assert.equal(metrics.topSafePadding, 20);
  assert.equal(metrics.modalHeaderTopPadding, 26);
  assert.equal(metrics.tabBarPaddingBottom, 6);
  assert.equal(metrics.tabBarHeight, 58);
});

test('Dynamic Island and home indicator insets are respected on modern phones', () => {
  const metrics = computeResponsiveMetrics({
    width: 393,
    height: 852,
    insets: { top: 59, bottom: 34, left: 0, right: 0 },
  });

  assert.equal(metrics.isCompactPhone, false);
  assert.equal(metrics.isTablet, false);
  assert.equal(metrics.horizontalPadding, 16);
  assert.equal(metrics.topSafePadding, 59);
  assert.equal(metrics.modalHeaderTopPadding, 65);
  assert.equal(metrics.sheetTopMargin, 71);
  assert.equal(metrics.bottomSafePadding, 34);
  assert.equal(metrics.tabBarPaddingBottom, 34);
  assert.equal(metrics.tabBarHeight, 90);
});

test('tablet and landscape viewports clamp max container width and preserve side notch insets', () => {
  const tablet = computeResponsiveMetrics({
    width: 820,
    height: 1180,
    insets: { top: 24, bottom: 20, left: 0, right: 0 },
  });

  assert.equal(tablet.isTablet, true);
  assert.equal(tablet.horizontalPadding, 24);
  assert.equal(tablet.contentMaxWidth, 720);
  assert.equal(tablet.sheetMaxWidth, 580);
  assert.equal(tablet.drawerWidth, 320);

  const landscapePhone = computeResponsiveMetrics({
    width: 852,
    height: 393,
    insets: { top: 0, bottom: 21, left: 59, right: 59 },
  });

  assert.equal(landscapePhone.isLandscape, true);
  assert.equal(landscapePhone.isWideTablet, true);
  assert.equal(landscapePhone.sideSafeLeft, 59);
  assert.equal(landscapePhone.sideSafeRight, 59);
  assert.equal(landscapePhone.contentMaxWidth, 820);
});
