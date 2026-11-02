<<<<<<< HEAD
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { DrawerMenuButton } from '../../components/MobileNavDrawer';
import { PhotoSubmissionModal } from '../../components/PhotoSubmissionModal';
import { Eyebrow, Screen, ScreenTitle } from '../../components/Screen';
import { SiteExplorerModal } from '../../components/SiteExplorerModal';
import {
  fetchMyDiscussionQuestions,
  fetchMyObservations,
  fetchMyReputation,
} from '../../services/api';
import { getContributorToken } from '../../services/contributorToken';
import {
  clearMobileHistory,
  getMobileHistory,
  removeMobileHistoryItem,
  type MobileHistoryItem,
} from '../../services/history';
import { radius, spacing, type Palette } from '../../theme/theme';
import { useAppTheme } from '../../theme/theme-provider';
import { useAppLanguage, type AppLanguage } from '../../utils/language';
import { observationDetailRoute } from '../../utils/observationNavigation';
import { useResponsiveLayout } from '../../utils/responsive';
import { userFacingError } from '../../utils/userFacingError';

type ProfileSection = 'posts' | 'discussions' | 'history';

interface HistoryGroup {
  day: string;
  items: MobileHistoryItem[];
}

function groupHistoryByDay(items: MobileHistoryItem[], language: AppLanguage): HistoryGroup[] {
  const groups: Record<string, MobileHistoryItem[]> = {};
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  items.forEach((item) => {
    const date = new Date(item.visitedAt);
    let day = date.toDateString();
    if (day === today) day = 'Today';
    else if (day === yesterday) day = 'Yesterday';
    else {
      day = date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
    }
    if (!groups[day]) groups[day] = [];
    groups[day].push(item);
  });

  return Object.entries(groups).map(([day, groupItems]) => ({ day, items: groupItems }));
}

