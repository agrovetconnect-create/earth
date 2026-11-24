import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ArrowLeft, Calendar } from 'lucide-react-native';
import { Markdown } from '../components/Markdown';
import { requestJson } from '../services/http';
import { colors, radius, spacing } from '../lib/theme';

/**
 * Full-page port of the web's About / How-it-works / Terms / Privacy pages
 * (AboutLayout + LegalLayout at the mobile breakpoint): in-view header with
 * back-to-map button, logo wordmark and pill tab navigation, then a white
 * document card on the #f8fafd page background with a mono "Last Updated"
 * badge and numbered CMS sections. The web's left table of contents is
 * `hidden lg:block`, so it does not appear at the mobile width.
 */

export type GuidePage = 'about' | 'how-it-works' | 'terms' | 'privacy';

interface CmsSection {
  id?: string;
  number?: string;
  title?: string;
  content?: string;
}

interface CmsPage {
  title?: string;
  subtitle?: string;
  lastUpdated?: string;
  sections?: CmsSection[];
}

interface PageConfig {
  tabs: Array<{ id: GuidePage; label: string }>;
  loadingText: string;
  errorTitle: string;
  errorSubtitle: string;
  errorFallback: string;
  /** About pages render the section number in a filled chip; legal pages render plain mono "N." */
  numberVariant: 'chip' | 'plain';
}

const PAGE_CONFIG: Record<GuidePage, PageConfig> = {
  about: {
    tabs: [
      { id: 'about', label: 'About Earth Talk' },
      { id: 'how-it-works', label: 'How It Works' },
    ],
    loadingText: 'Retrieving information...',
    errorTitle: 'About Earth Talk',
    errorSubtitle: 'Unable to retrieve this guide right now.',
    errorFallback: 'Guide content is currently unavailable.',
    numberVariant: 'chip',
  },
  'how-it-works': {
    tabs: [
      { id: 'about', label: 'About Earth Talk' },
      { id: 'how-it-works', label: 'How It Works' },
    ],
    loadingText: 'Retrieving information...',
    errorTitle: 'How Earth Talk Works',
    errorSubtitle: 'Unable to retrieve this guide right now.',
    errorFallback: 'Guide content is currently unavailable.',
    numberVariant: 'chip',
  },
  terms: {
    tabs: [
      { id: 'terms', label: 'Terms of Service' },
      { id: 'privacy', label: 'Privacy Policy' },
    ],
    loadingText: 'Retrieving Terms of Service...',
    errorTitle: 'Terms of Service',
    errorSubtitle: 'Unable to retrieve the latest Terms of Service right now.',
    errorFallback: 'Terms of Service content is currently unavailable.',
    numberVariant: 'plain',
  },
  privacy: {
    tabs: [
      { id: 'terms', label: 'Terms of Service' },
      { id: 'privacy', label: 'Privacy Policy' },
    ],
    loadingText: 'Retrieving Privacy Policy...',
    errorTitle: 'Privacy Policy',
    errorSubtitle: 'Unable to retrieve the latest Privacy Policy right now.',
    errorFallback: 'Privacy Policy content is currently unavailable.',
    numberVariant: 'plain',
  },
};

export function GuideView({
  page,
  onBack,
  onNavigateTab,
}: {
  page: GuidePage;
  onBack: () => void;
  onNavigateTab: (tab: GuidePage) => void;
}) {
  const config = PAGE_CONFIG[page];
  const [data, setData] = useState<CmsPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pulse = useRef(new Animated.Value(0.45)).current;

  const loadPage = useCallback((target: GuidePage) => {
    setLoading(true);
    setError(null);
    requestJson<CmsPage>(`/api/control/cms/${target}`)
      .then((payload) => {
        setData({
          ...payload,
          sections: Array.isArray(payload?.sections) ? payload.sections : [],
        });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load content.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadPage(page);
  }, [loadPage, page]);

  useEffect(() => {
    if (!loading) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [loading, pulse]);

  const sections = data?.sections ?? [];

  if (loading) {
    return (
      <View style={styles.page}>
        <GuideHeader page={page} onBack={onBack} onNavigateTab={onNavigateTab} />
        <View style={styles.loadingBody}>
          <Animated.Text style={[styles.loadingText, { opacity: pulse }]}>
            {config.loadingText}
          </Animated.Text>
        </View>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.page}>
        <GuideHeader page={page} onBack={onBack} onNavigateTab={onNavigateTab} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <DocumentCard lastUpdated="Unavailable" title={config.errorTitle} subtitle={config.errorSubtitle}>
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error || config.errorFallback}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => loadPage(page)}
                style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.retryLabel}>Try again</Text>
              </Pressable>
            </View>
          </DocumentCard>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <GuideHeader page={page} onBack={onBack} onNavigateTab={onNavigateTab} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <DocumentCard
          lastUpdated={data.lastUpdated || 'Unavailable'}
          title={data.title || config.errorTitle}
          subtitle={data.subtitle || ''}
        >
          {sections.map((section, index) => (
            <View key={section.id ?? index} style={styles.section}>
              <View style={styles.sectionHeadingRow}>
                {config.numberVariant === 'chip' ? (
                  <View style={styles.sectionChip}>
                    <Text style={styles.sectionChipText}>{section.number || ''}</Text>
                  </View>
                ) : (
                  <Text style={styles.sectionPlainNumber}>{section.number || ''}.</Text>
                )}
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>
              {section.content ? <Markdown content={section.content} /> : null}
            </View>
          ))}
          <View style={styles.guideFooter}>
            <Text style={styles.footerTagline}>Earth Talk — Citizen Geoscience Platform</Text>
            <Pressable
              onPress={() => onNavigateTab('terms')}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={styles.footerLink}>Legal & Transparency →</Text>
            </Pressable>
          </View>
        </DocumentCard>
      </ScrollView>
    </View>
  );
}

