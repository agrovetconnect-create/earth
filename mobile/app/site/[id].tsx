import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import {
  AlertTriangle,
  Bot,
  Check,
  Clock,
  FlaskConical,
  GraduationCap,
  MapPin,
  Share2,
  Users,
  X,
} from 'lucide-react-native';
import type { SiteExplorerPayload } from '../../src/types/community';
import { categoryLabel } from '../../src/types/community';
import {
  EVIDENCE_STATE_EXPLANATIONS,
  EVIDENCE_STATE_LABELS,
  type EvidenceState,
} from '../../src/types/community';
import { fetchSiteExplorer, recordVisit } from '../../src/services/communityApi';
import { fetchResearchOpportunities } from '../../src/services/publicApi';
import { cacheJson, offlineCacheKey, readCachedJson } from '../../src/services/offlineCache';
import type { ResearchOpportunity } from '../../src/types/intelligence';
import { formatPassportId } from '../../src/lib/format';
import { colors, radius, spacing, type } from '../../src/lib/theme';
import { evidenceStateHex } from '../../src/lib/evidenceMeta';

/**
 * Site Explorer — a port of the web's `SiteExplorerModal` as a page.
 *
 * The single most important rule: the AI interpretation, the community record
 * and the expert review are rendered as three visually and structurally
 * separate blocks. They are never merged into one "answer" and each carries
 * its own explanation of what it does and does not establish.
 */

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function EvidenceBadge({ state }: { state: EvidenceState }) {
  return (
    <View style={[styles.evidenceBadge, { borderColor: `${evidenceStateHex(state)}59`, backgroundColor: `${evidenceStateHex(state)}14` }]}>
      <Text style={[styles.evidenceBadgeText, { color: evidenceStateHex(state) }]}>
        {EVIDENCE_STATE_LABELS[state]}
      </Text>
    </View>
  );
}

