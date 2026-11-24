import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { WifiOff } from 'lucide-react-native';

/**
 * Port of the web's OfflineIndicator: a dark status pill pinned above the
 * bottom of the screen whenever the device is offline. Without an offline
 * tile cache of its own the app always reports the generic summary line.
 */
export function OfflineIndicator() {
  const netInfo = useNetInfo();
  const isOnline = netInfo.isConnected !== false;

  if (isOnline) return null;

  return (
    <View style={styles.wrap} pointerEvents="none" accessibilityLiveRegion="polite">
      <WifiOff size={16} color="#fbbf24" />
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>
          Offline Mode
        </Text>
        <Text style={styles.summary} numberOfLines={1}>
          Serving locally cached map tiles &amp; geological observations
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    backgroundColor: '#202124',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  summary: {
    fontSize: 11,
    fontWeight: '400',
    color: '#dadce0',
  },
});
