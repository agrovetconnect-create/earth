import { Link, Stack } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
<<<<<<< HEAD
import { Screen } from '../components/Screen';
import { radius, spacing, type Palette } from '../theme/theme';
import { useAppTheme } from '../theme/theme-provider';
=======
import { useAppTheme } from '../theme/theme-provider';
import type { Palette } from '../theme/theme';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

export default function NotFoundScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
<<<<<<< HEAD

  return (
    <Screen includeTopInset={false} includeBottomInset scroll={false}>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View style={styles.container}>
        <Text style={styles.title}>Page not found</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Back to Home</Text>
        </Link>
      </View>
    </Screen>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
      gap: spacing.md,
    },
    title: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.ink,
      textAlign: 'center',
    },
    link: {
      minHeight: 44,
      paddingHorizontal: spacing.lg,
      paddingVertical: 12,
      borderRadius: radius.m,
      backgroundColor: colors.forest,
      justifyContent: 'center',
    },
    linkText: {
      fontSize: 14,
      fontWeight: '800',
      color: '#FFFFFF',
    },
  });
}
=======
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
          <Text style={styles.title}>This screen doesn’t exist.</Text>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to Home</Text>
        </Link>
      </View>
    </>
  );
}

function createStyles(colors: Palette) { return StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: colors.canvas,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.ink,
    textAlign: 'center',
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    color: colors.forest,
  },
}); }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
