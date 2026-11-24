import React, { useEffect, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Check,
  Compass,
  History,
  Info,
  Languages,
  LogIn,
  LogOut,
  Map as MapIcon,
  MapPin,
  MessageSquarePlus,
  MonitorSmartphone,
  Moon,
  Search,
  ShieldCheck,
  Smartphone,
  Sun,
  Telescope,
  Upload,
  X,
} from 'lucide-react-native';
import type { ComponentType } from 'react';
import type { View as NavView } from '../services/navigation';
import type { AppDistributionPublicConfig } from '../services/appDistributionApi';
import { openWhatsApp } from '../services/whatsapp';
import { userAvatarSrc, useCommunityUser } from '../services/communityAuth';
import { usePreferences, type Locale } from '../services/preferences';
import { colors, radius, spacing, elevation } from '../lib/theme';
import { useTheme, type ThemeMode } from '../lib/themeMode';

/**
 * The web app's Sidebar as an overlay drawer — the web narrow-viewport shows
 * the same column over the map when the menu button is tapped.
 *
 * Structure follows the web navigation exactly: an "Earth Talk" wordmark, a
 * plain list of destinations (no section headings), the Language utility row,
 * and a pinned footer of actions. Destinations that need a session are hidden
 * until there is one, and whether the reader is signed in is shown once, at
 * the foot of the column.
 */

type CommunityPanelId = 'investigations';

interface SidebarEntry {
  /** The shell view the entry opens. */
  id: NavView;
  /** Which section of a view split across entries this opens. */
  panel?: CommunityPanelId;
  label: string;
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  requiresSignIn?: boolean;
}

/** Verbatim structure of the web's NAV_GROUPS, minus the Super Admin entries. */
const SIDEBAR_ENTRIES: SidebarEntry[] = [
  { id: 'explore', label: 'Explore map', icon: Compass },
  { id: 'sites', label: 'Geoscience sites', icon: MapPin },
  { id: 'community', label: 'Investigations', icon: Search, panel: 'investigations' },
  { id: 'mine', label: 'My Earth Talk', icon: Telescope, requiresSignIn: true },
  { id: 'my-map', label: 'My Map', icon: MapIcon, requiresSignIn: true },
  { id: 'history', label: 'History', icon: History },
  { id: 'about', label: 'About & Guide', icon: Info },
  { id: 'terms', label: 'Legal & Transparency', icon: ShieldCheck },
];

const LOCALE_OPTIONS: { id: Locale; nativeLabel: string; label: string }[] = [
  { id: 'en', nativeLabel: 'English', label: 'English' },
  { id: 'fr', nativeLabel: 'Français', label: 'French' },
];

interface DrawerProps {
  visible: boolean;
  onClose: () => void;
  activeView: NavView;
  /** The section of the active view on screen, when it has several. */
  activePanel?: CommunityPanelId | null;
  onSelectView: (view: NavView, panel?: CommunityPanelId) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onSubmitObservation: () => void;
  distribution: AppDistributionPublicConfig | null;
  whatsappNumber: string | null;
}

