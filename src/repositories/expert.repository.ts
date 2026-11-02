import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { redactContributorHash } from '../utils/contributor.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { ServiceUnavailableError } from '../utils/service-error.js';
import { dataQualityService } from '../services/data-quality.service.js';
import type {
  ExpertObservationSummary,
  ExpertObservationDetail,
  ExpertVerificationRecord,
  VerificationAuditLogRecord,
  ExpertReviewInput,
  ExpertFilterOptions,
  ExpertReviewStats,
  AuditAction,
} from '../types/expert.types.js';
import type { VerificationStatus, PublicationStatus } from '../types/database.types.js';
import type { RockClassification, RockConfidence } from '../ai/geological.types.js';

export interface InMemoryObservationStore {
  id: string;
  passport_id: string;
  source: string;
  source_user_hash: string;
  status: string;
  is_rock: boolean;
  /**
   * Category decided before interpretation. `rock` for the historical records.
   *
   * Optional because the store predates the taxonomy, and a record ingested
   * before migration 013 has no category column value. A review screen that
   * assumed this was always present would show an empty category for exactly the
   * oldest records, which are the ones most likely to be in the review queue.
   */
  observation_category?: string;
  observation_subcategory?: string;
  primary_classification: RockClassification;
  possible_name: string | null;
  confidence: RockConfidence;
  confidence_score: number;
  observed_features: string[];
  reasoning: string;
  alternative_possibilities: string[];
  limitations: string[];
  recommended_next_steps: string[];
  safety_note: string;
  /** How far this reading has been checked. Separate from verification_status. */
  evidence_state?: string;
  verification_status: VerificationStatus;
  publication_status: PublicationStatus;
  published_at: string | null;
  public_visibility_reason: string | null;
  district: string | null;
  media_type?: string;
  mime_type?: string;
  sector: string | null;
  cell: string | null;
  village: string | null;
  public_location_precision: 'private' | 'district' | 'approximate' | 'exact';
  latitude: number | null;
  longitude: number | null;
  ai_model: string;
  ai_prompt_version: string;
  analysis_version: string;
  created_at: string;
  updated_at: string;
  media_id: string;
  is_demo?: boolean;
}

export class ExpertRepository {
  /**
   * In-memory review queue.
   *
   * Intentionally EMPTY. This repository previously seeded itself with invented
   * observations — fabricated passport IDs, invented GPS coordinates, invented
   * rock names and invented citations to real geological survey sheets. Those
   * records were indistinguishable from genuine submissions once they reached
   * the review dashboard, so the seed was removed rather than re-labelled.
   *
   * Rows are only ever populated from a real database read or a record written
   * during this process's lifetime.
   */
  private inMemoryObservations: InMemoryObservationStore[] = [];
  private inMemoryVerifications: Map<string, ExpertVerificationRecord[]> = new Map();
  private inMemoryAuditLogs: VerificationAuditLogRecord[] = [];

  /**
   * Registers an observation into the in-process review queue.
   *
   * This is a write path, not a fixture hook: an observation that reaches the
   * dashboard without a configured database has to live somewhere, and this is
   * that somewhere. It performs no validation or invention of its own — the
   * caller supplies every field.
   *
   * Duplicate passport IDs are rejected so a caller cannot silently shadow an
   * existing record.
   */
  registerObservation(observation: InMemoryObservationStore): void {
    if (this.inMemoryObservations.some((o) => o.passport_id === observation.passport_id)) {
      throw new Error(`Observation '${observation.passport_id}' is already registered.`);
    }
    this.inMemoryObservations.push(observation);
  }

  /**
   * Lists observations for expert review according to filter parameters.
   */
  async findObservationsForReview(
    filters: ExpertFilterOptions
  ): Promise<{ data: ExpertObservationSummary[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 25));

