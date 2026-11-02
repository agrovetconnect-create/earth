import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { radius, spacing, type Palette } from '../theme/theme';
import { useAppTheme } from '../theme/theme-provider';
import { useAppLanguage, type AppLanguage } from '../utils/language';
import { useResponsiveLayout } from '../utils/responsive';
import { buildWhatsAppStartUrl, hasConfiguredWhatsAppRecipient } from '../utils/whatsapp';
import { GuideModal } from './GuideModal';
import { PhotoSubmissionModal } from './PhotoSubmissionModal';

type GuidePage = 'how-it-works' | 'about' | 'terms' | 'privacy';

interface NavDrawerContextValue {
  isOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  openPhotoSubmission: () => void;
  openGuidePage: (page: GuidePage) => void;
}

const NavDrawerContext = createContext<NavDrawerContextValue>({
  isOpen: false,
  openDrawer: () => undefined,
  closeDrawer: () => undefined,
  openPhotoSubmission: () => undefined,
  openGuidePage: () => undefined,
});

export function useNavDrawer(): NavDrawerContextValue {
  return useContext(NavDrawerContext);
}

export function DrawerMenuButton({ compact = false }: { compact?: boolean }) {
  const { colors } = useAppTheme();
  const { openDrawer } = useNavDrawer();
  const { t } = useAppLanguage();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('Open navigation menu')}
      hitSlop={4}
      onPress={openDrawer}
      style={[
        {
          width: compact ? 42 : 44,
          height: compact ? 42 : 44,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
        },
        !compact && {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.outlineSoft,
        },
      ]}
    >
      <Ionicons name="menu" size={22} color={colors.onSurface} />
    </Pressable>
  );
}

function getInitials(value: string): string {
  return (
    value
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'ET'
  );
}