export default function SiteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [payload, setPayload] = useState<SiteExplorerPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visitNote, setVisitNote] = useState('');
  const [visitStatus, setVisitStatus] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<ResearchOpportunity[]>([]);
  const [copiedUrl, setCopiedUrl] = useState(false);
  // True when the site on screen came from the on-device copy saved during a
  // previous online visit.
  const [fromCache, setFromCache] = useState(false);
  // The header sits below the phone's notch/status bar.
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFromCache(false);
    const cacheKey = offlineCacheKey.site(id);
    fetchSiteExplorer(id)
      .then((data) => {
        if (cancelled) return;
        // Keep a device copy so this site can be reopened offline later.
        void cacheJson(cacheKey, data);
        setPayload(data);
        return fetchResearchOpportunities(data.site.site_code ? { site: data.site.site_code } : {})
          .then((res) => {
            if (!cancelled) setOpportunities(res.items);
          })
          .catch(() => {
            if (!cancelled) setOpportunities([]);
          });
      })
      .catch((err: unknown) => {
        // Offline: fall back to the last saved copy of this site, if it was
        // opened here before.
        void readCachedJson<SiteExplorerPayload>(cacheKey).then((cached) => {
          if (cancelled) return;
          if (cached) {
            setPayload(cached);
            setFromCache(true);
            setOpportunities([]);
          } else {
            setError(err instanceof Error ? err.message : 'Could not load this site.');
          }
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleRecordVisit = async () => {
    if (!payload || !id) return;
    setVisitStatus(null);
    try {
      await recordVisit({ siteId: id, notes: visitNote.trim() || undefined });
      setVisitNote('');
      setVisitStatus('Visit recorded. Thank you.');
    } catch (err: unknown) {
      setVisitStatus(
        err instanceof Error ? err.message : 'The visit could not be recorded. Nothing was saved.'
      );
    }
  };

  const handleShareSite = async () => {
    if (!id) return;
    const base = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/api\/?$/, '') ?? '';
    await Clipboard.setStringAsync(`${base}/?view=sites&site=${encodeURIComponent(id)}`);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: spacing.md + insets.top }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={2}>
            {payload?.site.title ?? 'Loading site…'}
          </Text>
          {payload ? (
            <Text style={styles.headerSubtitle} numberOfLines={2}>
              {payload.site.site_code}
              {payload.site.district ? ` · ${payload.site.district}` : ''}
              {payload.site.sector ? ` · ${payload.site.sector}` : ''}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Pressable
            style={({ pressed }) => [
              styles.shareButton,
              copiedUrl && { borderColor: 'rgba(19,115,51,0.3)', backgroundColor: '#e6f4ea' },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => void handleShareSite()}
          >
            {copiedUrl ? <Check size={14} color="#137333" /> : <Share2 size={14} color="#3c4043" />}
            <Text style={[styles.shareButtonText, copiedUrl && { color: '#137333' }]}>
              {copiedUrl ? 'Copied' : 'Share'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel="Close site explorer"
            style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.7 }]}
          >
            <X size={20} color="#5e5e5e" />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#5e5e5e" />
            <Text style={styles.loadingText}>Loading site…</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBanner}>
            <AlertTriangle size={18} color="#d32f28" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {fromCache ? (
          <View style={styles.savedCopyBanner}>
            <AlertTriangle size={16} color="#8a6100" />
            <Text style={styles.savedCopyText}>
              Saved copy — shown offline. Live data returns when you reconnect.
            </Text>
          </View>
        ) : null}

        {payload && !loading ? (
          <View style={{ gap: spacing.xl }}>
            {/* Site description */}
            {payload.site.description ? (
              <Text style={styles.bodyText}>{payload.site.description}</Text>
            ) : null}

            {/* Why this grouping exists */}
            <View style={styles.groupingNote}>
              <Text style={styles.groupingText}>
                <Text style={{ fontWeight: '600', color: '#3c4043' }}>
                  How this site was formed:{' '}
                </Text>
                {payload.site.grouping_basis === 'admin_curated'
                  ? 'Grouped by the platform owner.'
                  : payload.site.grouping_basis === 'observation_cluster'
                    ? 'Grouped from observations recorded at this location.'
                    : 'Suggested by the community and not yet verified by an administrator.'}
              </Text>
            </View>

            {/* Block 1 — AI interpretation */}
            <View style={styles.block}>
              <View style={[styles.blockHeader, { backgroundColor: '#eef1f6' }]}>
                <Bot size={16} color="#3c4043" />
                <Text style={[styles.blockTitle, { color: '#1f1f1f' }]}>AI interpretation</Text>
                <View style={[styles.blockPill, { backgroundColor: '#e3e3e3' }]}>
                  <Text style={[styles.blockPillText, { color: '#3c4043' }]}>Automated</Text>
                </View>
              </View>
              <View style={styles.blockBody}>
                {payload.ai_interpretation ? (
                  <View style={{ gap: spacing.md }}>
                    <Text style={styles.explanationItalic}>
                      {EVIDENCE_STATE_EXPLANATIONS.ai_assisted}
                    </Text>
                    <View>
                      <Text style={styles.quietLabel}>Reading</Text>
                      <Text style={styles.readingValue}>
                        {payload.ai_interpretation.primary_classification}
                        {payload.ai_interpretation.possible_name
                          ? ` — ${payload.ai_interpretation.possible_name}`
                          : ''}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                      <View style={styles.confidenceChip}>
                        <Text style={styles.quietText}>
                          Confidence: {payload.ai_interpretation.confidence}
                        </Text>
                      </View>
                      {payload.ai_interpretation.observed_features.length > 0 ? (
                        <Text style={styles.quietText}>
                          Observed: {payload.ai_interpretation.observed_features.join(', ')}
                        </Text>
                      ) : null}
                    </View>
                    {payload.ai_interpretation.reasoning ? (
                      <Text style={styles.bodyText}>{payload.ai_interpretation.reasoning}</Text>
                    ) : null}
                    {payload.ai_interpretation.alternative_possibilities.length > 0 ? (
                      <View>
                        <Text style={styles.listHeading}>Other possibilities it could be</Text>
                        {payload.ai_interpretation.alternative_possibilities.map((alt, i) => (
                          <Text key={i} style={styles.listItem}>• {alt}</Text>
                        ))}
                      </View>
                    ) : null}
                    {payload.ai_interpretation.limitations.length > 0 ? (
                      <View>
                        <Text style={styles.listHeading}>Limitations</Text>
                        {payload.ai_interpretation.limitations.map((lim, i) => (
                          <Text key={i} style={styles.listItem}>• {lim}</Text>
                        ))}
                      </View>
                    ) : null}
                    <Text style={styles.tinyNote}>Model: {payload.ai_interpretation.ai_model}</Text>
                  </View>
                ) : (
                  <Text style={styles.bodyText}>
                    No AI interpretation is available for this site. Nothing is being shown because
                    no interpretation has been produced.
                  </Text>
                )}
              </View>
            </View>

            {/* Block 2 — Community record */}
            <View style={[styles.block, { borderColor: 'rgba(14,116,187,0.25)', backgroundColor: '#f4f8fe' }]}>
              <View style={[styles.blockHeader, { backgroundColor: '#e8f0fe', borderBottomColor: 'rgba(14,116,187,0.2)' }]}>
                <Users size={16} color="#0b57d0" />
                <Text style={[styles.blockTitle, { color: '#0b57d0' }]}>Community record</Text>
                <View style={[styles.blockPill, { backgroundColor: '#d3e3fd', borderColor: 'rgba(14,116,187,0.3)' }]}>
                  <Text style={[styles.blockPillText, { color: '#0b57d0' }]}>What people reported</Text>
                </View>
              </View>
              <View style={styles.blockBody}>
                <View style={{ gap: spacing.md }}>
                  <Text style={[styles.explanationItalic, { color: 'rgba(11,87,208,0.7)' }]}>
                    {EVIDENCE_STATE_EXPLANATIONS.community_investigated}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                    <Stat label="Investigations" value={payload.community.investigation_count} />
                    <Stat label="Questions" value={payload.community.question_count} />
                    <Stat label="Evidence items" value={payload.community.evidence_count} />
                    <Stat label="Visits" value={payload.community.visit_count} />
                  </View>
                  {payload.community.investigation_count === 0 &&
                  payload.community.evidence_count === 0 ? (
                    <Text style={styles.bodyText}>
                      The community has not investigated this site yet. This means no one has
                      contributed, not that the site has been checked and cleared.
                    </Text>
                  ) : (
                    <Text style={styles.bodyText}>
                      This is what contributors reported. It is not expert verification and not a
                      scientific determination.
                    </Text>
                  )}
                </View>
              </View>
            </View>

            {/* Block 3 — Expert review */}
            <View style={[styles.block, { borderColor: 'rgba(217,119,6,0.25)', backgroundColor: '#fef7e0' }]}>
              <View style={[styles.blockHeader, { backgroundColor: '#fef7e0', borderBottomColor: 'rgba(217,119,6,0.2)' }]}>
                <GraduationCap size={16} color="#9f6108" />
                <Text style={[styles.blockTitle, { color: '#9f6108' }]}>Expert review</Text>
                <View style={[styles.blockPill, { backgroundColor: '#fef7e0', borderColor: 'rgba(217,119,6,0.3)' }]}>
                  <Text style={[styles.blockPillText, { color: '#9f6108' }]}>Human determination</Text>
                </View>
              </View>
              <View style={styles.blockBody}>
                {payload.expert_review ? (
                  <View style={{ gap: spacing.md }}>
                    <Text style={[styles.explanationItalic, { color: 'rgba(159,97,8,0.7)' }]}>
                      {payload.expert_review.evidence_basis
                        ? 'Reviewed against the basis shown below.'
                        : EVIDENCE_STATE_EXPLANATIONS.expert_reviewed}
                    </Text>
                    <View style={styles.factRow}>
                      <Text style={styles.quietText}>Reviewed by</Text>
                      <Text style={styles.factValue}>{payload.expert_review.reviewer_label}</Text>
                    </View>
                    {!payload.expert_review.identity_published ? (
                      <Text style={styles.tinyNote}>
                        The reviewer's identity has not been published, so only the fact that a
                        review exists is shown.
                      </Text>
                    ) : null}
                    {payload.expert_review.expert_rock_name ? (
                      <View style={styles.factRow}>
                        <Text style={styles.quietText}>Expert reading</Text>
                        <Text style={styles.factValue}>{payload.expert_review.expert_rock_name}</Text>
                      </View>
                    ) : null}
                    {payload.expert_review.expert_classification ? (
                      <View style={styles.factRow}>
                        <Text style={styles.quietText}>Classification</Text>
                        <Text style={[styles.factValue, { textTransform: 'capitalize' }]}>
                          {payload.expert_review.expert_classification}
                        </Text>
                      </View>
                    ) : null}
                    {payload.expert_review.evidence_basis ? (
                      <View>
                        <Text style={styles.listHeading}>Basis for the determination</Text>
                        <Text style={styles.bodyText}>{payload.expert_review.evidence_basis}</Text>
                      </View>
                    ) : null}
                    {payload.expert_review.scientific_remarks ? (
                      <View>
                        <Text style={styles.listHeading}>Scientific remarks</Text>
                        <Text style={styles.bodyText}>{payload.expert_review.scientific_remarks}</Text>
                      </View>
                    ) : null}
                    {payload.expert_review.review_date ? (
                      <Text style={styles.tinyNote}>
                        Reviewed: {payload.expert_review.review_date}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={styles.bodyText}>
                    <Text style={{ color: '#5e5e5e' }}>No expert has reviewed this site. </Text>
                    Nothing here has been checked by a human expert.
                  </Text>
                )}
              </View>
            </View>

            {/* Separation statement */}
            <View style={styles.separationNote}>
              <Text style={styles.separationText}>
                <Text style={{ fontWeight: '600', color: '#1f1f1f' }}>
                  These three are different kinds of statement.{' '}
                </Text>
                An automated reading, a report from a member of the public, and a human expert
                determination do not carry the same weight. Community agreement is not scientific
                confirmation. Where they disagree, this site is shown as unresolved rather than
                resolved.
              </Text>
            </View>

            {/* Observations at this site */}
            {payload.observations.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={styles.sectionTitle}>
                  Observations at this site ({payload.observations.length})
                </Text>
                {payload.observations.map((obs) => (
                  <Pressable
                    key={obs.passport_id}
                    style={({ pressed }) => [styles.obsRow, pressed && { opacity: 0.8 }]}
                    onPress={() =>
                      router.push({ pathname: '/passport/[id]', params: { id: obs.passport_id } })
                    }
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.obsTitle} numberOfLines={1}>
                        {categoryLabel(obs.observation_category)}
                        {obs.possible_name ? ` — ${obs.possible_name}` : ''}
                      </Text>
                      {obs.observation_category !== 'rock' && obs.classification ? (
                        <Text style={[styles.quietText, { textTransform: 'capitalize' }]}>
                          Legacy rock classification: {obs.classification}
                        </Text>
                      ) : null}
                      <Text style={styles.obsId} numberOfLines={1}>
                        {formatPassportId(obs.passport_id)}
                      </Text>
                    </View>
                    <EvidenceBadge state={obs.evidence_state} />
                  </Pressable>
                ))}
              </View>
            ) : null}

            {/* Activity */}
            {payload.timeline.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={styles.sectionTitle}>Activity</Text>
                {payload.timeline.slice(0, 25).map((entry, i) => (
                  <View key={`${entry.ref_id}-${i}`} style={styles.timelineRow}>
                    <Clock size={14} color="#8f8f8f" />
                    <Text style={styles.timelineDate}>
                      {new Date(entry.event_at).toLocaleDateString()}
                    </Text>
                    <Text style={styles.timelineSummary}>{entry.summary}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Nearby observations */}
            {payload.nearby.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={styles.sectionTitle}>Nearby observations</Text>
                <Text style={styles.tinyNote}>
                  Proximity only. Being close together does not mean two observations belong to the
                  same site.
                </Text>
                {payload.nearby.slice(0, 8).map((obs) => (
                  <Pressable
                    key={obs.passport_id}
                    style={({ pressed }) => [styles.nearbyRow, pressed && { opacity: 0.8 }]}
                    onPress={() =>
                      router.push({ pathname: '/passport/[id]', params: { id: obs.passport_id } })
                    }
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.nearbyTitle}>{categoryLabel(obs.observation_category)}</Text>
                      <Text style={styles.obsId} numberOfLines={1}>
                        {formatPassportId(obs.passport_id)}
                      </Text>
                    </View>
                    <Text style={styles.quietText}>{obs.distance_km} km away</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {/* Research opportunities */}
            <View style={[styles.block, { borderColor: 'rgba(139,92,246,0.25)', backgroundColor: '#f7f5ff' }]}>
              <View style={[styles.blockHeader, { backgroundColor: '#eef0ff', borderBottomColor: 'rgba(139,92,246,0.2)' }]}>
                <FlaskConical size={16} color="#5b21b6" />
                <Text style={[styles.blockTitle, { color: '#4c1d95' }]}>Research opportunities</Text>
                <View style={[styles.blockPill, { backgroundColor: '#e4e4ff', borderColor: 'rgba(139,92,246,0.3)' }]}>
                  <Text style={[styles.blockPillText, { color: '#5b21b6' }]}>Open questions</Text>
                </View>
              </View>
              <View style={styles.blockBody}>
                {opportunities.length === 0 ? (
                  <Text style={styles.bodyText}>
                    No research opportunities have been raised for this site yet. Nothing is shown
                    because no one has flagged anything — not because the geology has been cleared.
                  </Text>
                ) : (
                  <View style={{ gap: spacing.md }}>
                    {opportunities.slice(0, 5).map((opportunity) => (
                      <View key={opportunity.opportunity_id} style={styles.opportunityCard}>
                        <Text style={styles.opportunityQuestion}>{opportunity.question}</Text>
                        {opportunity.summary ? (
                          <Text style={styles.quietText}>{opportunity.summary}</Text>
                        ) : null}
                        <Text style={[styles.tinyNote, { marginTop: spacing.sm }]}>
                          {opportunity.disclaimer}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* Record a visit */}
            <View style={styles.visitSection}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 }}>
                <MapPin size={16} color="#2b7f3f" />
                <Text style={styles.sectionTitle}>Record a visit</Text>
              </View>
              <Text style={[styles.tinyNote, { marginBottom: spacing.md }]}>
                Your phone number is never stored. You appear only as a handle such as "Field
                Explorer #A82F".
              </Text>
              <TextInput
                style={styles.visitInput}
                value={visitNote}
                onChangeText={setVisitNote}
                placeholder="What did you see? (optional)"
                placeholderTextColor="#8f8f8f"
                maxLength={2000}
                multiline
              />
              <Pressable style={({ pressed }) => [styles.visitButton, pressed && { opacity: 0.85 }]} onPress={() => void handleRecordVisit()}>
                <Text style={styles.visitButtonText}>Record visit</Text>
              </Pressable>
              {visitStatus ? <Text style={[styles.tinyNote, { marginTop: spacing.sm }]}>{visitStatus}</Text> : null}
            </View>

            {/* Empty-state honesty */}
            {payload.observations.length === 0 ? (
              <View style={styles.emptyHonesty}>
                <Text style={styles.emptyHonestyText}>
                  This site has no observations recorded against it. The site entry exists, but
                  there is nothing behind it yet.
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.surface,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f1f1f',
    lineHeight: 24,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#5e5e5e',
    marginTop: 2,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  shareButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3c4043',
  },
  closeButton: {
    padding: 6,
    borderRadius: radius.sm,
  },
  body: {
    padding: spacing.xl,
    gap: spacing.xl,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 48,
  },
  loadingText: {
    fontSize: 14,
    color: '#5e5e5e',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#ffdad8',
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.3)',
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#d32f28',
    lineHeight: 19,
  },
  savedCopyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: 'rgba(180,130,10,0.35)',
  },
  savedCopyText: {
    flex: 1,
    fontSize: 13,
    color: '#8a6100',
    lineHeight: 18,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#3c4043',
  },
  groupingNote: {
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: '#f0f4f9',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  groupingText: {
    fontSize: 12,
    lineHeight: 17,
    color: '#5e5e5e',
  },
  block: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.outline,
  },
  blockTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  blockPill: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  blockPillText: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  blockBody: {
    padding: 16,
    gap: spacing.md,
  },
  explanationItalic: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#5e5e5e',
  },
  quietLabel: {
    fontSize: 12,
    color: '#5e5e5e',
  },
  readingValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f1f1f',
    textTransform: 'capitalize',
    marginTop: 2,
  },
  confidenceChip: {
    borderRadius: radius.sm,
    backgroundColor: '#eef1f6',
    borderWidth: 1,
    borderColor: colors.outline,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  quietText: {
    fontSize: 12,
    color: '#5e5e5e',
  },
  listHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5e5e5e',
    marginBottom: 4,
  },
  listItem: {
    fontSize: 14,
    color: '#3c4043',
    lineHeight: 20,
    marginBottom: 2,
  },
  tinyNote: {
    fontSize: 11,
    color: '#8f8f8f',
    lineHeight: 15,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  factValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f1f1f',
    textAlign: 'right',
  },
  statCell: {
    flexGrow: 1,
    minWidth: 140,
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: '#f0f4f9',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f1f1f',
  },
  statLabel: {
    fontSize: 11,
    color: '#5e5e5e',
  },
  separationNote: {
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: '#f8fafd',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  separationText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#3c4043',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f1f1f',
  },
  obsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: '#f0f4f9',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  obsTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  obsId: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#8f8f8f',
    marginTop: 2,
  },
  evidenceBadge: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.surface,
  },
  evidenceBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  timelineDate: {
    fontSize: 12,
    color: '#5e5e5e',
    width: 84,
  },
  timelineSummary: {
    flex: 1,
    fontSize: 14,
    color: '#3c4043',
    lineHeight: 19,
  },
  nearbyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: '#f0f4f9',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  nearbyTitle: {
    fontSize: 14,
    color: '#1f1f1f',
  },
  opportunityCard: {
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
  },
  opportunityQuestion: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f1f1f',
    lineHeight: 19,
  },
  visitSection: {
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: '#f0f4f9',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  visitInput: {
    minHeight: 40,
    borderRadius: radius.sm,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.outline,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1f1f1f',
    marginBottom: spacing.sm,
  },
  visitButton: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    backgroundColor: '#2b7f3f',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  visitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  emptyHonesty: {
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: '#fef7e0',
    borderWidth: 1,
    borderColor: 'rgba(217,119,6,0.3)',
  },
  emptyHonestyText: {
    fontSize: 14,
    color: '#9f6108',
    lineHeight: 19,
  },
});