    // When a database is configured it is the only source of truth. A failed
    // query must surface as an outage, not fall through to the process-local
    // store: in production that store is empty, so falling back would answer a
    // database outage with "no observations to review" — a clean/empty state the
    // reviewer would read as fact. The in-memory fallback below is reached only
    // when no database is configured at all (development/demo).
    if (isDatabaseConfigured()) {
      try {
        let query = (supabase.from('observations') as any)
          .select('*, observation_locations(district), observation_media(id)', { count: 'exact' })
          .eq('is_demo', false);

        if (filters.status && filters.status !== 'all') {
          query = query.eq('verification_status', filters.status);
        }
        if (filters.classification) {
          query = query.eq('primary_classification', filters.classification);
        }
        if (filters.search) {
          query = query.ilike('passport_id', `%${filters.search.trim()}%`);
        }

        query = query.order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1);

        const { data, count, error } = await query;
        if (error) throw new Error(error.message);
        if (!Array.isArray(data)) throw new Error('observation review query returned no data array');

        let rows = data as any[];
        if (filters.district) {
          const wantedDistrict = filters.district.toLowerCase();
          rows = rows.filter((r) => {
            const loc = Array.isArray(r.observation_locations) ? r.observation_locations[0] : r.observation_locations;
            return loc?.district && String(loc.district).toLowerCase() === wantedDistrict;
          });
        }

        const obsIds = rows.map((r) => r.id).filter(Boolean);
        const latestVerifByObsId = new Map<string, any>();
        if (obsIds.length > 0) {
          const { data: verifRows, error: verifErr } = await (supabase.from('expert_verifications') as any)
            .select('observation_id, expert_rock_name, reviewer_name, identity_published, created_at')
            .in('observation_id', obsIds)
            .order('created_at', { ascending: false });
          if (verifErr) throw new Error(verifErr.message);
          for (const v of (verifRows ?? []) as any[]) {
            if (!latestVerifByObsId.has(v.observation_id)) {
              latestVerifByObsId.set(v.observation_id, v);
            }
          }
        }

        const mapped: ExpertObservationSummary[] = rows.map((row) => {
          const loc = Array.isArray(row.observation_locations) ? row.observation_locations[0] : row.observation_locations;
          const mediaList = Array.isArray(row.observation_media) ? row.observation_media : [];
          const latestVerif = latestVerifByObsId.get(row.id) ?? null;
          return {
            id: row.id,
            passport_id: row.passport_id,
            created_at: row.created_at,
            district: loc?.district || null,
            ai_classification: row.primary_classification,
            ai_possible_name: row.possible_name,
            ai_confidence: row.confidence,
            ai_confidence_score: row.confidence_score,
            verification_status: row.verification_status,
            publication_status: row.publication_status,
            expert_rock_name: latestVerif?.expert_rock_name || null,
            reviewer_name: latestVerif?.reviewer_name || null,
            has_media: mediaList.length > 0,
          };
        });
        return { data: mapped, total: filters.district ? mapped.length : count ?? mapped.length, page, limit };
      } catch (err) {
        logger.error('Database read failed in findObservationsForReview; refusing to fall back to process memory', {
          error: String(err),
        });
        throw new ServiceUnavailableError('expert observation review list', err);
      }
    }

    // In-memory filter implementation (no database configured)
    let filtered = this.inMemoryObservations.filter((o) => !o.is_demo);

    if (filters.status && filters.status !== 'all') {
      filtered = filtered.filter((o) => o.verification_status === filters.status);
    }
    if (filters.classification) {
      filtered = filtered.filter((o) => o.primary_classification === filters.classification);
    }
    if (filters.district) {
      const dist = filters.district.toLowerCase();
      filtered = filtered.filter((o) => o.district && o.district.toLowerCase() === dist);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase().trim();
      filtered = filtered.filter(
        (o) =>
          o.passport_id.toLowerCase().includes(q) ||
          (o.possible_name && o.possible_name.toLowerCase().includes(q)) ||
          (o.district && o.district.toLowerCase().includes(q))
      );
    }

    // Sort newest first
    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    const summaries: ExpertObservationSummary[] = paginated.map((obs) => {
      const verifs = this.inMemoryVerifications.get(obs.passport_id) || [];
      const latest = verifs[0] || null;

      return {
        id: obs.id,
        passport_id: obs.passport_id,
        created_at: obs.created_at,
        district: obs.district,
        ai_classification: obs.primary_classification,
        ai_possible_name: obs.possible_name,
        ai_confidence: obs.confidence,
        ai_confidence_score: obs.confidence_score,
        verification_status: obs.verification_status,
        publication_status: obs.publication_status,
        data_quality_score: dataQualityService.assessObservationQuality(
          this.mapToDetail(obs, verifs, [])
        ).overall_score,
        expert_rock_name: latest?.expert_rock_name || null,
        reviewer_name: latest?.reviewer_name || null,
        has_media: Boolean(obs.media_id),
      };
    });

    return { data: summaries, total, page, limit };
  }

  /**
   * Maps a stored row to the public review-detail shape.
   *
   * The AI block is copied verbatim and is never modified by a review decision;
   * the review findings live alongside it. `data_quality` is attached by the
   * caller because assessing it requires the already-assembled detail object.
   */
  private mapToDetail(
    obs: InMemoryObservationStore,
    verifs: ExpertVerificationRecord[],
    auditLogs: VerificationAuditLogRecord[]
  ): Omit<ExpertObservationDetail, 'data_quality'> {
    const latest = verifs[0] || null;

    return {
      id: obs.id,
      passport_id: obs.passport_id,
      source: obs.source,
      source_contributor_hash: redactContributorHash(obs.source_user_hash),
      status: obs.status,
      created_at: obs.created_at,
      updated_at: obs.updated_at,

      // Immutable AI Record (Never altered by review)
ai_analysis: {
  is_rock: obs.is_rock,
  // Falls back to `rock` only because the legacy path is `is_rock: true`. A
  // record with no category and `is_rock: false` was never a rock, so it is not
  // promoted to one here.
  observation_category: obs.observation_category ?? (obs.is_rock ? 'rock' : 'unknown'),
  observation_subcategory: obs.observation_subcategory ?? 'unknown',
  primary_classification: obs.primary_classification,
        possible_name: obs.possible_name,
        confidence: obs.confidence,
        confidence_score: obs.confidence_score,
        observed_features: obs.observed_features,
        reasoning: obs.reasoning,
        alternative_possibilities: obs.alternative_possibilities,
        limitations: obs.limitations,
        recommended_next_steps: obs.recommended_next_steps,
        safety_note: obs.safety_note,
        ai_model: obs.ai_model,
        ai_prompt_version: obs.ai_prompt_version,
        analysis_version: obs.analysis_version,
      },

      location: {
        district: obs.district,
        sector: obs.sector,
        cell: obs.cell,
        village: obs.village,
        precision: obs.public_location_precision,
        latitude: obs.latitude,
        longitude: obs.longitude,
        is_public: obs.publication_status === 'public',
      },

media: {
  id: obs.media_id,
  // Carried from the record rather than assumed. Hardcoding `image` /
  // `image/jpeg` would describe every video submission as a JPEG to a reviewer
  // deciding whether it is legible.
  media_type: obs.media_type ?? 'image',
  mime_type: obs.mime_type ?? 'image/jpeg',
  secure_url: `/api/expert/media/${obs.passport_id}`,
  created_at: obs.created_at,
},

verification_status: obs.verification_status,
    publication_status: obs.publication_status,
    published_at: obs.published_at,
    public_visibility_reason: obs.public_visibility_reason,
    evidence_state: obs.evidence_state ?? 'insufficient_evidence',

    latest_verification: latest,
      verifications_history: verifs,
      audit_logs: auditLogs,
    };
  }

  private rowToStore(row: any, loc: any, media: any): InMemoryObservationStore {
    return {
      id: row.id,
      passport_id: row.passport_id,
      source: row.source ?? 'web',
      source_user_hash: row.source_user_hash ?? '',
      status: row.status ?? 'completed',
      is_rock: Boolean(row.is_rock),
      observation_category: row.observation_category ?? undefined,
      observation_subcategory: row.observation_subcategory ?? undefined,
      primary_classification: row.primary_classification,
      possible_name: row.possible_name ?? null,
      confidence: row.confidence,
      confidence_score: Number(row.confidence_score ?? 0),
      observed_features: Array.isArray(row.observed_features) ? row.observed_features : [],
      reasoning: row.reasoning ?? '',
      alternative_possibilities: Array.isArray(row.alternative_possibilities) ? row.alternative_possibilities : [],
      limitations: Array.isArray(row.limitations) ? row.limitations : [],
      recommended_next_steps: Array.isArray(row.recommended_next_steps) ? row.recommended_next_steps : [],
      safety_note: row.safety_note ?? '',
      evidence_state: row.evidence_state ?? 'ai_assisted',
      verification_status: row.verification_status ?? 'unverified',
      publication_status: row.publication_status ?? 'private',
      published_at: row.published_at ?? null,
      public_visibility_reason: row.public_visibility_reason ?? null,
      district: loc?.district ?? null,
      media_type: media?.media_type ?? 'image',
      mime_type: media?.mime_type ?? 'image/jpeg',
      sector: loc?.sector ?? null,
      cell: loc?.cell ?? null,
      village: loc?.village ?? null,
      public_location_precision: loc?.public_location_precision ?? 'district',
      latitude: typeof loc?.latitude === 'number' ? loc.latitude : null,
      longitude: typeof loc?.longitude === 'number' ? loc.longitude : null,
      ai_model: row.ai_model ?? 'unknown',
      ai_prompt_version: row.ai_prompt_version ?? 'unknown',
      analysis_version: row.analysis_version ?? '1.0',
      created_at: row.created_at,
      updated_at: row.updated_at ?? row.created_at,
      media_id: media?.id ?? '',
      is_demo: Boolean(row.is_demo),
    };
  }

  /**
   * Retrieves single observation details for expert review, strictly preserving
   * the immutable AI preliminary assessment side-by-side with expert findings.
   */
  async getObservationForExpert(passportId: string): Promise<ExpertObservationDetail | null> {
    const cleanId = passportId.trim().toUpperCase();

    if (isDatabaseConfigured()) {
      try {
        const { data: row, error: obsErr } = await (supabase.from('observations') as any)
          .select('*')
          .ilike('passport_id', cleanId)
          .eq('is_demo', false)
          .maybeSingle();
        if (obsErr) throw new Error(obsErr.message);
        if (!row) return null;

        const [locRes, mediaRes, verifRes, auditRes] = await Promise.all([
          (supabase.from('observation_locations') as any)
            .select('*')
            .eq('observation_id', row.id)
            .maybeSingle(),
          (supabase.from('observation_media') as any)
            .select('id, media_type, mime_type, created_at, sort_order')
            .eq('observation_id', row.id)
            .order('sort_order', { ascending: true })
            .limit(1),
          (supabase.from('expert_verifications') as any)
            .select('*')
            .eq('observation_id', row.id)
            .order('created_at', { ascending: false }),
          (supabase.from('verification_audit_logs') as any)
            .select('*')
            .eq('observation_id', row.id)
            .order('created_at', { ascending: false }),
        ]);

        if (locRes.error) throw new Error(locRes.error.message);
        if (mediaRes.error) throw new Error(mediaRes.error.message);
        if (verifRes.error) throw new Error(verifRes.error.message);
        if (auditRes.error) throw new Error(auditRes.error.message);

        const primaryMedia = Array.isArray(mediaRes.data) && mediaRes.data.length > 0 ? mediaRes.data[0] : null;
        const obsStore = this.rowToStore(row, locRes.data ?? null, primaryMedia);
        const verifs: ExpertVerificationRecord[] = ((verifRes.data ?? []) as any[]).map((v) => ({
          id: v.id,
          observation_id: v.observation_id,
          passport_id: row.passport_id,
          reviewer_id: v.reviewer_id,
          reviewer_name: v.reviewer_name,
          reviewer_role: v.reviewer_role,
          reviewer_organization: v.reviewer_organization,
          status: v.status,
          expert_classification: v.expert_classification ?? null,
          expert_rock_name: v.expert_rock_name ?? null,
          expert_confidence: v.expert_confidence ?? null,
          expert_observed_features: Array.isArray(v.expert_observed_features) ? v.expert_observed_features : [],
          expert_notes: v.expert_notes ?? null,
          scientific_remarks: v.scientific_remarks ?? null,
          created_at: v.created_at,
          updated_at: v.updated_at ?? v.created_at,
        }));
        const auditLogs: VerificationAuditLogRecord[] = ((auditRes.data ?? []) as any[]).map((a) => ({
          id: a.id,
          observation_id: a.observation_id,
          passport_id: a.passport_id ?? row.passport_id,
          reviewer_id: a.reviewer_id,
          reviewer_name: a.reviewer_name,
          action: a.action,
          previous_status: a.previous_status,
          new_status: a.new_status,
          notes: a.notes ?? null,
          metadata: a.metadata ?? {},
          created_at: a.created_at,
        }));

        const baseDetail = this.mapToDetail(obsStore, verifs, auditLogs);
        if (primaryMedia?.id && baseDetail.media) {
          baseDetail.media.secure_url = `/api/posts/${row.passport_id}/media/${primaryMedia.id}`;
        }
        return {
          ...baseDetail,
          data_quality: dataQualityService.assessObservationQuality(baseDetail),
        };
      } catch (err) {
        logger.error('Database read failed in getObservationForExpert; refusing to fall back to process memory', {
          passportId: cleanId,
          error: String(err),
        });
        throw new ServiceUnavailableError('expert observation detail', err);
      }
    }

    // Check in-memory store (development/hermetic tests only)
    const obs = this.inMemoryObservations.find((o) => o.passport_id === cleanId && !o.is_demo);
    if (!obs) {
      return null;
    }

    const verifs = this.inMemoryVerifications.get(obs.passport_id) || [];
    const auditLogs = this.inMemoryAuditLogs.filter((l) => l.passport_id === obs.passport_id);
    const baseDetail = this.mapToDetail(obs, verifs, auditLogs);

    return {
      ...baseDetail,
      data_quality: dataQualityService.assessObservationQuality(baseDetail),
    };
  }

  /**
   * Applies an authoritative expert verification decision without modifying
   * the underlying immutable AI assessment.
   */
  async submitVerification(
    passportId: string,
    reviewer: { id: string; name: string; role: 'expert' | 'lead_geologist' | 'admin'; organization: string },
    input: ExpertReviewInput,
    identityPublished = false
  ): Promise<{
    success: boolean;
    verification: ExpertVerificationRecord;
    auditLog: VerificationAuditLogRecord;
    updatedObservation: ExpertObservationDetail;
  }> {
    const cleanId = passportId.trim().toUpperCase();
    const newStatus = input.verification_status;
    let action: AuditAction = 'status_changed';
    if (newStatus === 'expert_verified') action = 'verified';
    else if (newStatus === 'rejected') action = 'rejected';
    else if (newStatus === 'under_review') action = 'assigned_review';

    if (isDatabaseConfigured()) {
      try {
        const { data: rpcResult, error: rpcErr } = await (supabase as any).rpc(
          'submit_expert_verification_transactional',
          {
            p_passport_id: cleanId,
            p_reviewer_id: reviewer.id,
            p_reviewer_name: reviewer.name,
            p_reviewer_role: reviewer.role,
            p_reviewer_organization: reviewer.organization,
            p_identity_published: identityPublished,
            p_new_status: newStatus,
            p_action: action,
            p_expert_classification: input.expert_classification || null,
            p_expert_rock_name: input.expert_rock_name?.trim() || null,
            p_expert_confidence: input.expert_confidence || null,
            p_expert_observed_features: input.expert_observed_features || [],
            p_expert_notes: input.expert_notes?.trim() || null,
            p_scientific_remarks: input.scientific_remarks?.trim() || null,
            p_publication_status: input.publication_status ?? null,
            p_public_visibility_reason:
              input.public_visibility_reason !== undefined ? input.public_visibility_reason : null,
          }
        );

        if (rpcErr || !rpcResult) {
          const msg = rpcErr?.message ?? 'No payload returned from submit_expert_verification_transactional';
          if (/not found/i.test(msg)) {
            throw new Error(`Observation with passport ID '${passportId}' not found.`);
          }
          throw new ServiceUnavailableError('expert verification transactional write', rpcErr ?? new Error(msg));
        }

        const obsRow = rpcResult.observation;
        const verifRow = rpcResult.verification;
        const auditRow = rpcResult.audit_log;

        const updatedDetail = await this.getObservationForExpert(obsRow.passport_id);
        if (!updatedDetail) {
          throw new ServiceUnavailableError(
            'expert verification post-commit read',
            new Error('Verified observation could not be reloaded from database')
          );
        }

        const verificationRecord: ExpertVerificationRecord = {
          id: verifRow.id,
          observation_id: obsRow.id,
          passport_id: obsRow.passport_id,
          reviewer_id: reviewer.id,
          reviewer_name: reviewer.name,
          reviewer_role: reviewer.role,
          reviewer_organization: reviewer.organization,
          status: newStatus,
          expert_classification: verifRow.expert_classification ?? null,
          expert_rock_name: verifRow.expert_rock_name ?? null,
          expert_confidence: verifRow.expert_confidence ?? null,
          expert_observed_features: Array.isArray(verifRow.expert_observed_features)
            ? verifRow.expert_observed_features
            : [],
          expert_notes: verifRow.expert_notes ?? null,
          scientific_remarks: verifRow.scientific_remarks ?? null,
          created_at: verifRow.created_at,
          updated_at: verifRow.updated_at ?? verifRow.created_at,
        };

        const auditLog: VerificationAuditLogRecord = {
          id: auditRow.id,
          observation_id: obsRow.id,
          passport_id: obsRow.passport_id,
          reviewer_id: reviewer.id,
          reviewer_name: reviewer.name,
          action,
          previous_status: auditRow.previous_status,
          new_status: newStatus,
          notes: auditRow.notes,
          metadata: auditRow.metadata ?? {},
          created_at: auditRow.created_at,
        };

        return {
          success: true,
          verification: verificationRecord,
          auditLog,
          updatedObservation: updatedDetail,
        };
      } catch (err) {
        if (err instanceof ServiceUnavailableError) throw err;
        if (err instanceof Error && /not found/i.test(err.message)) throw err;
        logger.error('Database write failed in submitVerification; refusing to report fake success', {
          passportId: cleanId,
          error: String(err),
        });
        throw new ServiceUnavailableError('expert verification write', err);
      }
    }

    const obs = this.inMemoryObservations.find((o) => o.passport_id === cleanId && !o.is_demo);

    if (!obs) {
      throw new Error(`Observation with passport ID '${passportId}' not found.`);
    }

    const previousStatus = obs.verification_status;

    // Update observation metadata (in-memory dev/test mode only)
    obs.verification_status = newStatus;
    if (newStatus === 'expert_verified') {
      if (obs.evidence_state !== 'scientifically_confirmed') {
        obs.evidence_state = 'expert_reviewed';
      }
    } else if (newStatus === 'rejected') {
      obs.evidence_state = 'rejected';
    }
    obs.updated_at = new Date().toISOString();

    if (input.publication_status) {
      obs.publication_status = input.publication_status;
      if (input.publication_status === 'public' && !obs.published_at) {
        obs.published_at = new Date().toISOString();
      }
    }
    if (input.public_visibility_reason) {
      obs.public_visibility_reason = input.public_visibility_reason;
    }

    // Create verification record
    const verificationRecord: ExpertVerificationRecord = {
      id: `ver-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      observation_id: obs.id,
      passport_id: obs.passport_id,
      reviewer_id: reviewer.id,
      reviewer_name: reviewer.name,
      reviewer_role: reviewer.role,
      reviewer_organization: reviewer.organization,
      status: newStatus,
      expert_classification: input.expert_classification || null,
      expert_rock_name: input.expert_rock_name?.trim() || null,
      expert_confidence: input.expert_confidence || null,
      expert_observed_features: input.expert_observed_features || [],
      expert_notes: input.expert_notes?.trim() || null,
      scientific_remarks: input.scientific_remarks?.trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const existingVerifs = (this.inMemoryVerifications.get(obs.passport_id) || []).map((v) => ({
      ...v,
      updated_at: new Date().toISOString(),
    }));
    this.inMemoryVerifications.set(obs.passport_id, [verificationRecord, ...existingVerifs]);

    const auditLog: VerificationAuditLogRecord = {
      id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      observation_id: obs.id,
      passport_id: obs.passport_id,
      reviewer_id: reviewer.id,
      reviewer_name: reviewer.name,
      action,
      previous_status: previousStatus,
      new_status: newStatus,
      notes: input.expert_notes || input.scientific_remarks || `Observation status changed to ${newStatus}`,
      metadata: {
        expert_classification: input.expert_classification,
        expert_rock_name: input.expert_rock_name,
        publication_status: obs.publication_status,
      },
      created_at: new Date().toISOString(),
    };

    this.inMemoryAuditLogs.unshift(auditLog);

    const updatedDetail = (await this.getObservationForExpert(obs.passport_id))!;
    return {
      success: true,
      verification: verificationRecord,
      auditLog,
      updatedObservation: updatedDetail,
    };
  }

  /**
   * Aggregates verification statistics across real (non-demo) observations only.
   */
  async getReviewStats(): Promise<ExpertReviewStats> {
    let rows: Array<{ verification_status: string; primary_classification: string }>;

    if (isDatabaseConfigured()) {
      try {
        const { data, error } = await (supabase.from('observations') as any)
          .select('verification_status, primary_classification')
          .eq('is_demo', false);
        if (error) throw new Error(error.message);
        if (!Array.isArray(data)) throw new Error('observation stats query returned non-array');
        rows = data as Array<{ verification_status: string; primary_classification: string }>;
      } catch (err) {
        logger.error('Database read failed in getReviewStats; refusing to fall back to process memory', {
          error: String(err),
        });
        throw new ServiceUnavailableError('expert review statistics', err);
      }
    } else {
      rows = this.inMemoryObservations.filter((o) => !o.is_demo);
    }

    const total = rows.length;
    let awaitingReview = 0;
    let underReview = 0;
    let verified = 0;
    let rejected = 0;

    const classificationBreakdown: Record<string, number> = {};
    const verifiedBreakdown: Record<string, number> = {};

    for (const obs of rows) {
      if (obs.verification_status === 'unverified') awaitingReview += 1;
      else if (obs.verification_status === 'under_review') underReview += 1;
      else if (obs.verification_status === 'expert_verified') {
        verified += 1;
        const cls = obs.primary_classification;
        verifiedBreakdown[cls] = (verifiedBreakdown[cls] || 0) + 1;
      } else if (obs.verification_status === 'rejected') rejected += 1;

      const cls = obs.primary_classification;
      classificationBreakdown[cls] = (classificationBreakdown[cls] || 0) + 1;
    }

    const reviewedCount = verified + rejected;
    const ratePct = total > 0 ? Math.round((reviewedCount / total) * 100) : 0;

    return {
      total_observations: total,
      awaiting_review_count: awaitingReview,
      under_review_count: underReview,
      verified_count: verified,
      rejected_count: rejected,
      verification_rate_pct: ratePct,
      classification_breakdown: classificationBreakdown,
      verified_breakdown: verifiedBreakdown,
    };
  }

  /**
   * Retrieves recent audit logs across all observations.
   */
  async getAuditLogs(limit = 50): Promise<VerificationAuditLogRecord[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    if (isDatabaseConfigured()) {
      try {
        const { data, error } = await (supabase.from('verification_audit_logs') as any)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(safeLimit);
        if (error) throw new Error(error.message);
        if (!Array.isArray(data)) return [];
        return (data as any[]).map((a) => ({
          id: a.id,
          observation_id: a.observation_id,
          passport_id: a.passport_id,
          reviewer_id: a.reviewer_id,
          reviewer_name: a.reviewer_name,
          action: a.action,
          previous_status: a.previous_status,
          new_status: a.new_status,
          notes: a.notes ?? null,
          metadata: a.metadata ?? {},
          created_at: a.created_at,
        }));
      } catch (err) {
        logger.error('Database read failed in getAuditLogs; refusing to fall back to process memory', {
          error: String(err),
        });
        throw new ServiceUnavailableError('expert verification audit logs', err);
      }
    }
    return this.inMemoryAuditLogs.slice(0, safeLimit);
  }

  /**
   * Appends an audit log record.
   */
  async recordAuditLog(entry: VerificationAuditLogRecord): Promise<void> {
    if (isDatabaseConfigured()) {
      try {
        const { error } = await (supabase.from('verification_audit_logs') as any).insert({
          observation_id: entry.observation_id,
          passport_id: entry.passport_id,
          reviewer_id: entry.reviewer_id,
          reviewer_name: entry.reviewer_name,
          action: entry.action,
          previous_status: entry.previous_status,
          new_status: entry.new_status,
          notes: entry.notes,
          metadata: entry.metadata ?? {},
        });
        if (error) throw new Error(error.message);
        return;
      } catch (err) {
        throw new ServiceUnavailableError('expert audit log write', err);
      }
    }
    this.inMemoryAuditLogs.unshift(entry);
  }

  /**
   * Retrieves all raw non-demo observations for analytics and exports.
   */
  async getAllRawObservations(): Promise<InMemoryObservationStore[]> {
    if (isDatabaseConfigured()) {
      try {
        const { data, error } = await (supabase.from('observations') as any)
          .select('*, observation_locations(*), observation_media(id, media_type, mime_type)')
          .eq('is_demo', false)
          .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        if (!Array.isArray(data)) return [];
        return (data as any[]).map((row) => {
          const loc = Array.isArray(row.observation_locations)
            ? row.observation_locations[0]
            : row.observation_locations;
          const media = Array.isArray(row.observation_media)
            ? row.observation_media[0]
            : row.observation_media;
          return this.rowToStore(row, loc ?? null, media ?? null);
        });
      } catch (err) {
        logger.error('Database read failed in getAllRawObservations; refusing to fall back to process memory', {
          error: String(err),
        });
        throw new ServiceUnavailableError('raw observation export read', err);
      }
    }
    return this.inMemoryObservations.filter((o) => !o.is_demo);
  }

  /**
   * Retrieves verifications map.
   */
  getAllVerificationsMap(): Map<string, ExpertVerificationRecord[]> {
    return this.inMemoryVerifications;
  }

  /**
   * Retrieves real processing events for monitoring.
   *
   * REAL DATA POLICY: this queries the `processing_events` table written by the
   * live pipeline. Returns an empty array when no database is configured in dev,
   * and throws ServiceUnavailableError when a configured database fails.
   */
  async getProcessingEvents(
    limit = 100
  ): Promise<Array<{ id: string; status: string; duration_ms: number | null; error_code?: string; created_at: string }>> {
    if (!isDatabaseConfigured()) {
      return [];
    }

    try {
      const { data, error } = await (supabase
        .from('processing_events' as any)
        .select('id, status, duration_ms, error_code, created_at')
        .order('created_at', { ascending: false })
        .limit(Math.min(Math.max(limit, 1), 500)) as any);

      if (error) throw new Error(error.message);
      if (!Array.isArray(data)) return [];

      return (data as any[]).map((row) => ({
        id: String(row.id),
        status: String(row.status),
        duration_ms: row.duration_ms === null || row.duration_ms === undefined ? null : Number(row.duration_ms),
        error_code: row.error_code ?? undefined,
        created_at: String(row.created_at),
      }));
    } catch (err) {
      logger.error('Could not read processing events; refusing to mask database error', { error: String(err) });
      throw new ServiceUnavailableError('processing events read', err);
    }
  }
}

export const expertRepository = new ExpertRepository();
