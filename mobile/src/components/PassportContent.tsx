import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  Check,
  HelpCircle,
  Lightbulb,
  MapPin,
  Microscope,
  Share2,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react-native';
import type { PublicObservationDetail } from '../types/public';
import {
  EVIDENCE_STATE_EXPLANATIONS,
  EVIDENCE_STATE_HEX,
  EVIDENCE_STATE_LABELS,
  type EvidenceState,
} from '../types/community';
import {
  fetchNearbyObservations,
  fetchObservationIntelligence,
  fetchSimilarObservations,
} from '../services/publicApi';
import type {
  EvidenceSource,
  GeoscienceIntelligenceResult,
  RelatedObservationsResponse,
} from '../types/intelligence';
import { formatCapitalized, formatDate, formatPassportId } from '../lib/format';
import { colors, radius, spacing, type as typeScale } from '../lib/theme';

/**
 * The Geoscience Passport — a port of the web's `GeosciencePassportModal`,
 * rendered as the full `/passport/[id]` page: hero media, the quiet facts that
 * frame the record, the AI reading with its limits, the geoscience intelligence
 * layer and related public records, and a sticky WhatsApp action bar.
 */

/** Plain language per evidence source, mirrored from the server. */
const SOURCE_LABELS: Record<EvidenceSource, string> = {
  observed: 'Seen in the media',
  user_reported: 'Reported by the person who sent it',
  ai_inferred: 'Reasoned by the AI',
  community_suggested: 'Suggested by the community',
  expert_reviewed: 'Placed by an expert review',
  scientific_confirmation: 'Scientific confirmation',
  nearby_observation: 'Nearby public observation',
  geological_context: 'Geological dataset',
};

/** A mark per category, so the header shows what the record is at a glance. */
const CATEGORY_ICONS: Record<string, string> = {
  rock: '🪨',
  mineral: '💎',
  fossil: '🦴',
  geological_structure: '🪨',
  geological_layer: '📚',
  geomorphology: '⛰️',
  volcanic_feature: '🌋',
  hydrogeological_feature: '💧',
  mining_observation: '⛏️',
  engineering_geology: '🏗️',
  other_geoscience: '🌍',
  unknown: '❓',
  insufficient_image: '❓',
  non_geoscience: '❓',
};