export function Drawer({
  visible,
  onClose,
  activeView,
  activePanel,
  onSelectView,
  onSignIn,
  onSignOut,
  onSubmitObservation,
  distribution,
  whatsappNumber,
}: DrawerProps) {
  const insets = useSafeAreaInsets();
  const user = useCommunityUser();
  const { locale, setLocale } = usePreferences();
  const { mode, setMode, palette: t } = useTheme();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  useEffect(() => {
    if (!visible) {
      setLanguageOpen(false);
      setThemeOpen(false);
      setAccountMenuOpen(false);
    }
  }, [visible]);

  const whatsappEnabled =
    distribution?.whatsapp?.enabled === true && Boolean(whatsappNumber ?? distribution?.whatsapp?.number);
  const getAppUrl = distribution?.appDownload?.enabled ? distribution.appDownload.url : null;

  // A signed-in contributor is sent straight into My Earth Talk on WhatsApp, so
  // the entry names the destination rather than the onboarding step.
  const whatsAppLabel = user ? 'My Earth Talk on WhatsApp' : 'Start on WhatsApp';

  const signedIn = Boolean(user);
  const entries = SIDEBAR_ENTRIES.filter((entry) => !(entry.requiresSignIn && !signedIn));

  const contributorName =
    user?.display_name || user?.email?.split('@')[0] || user?.public_user_id || '';
  const contributorInitials =
    contributorName
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'ET';

  const isEntryActive = (entry: SidebarEntry) => {
    if (entry.id === 'about' && (activeView === 'about' || activeView === 'how-it-works')) return true;
    if (entry.id === 'terms' && (activeView === 'terms' || activeView === 'privacy')) return true;
    return entry.id === activeView && (entry.panel ? entry.panel === activePanel : activePanel == null);
  };

  const themeOptions: Array<{ id: ThemeMode; label: string; icon: ComponentType<{ size?: number; color?: string }> }> = [
    { id: 'system', label: 'Auto — follow the phone', icon: MonitorSmartphone },
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.scrim, { backgroundColor: t.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close sidebar" />
        <View
          style={[
            styles.panel,
            {
              paddingTop: insets.top + spacing.sm,
              paddingBottom: insets.bottom + spacing.sm,
              backgroundColor: t.surface,
            },
            elevation[3],
          ]}
        >
          {/* Header — the wordmark and the close control */}
          <View style={styles.header}>
            <Image
              source={require('../../assets/images/icon.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={[styles.wordmark, { color: t.onSurface }]}>Earth Talk</Text>
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityLabel="Close sidebar">
              <X size={20} color={t.onSurfaceVariant} />
            </Pressable>
          </View>

          {/* Navigation — the one scroll region, header and footer held outside it */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: spacing.xs }} showsVerticalScrollIndicator={false}>
            {entries.map((entry, index) => {
              const active = isEntryActive(entry);
              const Icon = entry.icon;
              const previous = entries[index - 1];
              const groupBreak =
                previous &&
                ((previous.id === 'sites' && entry.id === 'community') ||
                  (previous.id === 'community' && entry.id === 'mine') ||
                  (previous.id === 'my-map' && entry.id === 'history') ||
                  (previous.id === 'history' && entry.id === 'about'));
              return (
                <View key={`${entry.id}:${entry.panel ?? ''}`} style={groupBreak ? { marginTop: spacing.md } : undefined}>
                  <Pressable
                    accessibilityLabel={entry.label}
                    accessibilityState={active ? { checked: true } : undefined}
                    onPress={() => onSelectView(entry.id, entry.panel)}
                    style={({ pressed }) => [styles.menuItem, active && styles.menuItemActive, pressed && { opacity: 0.85 }]}
                  >
                    <Icon size={20} color={active ? t.onPrimaryContainer : t.onSurfaceVariant} />
                    <Text style={[styles.menuLabel, { color: t.onSurface }, active && { fontWeight: '500' }]}>{entry.label}</Text>
                  </Pressable>
                </View>
              );
            })}

            {/* Footer utility — the Language row opens the locale card in place */}
            <Pressable
              accessibilityLabel="Language"
              onPress={() => setLanguageOpen((prev) => !prev)}
              style={({ pressed }) => [styles.menuItem, languageOpen && styles.menuItemActive, pressed && { opacity: 0.85 }]}
            >
              <Languages size={20} color={languageOpen ? t.primary : t.onSurfaceVariant} />
              <Text style={[styles.menuLabel, { color: t.onSurface }]}>Language</Text>
            </Pressable>

            {/* Appearance — Auto follows the phone's light/dark setting */}
            <Pressable
              accessibilityLabel="Appearance"
              onPress={() => setThemeOpen((prev) => !prev)}
              style={({ pressed }) => [styles.menuItem, themeOpen && styles.menuItemActive, pressed && { opacity: 0.85 }]}
            >
              <MonitorSmartphone size={20} color={themeOpen ? t.primary : t.onSurfaceVariant} />
              <Text style={[styles.menuLabel, { color: t.onSurface }]}>Appearance</Text>
            </Pressable>
            {themeOpen
              ? themeOptions.map((option) => {
                  const active = option.id === mode;
                  const OptionIcon = option.icon;
                  return (
                    <Pressable
                      key={option.id}
                      accessibilityLabel={option.label}
                      accessibilityState={active ? { checked: true } : undefined}
                      onPress={() => {
                        setMode(option.id);
                        setThemeOpen(false);
                      }}
                      style={([
                        styles.themeRow,
                        active && { backgroundColor: t.primaryContainer },
                      ] as never)}
                    >
                      <OptionIcon size={16} color={active ? t.onPrimaryContainer : t.onSurfaceVariant} />
                      <Text
                        style={[
                          styles.themeRowLabel,
                          { color: active ? t.onPrimaryContainer : t.onSurface },
                        ]}
                      >
                        {option.label}
                      </Text>
                      {active ? <Check size={14} color={t.onPrimaryContainer} /> : null}
                    </Pressable>
                  );
                })
              : null}
          </ScrollView>

          {/* Language popover — anchored above the footer, as on the web */}
          {languageOpen ? (
            <View style={[styles.languageCard, { backgroundColor: t.surfaceContainer }]}>
              {LOCALE_OPTIONS.map((option) => {
                const active = option.id === locale;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => {
                      setLocale(option.id);
                      setLanguageOpen(false);
                    }}
                    style={[styles.languageRow, active && { backgroundColor: t.primaryContainer }]}
                  >
                    <View style={[styles.flagGlyph, { backgroundColor: t.surfaceContainerHigh }]}>
                      <Text style={[styles.flagGlyphText, { color: t.onSurfaceVariant }]}>{option.id.toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.languageNative, { color: t.onSurface }]}>{option.nativeLabel}</Text>
                      {option.nativeLabel !== option.label ? (
                        <Text style={[styles.languageSub, { color: t.onSurfaceVariant }]}>{option.label}</Text>
                      ) : null}
                    </View>
                    {active ? <Check size={16} color={t.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* Primary action + session state — pinned to the bottom */}
          <View style={[styles.footer, { backgroundColor: t.surface }]}>
            {getAppUrl ? (
              <Pressable
                style={({ pressed }) => [styles.tonalButton, pressed && { opacity: 0.85 }]}
                onPress={() => {
                  const url = getAppUrl;
                  onClose();
                  void openWhatsApp(url, 'Hello Earth Talk!');
                }}
              >
                <Smartphone size={16} color={t.onSurface} />
                <Text style={[styles.tonalLabel, { color: t.onSurface }]}>Get app</Text>
              </Pressable>
            ) : null}

            {whatsappEnabled ? (
              <Pressable
                style={({ pressed }) => [styles.tonalButton, pressed && { opacity: 0.85 }]}
                onPress={() => {
                  const target = whatsappNumber ?? distribution?.whatsapp?.number ?? '';
                  onClose();
                  void openWhatsApp(target, 'Hello Earth Talk!');
                }}
              >
                <MessageSquarePlus size={16} color={t.onSurface} />
                <Text style={[styles.tonalLabel, { color: t.onSurface }]} numberOfLines={1}>{whatsAppLabel}</Text>
              </Pressable>
            ) : null}

            <Pressable style={({ pressed }) => [styles.filledButton, { backgroundColor: t.primary }, pressed && { opacity: 0.9 }]} onPress={onSubmitObservation}>
              <Upload size={16} color={t.onPrimary} />
              <Text style={[styles.filledLabel, { color: t.onPrimary }]} numberOfLines={1}>Submit Field Observation</Text>
            </Pressable>

            {user ? (
              <View>
                <Pressable
                  accessibilityLabel={`${contributorName} — account and log out`}
                  onPress={() => setAccountMenuOpen((prev) => !prev)}
                  style={({ pressed }) => [styles.identityRow, pressed && { backgroundColor: t.surfaceContainerHigh }]}
                >
                  {userAvatarSrc(user.public_user_id, (user as { avatar_version?: number }).avatar_version) ? (
                    <Image
                      source={{
                        uri: userAvatarSrc(user.public_user_id, (user as { avatar_version?: number }).avatar_version) as string,
                      }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={[styles.avatar, { backgroundColor: '#ceead6', alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={styles.avatarInitials}>{contributorInitials}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.identityName, { color: t.onSurface }]} numberOfLines={1}>{contributorName}</Text>
                    <Text style={[styles.identityRole, { color: t.onSurfaceVariant }]} numberOfLines={1}>Contributor</Text>
                  </View>
                </Pressable>
                {accountMenuOpen ? (
                  <View style={[styles.accountMenu, { backgroundColor: t.surfaceContainer, borderColor: t.outlineVariant }]}>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
                      <Text style={[styles.identityName, { color: t.onSurface }]} numberOfLines={1}>{contributorName}</Text>
                      <Text style={[styles.identityRole, { color: t.onSurfaceVariant }]} numberOfLines={1}>Contributor</Text>
                    </View>
                    <Pressable
                      style={({ pressed }) => [styles.accountMenuItem, pressed && { backgroundColor: t.surfaceContainerHigh }]}
                      onPress={() => {
                        setAccountMenuOpen(false);
                        onSignOut();
                      }}
                    >
                      <LogOut size={16} color={t.onSurface} />
                      <Text style={[styles.accountMenuLabel, { color: t.onSurface }]}>Log out</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : (
              <Pressable style={({ pressed }) => [styles.outlinedButton, { borderColor: t.outline }, pressed && { opacity: 0.85 }]} onPress={onSignIn}>
                <LogIn size={16} color={t.primary} />
                <Text style={[styles.outlinedLabel, { color: t.primary }]}>Sign in</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: colors.scrim,
    flexDirection: 'row',
  },
  panel: {
    width: '84%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderTopRightRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  header: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    marginLeft: 4,
  },
  wordmark: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#041e49',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 44,
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: radius.full,
    paddingHorizontal: 16,
  },
  menuItemActive: {
    backgroundColor: colors.primaryContainer,
  },
  menuLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.onSurface,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 40,
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
  },
  themeRowLabel: {
    flex: 1,
    fontSize: 13,
  },
  languageCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 168,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surface,
    padding: 6,
    ...elevation[3],
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  flagGlyph: {
    width: 24,
    height: 18,
    borderRadius: 3,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagGlyphText: {
    fontSize: 8,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  languageNative: {
    fontSize: 13,
    color: '#1f1f1f',
  },
  languageSub: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#5e5e5e',
  },
  footer: {
    gap: spacing.sm,
    paddingHorizontal: 12,
    paddingTop: 12,
    backgroundColor: '#ffffff',
  },
  tonalButton: {
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  tonalLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.onSurface,
  },
  filledButton: {
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  filledLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.onPrimary,
  },
  outlinedButton: {
    height: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.outline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  outlinedLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.sm,
    padding: 4,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
  },
  avatarInitials: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1f4f33',
  },
  identityName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  identityRole: {
    fontSize: 10,
    color: '#5e5e5e',
  },
  accountMenu: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: '#ffffff',
    padding: 4,
    marginTop: spacing.xs,
    ...elevation[2],
  },
  accountMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  accountMenuLabel: {
    fontSize: 13,
    color: colors.onSurface,
  },
});

export type { CommunityPanelId as DrawerCommunityPanel };
