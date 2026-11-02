import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthProvider';
import { DrawerMenuButton, useNavDrawer } from '../../components/MobileNavDrawer';
import {
  sendMobileChatMessage,
  type MobileChatLocationPayload,
  type MobileChatMessageResult,
  type MobilePinConfirmationSummary,
  type MobilePinDecision,
} from '../../services/api';
import { getContributorToken } from '../../services/contributorToken';
import { recordMobileHistory } from '../../services/history';
import { radius, spacing, type Palette } from '../../theme/theme';
import { useAppTheme } from '../../theme/theme-provider';
import {
  buildSampleExifJpegBase64,
  extractExifFromBase64,
  nearestRwandaDistrict,
} from '../../utils/exifExtractor';
import { observationDetailRoute } from '../../utils/observationNavigation';
import { useAppLanguage } from '../../utils/language';
import { useResponsiveLayout } from '../../utils/responsive';
import { userFacingError } from '../../utils/userFacingError';

interface SelectedMediaAttachment {
  kind: 'image';
  mimeType: string;
  base64: string;
  fileName: string;
  previewUri?: string;
  exifDistrict?: string | null;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  imageUri?: string;
  type?: MobileChatMessageResult['type'];
  passport?: Record<string, unknown>;
  pendingPassportId?: string | null;
  awaitingPinConfirmation?: boolean;
  pinConfirmation?: MobilePinConfirmationSummary;
  questionsForUser?: string[];
  suggestedActions?: string[];
}

interface WebFileLike {
  name: string;
  type: string;
  size: number;
}

const PIN_OPTIONS: ReadonlyArray<{ decision: MobilePinDecision; label: string }> = [
  { decision: 'pin_approximate', label: 'Pin ~2 km' },
  { decision: 'pin_exact', label: 'Pin Exact' },
  { decision: 'pin_district', label: 'District' },
  { decision: 'keep_private', label: 'Private' },
];

