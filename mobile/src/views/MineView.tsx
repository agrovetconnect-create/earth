import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AlertCircle,
  CheckCircle2,
  EyeOff,
  Image as ImageIcon,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Smartphone,
  Sparkles,
  Telescope,
  User,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import type { CommunityUser, MyPostSummary } from '../types/communityPosts';
import type { PublicReputationSummary } from '../types/community';
import { fetchMyPosts } from '../services/postsApi';
import { fetchMyReputation } from '../services/communityApi';
import {
  useCommunityUser,
  userAvatarSrc,
  linkWhatsApp,
  verifyLinkWhatsApp,
  updateProfile,
  setAvatar,
  clearAvatar,
  restoreGoogleAvatar,
  refreshSession,
} from '../services/communityAuth';
import { fileToDataUrl, dataUrlToBase64 } from '../lib/file';
import { categoryLabel } from '../types/community';
import { formatPassportId } from '../lib/format';
import { CATEGORY_COLORS, colors, radius, spacing } from '../lib/theme';
import WhatsAppIcon from '../components/WhatsAppIcon';

/**
 * "My Earth Talk" — the contributor's own dashboard: identity, WhatsApp
 * linking, contribution record and their posts. Port of the web
 * MyEarthTalkView with the mobile narrow-viewport layout.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DISPLAY_NAME_EDIT_INTERVAL_MS = 7 * DAY_MS;

function nextDisplayNameEditAtFor(updatedAt: string | null | undefined): number {
  if (!updatedAt) return 0;
  const last = Date.parse(updatedAt);
  if (!Number.isFinite(last)) return 0;
  return last + DISPLAY_NAME_EDIT_INTERVAL_MS;
}

function canEditDisplayNameFor(updatedAt: string | null | undefined): boolean {
  return nextDisplayNameEditAtFor(updatedAt) <= Date.now();
}

/* ------------------------------------------------------------------ */
/* WhatsApp linking                                                    */
/* ------------------------------------------------------------------ */