export function NavDrawerProvider({ children }: PropsWithChildren) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const auth = useAuth();
  const pathname = usePathname();

  const [isOpen, setIsOpen] = useState(false);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [guidePage, setGuidePage] = useState<GuidePage | null>(null);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const { language, setLanguage, t } = useAppLanguage();

  const openDrawer = useCallback(() => {
    setAccountMenuOpen(false);
    setLanguageOpen(false);
    setIsOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    setAccountMenuOpen(false);
    setLanguageOpen(false);
  }, []);

  const openPhotoSubmission = useCallback(() => {
    setIsOpen(false);
    setPhotoModalOpen(true);
  }, []);

  const openGuidePage = useCallback((page: GuidePage) => {
    setIsOpen(false);
    setGuidePage(page);
  }, []);

  const navigateTo = (href: Parameters<typeof router.push>[0]) => {
    closeDrawer();
    router.push(href);
  };

  const chooseLanguage = (next: AppLanguage) => {
    setLanguage(next);
    setLanguageOpen(false);
  };

  const handleOpenWhatsApp = async () => {
    if (!hasConfiguredWhatsAppRecipient()) return;
    const url = buildWhatsAppStartUrl();
    closeDrawer();
    await Linking.openURL(url).catch(() => undefined);
  };

  const signedIn = Boolean(auth.user);
  const whatsAppConfigured = hasConfiguredWhatsAppRecipient();

  const contextValue = useMemo<NavDrawerContextValue>(
    () => ({
      isOpen,
      openDrawer,
      closeDrawer,
      openPhotoSubmission,
      openGuidePage,
    }),
    [isOpen, openDrawer, closeDrawer, openPhotoSubmission, openGuidePage]
  );

  return (
    <NavDrawerContext.Provider value={contextValue}>
      {children}

      <Modal
        visible={isOpen}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={closeDrawer}
      >
        <View style={styles.backdropRow}>
          <View
            style={[
              styles.drawer,
              {
                width: layout.drawerWidth,
                paddingLeft: layout.sideSafeLeft,
              },
            ]}
          >
            <View
              style={[
                styles.drawerHeader,
                { paddingTop: layout.modalHeaderTopPadding },
              ]}
            >
              <View style={styles.brandRow}>
                <Image
                  accessibilityIgnoresInvertColors
                  accessible={false}
                  resizeMode="contain"
                  source={require('../assets/images/icon.png')}
                  style={styles.brandIcon}
                />
                <View style={styles.brandTextWrap}>
                  <Text style={styles.brandTitle} numberOfLines={1}>
                    Earth Talk
                  </Text>
                  <Text style={styles.brandSubtitle} numberOfLines={1}>
                    {t('Field GeoAI')}
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Close navigation menu')}
                onPress={closeDrawer}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={22} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.group}>
                <Text style={styles.groupTitle}>{t('Explore')}</Text>
                <DrawerItem
                  icon="compass-outline"
                  label={t('Explore map')}
                  active={pathname === '/map'}
                  onPress={() => navigateTo({ pathname: '/(tabs)/map', params: { mode: 'explore' } })}
                  colors={colors}
                />
                <DrawerItem
                  icon="location-outline"
                  label={t('Geoscience sites')}
                  active={pathname === '/sites'}
                  onPress={() => navigateTo('/(tabs)/sites')}
                  colors={colors}
                />
                <DrawerItem
                  icon="albums-outline"
                  label={t('Explore feed')}
                  active={pathname === '/explore'}
                  onPress={() => navigateTo('/(tabs)/explore')}
                  colors={colors}
                />
                <DrawerItem
                  icon="home-outline"
                  label={t('Home overview')}
                  active={pathname === '/' || pathname === '/index'}
                  onPress={() => navigateTo('/(tabs)')}
                  colors={colors}
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.group}>
                <Text style={styles.groupTitle}>{t('GeoAI Field Assistant')}</Text>
                <DrawerItem
                  icon="chatbubbles-outline"
                  label={t('GeoAI Chat')}
                  active={pathname === '/chat'}
                  onPress={() => navigateTo('/(tabs)/chat')}
                  colors={colors}
                />
                <DrawerItem
                  icon="camera-outline"
                  label={t('Submit field photo')}
                  active={false}
                  onPress={openPhotoSubmission}
                  colors={colors}
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.group}>
                <Text style={styles.groupTitle}>{t('Community')}</Text>
                <DrawerItem
                  icon="search-outline"
                  label={t('Investigations')}
                  active={pathname === '/community'}
                  onPress={() =>
                    navigateTo({ pathname: '/(tabs)/community', params: { panel: 'investigations' } })
                  }
                  colors={colors}
                />
                <DrawerItem
                  icon="help-buoy-outline"
                  label={t('Community Q&A')}
                  active={false}
                  onPress={() =>
                    navigateTo({ pathname: '/(tabs)/community', params: { panel: 'questions' } })
                  }
                  colors={colors}
                />
                {signedIn && (
                  <DrawerItem
                    icon="chatbox-ellipses-outline"
                    label={t('My questions')}
                    active={false}
                    onPress={() =>
                      navigateTo({ pathname: '/(tabs)/community', params: { panel: 'my_questions' } })
                    }
                    colors={colors}
                  />
                )}
                <DrawerItem
                  icon="ribbon-outline"
                  label={t('My contributions')}
                  active={false}
                  onPress={() =>
                    navigateTo({ pathname: '/(tabs)/community', params: { panel: 'reputation' } })
                  }
                  colors={colors}
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.group}>
                <Text style={styles.groupTitle}>{t('Your Earth Talk')}</Text>
                <DrawerItem
                  icon="person-outline"
                  label={t('My Earth Talk')}
                  active={pathname === '/profile'}
                  onPress={() =>
                    navigateTo({ pathname: '/(tabs)/profile', params: { section: 'posts' } })
                  }
                  colors={colors}
                />
                {signedIn && (
                  <DrawerItem
                    icon="map-outline"
                    label={t('My Map')}
                    active={false}
                    onPress={() =>
                      navigateTo({ pathname: '/(tabs)/map', params: { mode: 'my_map' } })
                    }
                    colors={colors}
                  />
                )}
                <DrawerItem
                  icon="time-outline"
                  label={t('History')}
                  active={false}
                  onPress={() =>
                    navigateTo({ pathname: '/(tabs)/profile', params: { section: 'history' } })
                  }
                  colors={colors}
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.group}>
                <Text style={styles.groupTitle}>{t('Learn & settings')}</Text>
                <DrawerItem
                  icon="settings-outline"
                  label={t('Settings')}
                  active={pathname === '/settings'}
                  onPress={() => navigateTo('/settings')}
                  colors={colors}
                />
                <DrawerItem
                  icon="information-circle-outline"
                  label={t('About & Guide')}
                  active={false}
                  onPress={() => openGuidePage('how-it-works')}
                  colors={colors}
                />
                <DrawerItem
                  icon="shield-checkmark-outline"
                  label={t('Legal & Transparency')}
                  active={false}
                  onPress={() => openGuidePage('privacy')}
                  colors={colors}
                />
                <DrawerItem
                  icon="language-outline"
                  label={`${t('Language')} (${language.toUpperCase()})`}
                  active={languageOpen}
                  onPress={() => setLanguageOpen((prev) => !prev)}
                  colors={colors}
                />

                {languageOpen && (
                  <View style={styles.languageBox}>
                    {(
                      [
                        ['en', 'English'],
                        ['fr', 'Français'],
                      ] as const
                    ).map(([code, label]) => {
                      const active = language === code;
                      return (
                        <Pressable
                          key={code}
                          onPress={() => chooseLanguage(code)}
                          style={[styles.langOption, active && styles.langOptionActive]}
                        >
                          <Text style={[styles.langOptionText, active && styles.langOptionTextActive]}>
                            {label}
                          </Text>
                          {active && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            </ScrollView>

            <View
              style={[
                styles.drawerFooter,
                { paddingBottom: layout.bottomSafePadding },
              ]}
            >
              {whatsAppConfigured && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    void handleOpenWhatsApp();
                  }}
                  style={styles.whatsAppBtn}
                >
                  <Ionicons name="logo-whatsapp" size={18} color={colors.onPrimary} />
                  <Text style={styles.whatsAppBtnText} numberOfLines={1}>
                    {signedIn ? t('My Earth Talk on WhatsApp') : t('Start on WhatsApp')}
                  </Text>
                </Pressable>
              )}

              {auth.user ? (
                <View>
                  {accountMenuOpen && (
                    <View style={styles.accountPopover}>
                      <Pressable
                        onPress={() => navigateTo('/(tabs)/profile')}
                        style={styles.popoverAction}
                      >
                        <Ionicons name="person-circle-outline" size={18} color={colors.onSurface} />
                        <Text style={styles.popoverActionText}>{t('Account')}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setAccountMenuOpen(false);
                          closeDrawer();
                          void auth.signOut();
                        }}
                        style={styles.popoverAction}
                      >
                        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                        <Text style={[styles.popoverActionText, { color: colors.danger }]}>
                          {t('Log out')}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setAccountMenuOpen((prev) => !prev)}
                    style={styles.identityBtn}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {getInitials(auth.user.display_name || auth.user.public_user_id)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={styles.identityName}>
                        {auth.user.display_name || t('Contributor')}
                      </Text>
                      <Text numberOfLines={1} style={styles.identityRole}>
                        {auth.user.public_user_id}
                      </Text>
                    </View>
                    <Ionicons
                      name={accountMenuOpen ? 'chevron-down' : 'chevron-up'}
                      size={18}
                      color={colors.onSurfaceVariant}
                    />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => navigateTo('/(tabs)/profile')}
                  style={styles.signInBtn}
                >
                  <Ionicons name="log-in-outline" size={18} color={colors.primary} />
                  <Text style={styles.signInBtnText}>{t('Sign in')}</Text>
                </Pressable>
              )}
            </View>
          </View>

          <Pressable
            accessibilityLabel={t('Close menu backdrop')}
            style={styles.backdropDismiss}
            onPress={closeDrawer}
          />
        </View>
      </Modal>

      <PhotoSubmissionModal
        visible={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
      />

      <GuideModal
        visible={Boolean(guidePage)}
        page={guidePage}
        onClose={() => setGuidePage(null)}
      />
    </NavDrawerContext.Provider>
  );
}

function DrawerItem({
  icon,
  label,
  active,
  onPress,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
  colors: Palette;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: radius.m,
        backgroundColor: active ? colors.primaryContainer : 'transparent',
      }}
    >
      <Ionicons
        name={icon}
        size={20}
        color={active ? colors.onPrimaryContainer : colors.onSurfaceVariant}
      />
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontSize: 14,
          fontWeight: active ? '700' : '600',
          color: active ? colors.onPrimaryContainer : colors.onSurface,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    backdropRow: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    drawer: {
      height: '100%',
      backgroundColor: colors.surface,
      borderRightWidth: 1,
      borderRightColor: colors.outlineSoft,
      justifyContent: 'space-between',
    },
    backdropDismiss: {
      flex: 1,
    },
    drawerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineSoft,
    },
    brandRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    brandTextWrap: {
      flex: 1,
    },
    brandIcon: {
      width: 32,
      height: 38,
    },
    brandTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.onSurface,
      letterSpacing: -0.2,
    },
    brandSubtitle: {
      fontSize: 11,
      color: colors.onSurfaceFaint,
    },
    closeBtn: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollContent: {
      padding: spacing.sm,
      paddingBottom: spacing.md,
      gap: 2,
    },
    group: {
      gap: 2,
      paddingVertical: 2,
    },
    groupTitle: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.onSurfaceFaint,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    divider: {
      height: 1,
      backgroundColor: colors.outlineSoft,
      marginVertical: 4,
      marginHorizontal: 8,
    },
    languageBox: {
      marginHorizontal: 12,
      marginTop: 4,
      borderRadius: radius.m,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      backgroundColor: colors.surfaceContainerLow,
      overflow: 'hidden',
    },
    langOption: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    langOptionActive: {
      backgroundColor: colors.primaryContainer,
    },
    langOptionText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.onSurface,
    },
    langOptionTextActive: {
      color: colors.onPrimaryContainer,
      fontWeight: '700',
    },
    drawerFooter: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.outlineSoft,
      backgroundColor: colors.surfaceContainer,
      gap: 8,
    },
    whatsAppBtn: {
      minHeight: 44,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 14,
    },
    whatsAppBtnText: {
      color: colors.onPrimary,
      fontSize: 13,
      fontWeight: '700',
      flexShrink: 1,
    },
    signInBtn: {
      minHeight: 44,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.outline,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    signInBtnText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '700',
    },
    identityBtn: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: radius.m,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
    },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.onPrimaryContainer,
    },
    identityName: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.onSurface,
    },
    identityRole: {
      fontSize: 11,
      color: colors.onSurfaceFaint,
    },
    accountPopover: {
      marginBottom: 8,
      borderRadius: radius.m,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    popoverAction: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineSoft,
    },
    popoverActionText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.onSurface,
    },
  });
}
