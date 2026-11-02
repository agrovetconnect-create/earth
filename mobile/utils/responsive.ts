import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  computeResponsiveMetrics,
  type ResponsiveMetrics,
  type ViewportInput,
  type ViewportInsets,
} from './responsiveMetrics';

export { computeResponsiveMetrics, type ResponsiveMetrics, type ViewportInput, type ViewportInsets };

export function useResponsiveLayout(): ResponsiveMetrics {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(
    () =>
      computeResponsiveMetrics({
        width,
        height,
        insets,
      }),
    [width, height, insets.top, insets.bottom, insets.left, insets.right]
  );
}