export default function ProfileScreen() {
  const { colors } = useAppTheme();
  const { language, t } = useAppLanguage();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const auth = useAuth();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ section?: string }>();

  const [activeSection, setActiveSection] = useState<ProfileSection>('posts');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [challengeRequired, setChallengeRequired] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // WhatsApp Account Linking state
  const [waPhone, setWaPhone] = useState('');
  const [waCode, setWaCode] = useState('');
  const [waStep, setWaStep] = useState<'input' | 'verify'>('input');
  const [waMessage, setWaMessage] = useState('');

  // History & Modals
  const [historyItems, setHistoryItems] = useState<MobileHistoryItem[]>([]);
  const [historyQuery, setHistoryQuery] = useState('');
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [explorerSiteId, setExplorerSiteId] = useState<string | null>(null);

  useEffect(() => {
    if (params.section === 'posts' || params.section === 'discussions' || params.section === 'history') {
      setActiveSection(params.section);
    }
  }, [params.section]);

  const ownObservations = useQuery({
    queryKey: ['account', 'observations', auth.user?.public_user_id ?? 'device'],
    queryFn: async ({ signal }) => {
      const contributorToken = await getContributorToken().catch(() => null);
      return fetchMyObservations(auth.token, signal, contributorToken);
    },
    enabled: Boolean(auth.ready),
  });

  const ownDiscussions = useQuery({
    queryKey: ['account', 'discussions', auth.user?.public_user_id],
    queryFn: ({ signal }) => fetchMyDiscussionQuestions(auth.token!, signal),
    enabled: Boolean(auth.user && auth.token) && activeSection === 'discussions',
  });

  const reputationQuery = useQuery({
    queryKey: ['account', 'reputation', auth.user?.public_user_id ?? 'device'],
    queryFn: async ({ signal }) => {
      const contributorToken = await getContributorToken();
      return fetchMyReputation(contributorToken, signal);
    },
    enabled: Boolean(auth.ready),
  });

  const reloadHistory = useCallback(async () => {
    const items = await getMobileHistory();
    setHistoryItems(items);
  }, []);

  useEffect(() => {
    void reloadHistory();
  }, [reloadHistory, activeSection]);

  useEffect(() => {
    setDisplayName(auth.user?.display_name ?? '');
  }, [auth.user?.display_name]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setFeedback('');
    try {
      await action();
    } catch (error) {
      setFeedback(userFacingError(error));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleLogin = () =>
    run(async () => {
      const res = await auth.loginWithGoogle('contributor.earthtalk@gmail.com', 'Google Contributor', null);
      if (res.verification_required && res.challenge_id) {
        setChallengeId(res.challenge_id);
        setMaskedEmail(res.masked_email || t('your Google email'));
        setChallengeRequired(true);
        setResendCooldown(30);
        setFeedback(t('Verification code sent to your Google account email.'));
      } else {
        setFeedback(t('Signed in with Google.'));
      }
    });

  const handleVerifyChallenge = () => {
    if (!code.trim() || !/^\d{6}$/.test(code.trim())) {
      setFeedback(t('Enter the 6-digit verification code received in your email.'));
      return;
    }
    run(async () => {
      await auth.verifyGoogleChallenge(challengeId, code.trim());
      setCode('');
      setChallengeId('');
      setChallengeRequired(false);
      setFeedback(t('Signed in and verified.'));
    });
  };

  const handleResendChallenge = () => {
    if (resendCooldown > 0 || busy) return;
    run(async () => {
      const res = await auth.resendGoogleChallenge(challengeId);
      setChallengeId(res.challenge_id);
      setCode('');
      setResendCooldown(30);
      setFeedback(t('New verification code sent to your email.'));
    });
  };

  const handleRestoreGoogleAvatar = () =>
    run(async () => {
      await auth.restoreGoogleAvatar();
      setFeedback(t('Restored Google profile photo.'));
    });

  const confirmSignOut = () =>
    run(async () => {
      await auth.signOut();
      setConfirmingSignOut(false);
      queryClient.removeQueries({ queryKey: ['account'] });
    });

  const handleRequestWhatsAppLink = () =>
    run(async () => {
      if (!waPhone.trim()) return;
      await auth.linkWhatsApp(waPhone.trim());
      setWaStep('verify');
      setWaMessage(t('A 6-digit verification code was sent to your WhatsApp.'));
    });

  const handleVerifyWhatsAppLink = () =>
    run(async () => {
      if (!waPhone.trim() || waCode.trim().length !== 6) return;
      await auth.verifyWhatsAppLink(waPhone.trim(), waCode.trim());
      setWaCode('');
      setWaStep('input');
      setWaMessage(t('WhatsApp account linked! Your field submissions are now unified.'));
      void ownObservations.refetch();
    });

  const posts = ownObservations.data?.data ?? [];
  const publicCount = posts.filter((post) => post.is_public).length;
  const privateCount = posts.length - publicCount;
  const openQuestionsCount = posts.reduce(
    (sum, post) => sum + (post.open_question_count ?? 0),
    0
  );

  const filteredHistory = useMemo(() => {
    const needle = historyQuery.trim().toLowerCase();
    if (!needle) return historyItems;
    return historyItems.filter((item) =>
      [item.title, item.subtitle, item.kind, item.refId]
        .some((v) => v.toLowerCase().includes(needle))
    );
  }, [historyItems, historyQuery]);

  const historyGroups = useMemo(
    () => groupHistoryByDay(filteredHistory, language),
    [filteredHistory, language]
  );

  return (
    <Screen keyboardAvoiding>
      <View style={styles.topBar}>
        <DrawerMenuButton />
        <View style={{ flex: 1 }}>
          <Eyebrow>{t('Account')}</Eyebrow>
          <ScreenTitle subtitle={t('Identity, posts, WhatsApp link, and history.')}>
            {t('My Earth Talk')}
          </ScreenTitle>
        </View>
        <Link href="/settings" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Open settings')}
            style={styles.headerActionBtn}
          >
            <Ionicons name="settings-outline" size={20} color={colors.onSurface} />
          </Pressable>
        </Link>
      </View>

      {/* Quick Action Strip */}
      <View style={styles.quickActionRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSubmitModalOpen(true)}
          style={[styles.quickActionBtn, styles.quickActionBtnPrimary]}
        >
          <Ionicons name="camera-outline" size={16} color={colors.onPrimary} />
          <Text style={styles.quickActionTextPrimary}>{t('Submit Photo')}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/(tabs)/map', params: { mode: 'my_map' } })}
          style={styles.quickActionBtn}
        >
          <Ionicons name="map-outline" size={16} color={colors.primary} />
          <Text style={styles.quickActionText}>{t('My Map')}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/(tabs)/sites')}
          style={styles.quickActionBtn}
        >
          <Ionicons name="location-outline" size={16} color={colors.primary} />
          <Text style={styles.quickActionText}>{t('Sites')}</Text>
        </Pressable>
      </View>

      {/* Identity / Sign-in Card */}
      {auth.user ? (
        <View style={styles.card}>
          <View style={styles.userHeader}>
            <View style={styles.avatar}>
              {auth.user.avatar_url ? (
                <Image
                  source={{ uri: auth.user.avatar_url }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <Text style={styles.avatarText}>
                  {auth.user.display_name?.charAt(0).toUpperCase() || 'E'}
                </Text>
              )}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.userName}>
                {auth.user.display_name || t('Anonymous contributor')}
              </Text>
              <Text style={styles.userMeta}>{t(`ID: ${auth.user.public_user_id}`)}</Text>
              {auth.user.email ? (
                <View style={styles.verifiedEmailBadge}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                  <Text style={styles.verifiedEmailText}>{auth.user.email}</Text>
                </View>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Sign out')}
              onPress={() => setConfirmingSignOut((prev) => !prev)}
              style={styles.signOutBtn}
            >
              <Ionicons name="log-out-outline" size={20} color={colors.danger} />
            </Pressable>
          </View>

          {(auth.user.avatar_source === 'custom' || auth.user.google_avatar_url) && (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={handleRestoreGoogleAvatar}
              style={[styles.restorePhotoBtn, busy && styles.disabled]}
            >
              <Ionicons name="refresh-outline" size={14} color={colors.primary} />
              <Text style={styles.restorePhotoText}>{t('Restore Google profile photo')}</Text>
            </Pressable>
          )}

          {confirmingSignOut && (
            <View style={styles.confirmSignOutBox}>
              <Text style={styles.confirmSignOutText}>
                {t('Sign out from this device? Your local session will be cleared.')}
              </Text>
              <View style={styles.confirmSignOutActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setConfirmingSignOut(false)}
                  style={styles.cancelBtn}
                >
                  <Text style={styles.cancelBtnText}>{t('Cancel')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={confirmSignOut}
                  style={styles.dangerBtn}
                >
                  <Text style={styles.dangerBtnText}>{t('Sign out')}</Text>
                </Pressable>
              </View>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('Display Name')}</Text>
            <View style={[styles.inputRow, layout.isCompactPhone && styles.inputRowStack]}>
              <TextInput
                placeholder={t('Display name')}
                placeholderTextColor={colors.onSurfaceFaint}
                value={displayName}
                onChangeText={setDisplayName}
                style={[styles.input, { flex: 1 }]}
              />
              <Pressable
                disabled={busy || displayName.trim() === (auth.user.display_name ?? '')}
                onPress={() =>
                  run(async () => {
                    await auth.updateDisplayName(displayName.trim() || null);
                    setFeedback(t('Display name updated.'));
                  })
                }
                style={[
                  styles.smallBtn,
                  (busy || displayName.trim() === (auth.user.display_name ?? '')) && styles.disabled,
                ]}
              >
                <Text style={styles.smallBtnText}>{t('Save')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <View style={{ gap: 4 }}>
            <Text style={styles.welcomeTitle}>
              {challengeRequired ? t('Verify email') : t('Sign in to Earth Talk')}
            </Text>
            <Text style={styles.welcomeSubtitle}>
              {challengeRequired
                ? t('Enter the 6-digit code sent to your email.')
                : t('Submit observations and sync your field records.')}
            </Text>
          </View>

          {feedback ? (
            <View style={{ padding: 10, borderRadius: 8, backgroundColor: colors.surfaceVariant }}>
              <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '500' }}>{t(feedback)}</Text>
            </View>
          ) : null}

          {!challengeRequired ? (
            /* Option 1: Continue with Google */
            <View style={{ gap: 16 }}>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={handleGoogleLogin}
                style={[styles.googleBtn, busy && styles.disabled]}
              >
                <Ionicons name="logo-google" size={18} color="#4285F4" />
                <Text style={styles.googleBtnText}>
                  {busy ? t('Connecting to Google...') : t('Continue with Google')}
                </Text>
              </Pressable>
            </View>
          ) : (
            /* Verification Screen */
            <View style={{ gap: 12 }}>
              <View style={{ padding: 12, borderRadius: 8, backgroundColor: colors.surfaceVariant, gap: 2 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary, textTransform: 'uppercase' }}>
                  {t('Email Verification')}
                </Text>
                <Text style={{ fontSize: 13, color: colors.onSurface }}>
                  {t('Code sent to')}{' '}
                  <Text style={{ fontWeight: '700', color: colors.primary }}>{maskedEmail}</Text>
                </Text>
              </View>

              <View style={{ gap: 4 }}>
                <Text style={styles.fieldLabel}>{t('6-digit verification code')}</Text>
                <TextInput
                  placeholder="123456"
                  placeholderTextColor={colors.onSurfaceFaint}
                  value={code}
                  onChangeText={(txt) => setCode(txt.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!busy}
                  style={[styles.input, { textAlign: 'center', fontSize: 20, letterSpacing: 6 }]}
                />
              </View>

              <Pressable
                disabled={busy || code.trim().length !== 6}
                onPress={handleVerifyChallenge}
                style={[styles.primaryBtn, (busy || code.trim().length !== 6) && styles.disabled]}
              >
                <Text style={styles.primaryBtnText}>
                  {busy ? t('Verifying...') : t('Verify and sign in')}
                </Text>
              </Pressable>

              <View style={styles.resendRow}>
                <Pressable
                  disabled={resendCooldown > 0 || busy}
                  onPress={handleResendChallenge}
                >
                  <Text style={[styles.linkText, resendCooldown > 0 && styles.disabled]}>
                    {resendCooldown > 0
                      ? t(`Resend code in ${resendCooldown}s`)
                      : t('Resend verification code')}
                  </Text>
                </Pressable>
                <Pressable
                  disabled={busy}
                  onPress={() => {
                    setChallengeRequired(false);
                    setChallengeId('');
                    setCode('');
                    setFeedback('');
                  }}
                >
                  <Text style={styles.linkText}>{t('Use different Google account')}</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}

      {/* WhatsApp Account Linking Card */}
      {auth.user && (
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="logo-whatsapp" size={18} color={colors.success} />
            <Text style={styles.sectionTitle}>{t('WhatsApp Link')}</Text>
          </View>

          {auth.user.is_whatsapp_linked ? (
            <View style={styles.linkedBanner}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={styles.linkedTitle}>{t('WhatsApp linked')}</Text>
                <Text style={styles.linkedSub}>{t('Field observations sync automatically.')}</Text>
              </View>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <Text style={styles.body}>
                {t('Link your WhatsApp number to sync field posts across devices.')}
              </Text>

              {waMessage ? <Text style={styles.waNotice}>{t(waMessage)}</Text> : null}

              {waStep === 'input' ? (
                <View style={[styles.inputRow, layout.isCompactPhone && styles.inputRowStack]}>
                  <TextInput
                    placeholder="+250 78..."
                    placeholderTextColor={colors.onSurfaceFaint}
                    value={waPhone}
                    onChangeText={setWaPhone}
                    keyboardType="phone-pad"
                    style={[styles.input, { flex: 1 }]}
                  />
                  <Pressable
                    disabled={busy || !waPhone.trim()}
                    onPress={handleRequestWhatsAppLink}
                    style={[styles.smallBtn, (busy || !waPhone.trim()) && styles.disabled]}
                  >
                    <Text style={styles.smallBtnText}>{t('Send Code')}</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <View style={[styles.inputRow, layout.isCompactPhone && styles.inputRowStack]}>
                    <TextInput
                      placeholder={t('6-digit code')}
                      placeholderTextColor={colors.onSurfaceFaint}
                      value={waCode}
                      onChangeText={(txt) => setWaCode(txt.replace(/\D/g, '').slice(0, 6))}
                      keyboardType="number-pad"
                      maxLength={6}
                      style={[styles.input, { flex: 1 }]}
                    />
                    <Pressable
                      disabled={busy || waCode.length !== 6}
                      onPress={handleVerifyWhatsAppLink}
                      style={[styles.smallBtn, (busy || waCode.length !== 6) && styles.disabled]}
                    >
                      <Text style={styles.smallBtnText}>{t('Verify')}</Text>
                    </Pressable>
                  </View>
                  <Pressable onPress={() => setWaStep('input')}>
                    <Text style={styles.linkText}>{t('Change number')}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {feedback ? <Text style={styles.feedback}>{t(feedback)}</Text> : null}

      {/* 4 Summary Stat Cards */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, layout.isTablet && styles.statCardTablet]}>
          <View style={styles.statHeader}>
            <Text style={styles.statLabel}>{t('Posts')}</Text>
            <Ionicons name="telescope-outline" size={15} color={colors.onSurfaceFaint} />
          </View>
          <Text style={styles.statValue}>{posts.length}</Text>
        </View>

        <View style={[styles.statCard, layout.isTablet && styles.statCardTablet]}>
          <View style={styles.statHeader}>
            <Text style={styles.statLabel}>{t('Public')}</Text>
            <Ionicons name="eye-outline" size={15} color={colors.success} />
          </View>
          <Text style={styles.statValue}>{publicCount}</Text>
        </View>

        <View style={[styles.statCard, layout.isTablet && styles.statCardTablet]}>
          <View style={styles.statHeader}>
            <Text style={styles.statLabel}>{t('Private')}</Text>
            <Ionicons name="lock-closed-outline" size={15} color={colors.warning} />
          </View>
          <Text style={styles.statValue}>{privateCount}</Text>
        </View>

        <View style={[styles.statCard, layout.isTablet && styles.statCardTablet]}>
          <View style={styles.statHeader}>
            <Text style={styles.statLabel}>{t('AI Qs')}</Text>
            <Ionicons name="sparkles-outline" size={15} color={colors.primary} />
          </View>
          <Text style={styles.statValue}>{openQuestionsCount}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TabItem
          active={activeSection === 'posts'}
          label={t(`Posts (${posts.length})`)}
          onPress={() => setActiveSection('posts')}
          colors={colors}
          styles={styles}
        />
        <TabItem
          active={activeSection === 'discussions'}
          label={t('Discussions')}
          onPress={() => setActiveSection('discussions')}
          colors={colors}
          styles={styles}
        />
        <TabItem
          active={activeSection === 'history'}
          label={t(`History (${historyItems.length})`)}
          onPress={() => setActiveSection('history')}
          colors={colors}
          styles={styles}
        />
      </View>

      {/* Section Content */}
      <View style={styles.sectionContent}>
        {activeSection === 'posts' && (
          <View style={styles.listContainer}>
            {ownObservations.isLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : ownObservations.error ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>{t('Could not load your posts')}</Text>
                <Text style={styles.emptyText}>{userFacingError(ownObservations.error)}</Text>
                <Pressable onPress={() => void ownObservations.refetch()}>
                  <Text style={styles.clearText}>{t('Retry')}</Text>
                </Pressable>
              </View>
            ) : posts.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>{t('No posts yet')}</Text>
                <Text style={styles.emptyText}>{t('Submitted field observations appear here.')}</Text>
              </View>
            ) : (
              posts.map((item) => (
                <Link
                  key={item.passport_id}
                  href={observationDetailRoute(item.passport_id)}
                  asChild
                >
                  <Pressable style={styles.listItem}>
                    <View style={styles.listItemIcon}>
                      <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={styles.postTitleRow}>
                        <Text style={styles.listItemTitle} numberOfLines={1}>
                          {item.title || item.passport_id}
                        </Text>
                        <View
                          style={[
                            styles.visibilityPill,
                            item.is_public ? styles.publicPill : styles.privatePill,
                          ]}
                        >
                          <Text
                            style={[
                              styles.visibilityPillText,
                              { color: item.is_public ? colors.success : colors.warning },
                            ]}
                          >
                            {item.is_public ? t('Public') : t('Private')}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.postMetaRow}>
                        <Text style={styles.listItemMeta}>
                          {t(item.observation_category.replace(/_/g, ' '))}
                        </Text>
                        <Text style={styles.listItemMeta}>· {t(`${item.media_count ?? 0} media`)}</Text>
                        <Text style={styles.listItemMeta}>
                          · {t(`${item.comment_count ?? 0} comments`)}
                        </Text>
                        {(item.open_question_count ?? 0) > 0 && (
                          <Text style={[styles.listItemMeta, { color: colors.warning, fontWeight: '700' }]}>
                            · {t(`${item.open_question_count} AI Q`)}
                          </Text>
                        )}
                        {!item.is_public && (
                          <Text style={styles.listItemMeta}>· {t('Not on map')}</Text>
                        )}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.outline} />
                  </Pressable>
                </Link>
              ))
            )}
          </View>
        )}

        {activeSection === 'discussions' && (
          <View style={styles.listContainer}>
            {!auth.user ? (
              <Text style={styles.emptyText}>{t('Sign in above to view your threads.')}</Text>
            ) : ownDiscussions.isLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : ownDiscussions.error ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>{t('Could not load discussions')}</Text>
                <Text style={styles.emptyText}>{userFacingError(ownDiscussions.error)}</Text>
                <Pressable onPress={() => void ownDiscussions.refetch()}>
                  <Text style={styles.clearText}>{t('Retry')}</Text>
                </Pressable>
              </View>
            ) : (ownDiscussions.data?.data.length ?? 0) === 0 ? (
              <Text style={styles.emptyText}>{t('No active discussions yet.')}</Text>
            ) : (
              ownDiscussions.data?.data.map((item) => (
                <Link
                  key={item.comment_id}
                  href={observationDetailRoute(item.passport_id)}
                  asChild
                >
                  <Pressable style={styles.listItem}>
                    <View
                      style={[
                        styles.listItemIcon,
                        { backgroundColor: colors.primaryContainer },
                      ]}
                    >
                      <Ionicons name="chatbubble-outline" size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listItemTitle} numberOfLines={2}>
                        {item.body}
                      </Text>
                      <Text style={styles.listItemMeta}>
                        {item.post_title} · {t(`${item.reply_count} replies`)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.outline} />
                  </Pressable>
                </Link>
              ))
            )}
          </View>
        )}

        {activeSection === 'history' && (
          <View style={styles.historyContainer}>
            <View style={styles.historyHeader}>
              <Text style={styles.sectionTitle}>{t('Local Session History')}</Text>
              {historyItems.length > 0 && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    void clearMobileHistory().then(reloadHistory);
                  }}
                >
                  <Text style={styles.clearText}>{t('Clear All')}</Text>
                </Pressable>
              )}
            </View>

            {historyItems.length > 0 && (
              <View style={styles.historySearchBox}>
                <Ionicons name="search" size={16} color={colors.onSurfaceFaint} />
                <TextInput
                  placeholder={t('Search your history...')}
                  placeholderTextColor={colors.onSurfaceFaint}
                  value={historyQuery}
                  onChangeText={setHistoryQuery}
                  style={styles.historySearchInput}
                />
                {historyQuery.length > 0 && (
                  <Pressable onPress={() => setHistoryQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={colors.onSurfaceFaint} />
                  </Pressable>
                )}
              </View>
            )}

            {historyGroups.map((group) => (
              <View key={group.day} style={styles.historyGroup}>
                <Text style={styles.dayLabel}>{t(group.day)}</Text>
                <View style={styles.groupItems}>
                  {group.items.map((item) => (
                    <View key={item.id} style={styles.historyRow}>
                      <Pressable
                        onPress={() =>
                          item.kind === 'site'
                            ? setExplorerSiteId(item.refId)
                            : router.push(observationDetailRoute(item.refId))
                        }
                        style={styles.historyMainBtn}
                      >
                        <View style={styles.listItemIcon}>
                          <Ionicons
                            name={item.kind === 'site' ? 'location-outline' : 'document-text-outline'}
                            size={18}
                            color={colors.onSurfaceVariant}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.listItemTitle} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={styles.listItemMeta} numberOfLines={1}>
                            {item.subtitle ? `${t(item.subtitle)} · ` : ''}
                            {new Date(item.visitedAt).toLocaleTimeString(
                              language === 'fr' ? 'fr-FR' : 'en-US',
                              {
                                hour: '2-digit',
                                minute: '2-digit',
                              }
                            )}
                          </Text>
                        </View>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t(`Remove ${item.title} from history`)}
                        onPress={() => {
                          void removeMobileHistoryItem(item.id).then(setHistoryItems);
                        }}
                        style={styles.historyDeleteBtn}
                      >
                        <Ionicons name="close" size={16} color={colors.onSurfaceFaint} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            ))}

            {historyItems.length === 0 ? (
              <Text style={styles.emptyText}>{t('No recent history yet.')}</Text>
            ) : filteredHistory.length === 0 ? (
              <Text style={styles.emptyText}>{t(`No items match "${historyQuery}".`)}</Text>
            ) : null}
          </View>
        )}
      </View>

      {/* Contribution Record Summary */}
      {reputationQuery.data && (
        <View style={styles.card}>
          <View style={styles.historyHeader}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="ribbon-outline" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>{t('Impact')}</Text>
            </View>
            <Pressable
              onPress={() =>
                router.push({ pathname: '/(tabs)/community', params: { panel: 'reputation' } })
              }
            >
              <Text style={styles.clearText}>{t('Details')}</Text>
            </Pressable>
          </View>

          <Text style={styles.userMeta}>{t(`Handle: ${reputationQuery.data.public_handle}`)}</Text>

          <View style={styles.repMetricsRow}>
            <View style={styles.repMetricChip}>
              <Text style={styles.repMetricVal}>{reputationQuery.data.observations_count}</Text>
              <Text style={styles.repMetricLbl}>{t('Posts')}</Text>
            </View>
            <View style={styles.repMetricChip}>
              <Text style={styles.repMetricVal}>{reputationQuery.data.evidence_count}</Text>
              <Text style={styles.repMetricLbl}>{t('Evidence')}</Text>
            </View>
            <View style={styles.repMetricChip}>
              <Text style={styles.repMetricVal}>{reputationQuery.data.answers_count}</Text>
              <Text style={styles.repMetricLbl}>{t('Answers')}</Text>
            </View>
            <View style={styles.repMetricChip}>
              <Text style={styles.repMetricVal}>{reputationQuery.data.visits_count}</Text>
              <Text style={styles.repMetricLbl}>{t('Visits')}</Text>
            </View>
          </View>
        </View>
      )}

      <Link href="/settings" asChild>
        <Pressable style={styles.settingsBtn}>
          <Ionicons name="settings-outline" size={20} color={colors.primary} />
          <Text style={styles.settingsText}>{t('Settings, Theme & Guides')}</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.outline} />
        </Pressable>
      </Link>

      <PhotoSubmissionModal
        visible={submitModalOpen}
        onClose={() => setSubmitModalOpen(false)}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: ['account', 'observations'] });
        }}
      />

      <SiteExplorerModal
        visible={Boolean(explorerSiteId)}
        siteId={explorerSiteId}
        onClose={() => setExplorerSiteId(null)}
      />
    </Screen>
  );
}

function TabItem({
  active,
  label,
  onPress,
  colors,
  styles,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  colors: Palette;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tabItem,
        { borderBottomColor: active ? colors.primary : 'transparent' },
      ]}
    >
      <Text style={[styles.tabText, { color: active ? colors.primary : colors.onSurfaceFaint }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    topBar: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    headerActionBtn: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickActionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    quickActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 42,
      paddingHorizontal: 14,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
    },
    quickActionBtnPrimary: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    quickActionText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.primary,
    },
    quickActionTextPrimary: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.onPrimary,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.l,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      gap: 16,
    },
    cardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    userHeader: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarImage: { width: 56, height: 56, borderRadius: 28 },
    avatarText: { fontSize: 22, fontWeight: '800', color: colors.onPrimaryContainer },
    userName: { fontSize: 17, fontWeight: '800', color: colors.onSurface, letterSpacing: -0.3 },
    userMeta: { fontSize: 12, color: colors.onSurfaceFaint, fontWeight: '600', marginTop: 2 },
    verifiedEmailBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: radius.full,
      backgroundColor: colors.surfaceContainerLow,
      alignSelf: 'flex-start',
      marginTop: 2,
    },
    verifiedEmailText: { fontSize: 12, fontWeight: '600', color: colors.onSurfaceVariant },
    restorePhotoBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      alignSelf: 'flex-start',
    },
    restorePhotoText: { fontSize: 12, fontWeight: '700', color: colors.primary },
    signOutBtn: {
      padding: 10,
      borderRadius: radius.full,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
    },
    confirmSignOutBox: {
      padding: 12,
      borderRadius: radius.m,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      gap: 10,
    },
    confirmSignOutText: {
      fontSize: 13,
      color: colors.onSurface,
      lineHeight: 18,
    },
    confirmSignOutActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
    },
    cancelBtn: {
      height: 36,
      paddingHorizontal: 14,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.outline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.onSurfaceVariant,
    },
    dangerBtn: {
      height: 36,
      paddingHorizontal: 16,
      borderRadius: radius.full,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dangerBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.onPrimary,
    },
    divider: { height: 1, backgroundColor: colors.outlineSoft },
    fieldGroup: { gap: 8 },
    fieldLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.onSurfaceFaint,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    inputRow: { flexDirection: 'row', gap: 8 },
    inputRowStack: { flexDirection: 'column' },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.onSurface, letterSpacing: -0.2 },
    welcomeTitle: { fontSize: 18, fontWeight: '800', color: colors.onSurface, letterSpacing: -0.3 },
    welcomeSubtitle: { fontSize: 13, color: colors.onSurfaceVariant, lineHeight: 18 },
    googleBtn: {
      height: 48,
      backgroundColor: '#ffffff',
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginTop: 4,
    },
    googleBtnText: { color: '#1f1f1f', fontWeight: '700', fontSize: 15 },
    orDivider: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginVertical: 4,
    },
    orLine: { flex: 1, height: 1, backgroundColor: colors.outlineSoft },
    orText: { fontSize: 12, fontWeight: '700', color: colors.onSurfaceFaint, textTransform: 'uppercase' },
    resendRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
    },
    body: { fontSize: 13, color: colors.onSurfaceVariant, lineHeight: 19 },
    input: {
      minHeight: 46,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      borderRadius: radius.m,
      paddingHorizontal: 12,
      fontSize: 15,
      backgroundColor: colors.surfaceContainer,
      color: colors.onSurface,
    },
    primaryBtn: {
      height: 48,
      backgroundColor: colors.primary,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    primaryBtnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 15 },
    smallBtn: {
      paddingHorizontal: 16,
      minHeight: 46,
      backgroundColor: colors.primary,
      borderRadius: radius.m,
      alignItems: 'center',
      justifyContent: 'center',
    },
    smallBtnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 13 },
    linkText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
    disabled: { opacity: 0.5 },
    linkedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: radius.m,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
    },
    linkedTitle: { fontSize: 13, fontWeight: '700', color: colors.onSurface },
    linkedSub: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },
    waNotice: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: '600',
      backgroundColor: colors.primaryContainer,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.s,
    },
    feedback: { fontSize: 13, color: colors.primary, textAlign: 'center', fontWeight: '600' },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    statCard: {
      flexGrow: 1,
      minWidth: '45%',
      backgroundColor: colors.surface,
      borderRadius: radius.m,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      gap: 6,
    },
    statCardTablet: {
      minWidth: '22%',
      flexBasis: '22%',
    },
    statHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    statLabel: { fontSize: 12, color: colors.onSurfaceFaint, fontWeight: '600' },
    statValue: { fontSize: 22, fontWeight: '800', color: colors.onSurface },
    tabs: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineSoft,
    },
    tabItem: {
      flex: 1,
      height: 46,
      alignItems: 'center',
      justifyContent: 'center',
      borderBottomWidth: 3,
      marginBottom: -1,
    },
    tabText: { fontSize: 13, fontWeight: '700' },
    sectionContent: { gap: spacing.md },
    listContainer: {
      backgroundColor: colors.surface,
      borderRadius: radius.l,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      overflow: 'hidden',
    },
    loadingWrap: { padding: 28, alignItems: 'center' },
    emptyBox: { padding: 28, alignItems: 'center', gap: 6 },
    emptyTitle: { fontSize: 14, fontWeight: '700', color: colors.onSurface },
    listItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineSoft,
      gap: 12,
    },
    listItemIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceContainerLow,
      alignItems: 'center',
      justifyContent: 'center',
    },
    postTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    postMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 4,
    },
    visibilityPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.full,
      borderWidth: 1,
    },
    publicPill: {
      backgroundColor: colors.surfaceContainerLow,
      borderColor: colors.outlineSoft,
    },
    privatePill: {
      backgroundColor: colors.surfaceContainerLow,
      borderColor: colors.outlineSoft,
    },
    visibilityPillText: {
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    listItemTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.onSurface },
    listItemMeta: { fontSize: 12, color: colors.onSurfaceFaint },
    emptyText: { textAlign: 'center', color: colors.onSurfaceFaint, fontSize: 13, padding: 24 },
    historyContainer: { gap: 14 },
    historyHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    historySearchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 44,
      paddingHorizontal: 14,
      borderRadius: radius.m,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
    },
    historySearchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.onSurface,
    },
    clearText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
    historyGroup: { gap: 8 },
    dayLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.onSurfaceFaint,
      textTransform: 'uppercase',
      paddingHorizontal: 4,
    },
    groupItems: {
      backgroundColor: colors.surface,
      borderRadius: radius.l,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      overflow: 'hidden',
    },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineSoft,
    },
    historyMainBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      gap: 12,
    },
    historyDeleteBtn: {
      paddingHorizontal: 14,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    repMetricsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    repMetricChip: {
      flex: 1,
      minWidth: 70,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: radius.m,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      alignItems: 'center',
    },
    repMetricVal: { fontSize: 17, fontWeight: '800', color: colors.onSurface },
    repMetricLbl: { fontSize: 11, color: colors.onSurfaceFaint, marginTop: 2 },
    settingsBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      backgroundColor: colors.surface,
      borderRadius: radius.l,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      gap: 12,
    },
    settingsText: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.onSurface },
  });
}
=======
import { Link } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Eyebrow, Screen, ScreenTitle } from '../../components/Screen';
import { WhatsAppSubmissionButton } from '../../components/WhatsAppSubmissionButton';
import { useAppTheme } from '../../theme/theme-provider';
import { spacing, type Palette } from '../../theme/theme';
import { useAuth } from '../../auth/AuthProvider';
import { userFacingError } from '../../utils/userFacingError';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, fetchMyObservations } from '../../services/api';
import { observationDetailRoute } from '../../utils/observationNavigation';