export function PassportContent({
  observation,
  onClose,
  onOpenWhatsApp,
}: {
  observation: PublicObservationDetail;
  onClose: () => void;
  onOpenWhatsApp: () => void;
}) {
  const [intelligence, setIntelligence] = useState<GeoscienceIntelligenceResult | null>(null);
  const [nearby, setNearby] = useState<RelatedObservationsResponse | null>(null);
  const [similar, setSimilar] = useState<RelatedObservationsResponse | null>(null);
  const [intelReady, setIntelReady] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  // Keep the floating close/ID row clear of the notch and status bar.
  const insets = useSafeAreaInsets();

  const passportId = observation.passport_id;

  useEffect(() => {
    if (!passportId) return;
    let cancelled = false;
    setIntelReady(false);
    setIntelligence(null);
    setNearby(null);
    setSimilar(null);
    Promise.all([
      fetchObservationIntelligence(passportId),
      fetchNearbyObservations(passportId),
      fetchSimilarObservations(passportId),
    ])
      .then(([intel, near, sim]) => {
        if (cancelled) return;
        setIntelligence(intel);
        setNearby(near);
        setSimilar(sim);
      })
      .catch(() => {
        if (!cancelled) {
          setIntelligence(null);
          setNearby(null);
          setSimilar(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIntelReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [passportId]);

  const photoCount = observation.public_media_count ?? observation.media_count ?? 0;
  const evidenceState = observation.evidence_state as EvidenceState | null | undefined;
  const title =
    observation.post_title ||
    observation.primary_interpretation ||
    formatCapitalized(observation.possible_name) ||
    'Geoscience Passport';
  const hero = observation.primary_media_url;
  const categoryIcon = CATEGORY_ICONS[observation.observation_category] ?? '❓';

  const shareLink = useMemo(() => {
    const base = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/api\/?$/, '') ?? '';
    return `${base}/?view=explore&passport=${encodeURIComponent(passportId)}&fullscreen=1`;
  }, [passportId]);

  const handleSharePassport = async () => {
    await Clipboard.setStringAsync(shareLink);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const renderRelatedList = (response: RelatedObservationsResponse, heading: string) => (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.sectionLabel}>…</Text>
      {response.items.slice(0, 5).map((item) => (
        <View key={item.passport_id} style={styles.relatedRow}>
          <View style={styles.relatedAvatar}>
            <Text style={{ fontSize: 15 }}>{CATEGORY_ICONS[item.observation_category] ?? '❓'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.relatedId} numberOfLines={1}>{formatPassportId(item.passport_id)}</Text>
            <Text style={styles.relatedMeta} numberOfLines={1}>
              {formatCapitalized(item.observation_category)}
              {item.district ? ` · ${item.district}` : ''}
            </Text>
          </View>
          {item.distance_km !== null ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{item.distance_km} km</Text>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.root}>
      {/* Floating Close Button & ID pinned at top of the page */}
      <View style={[styles.floatRow, { top: 12 + insets.top }]} pointerEvents="box-none">
        <View style={styles.floatLeft} pointerEvents="box-none">
          <View style={styles.idPill}>
            <Text style={styles.idPillText}>{formatPassportId(observation.passport_id)}</Text>
          </View>
          <Pressable
            style={styles.sharePill}
            onPress={() => void handleSharePassport()}
            accessibilityLabel="Share Geoscience Passport link"
          >
            {copiedUrl ? (
              <Check size={14} color="#81c995" />
            ) : (
              <Share2 size={14} color="#ffffff" />
            )}
            <Text style={styles.sharePillText}>{copiedUrl ? 'Copied' : 'Share'}</Text>
          </Pressable>
        </View>
        <Pressable style={styles.closeButton} onPress={onClose} accessibilityLabel="Close Geoscience Passport">
          <X size={20} color="#ffffff" />
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        {/* Hero media */}
        {hero ? (
          <View style={styles.heroWrap}>
            <Image source={{ uri: hero }} style={styles.heroImage} resizeMode="cover" />
            <View style={styles.heroScrim} pointerEvents="none" />
            {photoCount > 0 ? (
              <View style={styles.photoCountPill}>
                <Text style={styles.photoCountText}>
                  {photoCount} photo{photoCount === 1 ? '' : 's'}
                </Text>
              </View>
            ) : null}
            <View style={styles.categoryPill}>
              <Text style={{ fontSize: 12 }}>{categoryIcon}</Text>
              <Text style={styles.categoryPillText}>{formatCapitalized(observation.observation_category)}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.noPhotoBand}>
            <Text style={{ fontSize: 30 }}>{categoryIcon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionLabel}>No public photo</Text>
              <Text style={styles.noPhotoText} numberOfLines={2}>
                {formatCapitalized(observation.observation_category)}
                {observation.observation_subcategory &&
                observation.observation_subcategory !== 'unknown'
                  ? ` · ${formatCapitalized(observation.observation_subcategory)}`
                  : ''}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.body}>
          {/* Title and first-view chips */}
          <View>
            <Text style={styles.title}>{title}</Text>
            <View style={styles.chipRow}>
              {evidenceState ? (
                <View style={styles.chip}>
                  <View style={[styles.dot, { backgroundColor: EVIDENCE_STATE_HEX[evidenceState] }]} />
                  <Text style={styles.chipText}>{EVIDENCE_STATE_LABELS[evidenceState]}</Text>
                </View>
              ) : null}
              <View style={styles.chip}>
                <MapPin size={12} color={colors.onSurfaceVariant} />
                <Text style={styles.chipText}>
                  {observation.district ? `${observation.district} District` : 'Rwanda'}
                </Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipText}>{formatDate(observation.created_at)}</Text>
              </View>
              {observation.is_demo && photoCount > 0 ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>Public media: {photoCount}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Key facts grid */}
          <View style={styles.factsGrid}>
            <View style={styles.factCell}>
              <Text style={styles.sectionLabel}>Passport ID</Text>
              <Text style={[styles.factValue, { fontFamily: 'monospace' }]}>
                {formatPassportId(observation.passport_id)}
              </Text>
            </View>
            <View style={styles.factCell}>
              <Text style={styles.sectionLabel}>Category</Text>
              <Text style={styles.factValue}>{formatCapitalized(observation.observation_category)}</Text>
              {observation.observation_subcategory &&
              observation.observation_subcategory !== 'unknown' ? (
                <Text style={styles.factSub}>
                  {formatCapitalized(observation.observation_subcategory)}
                </Text>
              ) : null}
            </View>
            <View style={styles.factCell}>
              <Text style={styles.sectionLabel}>Proposed identification</Text>
              <Text style={styles.factValue}>
                {observation.primary_interpretation ||
                  formatCapitalized(observation.possible_name) ||
                  'Unidentified'}
              </Text>
              {observation.classification &&
              observation.classification !== 'non_rock' &&
              observation.classification !== 'insufficient_image' ? (
                <Text style={styles.factSub}>
                  Rock type: {formatCapitalized(observation.classification)}
                </Text>
              ) : null}
            </View>
            <View style={styles.factCell}>
              <Text style={styles.sectionLabel}>AI confidence</Text>
              <Text style={styles.factValue}>{formatCapitalized(observation.confidence)}</Text>
              <Text style={styles.factSub}>Score {Math.round(observation.confidence_score * 100)}%</Text>
            </View>
            <View style={[styles.factCell, { gridColumn: 'span 2' }]}>
              <Text style={styles.sectionLabel}>Evidence state</Text>
              {evidenceState ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[styles.dot, { width: 10, height: 10, backgroundColor: EVIDENCE_STATE_HEX[evidenceState] }]} />
                    <Text style={[styles.factValue, { color: EVIDENCE_STATE_HEX[evidenceState] }]}>
                      {EVIDENCE_STATE_LABELS[evidenceState]}
                    </Text>
                  </View>
                  <Text style={[styles.factSub, { flex: 1, minWidth: 160, lineHeight: 16 }]}>
                    {EVIDENCE_STATE_EXPLANATIONS[evidenceState]}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.factValue, { marginTop: 4 }]}>Not recorded</Text>
              )}
            </View>
          </View>

          {/* Research opportunity flag */}
          {observation.is_research_opportunity ? (
            <View style={styles.researchFlag}>
              <Microscope size={16} color="#0842a0" />
              <Text style={styles.researchFlagText}>
                <Text style={{ fontWeight: '600' }}>Flagged as a research opportunity.</Text> A
                person marked this record as worth further study. That is a question worth asking,
                not a finding:{' '}
                {observation.research_opportunity_count
                  ? `${observation.research_opportunity_count} related question${
                      observation.research_opportunity_count === 1 ? '' : 's'
                    } recorded.`
                  : 'No related questions recorded yet.'}
              </Text>
            </View>
          ) : null}

          {/* Observed visual evidence */}
          {observation.observed_features.length > 0 ? (
            <View style={styles.panelSection}>
              <View style={styles.panelTitleRow}>
                <Sparkles size={16} color="#9f6108" />
                <Text style={styles.panelTitle}>Observed visual evidence</Text>
              </View>
              <View style={styles.panelCard}>
                {observation.observed_features.map((feat, idx) => (
                  <View key={idx} style={styles.bulletRow}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.panelBody}>{feat}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Preliminary reasoning */}
          {observation.reasoning ? (
            <View style={styles.panelSection}>
              <View style={styles.panelTitleRow}>
                <Lightbulb size={16} color="#9f6108" />
                <Text style={styles.panelTitle}>Preliminary reasoning</Text>
              </View>
              <View style={styles.panelCard}>
                <Text style={styles.panelBody}>{observation.reasoning}</Text>
              </View>
            </View>
          ) : null}

          {/* What is still uncertain */}
          {observation.uncertainties && observation.uncertainties.length > 0 ? (
            <View style={styles.panelSection}>
              <View style={styles.panelTitleRow}>
                <HelpCircle size={16} color="#8f8f8f" />
                <Text style={styles.panelTitle}>What is still uncertain</Text>
              </View>
              {observation.uncertainties.map((item, idx) => (
                <View key={idx} style={styles.bulletRow}>
                  <Text style={styles.bulletMark}>•</Text>
                  <Text style={styles.smallText}>{item}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Scientific limitations */}
          {observation.limitations.length > 0 ? (
            <View style={styles.panelSection}>
              <View style={styles.panelTitleRow}>
                <ShieldAlert size={16} color="#d32f28" />
                <Text style={styles.panelTitle}>Scientific limitations of visual assessment</Text>
              </View>
              {observation.limitations.map((lim, idx) => (
                <View key={idx} style={styles.bulletRow}>
                  <Text style={styles.bulletMark}>•</Text>
                  <Text style={styles.smallText}>{lim}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Location & privacy notice */}
          <View style={styles.privacyNotice}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MapPin size={14} color="#7a5207" />
              <Text style={styles.privacyTitle}>Location &amp; privacy protection</Text>
            </View>
            <Text style={styles.privacyText}>
              <Text style={{ fontWeight: '600', color: '#7a5207' }}>Area: </Text>
              {observation.district ? `${observation.district} District, Rwanda` : 'Rwanda'}
            </Text>
            <Text style={styles.privacyText}>
              🔒 <Text style={{ fontWeight: '600', color: '#7a5207' }}>Privacy policy: </Text>
              Exact GPS coordinates and contributor personal data are protected and never published.
              Generalized district-level coordinates are used.
            </Text>
          </View>

          {/* Scientific safety notice */}
          <Text style={styles.safetyNotice}>
            ⚠️ <Text style={{ fontWeight: '500', color: '#3c4043' }}>Scientific disclaimer: </Text>
            {observation.safety_note} A photograph or video cannot confirm mineral deposits, ore
            grade, gold presence, geological age, or economic valuation, and nothing here is a
            laboratory determination.
          </Text>

          {/* Geoscience Intelligence */}
          <View style={styles.intelSection}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <BrainCircuit size={16} color="#5c2d91" />
              <Text style={[styles.panelTitle, { flex: 1, color: '#3c4043', marginBottom: 0 }]}>
                Geoscience Intelligence
              </Text>
              <View style={[styles.chip, { backgroundColor: '#ffffff' }]}>
                <Text style={[styles.chipText, { color: '#5c2d91' }]}>AI reading, not verified</Text>
              </View>
            </View>

            {!intelReady ? (
              <Text style={styles.intelLoading}>Assembling the intelligence presentation…</Text>
            ) : intelligence ? (
              <View style={{ gap: spacing.md }}>
                {intelligence.summary ? (
                  <Text style={styles.panelBody}>{intelligence.summary}</Text>
                ) : null}

                {intelligence.primaryEvidence.length > 0 ? (
                  <View style={{ gap: 6 }}>
                    <Text style={styles.sectionLabel}>What supports this reading</Text>
                    {intelligence.primaryEvidence.map((item, idx) => (
                      <View key={idx} style={styles.bulletRow}>
                        <Text style={[styles.bulletMark, { color: '#7a50c7' }]}>•</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.smallText}>{item.claim}</Text>
                          <Text style={styles.tinyText}>
                            {SOURCE_LABELS[item.source] ?? item.source}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}

                {intelligence.alternativeHypotheses.length > 0 ? (
                  <View style={{ gap: 6 }}>
                    <Text style={styles.sectionLabel}>Other readings that remain possible</Text>
                    {intelligence.alternativeHypotheses.map((hyp, idx) => (
                      <View key={idx}>
                        <Text style={[styles.smallText, { fontWeight: '500' }]}>{hyp.label}</Text>
                        {hyp.evidenceFor.length > 0 ? (
                          <Text style={styles.tinyText}>
                            For: {hyp.evidenceFor.map((e) => e.claim).join('; ')}
                          </Text>
                        ) : null}
                        {hyp.evidenceAgainst.length > 0 ? (
                          <Text style={styles.tinyText}>
                            Against: {hyp.evidenceAgainst.map((e) => e.claim).join('; ')}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}

                {intelligence.followUpQuestions.length > 0 ? (
                  <View style={{ gap: 6 }}>
                    <Text style={styles.sectionLabel}>
                      Questions for the person who submitted it
                    </Text>
                    {intelligence.followUpQuestions.map((q, idx) => (
                      <View key={idx} style={styles.bulletRow}>
                        <Text style={[styles.bulletMark, { color: '#7a50c7' }]}>?</Text>
                        <Text style={styles.smallText}>{q}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {intelligence.geologicalContextNote ? (
                  <View style={styles.contextNote}>
                    <Text style={styles.smallText}>
                      <Text style={{ fontWeight: '500', color: '#3c4043' }}>Geological context: </Text>
                      {intelligence.geologicalContextNote}
                    </Text>
                  </View>
                ) : null}

                {intelligence.confidenceStatement ? (
                  <Text style={[styles.tinyText, { fontStyle: 'italic' }]}>
                    {intelligence.confidenceStatement}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={styles.smallText}>
                The intelligence presentation could not be assembled for this record. The passport
                content above remains unaffected.
              </Text>
            )}
          </View>

          {/* Related public records */}
          {(nearby?.count ?? 0) + (similar?.count ?? 0) > 0 ? (
            <View style={styles.panelSection}>
              <View style={styles.panelTitleRow}>
                <MapPin size={16} color="#8f8f8f" />
                <Text style={styles.panelTitle}>Related public records</Text>
              </View>
              <View style={{ gap: spacing.md }}>
                {nearby && nearby.count > 0
                  ? renderRelatedList(nearby, `Near this location — ${nearby.note}`)
                  : null}
                {similar && similar.count > 0
                  ? renderRelatedList(similar, `Same category elsewhere — ${similar.note}`)
                  : null}
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Sticky action bar */}
      <View style={styles.actionBar}>
        <Text style={styles.actionNote} numberOfLines={1}>
          Preliminary AI-assisted record · not a laboratory determination
        </Text>
        <Pressable style={styles.closeTextButton} onPress={onClose}>
          <Text style={styles.closeTextButtonText}>Close</Text>
        </Pressable>
        <Pressable style={styles.whatsappButton} onPress={onOpenWhatsApp}>
          <Text style={styles.whatsappButtonText} numberOfLines={1}>
            {observation.observation_category === 'rock'
              ? 'Have a rock like this? Submit via WhatsApp'
              : 'Have something like this? Submit via WhatsApp'}
          </Text>
          <ArrowRight size={16} color={colors.onPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  floatRow: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  floatLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 31,
  },
  idPill: {
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  idPillText: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  sharePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sharePillText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroWrap: {
    height: 208,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  photoCountPill: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  photoCountText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#ffffff',
  },
  categoryPill: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  noPhotoBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#eef1f6',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  noPhotoText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f1f1f',
    marginTop: 2,
  },
  body: {
    gap: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 26,
    letterSpacing: -0.2,
    color: '#1f1f1f',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    height: 26,
  },
  chipText: {
    fontSize: 12,
    color: colors.onSurface,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  factsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.outlineVariant,
    gap: 1,
    overflow: 'hidden',
  },
  factCell: {
    width: '50%',
    backgroundColor: '#ffffff',
    padding: 14,
  },
  factValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f1f1f',
    marginTop: 4,
  },
  factSub: {
    fontSize: 12,
    color: '#5e5e5e',
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.onSurfaceVariant,
  },
  researchFlag: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#a8c7ec',
    backgroundColor: '#e8f3ff',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  researchFlagText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: '#0842a0',
  },
  panelSection: {
    gap: spacing.sm,
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  panelTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f1f1f',
    marginBottom: 2,
  },
  panelCard: {
    gap: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: '#f8fafd',
    padding: 16,
  },
  panelBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#3c4043',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.outline,
    marginTop: 7,
  },
  bulletMark: {
    fontSize: 12,
    color: colors.outline,
  },
  smallText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: '#5e5e5e',
  },
  tinyText: {
    fontSize: 11,
    lineHeight: 15,
    color: '#5e5e5e',
  },
  privacyNotice: {
    gap: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#ffdf99',
    backgroundColor: '#fff8e6',
    padding: 16,
  },
  privacyTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7a5207',
  },
  privacyText: {
    fontSize: 12,
    lineHeight: 17,
    color: '#5e5e5e',
  },
  safetyNotice: {
    fontSize: 11,
    lineHeight: 17,
    color: '#5e5e5e',
  },
  intelSection: {
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#d7c9ff',
    backgroundColor: '#f4f1ff',
    padding: 16,
  },
  intelLoading: {
    fontSize: 12,
    color: '#5e5e5e',
  },
  contextNote: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(215,201,255,0.6)',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  relatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: '#ffffff',
    padding: 10,
  },
  relatedAvatar: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  relatedId: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  relatedMeta: {
    fontSize: 11,
    color: '#5e5e5e',
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  actionNote: {
    fontSize: 11,
    color: '#8f8f8f',
    maxWidth: 120,
  },
  closeTextButton: {
    height: 40,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeTextButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
  },
  whatsappButton: {
    flex: 1,
    maxWidth: 260,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  whatsappButtonText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.onPrimary,
  },
});
