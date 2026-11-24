import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from '../src/lib/themeMode';

function RootShell() {
  const { dark, palette } = useTheme();
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} backgroundColor={palette.surface} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.surface },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" options={{ presentation: 'modal' }} />
        <Stack.Screen name="submit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="site/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="passport/[id]" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootShell />
    </ThemeProvider>
  );
}