export default function ProfileScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const auth = useAuth();
  const queryClient = useQueryClient();
  const ownObservations = useQuery({
    queryKey: ['account', 'observations', auth.user?.public_user_id],
    queryFn: ({ signal }) => fetchMyObservations(auth.token!, signal),
    enabled: Boolean(auth.user && auth.token),
  });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeRequested, setCodeRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [displayName, setDisplayName] = useState('');
  useEffect(() => { setDisplayName(auth.user?.display_name ?? ''); }, [auth.user?.display_name]);
  useEffect(() => {
    if (ownObservations.error instanceof ApiError && ownObservations.error.kind === 'unauthorized') void auth.refreshSession();
  }, [ownObservations.error, auth.refreshSession]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setFeedback('');
    try { await action(); }
    catch (error) {
      setFeedback(userFacingError(error));
      if (error instanceof ApiError && error.kind === 'unauthorized') void auth.refreshSession();
    }
    finally { setBusy(false); }
  };
  const requestCode = () => run(async () => {
    const result = await auth.requestCode(phone.trim());
    setCodeRequested(true);
    setFeedback(result.delivery === 'whatsapp' ? 'A six digit sign-in code was sent through WhatsApp. It expires soon; enter it below.' : 'Development delivery is active. Check the backend development console for the code.');
  });
  const verifyCode = () => run(async () => {
    await auth.verifyCode(phone.trim(), code.trim());
    setCode(''); setPhone(''); setCodeRequested(false); setFeedback('You are signed in.');
  });
  const signOut = () => Alert.alert('Sign out of Earth Talk?', 'Your server session will be revoked.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: () => { void run(async () => { await auth.signOut(); queryClient.removeQueries({ queryKey: ['account', 'observations'] }); }); } },
  ]);

  return <Screen>
    <Eyebrow>Your Earth Talk</Eyebrow><ScreenTitle subtitle="Your mobile profile and app preferences.">Profile</ScreenTitle>
    {!auth.ready ? <View style={styles.panel}><Text style={styles.title}>Checking account session</Text><Text style={styles.body}>Public browsing remains available.</Text></View> : auth.user ? <View style={styles.panel}>
      <Text style={styles.title}>{auth.user.display_name || 'Earth Talk contributor'}{auth.user.is_demo ? ' · Demonstration account' : ''}</Text>
      <Text style={styles.body}>Signed in with a WhatsApp verified Earth Talk account. Your phone number is not displayed or stored in app preferences.</Text>
      <Text accessibilityLabel="Public account identifier" style={styles.body}>Public ID: {auth.user.public_user_id}</Text>
      <TextInput accessibilityLabel="Public display name" placeholder="Display name" placeholderTextColor={colors.muted} value={displayName} onChangeText={setDisplayName} maxLength={60} style={styles.input} editable={!busy} />
      <Pressable accessibilityRole="button" accessibilityLabel="Save public display name" disabled={busy} onPress={() => { void run(async () => { await auth.updateDisplayName(displayName.trim() || null); setDisplayName(''); setFeedback('Profile name updated.'); }); }} style={[styles.action, busy && styles.disabled]}><Text style={styles.actionText}>{busy ? 'Saving…' : 'Save display name'}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Sign out and revoke this session" onPress={signOut} style={styles.action} disabled={busy}><Text style={styles.actionText}>{busy ? 'Signing out…' : 'Sign out'}</Text></Pressable>
    </View> : <View style={styles.panel}>
      <Text style={styles.title}>Guest access</Text>
      <Text style={styles.body}>Browse public observations, map data, and community information without signing in. Sign-in is optional and uses the existing WhatsApp verification flow.</Text>
      {auth.restoreFailed ? <Pressable accessibilityRole="button" onPress={() => { void auth.refreshSession(); }} style={styles.action}><Text style={styles.actionText}>Retry session check</Text></Pressable> : null}
      {!auth.ready ? null : Platform.OS === 'web' ? <Text style={styles.body}>Native account sign-in is available in the iOS or Android app, not the web preview.</Text> : <>
        <TextInput accessibilityLabel="WhatsApp phone number with country code" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="+250 78 123 45 67" placeholderTextColor={colors.muted} value={phone} onChangeText={setPhone} style={styles.input} editable={!busy} />
        {codeRequested ? <TextInput accessibilityLabel="Six digit WhatsApp verification code" keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" placeholder="6 digit code" placeholderTextColor={colors.muted} value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} style={styles.input} editable={!busy} /> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={codeRequested ? 'Send a new sign-in code through WhatsApp' : 'Request sign-in code through WhatsApp'} disabled={busy || !phone.trim()} onPress={requestCode} style={[styles.action, (busy || !phone.trim()) && styles.disabled]}><Text style={styles.actionText}>{busy ? 'Please wait…' : codeRequested ? 'Send a new code' : 'Request WhatsApp code'}</Text></Pressable>
        {codeRequested ? <Pressable accessibilityRole="button" accessibilityLabel="Verify code and sign in" disabled={busy || code.length !== 6} onPress={verifyCode} style={[styles.action, (busy || code.length !== 6) && styles.disabled]}><Text style={styles.actionText}>Verify and sign in</Text></Pressable> : null}
      </>}
    </View>}
    {feedback ? <Text accessibilityRole="alert" style={styles.feedback}>{feedback}</Text> : null}
    {auth.user ? <View style={styles.panel}>
      <Text style={styles.title}>Your observations</Text>
      <Text style={styles.body}>This private account list is returned by Earth Talk. Coordinates are not displayed here.</Text>
      {ownObservations.isLoading ? <Text accessibilityRole="progressbar" style={styles.body}>Loading your records…</Text>
        : ownObservations.error && !ownObservations.data ? <><Text style={styles.body}>{userFacingError(ownObservations.error)}</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry loading your observations" onPress={() => { void ownObservations.refetch(); }} style={styles.action}><Text style={styles.actionText}>Retry</Text></Pressable></>
          : ownObservations.data?.data.length ? ownObservations.data.data.map((item) => <View key={item.passport_id} style={styles.record}>
            {item.is_public ? <Link href={observationDetailRoute(item.passport_id)} asChild><Pressable accessibilityRole="link" accessibilityLabel={`Open public observation ${item.title}`}><Text style={styles.recordTitle}>{item.title}</Text><Text style={styles.recordMeta}>{item.passport_id} · {item.observation_category} · Public</Text></Pressable></Link>
              : <><Text style={styles.recordTitle}>{item.title}</Text><Text style={styles.recordMeta}>{item.passport_id} · {item.observation_category} · Private</Text><Text style={styles.body}>Owner-only details are not available in this mobile view.</Text></>}
            <Text style={styles.recordMeta}>{new Date(item.created_at).toLocaleDateString()} · {item.media_count} media · {item.comment_count} comments · {item.open_question_count} open questions</Text>
          </View>) : <Text style={styles.body}>No account observations were returned.</Text>}
      {ownObservations.error && ownObservations.data ? <Text style={styles.body}>Could not refresh; showing previously loaded account records.</Text> : null}
    </View> : null}
    <Link href="/settings" asChild><Pressable accessibilityRole="button" accessibilityLabel="Open settings" style={({ pressed }) => [styles.row, pressed && styles.pressed]}><Text style={styles.rowText}>Settings</Text><Text aria-hidden style={styles.chevron}>›</Text></Pressable></Link>
    {!auth.user ? <View style={styles.panel}><Text style={styles.title}>Account data stays optional</Text><Text style={styles.body}>Signing in is required only for account-specific actions such as posting comments. Public browsing remains available while signed out.</Text></View> : null}
    <View style={styles.panel}><Text style={styles.title}>Contribute through the supported workflow</Text><Text style={styles.body}>Observation submissions continue through the existing WhatsApp flow. This app does not upload photos for AI analysis.</Text><WhatsAppSubmissionButton variant="participate" /></View>
  </Screen>;
}
function createStyles(colors: Palette) { return StyleSheet.create({
  panel: { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: 18, borderWidth: 1, borderColor: colors.line, gap: 8 },
  title: { color: colors.ink, fontWeight: '800', fontSize: 16 }, body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, color: colors.ink, borderRadius: 12, paddingHorizontal: 13, fontSize: 16 },
  action: { minHeight: 48, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 12, backgroundColor: colors.forest }, actionText: { color: colors.surface, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.55 }, feedback: { color: colors.ink, backgroundColor: colors.moss, padding: 12, borderRadius: 12, lineHeight: 19 },
  record: { gap: 5, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line }, recordTitle: { color: colors.forest, fontWeight: '800', fontSize: 15 }, recordMeta: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  row: { minHeight: 52, paddingHorizontal: spacing.md, borderRadius: 14, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, rowText: { color: colors.ink, fontWeight: '700', fontSize: 15 }, chevron: { color: colors.forest, fontSize: 24 }, pressed: { opacity: 0.8 },
}); }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
