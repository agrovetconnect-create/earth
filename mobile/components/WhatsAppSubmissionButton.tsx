<<<<<<< HEAD
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, type Palette } from '../theme/theme';
import { useAppTheme } from '../theme/theme-provider';
import { useAppLanguage } from '../utils/language';
=======
import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text } from 'react-native';
import type { Palette } from '../theme/theme';
import { useAppTheme } from '../theme/theme-provider';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
import { buildWhatsAppStartUrl, hasConfiguredWhatsAppRecipient } from '../utils/whatsapp';

export function WhatsAppSubmissionButton({ variant = 'submit' }: { variant?: 'submit' | 'participate' }) {
  const { colors } = useAppTheme();
<<<<<<< HEAD
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
=======
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [opening, setOpening] = useState(false);
  const hasRecipient = hasConfiguredWhatsAppRecipient();
  const open = async () => {
    if (opening) return;
    setOpening(true);
    try { await Linking.openURL(buildWhatsAppStartUrl()); }
    catch { Alert.alert('WhatsApp could not be opened', 'Install WhatsApp or open the Earth Talk WhatsApp entry link from a browser. The app does not submit images directly.'); }
    finally { setOpening(false); }
  };
  const title = variant === 'participate' ? 'Participate through WhatsApp' : 'Submit an Observation via WhatsApp';
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint="Opens WhatsApp. No message is sent automatically." disabled={opening} hitSlop={4} onPress={() => { void open(); }} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Text style={styles.title}>{title}</Text><Text style={styles.body}>{hasRecipient ? 'Opens Earth Talk’s configured WhatsApp chat with START prepared.' : 'Opens WhatsApp’s chat picker. Choose the verified Earth Talk account before continuing.'} Nothing is sent automatically; direct photo submission is not available in this app.</Text></Pressable>;
}
function createStyles(colors: Palette) { return StyleSheet.create({ button: { minHeight: 60, padding: 16, borderRadius: 16, backgroundColor: colors.forest, gap: 6 }, pressed: { opacity: 0.85 }, title: { color: colors.surface, fontSize: 15, fontWeight: '800' }, body: { color: colors.surface, fontSize: 13, lineHeight: 19, opacity: 0.92 } }); }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
