import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { AnimatedSplashScreen } from '../components/AnimatedSplashScreen';
import { NavDrawerProvider } from '../components/MobileNavDrawer';
import { registerMobileServiceWorker } from '../services/offlineCache';
import { ThemeProvider, useAppTheme } from '../theme/theme-provider';
import { useAppLanguage } from '../utils/language';
import { shouldRetryRead } from '../utils/queryPolicy';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: shouldRetryRead, refetchOnWindowFocus: false } },
  }));
  useEffect(() => {
    void registerMobileServiceWorker();
  }, []);
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <NavDrawerProvider>
              <AppShell />
            </NavDrawerProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppShell() {
  const { colors, isDark } = useAppTheme();
  const { ready: authReady } = useAuth();
  const { t } = useAppLanguage();
  const [splashVisible, setSplashVisible] = useState(true);

  const handleNativeSplashHide = useCallback(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  const handleSplashFinish = useCallback(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
    setSplashVisible(false);
  }, []);

  return (
    <View style={styles.shell}>
      <StatusBar style={splashVisible ? 'light' : isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerTintColor: colors.forest,
          headerTitleStyle: { color: colors.ink },
          headerStyle: { backgroundColor: colors.canvas },
          contentStyle: { backgroundColor: colors.canvas },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="observations/[id]"
          options={{ title: t('Passport'), headerBackTitle: t('Back') }}
        />
        <Stack.Screen name="settings" options={{ title: t('Settings') }} />
      </Stack>

      {splashVisible ? (
        <AnimatedSplashScreen
          appReady={authReady}
          onBackgroundReady={handleNativeSplashHide}
          onFinish={handleSplashFinish}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
});
