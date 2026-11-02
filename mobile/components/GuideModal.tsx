import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchCmsGuide, type CmsGuide } from '../services/api';
import { type Palette } from '../theme/theme';
import { useAppTheme } from '../theme/theme-provider';
import { useAppLanguage } from '../utils/language';
import { useResponsiveLayout } from '../utils/responsive';

interface GuideModalProps {
  visible: boolean;
  page: 'about' | 'how-it-works' | 'terms' | 'privacy' | null;
  onClose: () => void;
}

export function GuideModal({ visible, page, onClose }: GuideModalProps) {
  const { colors } = useAppTheme();
  const { language, t } = useAppLanguage();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [guide, setGuide] = useState<CmsGuide | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && page) {
      setLoading(true);
      setError(null);
      fetchCmsGuide(page)
        .then(setGuide)
        .catch(() => setError(t('Could not load guide.')))
        .finally(() => setLoading(false));
    } else {
      setGuide(null);
    }
  }, [visible, page, language, t]);

  const headerTopPadding = Platform.OS === 'ios' ? 14 : layout.modalHeaderTopPadding;

  return (
    <Modal
      visible={visible && Boolean(page)}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View
          style={[
            styles.header,
            {
              paddingTop: headerTopPadding,
              paddingLeft: layout.sideSafeLeft + layout.horizontalPadding,
              paddingRight: layout.sideSafeRight + layout.horizontalPadding,
            },
          ]}
        >
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t(
              page === 'about'
                ? 'About Earth Talk'
                : page === 'how-it-works'
                  ? 'How it Works'
                  : page === 'terms'
                    ? 'Terms of Use'
                    : 'Privacy Policy'
            )}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Close guide')}
            onPress={onClose}
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={24} color={colors.onSurface} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingHorizontal: layout.horizontalPadding,
              paddingBottom: layout.bottomSafePadding + 24,
              maxWidth: layout.contentMaxWidth,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={40} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
              <Pressable
                style={styles.retryBtn}
                onPress={() => {
                  if (page) {
                    setLoading(true);
                    setError(null);
                    fetchCmsGuide(page)
                      .then(setGuide)
                      .catch(() => setError(t('Could not load guide.')))
                      .finally(() => setLoading(false));
                  }
                }}
              >
                <Text style={styles.retryText}>{t('Retry')}</Text>
              </Pressable>
            </View>
          ) : guide ? (
            <View style={styles.guideContainer}>
              <Text style={styles.subtitle}>{t(guide.subtitle)}</Text>
              <Text style={styles.lastUpdated}>{t(`Updated ${guide.lastUpdated}`)}</Text>

              {guide.sections.map((section) => (
                <View key={section.id} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    {section.number && <Text style={styles.sectionNumber}>{section.number}</Text>}
                    <Text style={styles.sectionTitle}>{t(section.title)}</Text>
                  </View>
                  <Text style={styles.sectionBody}>{t(section.content)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    header: {
      minHeight: 56,
      paddingBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineSoft,
    },
    headerTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.onSurface },
    closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    content: { width: '100%', alignSelf: 'center', paddingTop: 18 },
    subtitle: { fontSize: 15, color: colors.onSurfaceVariant, lineHeight: 22, marginBottom: 4 },
    lastUpdated: { fontSize: 12, color: colors.onSurfaceFaint, marginBottom: 20 },
    guideContainer: { gap: 20 },
    section: { gap: 10 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    sectionNumber: {
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
      backgroundColor: colors.primaryContainer,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    sectionTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.onSurface },
    sectionBody: { fontSize: 14, color: colors.onSurfaceVariant, lineHeight: 21 },
    errorContainer: { alignItems: 'center', gap: 14, marginTop: 48 },
    errorText: { textAlign: 'center', color: colors.onSurfaceFaint, fontSize: 14 },
    retryBtn: {
      paddingHorizontal: 24,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      justifyContent: 'center',
    },
    retryText: { color: colors.onPrimary, fontWeight: '700' },
  });
}
