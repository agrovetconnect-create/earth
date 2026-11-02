import Constants from 'expo-constants';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, ScreenTitle } from '../components/Screen';
import { GuideModal } from '../components/GuideModal';
import { getApiBaseUrl } from '../services/api';
import { spacing, radius, type Palette, type ThemeMode } from '../theme/theme';
import { useAppTheme } from '../theme/theme-provider';
import { useAppLanguage } from '../utils/language';

const modes: Array<{ value: ThemeMode; title: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'system', title: 'System', icon: 'phone-portrait-outline' },
  { value: 'light', title: 'Light', icon: 'sunny-outline' },
  { value: 'dark', title: 'Dark', icon: 'moon-outline' },
];

export default function SettingsScreen() {
  const { mode, setMode, colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { language, setLanguage: chooseLanguage, t } = useAppLanguage();
  const [openGuide, setOpenGuide] = useState<'how-it-works' | 'about' | 'terms' | 'privacy' | null>(null);

  let apiConfigured = true;
  try {
    getApiBaseUrl();
  } catch {
    apiConfigured = false;
  }

  return (
    <Screen includeTopInset={false} includeBottomInset>
      <ScreenTitle subtitle={t('Theme, language, and field guides.')}>{t('Settings')}</ScreenTitle>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('Appearance')}</Text>
        <View style={styles.card}>
          {modes.map((item, idx) => {
            const selected = mode === item.value;
            return (
              <Pressable
                key={item.value}
                onPress={() => setMode(item.value)}
                style={[styles.row, idx < modes.length - 1 && styles.rowDivider]}
              >
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={selected ? colors.primary : colors.onSurfaceVariant}
                />
                <Text style={[styles.rowText, selected && styles.rowTextActive]}>{t(item.title)}</Text>
                {selected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('Language')}</Text>
        <View style={styles.card}>
          <Pressable style={[styles.row, styles.rowDivider]} onPress={() => chooseLanguage('en')}>
            <Text style={[styles.rowText, language === 'en' && styles.rowTextActive]}>English</Text>
            {language === 'en' && <Ionicons name="checkmark" size={20} color={colors.primary} />}
          </Pressable>
          <Pressable style={styles.row} onPress={() => chooseLanguage('fr')}>
            <Text style={[styles.rowText, language === 'fr' && styles.rowTextActive]}>Français</Text>
            {language === 'fr' && <Ionicons name="checkmark" size={20} color={colors.primary} />}
          </Pressable>
        </View>
        <Text style={styles.sectionHint}>
          {t('Updates app screens, menus, and guides. Field notes keep their author language.')}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('Guides & Policies')}</Text>
        <View style={styles.card}>
          <Pressable
            style={[styles.row, styles.rowDivider]}
            onPress={() => setOpenGuide('how-it-works')}
          >
            <Ionicons name="help-circle-outline" size={20} color={colors.onSurfaceVariant} />
            <Text style={styles.rowText}>{t('How It Works')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.outline} />
          </Pressable>
          <Pressable style={[styles.row, styles.rowDivider]} onPress={() => setOpenGuide('about')}>
            <Ionicons name="information-circle-outline" size={20} color={colors.onSurfaceVariant} />
            <Text style={styles.rowText}>{t('About Earth Talk')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.outline} />
          </Pressable>
          <Pressable
            style={[styles.row, styles.rowDivider]}
            onPress={() => setOpenGuide('privacy')}
          >
            <Ionicons name="shield-outline" size={20} color={colors.onSurfaceVariant} />
            <Text style={styles.rowText}>{t('Privacy')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.outline} />
          </Pressable>
          <Pressable style={styles.row} onPress={() => setOpenGuide('terms')}>
            <Ionicons name="document-text-outline" size={20} color={colors.onSurfaceVariant} />
            <Text style={styles.rowText}>{t('Terms')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.outline} />
          </Pressable>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.versionText}>
          {t(`Earth Talk v${Constants.expoConfig?.version ?? '1.0.0'}`)}
        </Text>
        {!apiConfigured ? <Text style={styles.connectionText}>{t('Offline mode')}</Text> : null}
      </View>

      <GuideModal
        visible={Boolean(openGuide)}
        page={openGuide}
        onClose={() => setOpenGuide(null)}
      />
    </Screen>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    section: { gap: 6 },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginLeft: 12,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.l,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.outlineSoft,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      minHeight: 50,
      gap: 12,
    },
    rowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineSoft,
    },
    rowText: {
      flex: 1,
      fontSize: 15,
      color: colors.onSurface,
      fontWeight: '500',
    },
    rowTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    footer: {
      paddingVertical: spacing.lg,
      alignItems: 'center',
      gap: 4,
    },
    versionText: {
      fontSize: 13,
      color: colors.onSurfaceVariant,
      fontWeight: '600',
    },
    sectionHint: {
      fontSize: 12,
      color: colors.onSurfaceFaint,
      lineHeight: 17,
      marginHorizontal: 12,
    },
    connectionText: {
      fontSize: 12,
      color: colors.onSurfaceFaint,
    },
  });
}