function nowTimeLabel(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function StandaloneChatScreen() {
  const { colors } = useAppTheme();
  const { t } = useAppLanguage();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { token: sessionToken } = useAuth();
  const { openPhotoSubmission } = useNavDrawer();
  const params = useLocalSearchParams<{ passportId?: string }>();
  const scrollViewRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome_1',
      sender: 'assistant',
      text:
        'Send a clear rock, mineral, or landform photo using + to create a Geoscience Passport, or ask any geology question.',
      timestamp: nowTimeLabel(),
      type: 'help',
      suggestedActions: ['Identify quartz', 'Rwanda basalt', 'SITES', 'HELP'],
    },
  ]);

  const [inputText, setInputText] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<SelectedMediaAttachment | null>(null);
  const [attachedLocation, setAttachedLocation] = useState<MobileChatLocationPayload | null>(null);
  const [activePassportId, setActivePassportId] = useState<string | null>(null);
  const [toolsTrayOpen, setToolsTrayOpen] = useState(false);
  const [toolNotice, setToolNotice] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (params.passportId && params.passportId.trim()) {
      setActivePassportId(params.passportId.trim());
    }
  }, [params.passportId]);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const applyPhotoBase64 = (base64: string, mimeType: string, fileName: string) => {
    const exif = extractExifFromBase64(base64);
    if (exif.hasCoordinates && !attachedLocation) {
      setAttachedLocation({
        latitude: exif.latitude,
        longitude: exif.longitude,
        district: exif.inferredDistrict ?? null,
      });
    }
    setSelectedMedia({
      kind: 'image',
      mimeType,
      base64,
      fileName,
      previewUri: `data:${mimeType};base64,${base64}`,
      exifDistrict: exif.hasCoordinates ? exif.inferredDistrict ?? 'GPS' : null,
    });
    setToolsTrayOpen(false);
    setToolNotice(null);
  };

  const handleChoosePhoto = () => {
    const g = globalThis as unknown as {
      document?: {
        createElement: (tag: string) => {
          type: string;
          accept: string;
          onchange:
            | ((ev: { target: { files?: ArrayLike<WebFileLike & Blob> | null } }) => void)
            | null;
          click: () => void;
        };
      };
      FileReader?: new () => {
        result: string | ArrayBuffer | null;
        onload: (() => void) | null;
        onerror: (() => void) | null;
        readAsDataURL: (b: Blob) => void;
      };
    };

    if (!g.document || !g.FileReader) {
      const sampleBase64 = buildSampleExifJpegBase64();
      applyPhotoBase64(sampleBase64, 'image/jpeg', 'musanze-outcrop.jpg');
      return;
    }

    const input = g.document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/heic';
    input.onchange = (ev) => {
      const file = ev.target.files?.[0];
      if (!file || !g.FileReader) return;
      if (file.size > 10 * 1024 * 1024) {
        setToolNotice(t('Max photo size is 10 MB.'));
        return;
      }
      const mimeType = file.type || 'image/jpeg';
      const reader = new g.FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const rawBase64 = reader.result.includes(',')
            ? reader.result.slice(reader.result.indexOf(',') + 1)
            : reader.result;
          applyPhotoBase64(rawBase64, mimeType, file.name);
        }
      };
      reader.onerror = () => setToolNotice(t('Could not read photo.'));
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleAttachSamplePhoto = () => {
    const sampleBase64 = buildSampleExifJpegBase64();
    applyPhotoBase64(sampleBase64, 'image/jpeg', 'musanze-basalt.jpg');
  };

  const handleAttachGpsLocation = async () => {
    setToolNotice(t('Reading GPS…'));
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setToolNotice(t('Location permission declined.'));
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const lat = Number(loc.coords.latitude.toFixed(6));
      const lon = Number(loc.coords.longitude.toFixed(6));
      const district = nearestRwandaDistrict(lat, lon);
      setAttachedLocation({
        latitude: lat,
        longitude: lon,
        accuracy_meters: loc.coords.accuracy ? Math.round(loc.coords.accuracy) : null,
        district,
      });
      setToolNotice(null);
      setToolsTrayOpen(false);
    } catch {
      setToolNotice(t('Could not read GPS.'));
    }
  };

  const dispatchChatRequest = async (paramsReq: {
    userBubbleText: string;
    message?: string;
    media?: SelectedMediaAttachment | null;
    location?: MobileChatLocationPayload | null;
    targetPassportId?: string | null;
    pinDecision?: MobilePinDecision;
  }) => {
    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: paramsReq.userBubbleText,
      timestamp: nowTimeLabel(),
      imageUri: paramsReq.media?.previewUri,
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsSending(true);
    scrollToBottom();

    try {
      const contributorToken = await getContributorToken().catch(() => null);
      const response = await sendMobileChatMessage(
        {
          message: paramsReq.message,
          image_base64: paramsReq.media?.base64,
          mime_type: paramsReq.media?.mimeType,
          location: paramsReq.location ?? undefined,
          pending_passport_id: (paramsReq.targetPassportId ?? activePassportId) || undefined,
          pin_decision: paramsReq.pinDecision,
        },
        sessionToken,
        undefined,
        contributorToken || undefined
      );

      const passportTitle =
        (typeof response.passport?.post_title === 'string' && response.passport.post_title.trim()) ||
        (typeof response.passport?.possible_name === 'string' && response.passport.possible_name.trim()) ||
        '';
      const passportIdFromPayload =
        typeof response.passport?.passport_id === 'string' && response.passport.passport_id.trim()
          ? response.passport.passport_id.trim()
          : '';
      const passportCategory =
        typeof response.passport?.observation_category === 'string' &&
        response.passport.observation_category.trim()
          ? response.passport.observation_category.trim()
          : 'observation';
      const passportDistrict =
        typeof response.passport?.district === 'string' && response.passport.district.trim()
          ? response.passport.district.trim()
          : 'GeoAI';

      if (response.pending_passport_id) {
        setActivePassportId(response.pending_passport_id);
        void recordMobileHistory({
          kind: 'observation',
          refId: response.pending_passport_id,
          title: passportTitle || response.pending_passport_id,
          subtitle: 'GeoAI session',
        });
      } else if (passportIdFromPayload) {
        void recordMobileHistory({
          kind: 'observation',
          refId: passportIdFromPayload,
          title: passportTitle || passportIdFromPayload,
          subtitle: `${passportCategory} · ${passportDistrict}`,
        });
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `asst_${Date.now()}`,
          sender: 'assistant',
          text: response.reply,
          timestamp: nowTimeLabel(),
          type: response.type,
          passport: response.passport,
          pendingPassportId: response.pending_passport_id,
          awaitingPinConfirmation: response.awaiting_pin_confirmation,
          pinConfirmation: response.pin_confirmation,
          questionsForUser: response.questions_for_user,
          suggestedActions: response.suggested_actions,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'assistant',
          text: userFacingError(err),
          timestamp: nowTimeLabel(),
        },
      ]);
    } finally {
      setIsSending(false);
      scrollToBottom();
    }
  };

  const handleSendComposer = async () => {
    const cleanText = inputText.trim();
    if (!cleanText && !selectedMedia && !attachedLocation) return;

    const mediaToSend = selectedMedia;
    const locToSend = attachedLocation;
    setInputText('');
    setSelectedMedia(null);
    setAttachedLocation(null);
    setToolsTrayOpen(false);

    const summaryLabel =
      cleanText ||
      (mediaToSend
        ? t(`Photo: ${mediaToSend.fileName}`)
        : t(`Location: ${locToSend?.district || 'GPS'}`));

    await dispatchChatRequest({
      userBubbleText: summaryLabel,
      message: cleanText || undefined,
      media: mediaToSend,
      location: locToSend,
    });
  };

  const handlePinDecision = (passportId: string, decision: MobilePinDecision, label: string) => {
    void dispatchChatRequest({
      userBubbleText: t(label),
      targetPassportId: passportId,
      pinDecision: decision,
    });
  };

  const handleQuickActionPress = (action: string) => {
    if (action.endsWith(' ')) {
      setInputText(action);
      return;
    }
    void dispatchChatRequest({ userBubbleText: action, message: action });
  };

  const canSend = Boolean(inputText.trim() || selectedMedia || attachedLocation) && !isSending;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? layout.insets.top : 0}
      >
        <View style={styles.header}>
          <View
            style={[
              styles.headerContent,
              { maxWidth: layout.contentMaxWidth },
            ]}
          >
            <DrawerMenuButton compact />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Go back')}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
              hitSlop={8}
              style={styles.headerIconBtn}
            >
              <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
            </Pressable>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {t('GeoAI')}
              </Text>
              <Text style={styles.headerStatusText} numberOfLines={1}>
                {t('Preliminary Earth science AI')}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Submit field photo')}
              onPress={openPhotoSubmission}
              style={styles.headerIconBtn}
            >
              <Ionicons name="camera-outline" size={21} color={colors.primary} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Open settings')}
              onPress={() => router.push('/settings')}
              style={styles.headerIconBtn}
            >
              <Ionicons name="settings-outline" size={21} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>

          {activePassportId && (
            <View style={styles.activeContextBanner}>
              <Ionicons name="document-text-outline" size={14} color={colors.onPrimaryContainer} />
              <Pressable
                style={{ flex: 1 }}
                onPress={() => router.push(observationDetailRoute(activePassportId))}
              >
                <Text style={styles.activeContextText} numberOfLines={1}>
                  {t(`Passport ${activePassportId}`)}
                </Text>
              </Pressable>
              <Pressable onPress={() => setActivePassportId(null)} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.onPrimaryContainer} />
              </Pressable>
            </View>
          )}
        </View>

        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingHorizontal: layout.horizontalPadding,
              maxWidth: layout.contentMaxWidth,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToBottom}
        >
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const passportId =
              msg.pendingPassportId ||
              msg.pinConfirmation?.passport_id ||
              (typeof msg.passport?.passport_id === 'string' ? msg.passport.passport_id : undefined);

            return (
              <View
                key={msg.id}
                style={[
                  styles.bubbleWrapper,
                  isUser ? styles.userBubbleWrapper : styles.assistantBubbleWrapper,
                ]}
              >
                <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
                  {msg.imageUri && (
                    <Image
                      source={{ uri: msg.imageUri }}
                      style={[
                        styles.bubbleImage,
                        layout.isCompactPhone && styles.bubbleImageCompact,
                      ]}
                    />
                  )}
                  <Text
                    style={[
                      styles.bubbleText,
                      isUser ? styles.userBubbleText : styles.assistantBubbleText,
                    ]}
                  >
                    {msg.id === 'welcome_1' ? t(msg.text) : msg.text}
                  </Text>

                  {msg.questionsForUser && msg.questionsForUser.length > 0 && (
                    <View style={styles.questionsBox}>
                      {msg.questionsForUser.map((q, idx) => (
                        <Pressable
                          key={idx}
                          style={styles.questionItem}
                          onPress={() => setInputText(`Re: "${q}" — `)}
                        >
                          <Text style={styles.questionItemText}>{q}</Text>
                          <Ionicons name="arrow-forward" size={14} color={colors.primary} />
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {msg.awaitingPinConfirmation && passportId && !isUser && (
                    <View style={styles.pinChoiceBox}>
                      <Text style={styles.pinChoiceTitle}>{t('Pin visibility:')}</Text>
                      <View style={styles.pinChoiceWrap}>
                        {PIN_OPTIONS.map((opt) => (
                          <Pressable
                            key={opt.decision}
                            disabled={isSending}
                            onPress={() => handlePinDecision(passportId, opt.decision, opt.label)}
                            style={styles.pinChoiceBtn}
                          >
                            <Text style={styles.pinChoiceBtnText}>{t(opt.label)}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}

                  {msg.pinConfirmation && !isUser && (
                    <View style={styles.pinConfirmedBadge}>
                      <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                      <Text style={styles.pinConfirmedText}>
                        {msg.pinConfirmation.is_public
                          ? t(
                              `Pinned (${t(msg.pinConfirmation.precision)}${
                                msg.pinConfirmation.district ? ` · ${msg.pinConfirmation.district}` : ''
                              })`
                            )
                          : t('Saved privately')}
                      </Text>
                    </View>
                  )}

                  {passportId && !isUser && (
                    <Pressable
                      style={styles.passportCard}
                      onPress={() => router.push(observationDetailRoute(passportId))}
                    >
                      <View style={styles.passportIconContainer}>
                        <Ionicons name="document-text" size={18} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.passportCardLabel}>{t('Passport')}</Text>
                        <Text style={styles.passportCardId}>{passportId}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceFaint} />
                    </Pressable>
                  )}
                </View>
                <Text style={styles.bubbleTime}>{msg.timestamp}</Text>
              </View>
            );
          })}

          {isSending && (
            <View style={styles.assistantBubbleWrapper}>
              <View style={[styles.bubble, styles.assistantBubble, styles.loadingBubble]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingText}>{t('Analyzing…')}</Text>
              </View>
            </View>
          )}
        </ScrollView>

        <View style={styles.composerContainer}>
          <View
            style={[
              styles.composerInner,
              {
                paddingHorizontal: layout.horizontalPadding,
                maxWidth: layout.contentMaxWidth,
              },
            ]}
          >
            {toolsTrayOpen && (
              <View style={styles.toolsTray}>
                <Pressable onPress={handleChoosePhoto} style={styles.toolActionCard}>
                  <Ionicons name="image-outline" size={18} color={colors.primary} />
                  <Text style={styles.toolActionText}>{t('Photo')}</Text>
                </Pressable>
                <Pressable onPress={handleAttachSamplePhoto} style={styles.toolActionCard}>
                  <Ionicons name="sparkles-outline" size={18} color={colors.earth} />
                  <Text style={styles.toolActionText}>{t('Sample')}</Text>
                </Pressable>
                <Pressable onPress={handleAttachGpsLocation} style={styles.toolActionCard}>
                  <Ionicons name="locate-outline" size={18} color={colors.success} />
                  <Text style={styles.toolActionText}>{t('GPS')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setToolsTrayOpen(false);
                    openPhotoSubmission();
                  }}
                  style={styles.toolActionCard}
                >
                  <Ionicons name="albums-outline" size={18} color={colors.onSurfaceVariant} />
                  <Text style={styles.toolActionText}>{t('Full Form')}</Text>
                </Pressable>
              </View>
            )}

            {toolNotice && (
              <View style={styles.toolNoticeBar}>
                <Text style={styles.toolNoticeText}>{toolNotice}</Text>
                <Pressable onPress={() => setToolNotice(null)} hitSlop={8}>
                  <Ionicons name="close" size={16} color={colors.onSurfaceFaint} />
                </Pressable>
              </View>
            )}

            {(selectedMedia || attachedLocation) && (
              <View style={styles.attachmentPreviewBar}>
                {selectedMedia && (
                  <View style={styles.attachmentPill}>
                    {selectedMedia.previewUri && (
                      <Image
                        source={{ uri: selectedMedia.previewUri }}
                        style={styles.attachmentThumb}
                      />
                    )}
                    <View style={{ maxWidth: 140 }}>
                      <Text style={styles.attachmentName} numberOfLines={1}>
                        {selectedMedia.fileName}
                      </Text>
                      {selectedMedia.exifDistrict && (
                        <Text style={styles.attachmentSub} numberOfLines={1}>
                          EXIF: {selectedMedia.exifDistrict}
                        </Text>
                      )}
                    </View>
                    <Pressable onPress={() => setSelectedMedia(null)} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color={colors.onSurfaceFaint} />
                    </Pressable>
                  </View>
                )}

                {attachedLocation && (
                  <View style={styles.attachmentPill}>
                    <Ionicons name="location" size={16} color={colors.success} />
                    <Text style={styles.attachmentName} numberOfLines={1}>
                      {attachedLocation.district ||
                        `${attachedLocation.latitude?.toFixed(3)}, ${attachedLocation.longitude?.toFixed(3)}`}
                    </Text>
                    <Pressable onPress={() => setAttachedLocation(null)} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color={colors.onSurfaceFaint} />
                    </Pressable>
                  </View>
                )}
              </View>
            )}

            {messages[messages.length - 1]?.suggestedActions && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.suggestionsScroll}
                contentContainerStyle={styles.suggestionsContent}
              >
                {messages[messages.length - 1].suggestedActions!.map((action, idx) => (
                  <Pressable
                    key={idx}
                    style={styles.suggestionChip}
                    onPress={() => handleQuickActionPress(action)}
                  >
                    <Text style={styles.suggestionChipText}>{t(action)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <View style={styles.composerBar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Attach photo or field location')}
                onPress={() => setToolsTrayOpen((prev) => !prev)}
                style={styles.composerToolBtn}
              >
                <Ionicons
                  name={toolsTrayOpen ? 'close-circle-outline' : 'add-circle-outline'}
                  size={28}
                  color={colors.primary}
                />
              </Pressable>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.textInput}
                  placeholder={t('Ask GeoAI or add notes…')}
                  placeholderTextColor={colors.onSurfaceFaint}
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Send message')}
                style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
                disabled={!canSend}
                onPress={() => {
                  void handleSendComposer();
                }}
              >
                <Ionicons name="send" size={18} color={colors.onPrimary} />
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.surface },
    container: { flex: 1, backgroundColor: colors.surfaceContainerLow },
    header: {
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineSoft,
    },
    headerContent: {
      width: '100%',
      alignSelf: 'center',
      minHeight: 54,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      gap: 2,
    },
    headerIconBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleContainer: { flex: 1, marginLeft: 4 },
    headerTitle: { fontSize: 16, fontWeight: '800', color: colors.onSurface },
    headerStatusText: { fontSize: 11, color: colors.onSurfaceFaint, fontWeight: '500' },
    activeContextBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 7,
      backgroundColor: colors.primaryContainer,
      gap: 8,
    },
    activeContextText: { fontSize: 12, fontWeight: '700', color: colors.onPrimaryContainer },
    scrollContent: {
      width: '100%',
      alignSelf: 'center',
      paddingVertical: spacing.md,
      paddingBottom: 20,
    },
    bubbleWrapper: { marginBottom: 12, maxWidth: '88%' },
    userBubbleWrapper: { alignSelf: 'flex-end', alignItems: 'flex-end' },
    assistantBubbleWrapper: { alignSelf: 'flex-start', alignItems: 'flex-start' },
    bubble: {
      borderRadius: radius.l,
      padding: 12,
      borderWidth: 1,
    },
    userBubble: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
      borderBottomRightRadius: radius.s,
    },
    assistantBubble: {
      backgroundColor: colors.surface,
      borderColor: colors.outlineSoft,
      borderBottomLeftRadius: radius.s,
    },
    bubbleText: { fontSize: 14, lineHeight: 20 },
    userBubbleText: { color: colors.onPrimary },
    assistantBubbleText: { color: colors.onSurface },
    bubbleImage: { width: 210, height: 165, borderRadius: radius.m, marginBottom: 8 },
    bubbleImageCompact: { width: 175, height: 138 },
    bubbleTime: { fontSize: 10, color: colors.onSurfaceFaint, marginTop: 3, marginHorizontal: 4 },
    loadingBubble: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderColor: colors.outlineSoft,
    },
    loadingText: { fontSize: 13, color: colors.onSurfaceFaint },
    questionsBox: {
      marginTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.outlineSoft,
      paddingTop: 8,
      gap: 4,
    },
    questionItem: {
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    questionItemText: {
      flex: 1,
      fontSize: 13,
      color: colors.primary,
      fontWeight: '600',
      marginRight: 8,
    },
    pinChoiceBox: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.outlineSoft,
      gap: 6,
    },
    pinChoiceTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.onSurfaceVariant,
    },
    pinChoiceWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    pinChoiceBtn: {
      minHeight: 36,
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radius.full,
      backgroundColor: colors.primaryContainer,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    pinChoiceBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.onPrimaryContainer,
    },
    pinConfirmedBadge: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radius.s,
      backgroundColor: colors.surfaceContainerLow,
    },
    pinConfirmedText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.onSurfaceVariant,
    },
    passportCard: {
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainer,
      padding: 10,
      borderRadius: radius.m,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      gap: 10,
    },
    passportIconContainer: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    passportCardLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.onSurfaceFaint,
      textTransform: 'uppercase',
    },
    passportCardId: { fontSize: 13, fontWeight: '700', color: colors.onSurface },
    composerContainer: {
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.outlineSoft,
      paddingBottom: 6,
    },
    composerInner: {
      width: '100%',
      alignSelf: 'center',
    },
    toolsTray: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      paddingTop: 10,
    },
    toolActionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      height: 38,
      borderRadius: radius.m,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
    },
    toolActionText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.onSurface,
    },
    toolNoticeBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radius.s,
      backgroundColor: colors.surfaceContainerLow,
    },
    toolNoticeText: {
      flex: 1,
      fontSize: 12,
      color: colors.onSurfaceVariant,
    },
    attachmentPreviewBar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingTop: 8,
    },
    attachmentPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radius.m,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
    },
    attachmentThumb: {
      width: 30,
      height: 30,
      borderRadius: radius.s,
    },
    attachmentName: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.onSurface,
    },
    attachmentSub: {
      fontSize: 10,
      color: colors.primary,
      fontWeight: '600',
    },
    suggestionsScroll: { maxHeight: 46, marginTop: 8 },
    suggestionsContent: { gap: 6, alignItems: 'center' },
    suggestionChip: {
      paddingHorizontal: 12,
      height: 34,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.outline,
      backgroundColor: colors.surface,
      justifyContent: 'center',
    },
    suggestionChipText: { fontSize: 12, color: colors.onSurfaceVariant, fontWeight: '600' },
    composerBar: { flexDirection: 'row', alignItems: 'flex-end', paddingVertical: 8, gap: 6 },
    composerToolBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    inputContainer: {
      flex: 1,
      minHeight: 44,
      maxHeight: 110,
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.xl,
      paddingHorizontal: 14,
      paddingVertical: 9,
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.outlineSoft,
    },
    textInput: { fontSize: 15, color: colors.onSurface, padding: 0, textAlignVertical: 'top' },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: { backgroundColor: colors.outline, opacity: 0.6 },
  });
}