function WhatsAppLinker() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'input' | 'verify'>('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleRequest = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await linkWhatsApp(phone.trim());
      setStep('verify');
      setMessage('A verification code was sent to your WhatsApp.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to request linking code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await verifyLinkWhatsApp(phone.trim(), code.trim());
      await refreshSession(); // Refresh to show the linked state.
      setMessage('WhatsApp identity linked to your account.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={[textStyles.description, { lineHeight: 19 }]}>
        Link your WhatsApp number so field observations sent from WhatsApp join this account.
      </Text>

      {error ? (
        <View style={styles.errorBanner}>
          <AlertCircle size={16} color="#b3261e" style={styles.bannerIcon} />
          <Text style={[textStyles.errorText, { flex: 1 }]}>{error}</Text>
        </View>
      ) : null}

      {message && !error ? (
        <View style={styles.messageBanner}>
          <CheckCircle2 size={16} color="#0b57d0" style={styles.bannerIcon} />
          <Text style={[textStyles.messageText, { flex: 1 }]}>{message}</Text>
        </View>
      ) : null}

      {step === 'input' ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+250 78..."
              keyboardType="phone-pad"
              placeholderTextColor={colors.onSurfaceVariant}
              style={[styles.input, { paddingRight: spacing.xl * 2 }]}
            />
            <Smartphone size={16} color="#8f8f8f" style={styles.inputIcon} />
          </View>
          <Pressable
            disabled={loading || !phone.trim()}
            style={({ pressed }) => [
              styles.tonalButton,
              styles.tonalButtonWide,
              (loading || !phone.trim()) && { opacity: 0.4 },
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => void handleRequest()}
          >
            <Text style={styles.tonalText}>{loading ? 'Sending...' : 'Link WhatsApp'}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TextInput
              value={code}
              onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              keyboardType="number-pad"
              placeholderTextColor={colors.onSurfaceVariant}
              style={[styles.input, styles.codeInput, { flex: 1 }]}
            />
            <Pressable
              disabled={loading || code.length !== 6}
              style={({ pressed }) => [
                styles.filledButton,
                (loading || code.length !== 6) && { opacity: 0.4 },
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => void handleVerify()}
            >
              <Text style={styles.filledText}>{loading ? 'Verifying...' : 'Verify & Link'}</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => setStep('input')} style={{ alignSelf: 'flex-start' }}>
            <Text style={styles.linkText}>Use a different number</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Contribution record (web ReputationPanel)                           */
/* ------------------------------------------------------------------ */

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statCard}>
      <Text style={[textStyles.statValue, { color: '#1f1f1f' }]}>{value}</Text>
      <Text style={textStyles.statLabel}>{label}</Text>
    </View>
  );
}

function ReputationPanel() {
  const [reputation, setReputation] = useState<PublicReputationSummary | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setReputation(await fetchMyReputation());
      setFailed(false);
    } catch {
      // Reputation is supplementary; its absence must not break the page.
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed || !reputation) {
    return (
      <View style={styles.dashedCard}>
        <Text style={[textStyles.emptyTitle, { textAlign: 'center' }]}>
          No contribution record for this browser
        </Text>
        <Text style={[textStyles.emptyBody, { textAlign: 'center', marginTop: 4 }]}>
          Contributions are recognised through a random token stored in this browser only. Clearing
          site data or switching browsers will start a new, empty record. There is no account to
          recover.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.statsGrid}>
        <Stat label="Observations" value={reputation.observations_count} />
        <Stat label="Evidence" value={reputation.evidence_count} />
        <Stat label="Votes" value={reputation.votes_count} />
        <Stat label="Investigations" value={reputation.investigations_count} />
        <Stat label="Questions" value={reputation.questions_count} />
        <Stat label="Answers" value={reputation.answers_count} />
        <Stat label="Visits" value={reputation.visits_count} />
        <Stat label="Districts" value={reputation.districts_represented} />
      </View>

      <Text style={textStyles.disclaimer}>{reputation.disclaimer}</Text>

      {reputation.achievements.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={textStyles.achievementsTitle}>Achievements</Text>
          {reputation.achievements.map((a) => (
            <View key={a.id} style={styles.achievementRow}>
              <View style={{ flex: 1 }}>
                <Text style={textStyles.achievementLabel}>{a.label}</Text>
                <Text style={textStyles.achievementDescription}>{a.description}</Text>
              </View>
              {a.earned ? (
                <View style={styles.earnedPill}>
                  <Text style={textStyles.earnedText}>Earned</Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* My Earth Talk                                                       */
/* ------------------------------------------------------------------ */

export function MineView({
  onOpenObservation,
  onSignIn,
}: {
  onOpenObservation: (passportId: string) => void;
  onSignIn: () => void;
}) {
  const viewer = useCommunityUser();
  const [posts, setPosts] = useState<MyPostSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [confirmingName, setConfirmingName] = useState(false);
  const [name, setName] = useState('');
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const load = useCallback(async () => {
    if (!viewer) return;
    setLoading(true);
    try {
      const data = await fetchMyPosts();
      const list = Array.isArray(data) ? data : [];
      const unique = Array.from(new Map(list.map((p) => [p.passport_id, p])).values());
      setPosts(unique);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not load your posts.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer?.public_user_id]);

  useEffect(() => {
    setPosts([]);
    setNotice(null);
    setEditingName(false);
    setConfirmingName(false);
    setAvatarFailed(false);
    if (viewer) {
      setName(viewer.display_name ?? '');
      void load();
    }
  }, [viewer, load]);

  if (!viewer) {
    return (
      <ScrollView contentContainerStyle={styles.gateContent}>
        <View style={[styles.gateCard, styles.cardBorder]}>
          <Telescope size={32} color="#0b57d0" />
          <Text style={[textStyles.gateTitle, { marginTop: spacing.md }]}>My Earth Talk</Text>
          <Text style={[textStyles.gateBody, { marginTop: spacing.sm }]}>
            Your observations, your questions, your comments - under one sign-in. Sign in with
            Google or Gmail to sync and edit your personal field records.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.filledButton, styles.gateButton, pressed && { opacity: 0.85 }]}
            onPress={onSignIn}
          >
            <Text style={styles.filledText}>Sign in to Earth Talk</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  const avatarVersion = (viewer as { avatar_version?: number }).avatar_version;
  const avatarSrc = userAvatarSrc(viewer.public_user_id, avatarVersion);
  const showAvatarImage = Boolean(avatarSrc) && !avatarFailed;
  const resolvedDisplayName =
    viewer.display_name || viewer.email?.split('@')[0] || viewer.public_user_id;

  const openQuestions = posts.reduce((total, post) => total + (post.open_question_count ?? 0), 0);

  const nameEditable = canEditDisplayNameFor(viewer.display_name_updated_at);
  const nextEditAt = nextDisplayNameEditAtFor(viewer.display_name_updated_at);
  const daysUntilRename =
    nextEditAt > Date.now() ? Math.ceil((nextEditAt - Date.now()) / DAY_MS) : 0;

  const saveName = async () => {
    const next = name.trim();
    if (next === (viewer.display_name ?? '')) {
      setConfirmingName(false);
      setEditingName(false);
      return;
    }
    setNotice(null);
    try {
      const updated = await updateProfile(next.length > 0 ? next : null);
      setNotice(
        updated.display_name
          ? `You now appear as "${updated.display_name}".`
          : 'Your posts are now shared anonymously.',
      );
      setEditingName(false);
      setConfirmingName(false);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not update your name.');
      setConfirmingName(false);
    }
  };

  const onAvatarChosen = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice('Photo library access was declined, so nothing was changed.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      exif: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setNotice(null);
    setAvatarBusy(true);
    try {
      const dataUrl = await fileToDataUrl({
        uri: asset.uri,
        mimeType: asset.mimeType ?? undefined,
      });
      const mimeType = asset.mimeType ?? 'image/jpeg';
      await setAvatar(dataUrlToBase64(dataUrl), mimeType);
      setAvatarFailed(false);
      setNotice('Your profile photo was updated.');
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'The photo could not be saved.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const onAvatarRemove = async () => {
    setNotice(null);
    setAvatarBusy(true);
    try {
      await clearAvatar();
      setAvatarFailed(true);
      setNotice('Your profile photo was removed.');
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'The photo could not be removed.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const onAvatarRestoreGoogle = async () => {
    setNotice(null);
    setAvatarBusy(true);
    try {
      await restoreGoogleAvatar();
      setAvatarFailed(false);
      setNotice('Original Google profile photo restored.');
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not restore Google photo.');
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Telescope size={20} color="#0b57d0" />
        <Text style={textStyles.viewTitle}>My Earth Talk</Text>
      </View>

      {notice ? (
        <View style={styles.noticeBanner}>
          <Text style={textStyles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      {/* Identity */}
      <View style={[styles.card, styles.cardPadding]}>
        <View style={{ alignItems: 'center' }}>
          <Pressable
            disabled={avatarBusy}
            onPress={onAvatarChosen}
            onLongPress={onAvatarRemove}
            style={styles.avatarRing}
          >
            {showAvatarImage ? (
              <Image
                source={{ uri: avatarSrc ?? undefined }}
                style={styles.avatarImage}
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <User size={20} color="#0b57d0" />
            )}
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 }}>
            <Text style={textStyles.monoName}>{resolvedDisplayName}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Text style={textStyles.monoId}>{viewer.public_user_id}</Text>
            {viewer.email ? (
              <View style={styles.emailChip}>
                <Mail size={12} color="#1a73e8" />
                <Text style={textStyles.emailText}>{viewer.email}</Text>
              </View>
            ) : null}
          </View>
          {editingName ? (
            <View style={{ gap: spacing.sm, marginTop: spacing.md, alignSelf: 'stretch' }}>
              <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Your public name"
                  autoFocus
                  placeholderTextColor={colors.onSurfaceVariant}
                  style={[styles.input, { flex: 1, minWidth: 160 }]}
                />
                {confirmingName ? (
                  <>
                    <Pressable style={[styles.filledButton, styles.smallButton]} onPress={() => void saveName()}>
                      <Text style={styles.filledText}>Confirm</Text>
                    </Pressable>
                    <Pressable onPress={() => setConfirmingName(false)} style={styles.textButton}>
                      <Text style={textStyles.cancelText}>Back</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable
                      style={[styles.filledButton, styles.smallButton]}
                      onPress={() => setConfirmingName(true)}
                    >
                      <Text style={styles.filledText}>Save</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setEditingName(false)}
                      style={styles.textButton}
                    >
                      <Text style={textStyles.cancelText}>Cancel</Text>
                    </Pressable>
                  </>
                )}
              </View>
              {confirmingName ? (
                <Text style={textStyles.confirmWarning}>
                  Change your name to "{name.trim() || resolvedDisplayName}"? A name can only be
                  changed once every 7 days.
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }}>
              <Text style={textStyles.displayName}>{resolvedDisplayName}</Text>
              <Pressable
                disabled={!nameEditable}
                onPress={() => {
                  setName(viewer.display_name ?? '');
                  setEditingName(true);
                }}
                style={({ pressed }) => [
                  styles.iconButton,
                  !nameEditable && { opacity: 0.4 },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Pencil size={14} color={colors.onSurface} />
              </Pressable>
            </View>
          )}
          {!nameEditable && daysUntilRename > 0 ? (
            <Text style={textStyles.cooldownText}>
              Your name can be changed again in {daysUntilRename} day{daysUntilRename === 1 ? '' : 's'}.
            </Text>
          ) : null}
        </View>
      </View>

      {/* WhatsApp linking */}
      <View style={[styles.card, styles.cardPadding]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
          <WhatsAppIcon size={16} />
          <Text style={textStyles.sectionTitle}>WhatsApp Account Linking</Text>
        </View>
        {viewer.is_whatsapp_linked ? (
          <View style={styles.linkedBox}>
            <Sparkles size={16} color="#16a34a" style={styles.bannerIcon} />
            <View style={{ flex: 1 }}>
              <Text style={styles.linkedTitle}>WhatsApp identity linked</Text>
              <Text style={styles.linkedCopy}>
                Your WhatsApp observations are automatically associated with this account.
              </Text>
            </View>
          </View>
        ) : (
          <WhatsAppLinker />
        )}
        {openQuestions > 0 ? (
          <View style={styles.openQuestionsBox}>
            <Text style={textStyles.openQuestionsLabel}>Open AI questions</Text>
            <Text style={textStyles.openQuestionsCount}>
              {openQuestions} question{openQuestions === 1 ? '' : 's'}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Contribution record */}
      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        <Text style={textStyles.sectionTitle}>Your contribution record</Text>
        <ReputationPanel />
      </View>

      {/* Your posts */}
      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        <Text style={textStyles.sectionTitle}>Your posts</Text>
        {loading && posts.length === 0 ? (
          <Text style={textStyles.loadingText}>Loading your posts…</Text>
        ) : posts.length === 0 ? (
          <View style={styles.dashedCard}>
            <Text style={textStyles.emptyTitle}>Nothing here yet.</Text>
            <Text style={[textStyles.emptyBody, { marginTop: 4 }]}>
              When you upload a specimen photo or send an observation, it appears here.
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {posts.map((post) => {
              const color = CATEGORY_COLORS[post.observation_category] ?? '#78716c';
              return (
                <View
                  key={post.passport_id}
                  style={[styles.card, styles.postCard]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                    <Text style={[textStyles.postTitle, { flex: 1 }]}>{post.title}</Text>
                    <View
                      style={[
                        styles.visibilityPill,
                        post.is_public ? styles.pillPublic : styles.pillPrivate,
                      ]}
                    >
                      <Text
                        style={[
                          textStyles.pillText,
                          { color: post.is_public ? '#2b7f3f' : '#7f5f00' },
                        ]}
                      >
                        {post.is_public ? 'Public' : 'Private'}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }}>
                    <Text style={textStyles.passportId}>{formatPassportId(post.passport_id)}</Text>
                    <View
                      style={[
                        styles.categoryChip,
                        { borderColor: `${color}55`, backgroundColor: `${color}14` },
                      ]}
                    >
                      <MapPin size={10} color={color} />
                      <Text style={[textStyles.categoryText, { color }]}>{categoryLabel(post.observation_category)}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.lg, marginTop: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <ImageIcon size={12} color="#5e5e5e" />
                      <Text style={textStyles.metaText}>{post.media_count ?? 0}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <MessageCircle size={12} color="#5e5e5e" />
                      <Text style={textStyles.metaText}>{post.comment_count ?? 0}</Text>
                    </View>
                    {(post.open_question_count ?? 0) > 0 ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Sparkles size={12} color="#9f6108" />
                        <Text style={[textStyles.metaText, { color: '#9f6108' }]}>
                          {post.open_question_count} open question
                          {(post.open_question_count ?? 0) === 1 ? '' : 's'}
                        </Text>
                      </View>
                    ) : null}
                    {!post.is_public ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <EyeOff size={12} color="#5e5e5e" />
                        <Text style={textStyles.metaText}>Not on the map</Text>
                      </View>
                    ) : null}
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      styles.tonalButton,
                      { marginTop: spacing.md },
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => onOpenObservation(post.passport_id)}
                  >
                    <Text style={styles.tonalText}>Open</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const textStyles = StyleSheet.create({
  viewTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  noticeText: {
    fontSize: 12,
    color: '#5e5e5e',
  },
  description: {
    fontSize: 12,
    color: '#5e5e5e',
  },
  monoName: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#5e5e5e',
  },
  monoId: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#5e5e5e',
  },
  emailText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#1a73e8',
  },
  displayName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  cancelText: {
    fontSize: 12,
    color: '#0b57d0',
  },
  confirmWarning: {
    fontSize: 11,
    lineHeight: 14,
    color: '#9f6108',
  },
  cooldownText: {
    fontSize: 11,
    color: '#8f8f8f',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '600',
  },
  statLabel: {
    fontSize: 11,
    color: '#5e5e5e',
  },
  disclaimer: {
    fontSize: 11,
    lineHeight: 16,
    color: '#5e5e5e',
  },
  achievementsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f1f1f',
  },
  achievementLabel: {
    fontSize: 13,
    color: '#1f1f1f',
  },
  achievementDescription: {
    fontSize: 11,
    color: '#8f8f8f',
  },
  earnedText: {
    fontSize: 11,
    color: '#2b7f3f',
  },
  loadingText: {
    fontSize: 13,
    color: '#5e5e5e',
    textAlign: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  emptyBody: {
    fontSize: 12,
    lineHeight: 17,
    color: '#5e5e5e',
  },
  postTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  pillText: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '500',
  },
  passportId: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#0b57d0',
  },
  categoryText: {
    fontSize: 11,
  },
  metaText: {
    fontSize: 11,
    color: '#5e5e5e',
  },
  gateTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1f1f1f',
    textAlign: 'center',
  },
  gateBody: {
    fontSize: 13,
    lineHeight: 20,
    color: '#5e5e5e',
    textAlign: 'center',
  },
  openQuestionsLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  openQuestionsCount: {
    fontSize: 11,
    color: '#9f6108',
  },
  messageText: {
    fontSize: 12,
    color: '#0b57d0',
  },
  errorText: {
    fontSize: 12,
    color: '#b3261e',
  },
});

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 3,
    gap: spacing.md,
  },
  gateContent: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  gateCard: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.xxl,
    alignItems: 'center',
  },
  gateButton: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  card: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  cardBorder: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  cardPadding: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.xl,
  },
  noticeBanner: {
    backgroundColor: '#f0f4f9',
    borderColor: '#e3e3e3',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  avatarRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e8f0fe',
    borderWidth: 1,
    borderColor: '#e3e3e3',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  emailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e8f0fe',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHigh,
  },
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: '#c7c7c7',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontSize: 13,
    color: '#1f1f1f',
    backgroundColor: colors.surface,
  },
  codeInput: {
    textAlign: 'center',
    letterSpacing: 6,
    fontWeight: '700',
  },
  inputIcon: {
    position: 'absolute',
    right: spacing.md,
    top: 12,
  },
  filledButton: {
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButton: {
    height: 36,
    paddingHorizontal: spacing.md,
  },
  filledText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.onPrimary,
  },
  tonalButton: {
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  tonalButtonWide: {
    alignSelf: 'auto',
    paddingHorizontal: spacing.lg,
    height: 40,
  },
  tonalText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.onSurface,
  },
  textButton: {
    height: 36,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: {
    fontSize: 11,
    color: '#0b57d0',
    textDecorationLine: 'underline',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: '#fdecec',
    borderColor: '#f5c6c6',
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  messageBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: '#eaf1fd',
    borderColor: '#c6dafc',
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  bannerIcon: {
    marginTop: 1,
  },
  linkedBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  linkedTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  linkedCopy: {
    fontSize: 12,
    lineHeight: 17,
    color: '#166534',
  },
  openQuestionsBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: '#f0f4f9',
    borderColor: '#e3e3e3',
    borderWidth: 1,
    borderRadius: radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  statCard: {
    width: '47%',
    flexGrow: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  achievementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#e3e3e3',
    backgroundColor: '#f0f4f9',
    padding: spacing.md,
  },
  earnedPill: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#2b7f3f40',
    backgroundColor: '#c4eed0',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  dashedCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#c7c7c7',
    backgroundColor: 'rgba(255,255,255,0.4)',
    padding: spacing.xl,
  },
  postCard: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.lg,
  },
  visibilityPill: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  pillPublic: {
    backgroundColor: '#c4eed0',
    borderColor: '#2b7f3f33',
  },
  pillPrivate: {
    backgroundColor: '#fff3cd',
    borderColor: '#e6c20040',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
});