/** Sticky top bar: back-to-map button, logo wordmark and the pill tab switcher. */
function GuideHeader({
  page,
  onBack,
  onNavigateTab,
}: {
  page: GuidePage;
  onBack: () => void;
  onNavigateTab: (tab: GuidePage) => void;
}) {
  const config = PAGE_CONFIG[page];
  return (
    <View style={styles.header}>
      <View style={styles.headerInner}>
        <View style={styles.headerLeft}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Return to Earth Talk application"
            onPress={onBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.headerPress]}
          >
            <ArrowLeft size={16} color="#5e5e5e" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to map"
            onPress={onBack}
            style={({ pressed }) => [styles.wordmark, pressed && { opacity: 0.7 }]}
          >
            <Image
              source={require('../../assets/images/icon.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.wordmarkText}>Earth Talk</Text>
          </Pressable>
        </View>
        <View style={styles.pillNav}>
          {config.tabs.map((tab) => {
            const active = tab.id === page;
            return (
              <Pressable
                key={tab.id}
                accessibilityRole="button"
                onPress={() => onNavigateTab(tab.id)}
                style={({ pressed }) => [
                  styles.pill,
                  active && styles.pillActive,
                  pressed && !active && styles.headerPress,
                ]}
              >
                <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/** The white document card: mono last-updated badge, title, subtitle, then sections. */
function DocumentCard({
  lastUpdated,
  title,
  subtitle,
  children,
}: {
  lastUpdated: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.updatedRow}>
          <View style={styles.updatedBadge}>
            <Calendar size={14} color="#0b57d0" />
            <Text style={styles.updatedText}>Last Updated: {lastUpdated}</Text>
          </View>
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
        {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f8fafd',
  },
  header: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#e3e3e3',
  },
  headerInner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 64,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerPress: {
    opacity: 0.7,
  },
  backButton: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e3e3e3',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideFooter: {
    marginTop: 40,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#e3e3e3',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  footerTagline: {
    fontSize: 12,
    color: '#5e5e5e',
  },
  footerLink: {
    fontSize: 12,
    fontWeight: '500',
    color: '#0b57d0',
    textDecorationLine: 'underline',
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  wordmarkText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  pillNav: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f4f9',
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e3e3e3',
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pillActive: {
    backgroundColor: '#ffffff',
  },
  pillLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#5e5e5e',
  },
  pillLabelActive: {
    color: '#0b57d0',
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: spacing.xxl * 3,
  },
  loadingBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: '#5e5e5e',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e3e3e3',
    padding: 24,
  },
  cardHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#e3e3e3',
    paddingBottom: 32,
    marginBottom: 32,
  },
  updatedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  updatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0f4f9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e3e3e3',
  },
  updatedText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#3c4043',
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1f1f1f',
    letterSpacing: -0.4,
  },
  cardSubtitle: {
    marginTop: 12,
    fontSize: 14,
    color: '#5e5e5e',
    lineHeight: 22,
  },
  cardBody: {
    gap: 32,
  },
  section: {
    gap: 12,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  sectionChip: {
    backgroundColor: '#f0f4f9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e3e3e3',
  },
  sectionChipText: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#0b57d0',
  },
  sectionPlainNumber: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#0b57d0',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f1f1f',
    flexShrink: 1,
  },
  errorBox: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#f8fafd',
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#5e5e5e',
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#0b57d0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
  },
});
