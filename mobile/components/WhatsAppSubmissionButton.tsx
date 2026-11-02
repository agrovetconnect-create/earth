import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, type Palette } from '../theme/theme';
import { useAppTheme } from '../theme/theme-provider';
import { useAppLanguage } from '../utils/language';
import { buildWhatsAppStartUrl, hasConfiguredWhatsAppRecipient } from '../utils/whatsapp';

export function WhatsAppSubmissionButton({ variant = 'submit' }: { variant?: 'submit' | 'participate' }) {
  const { colors } = useAppTheme();
  const { t } = useAppLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [opening, setOpening] = useState(false);
  const hasRecipient = hasConfiguredWhatsAppRecipient();

  const open = async () => {
    if (opening) return;
    if (!hasRecipient) {
      router.push('/(tabs)/chat');
      return;
    }
    setOpening(true);
    try {
      await Linking.openURL(buildWhatsAppStartUrl());
    } catch {
      Alert.alert(
        t('Open GeoAI Chat'),
        t('All WhatsApp features work directly inside GeoAI Chat.'),
        [
          { text: t('Open GeoAI Chat'), onPress: () => router.push('/(tabs)/chat') },
          { text: t('Close'), style: 'cancel' },
        ]
      );
    } finally {
      setOpening(false);
    }
  };

  const label = t(
    hasRecipient
      ? variant === 'participate'
        ? 'Open WhatsApp Channel'
        : 'Continue on WhatsApp'
      : 'Open In-App GeoAI Chat'
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={opening}
      hitSlop={4}
      onPress={() => {
        void open();
      }}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <Ionicons
          name={hasRecipient ? 'logo-whatsapp' : 'sparkles-outline'}
          size={18}
          color={colors.forest}
        />
        <Text style={styles.title} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    button: {
      minHeight: 46,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radius.m,
      backgroundColor: colors.canvas,
      borderWidth: 1,
      borderColor: colors.line,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    row: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    pressed: { opacity: 0.85 },
    title: {
      flex: 1,
      color: colors.ink,
      fontSize: 13,
      fontWeight: '700',
    },
  });
}
