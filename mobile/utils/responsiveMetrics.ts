export interface ViewportInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ViewportInput {
  width: number;
  height: number;
  insets: ViewportInsets;
}

export interface ResponsiveMetrics {
  width: number;
  height: number;
  insets: ViewportInsets;
  isCompactPhone: boolean;
  isTablet: boolean;
  isWideTablet: boolean;
  isLandscape: boolean;
  horizontalPadding: number;
  contentMaxWidth: number | undefined;
  sheetMaxWidth: number | undefined;
  mapOverlayMaxWidth: number | undefined;
  drawerWidth: number;
  topSafePadding: number;
  modalHeaderTopPadding: number;
  sheetTopMargin: number;
  bottomSafePadding: number;
  sideSafeLeft: number;
  sideSafeRight: number;
  tabBarHeight: number;
  tabBarPaddingBottom: number;
}

export function computeResponsiveMetrics({ width, height, insets }: ViewportInput): ResponsiveMetrics {
  const safeWidth = Math.max(280, Math.round(width || 375));
  const safeHeight = Math.max(320, Math.round(height || 812));
  const top = Math.max(0, Math.round(insets?.top ?? 0));
  const bottom = Math.max(0, Math.round(insets?.bottom ?? 0));
  const left = Math.max(0, Math.round(insets?.left ?? 0));
  const right = Math.max(0, Math.round(insets?.right ?? 0));

  const isCompactPhone = safeWidth < 360;
  const isTablet = safeWidth >= 600;
  const isWideTablet = safeWidth >= 840;
  const isLandscape = safeWidth > safeHeight;

  const horizontalPadding = isCompactPhone ? 12 : isTablet ? 24 : 16;
  const contentMaxWidth = isWideTablet ? 820 : isTablet ? 720 : undefined;
  const sheetMaxWidth = isTablet ? 580 : undefined;
  const mapOverlayMaxWidth = isTablet ? 520 : isLandscape ? 460 : undefined;
  const drawerWidth = Math.min(Math.max(252, Math.round(safeWidth * 0.84)), 320);

  const topSafePadding = Math.max(top, 8);
  const modalHeaderTopPadding = Math.max(top, 12) + 6;
  const sheetTopMargin = Math.max(top + 12, 24);
  const bottomSafePadding = Math.max(bottom, 14);
  const sideSafeLeft = left;
  const sideSafeRight = right;

  const baseTabHeight = isCompactPhone ? 52 : 56;
  const tabBarPaddingBottom = Math.max(bottom, 6);
  const tabBarHeight = baseTabHeight + tabBarPaddingBottom;

  return {
    width: safeWidth,
    height: safeHeight,
    insets: { top, bottom, left, right },
    isCompactPhone,
    isTablet,
    isWideTablet,
    isLandscape,
    horizontalPadding,
    contentMaxWidth,
    sheetMaxWidth,
    mapOverlayMaxWidth,
    drawerWidth,
    topSafePadding,
    modalHeaderTopPadding,
    sheetTopMargin,
    bottomSafePadding,
    sideSafeLeft,
    sideSafeRight,
    tabBarHeight,
    tabBarPaddingBottom,
  };
}
