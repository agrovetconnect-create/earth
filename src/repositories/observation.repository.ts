<<<<<<< HEAD
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { ServiceUnavailableError } from '../utils/service-error.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import {
  isVerifiedScientificConfirmation,
  ScientificEvidenceValidationError,
  type VerifiedScientificConfirmation,
} from '../utils/scientific-evidence.js';
=======
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { ServiceUnavailableError } from '../utils/service-error.js';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
import type { EvidenceState } from '../types/community.types.js';
import type {
  ObservationRow,
  ObservationInsert,
  ObservationStatus,
  ObservationMediaRow,
  ObservationMediaInsert,
  ObservationLocationRow,
  ObservationLocationInsert,
  ProcessingEventRow,
  ProcessingEventInsert,
  MediaModerationStatus,
} from '../types/database.types.js';

export class ObservationRepository {
<<<<<<< HEAD
  private inMemoryObservations = new Map<string, ObservationRow>();
  private inMemoryMedia = new Map<string, ObservationMediaRow>();
  private inMemoryLocations = new Map<string, ObservationLocationRow>();
  private inMemoryEvents: ProcessingEventRow[] = [];
  private inMemoryAuditLogs: Array<Record<string, unknown>> = [];
  private memoryCounter = 1;

  private requireDatabase(operation: string): void {
    if (!isDatabaseConfigured() && env.IS_PRODUCTION) {
      throw new ServiceUnavailableError(
        `observation ${operation}`,
        undefined,
        `Observation ${operation} requires a configured Supabase database in production.`
      );
    }
  }

  hasInMemoryEvidenceReference(observationId: string, reference: string): boolean {
    const cleanRef = reference.trim();
    if (!cleanRef) return false;
    for (const media of this.inMemoryMedia.values()) {
      if (
        media.observation_id === observationId &&
        media.moderation_status !== 'removed' &&
        (media.id === cleanRef ||
          media.source_media_id === cleanRef ||
          (media as { storage_url?: string | null }).storage_url === cleanRef)
      ) {
        return true;
      }
    }
    return false;
  }

=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  /**
   * Finds an observation by its unique source WhatsApp message ID.
   * Used for idempotency and duplicate webhook protection.
   *
   * A database error is thrown, never returned as null: treating an outage as
   * "this message is new" would let a retried webhook run the analysis again and
   * attempt a second observation for the same message.
   */
  async findBySourceMessageId(sourceMessageId: string): Promise<ObservationRow | null> {
<<<<<<< HEAD
    if (!isDatabaseConfigured()) {
      for (const obs of this.inMemoryObservations.values()) {
        if (obs.source_message_id === sourceMessageId) {
          return obs;
        }
      }
      return null;
    }

=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    try {
      const { data, error } = await supabase
        .from('observations')
        .select('*')
        .eq('source_message_id', sourceMessageId)
        .maybeSingle();

      if (error) throw new Error(error.message);

      return (data as unknown as ObservationRow) || null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown database error';
      logger.error('Database error in findBySourceMessageId', { error: msg });
      throw new ServiceUnavailableError('observation idempotency check', err);
    }
  }

  /**
   * Finds an observation by its public-friendly Geoscience Passport ID (e.g. RT-RW-000001).
   */
  async findByPassportId(passportId: string): Promise<ObservationRow | null> {
<<<<<<< HEAD
    const wanted = String(passportId ?? '').trim().toUpperCase();
    if (!wanted) return null;

    if (!isDatabaseConfigured()) {
      for (const obs of this.inMemoryObservations.values()) {
        if (obs.passport_id.toUpperCase() === wanted) {
          return obs;
        }
      }
      return null;
    }

=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    try {
      const { data, error } = await supabase
        .from('observations')
        .select('*')
<<<<<<< HEAD
        .ilike('passport_id', wanted)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
=======
        .eq('passport_id', passportId)
        .maybeSingle();

      if (error) {
        logger.error('Database error in findByPassportId', { error: error.message });
        return null;
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      }

      return (data as unknown as ObservationRow) || null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown database error';
<<<<<<< HEAD
      logger.error('Database error in findByPassportId', { error: msg });
      throw new ServiceUnavailableError('observation lookup by passport ID', err);
=======
      logger.error('Exception in findByPassportId', { error: msg });
      return null;
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    }
  }

  /**
   * Creates a new observation record.
   */
  async createObservation(insertData: ObservationInsert): Promise<ObservationRow> {
<<<<<<< HEAD
    this.requireDatabase('creation');

    if (!isDatabaseConfigured()) {
      const id = insertData.id || `obs_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const passport_id = insertData.passport_id || `RT-RW-${String(this.memoryCounter++).padStart(6, '0')}`;
      const now = new Date().toISOString();
      const row: ObservationRow = {
        id,
        passport_id,
        source: insertData.source || 'whatsapp',
        source_message_id: insertData.source_message_id,
        source_user_hash: insertData.source_user_hash,
        owner_user_id: insertData.owner_user_id ?? null,
        post_title: insertData.post_title ?? null,
        user_report: insertData.user_report ?? null,
        is_demo: insertData.is_demo ?? false,
        community_updated_at: null,
        status: insertData.status || 'processing',
        observation_category: insertData.observation_category ?? null,
        observation_subcategory: insertData.observation_subcategory ?? null,
        observation_type: insertData.observation_type ?? null,
        primary_interpretation: insertData.primary_interpretation ?? null,
        geological_context: insertData.geological_context ?? null,
        diagnostic_features: insertData.diagnostic_features ?? [],
        possible_alternatives: insertData.possible_alternatives ?? [],
        uncertainties: insertData.uncertainties ?? [],
        questions_for_user: insertData.questions_for_user ?? [],
        community_status: insertData.community_status || 'not_started',
        is_rock: insertData.is_rock ?? false,
        primary_classification: insertData.primary_classification,
        possible_name: insertData.possible_name ?? null,
        confidence: insertData.confidence,
        confidence_score: insertData.confidence_score,
        observed_features: insertData.observed_features || [],
        reasoning: insertData.reasoning,
        alternative_possibilities: insertData.alternative_possibilities || [],
        limitations: insertData.limitations || [],
        recommended_next_steps: insertData.recommended_next_steps || [],
        safety_note: insertData.safety_note,
        user_caption: insertData.user_caption ?? null,
        verification_status: insertData.verification_status || 'unverified',
        publication_status: insertData.publication_status || 'private',
        evidence_state: insertData.evidence_state || 'ai_assisted',
        evidence_state_reason: insertData.evidence_state_reason ?? null,
        evidence_state_changed_at: insertData.evidence_state_changed_at ?? now,
        evidence_state_changed_by: insertData.evidence_state_changed_by ?? null,
        scientific_confirmation_basis: null,
        scientific_confirmed_at: null,
        site_id: insertData.site_id ?? null,
        location_status: insertData.location_status || 'not_provided',
        data_quality_status: insertData.data_quality_status || 'partial',
        ai_model: insertData.ai_model || 'gemini-3.8-flash',
        ai_prompt_version: insertData.ai_prompt_version || 'v1',
        analysis_version: insertData.analysis_version || 'v1',
        system_version: insertData.system_version || 'v1',
        created_at: now,
        updated_at: now,
        published_at: insertData.publication_status === 'public' ? now : null,
      };
      this.inMemoryObservations.set(id, row);
      return row;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('observations') as any)
        .insert(insertData)
        .select('*')
        .single();

      if (error || !data) {
        throw new Error(error?.message || 'No row returned');
      }

      return data as ObservationRow;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to insert observation in Supabase', { error: msg });
      throw new ServiceUnavailableError('observation creation', err);
    }
=======
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('observations') as any)
      .insert(insertData)
      .select('*')
      .single();

    if (error || !data) {
      logger.error('Failed to insert observation in Supabase', {
        error: error?.message || 'No row returned',
      });
      throw new Error(`Database error creating observation: ${error?.message || 'Unknown'}`);
    }

    return data as ObservationRow;
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }

  /**
   * Updates an observation's processing status (processing -> completed / failed).
   */
  async updateObservationStatus(id: string, status: ObservationStatus): Promise<void> {
<<<<<<< HEAD
    this.requireDatabase('status update');

    if (!isDatabaseConfigured()) {
      const row = this.inMemoryObservations.get(id);
      if (row) {
        row.status = status;
        row.updated_at = new Date().toISOString();
      }
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('observations') as any)
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        throw new Error(error.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to update observation status', { id, status, error: msg });
      throw new ServiceUnavailableError('observation status update', err);
=======
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('observations') as any)
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      logger.error('Failed to update observation status', { id, status, error: error.message });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    }
  }

  /**
   * Saves image metadata associated with an observation.
   */
  async saveObservationMedia(mediaInsert: ObservationMediaInsert): Promise<ObservationMediaRow> {
<<<<<<< HEAD
    this.requireDatabase('media storage');

    if (!isDatabaseConfigured()) {
      const id = `med_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const row: ObservationMediaRow = {
        id,
        observation_id: mediaInsert.observation_id,
        media_type: mediaInsert.media_type ?? 'image',
        mime_type: mediaInsert.mime_type,
        file_size: mediaInsert.file_size,
        sha256: mediaInsert.sha256 ?? null,
        source_media_id: mediaInsert.source_media_id ?? '',
        storage_status: mediaInsert.storage_status || 'metadata_only',
        site_id: mediaInsert.site_id ?? null,
        file_path: null,
        capture_date: mediaInsert.capture_date ?? null,
        caption: mediaInsert.caption ?? null,
        media_category: mediaInsert.media_category ?? null,
        view_type: mediaInsert.view_type ?? null,
        duration_seconds: mediaInsert.duration_seconds ?? null,
        width_px: mediaInsert.width_px ?? null,
        height_px: mediaInsert.height_px ?? null,
        visibility: mediaInsert.visibility || 'private',
        moderation_status: mediaInsert.moderation_status || 'visible',
        moderated_by: null,
        moderated_at: null,
        media_role: mediaInsert.media_role || 'main',
        sort_order: mediaInsert.sort_order ?? 0,
        is_public: mediaInsert.is_public ?? false,
        content_base64: mediaInsert.content_base64 ?? null,
        stored_by_user_id: mediaInsert.stored_by_user_id ?? null,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      this.inMemoryMedia.set(id, row);
      return row;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('observation_media') as any)
        .insert(mediaInsert)
        .select('*')
        .single();

      if (error || !data) {
        throw new Error(error?.message || 'No media row returned');
      }

      return data as ObservationMediaRow;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to insert observation media', { error: msg });
      throw new ServiceUnavailableError('observation media storage', err);
    }
  }

  /**
   * Saves or updates voluntary geographic or descriptive location associated with an observation.
=======
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('observation_media') as any)
      .insert(mediaInsert)
      .select('*')
      .single();

    if (error || !data) {
      logger.error('Failed to insert observation media', { error: error?.message });
      throw new Error(`Database error saving observation media: ${error?.message}`);
    }

    return data as ObservationMediaRow;
  }

  /**
   * Saves voluntary geographic or descriptive location associated with an observation.
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
   */
  async saveObservationLocation(
    locationInsert: ObservationLocationInsert
  ): Promise<ObservationLocationRow> {
<<<<<<< HEAD
    this.requireDatabase('location storage');

    if (!isDatabaseConfigured()) {
      for (const existing of this.inMemoryLocations.values()) {
        if (existing.observation_id === locationInsert.observation_id) {
          existing.location_source = locationInsert.location_source;
          existing.latitude = locationInsert.latitude ?? null;
          existing.longitude = locationInsert.longitude ?? null;
          existing.accuracy_meters = locationInsert.accuracy_meters ?? null;
          existing.district = locationInsert.district ?? null;
          existing.sector = locationInsert.sector ?? null;
          existing.cell = locationInsert.cell ?? null;
          existing.village = locationInsert.village ?? null;
          existing.location_text = locationInsert.location_text ?? null;
          existing.geom = locationInsert.geom ?? null;
          existing.public_location_precision = locationInsert.public_location_precision || 'private';
          existing.is_public = locationInsert.is_public ?? false;
          return existing;
        }
      }

      const id = `loc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const row: ObservationLocationRow = {
        id,
        observation_id: locationInsert.observation_id,
        location_source: locationInsert.location_source,
        latitude: locationInsert.latitude ?? null,
        longitude: locationInsert.longitude ?? null,
        accuracy_meters: locationInsert.accuracy_meters ?? null,
        district: locationInsert.district ?? null,
        sector: locationInsert.sector ?? null,
        cell: locationInsert.cell ?? null,
        village: locationInsert.village ?? null,
        location_text: locationInsert.location_text ?? null,
        geom: locationInsert.geom ?? null,
        public_location_precision: locationInsert.public_location_precision || 'private',
        is_public: locationInsert.is_public ?? false,
        created_at: new Date().toISOString(),
      };
      this.inMemoryLocations.set(id, row);
      return row;
    }

    const insertPayload: ObservationLocationInsert = { ...locationInsert };
=======
    // If coordinates are present, build PostGIS point geometry representation
    const insertPayload = { ...locationInsert };
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    if (
      locationInsert.latitude !== null &&
      locationInsert.latitude !== undefined &&
      locationInsert.longitude !== null &&
      locationInsert.longitude !== undefined &&
      !locationInsert.geom
    ) {
      insertPayload.geom = `SRID=4326;POINT(${locationInsert.longitude} ${locationInsert.latitude})`;
<<<<<<< HEAD
    } else if (locationInsert.latitude === null || locationInsert.longitude === null) {
      insertPayload.geom = null;
    }

    try {
      // Check for an existing location row on this observation so pin updates never create duplicate rows
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing, error: lookupError } = await (supabase.from('observation_locations') as any)
        .select('id')
        .eq('observation_id', locationInsert.observation_id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (lookupError) {
        throw new Error(lookupError.message);
      }

      if (existing?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: updated, error: updateError } = await (supabase.from('observation_locations') as any)
          .update(insertPayload)
          .eq('id', existing.id)
          .select('*')
          .single();

        if (updateError || !updated) {
          throw new Error(updateError?.message || 'No location row returned on update');
        }
        return updated as ObservationLocationRow;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('observation_locations') as any)
        .insert(insertPayload)
        .select('*')
        .single();

      if (error || !data) {
        throw new Error(error?.message || 'No location row returned on insert');
      }

      return data as ObservationLocationRow;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to persist observation location', { error: msg });
      throw new ServiceUnavailableError('observation location storage', err);
    }
=======
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('observation_locations') as any)
      .insert(insertPayload)
      .select('*')
      .single();

    if (error || !data) {
      logger.error('Failed to insert observation location', { error: error?.message });
      throw new Error(`Database error saving observation location: ${error?.message}`);
    }

    return data as ObservationLocationRow;
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }

  /**
   * Records a processing pipeline event for auditability without storing sensitive payloads.
   */
  async recordProcessingEvent(eventInsert: ProcessingEventInsert): Promise<ProcessingEventRow | null> {
<<<<<<< HEAD
    if (!isDatabaseConfigured()) {
      const id = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const row: ProcessingEventRow = {
        id,
        observation_id: eventInsert.observation_id ?? null,
        event_type: eventInsert.event_type,
        status: eventInsert.status ?? 'completed',
        duration_ms: eventInsert.duration_ms ?? null,
        error_code: eventInsert.error_code ?? null,
        created_at: new Date().toISOString(),
      };
      this.inMemoryEvents.push(row);
      return row;
    }

=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('processing_events') as any)
        .insert(eventInsert)
        .select('*')
        .single();

      if (error) {
        logger.warn('Failed to record processing event', {
          event_type: eventInsert.event_type,
          error: error.message,
        });
        return null;
      }

      return (data as ProcessingEventRow) || null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.warn('Exception recording processing event', { error: msg });
      return null;
    }
  }

  /**
   * Attaches an observation to a geological site.
   *
   * Grouping is only ever explicit. Nothing here decides that two records belong
   * together, because a distance threshold is not a geological relationship and a
   * silently created cluster would present a guess as a fact.
   */
<<<<<<< HEAD
  async setObservationSite(
    observationId: string,
    siteId: string | null,
    actor: string,
    reason?: string,
    actorRole = 'super_admin'
  ): Promise<void> {
    this.requireDatabase('site assignment');
    const resolvedReason =
      reason?.trim() ||
      (siteId ? `Attached to geological site ${siteId}` : 'Detached from geological site');

    if (!isDatabaseConfigured()) {
      const row = this.inMemoryObservations.get(observationId);
      const beforeSiteId = row?.site_id ?? null;
      if (row) {
        row.site_id = siteId;
        row.updated_at = new Date().toISOString();
      }
      await this.writeAuditLog({
        action: 'observation.site_assigned',
        targetType: 'observation',
        targetId: observationId,
        reason: resolvedReason,
        details: { before_site_id: beforeSiteId, after_site_id: siteId },
        actor,
      });
      return;
    }

    const { error } = await (supabase as any).rpc('assign_observation_site_transactional', {
      p_observation_id: observationId,
      p_site_id: siteId,
      p_reason: resolvedReason,
      p_actor: actor,
      p_actor_role: actorRole,
    });

    if (error) {
      logger.error('Transactional site assignment failed', {
        error: error.message,
        observationId,
        siteId,
      });
      throw new ServiceUnavailableError('observation site assignment transactional update', error);
    }
=======
  async setObservationSite(observationId: string, siteId: string, actor: string): Promise<void> {
    const { error } = await (supabase.from('observations') as any)
      .update({ site_id: siteId, updated_at: new Date().toISOString() })
      .eq('id', observationId);

    if (error) {
      throw new Error(`Database error attaching observation to site: ${error.message}`);
    }

    await this.writeAuditLog({
      action: 'observation.site_assigned',
      targetType: 'observation',
      targetId: observationId,
      reason: `Attached to geological site ${siteId}`,
      details: { site_id: siteId },
      actor,
    });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }

  /**
   * Sets publication status and stamps `published_at` when publishing.
   */
  async setPublicationStatus(
    observationId: string,
    publicationStatus: 'public' | 'private' | 'hidden',
    reason: string,
    actor: string
  ): Promise<void> {
<<<<<<< HEAD
    this.requireDatabase('publication status update');

    const now = new Date().toISOString();
    if (!isDatabaseConfigured()) {
      const row = this.inMemoryObservations.get(observationId);
      if (row) {
        row.publication_status = publicationStatus;
        if (publicationStatus === 'public') row.published_at = now;
        row.updated_at = now;
      }
      await this.writeAuditLog({
        action: 'observation.publication_changed',
        targetType: 'observation',
        targetId: observationId,
        reason,
        details: { publication_status: publicationStatus },
        actor,
      });
      return;
    }

    if (isDatabaseConfigured()) {
      const { error } = await (supabase as any).rpc('update_publication_status_transactional', {
        p_observation_id: observationId,
        p_publication_status: publicationStatus,
        p_reason: reason,
        p_actor: actor,
        p_actor_role: 'super_admin',
      });

      if (error) {
        logger.error('Transactional publication status update failed', { error: error.message, observationId });
        throw new ServiceUnavailableError('observation publication status transactional update', error);
      }
      return;
    }
=======
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      publication_status: publicationStatus,
      updated_at: now,
    };

    if (publicationStatus === 'public') patch.published_at = now;

    const { error } = await (supabase.from('observations') as any).update(patch).eq('id', observationId);

    if (error) {
      throw new Error(`Database error setting publication status: ${error.message}`);
    }

    await this.writeAuditLog({
      action: 'observation.publication_changed',
      targetType: 'observation',
      targetId: observationId,
      reason,
      details: { publication_status: publicationStatus },
      actor,
    });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }

  /**
   * Sets the evidence state with its mandatory reason and actor.
   *
   * The reason is written in the same transaction boundary as the state change
   * so the two can never diverge. An evidence state without a stated reason is
   * the one thing a reader of the public map must never be unable to interrogate.
   */
  async setEvidenceState(
    observationId: string,
    state: EvidenceState,
    reason: string,
<<<<<<< HEAD
    actor: string,
    scientificEvidence: VerifiedScientificConfirmation | null = null,
    actorRole = 'super_admin'
  ): Promise<void> {
    this.requireDatabase('evidence state update');

    if (state === 'scientifically_confirmed' && !isVerifiedScientificConfirmation(scientificEvidence)) {
      throw new ScientificEvidenceValidationError(
        'SCIENTIFIC_CONFIRMATION_EVIDENCE_REQUIRED',
        'scientifically_confirmed cannot be stored without a server-verified laboratory and evidence record.'
      );
    }

    const structuredDetails = scientificEvidence
      ? {
          laboratory_id: scientificEvidence.laboratory_id,
          ...(scientificEvidence.laboratory_name
            ? { laboratory_name: scientificEvidence.laboratory_name }
            : {}),
          report_id: scientificEvidence.report_id,
          analytical_method: scientificEvidence.analytical_method,
          evidence_reference: scientificEvidence.evidence_reference,
          review_authorization: scientificEvidence.review_authorization,
          confirmed_at: scientificEvidence.confirmed_at,
        }
      : null;

    const now = new Date().toISOString();
    if (!isDatabaseConfigured()) {
      const row = this.inMemoryObservations.get(observationId);
      const beforeState = row?.evidence_state ?? null;
      if (row) {
        row.evidence_state = state;
        row.evidence_state_reason = reason;
        row.evidence_state_changed_at = now;
        row.evidence_state_changed_by = actor;
        if (state === 'scientifically_confirmed' && structuredDetails) {
          (row as any).scientific_confirmation_basis = JSON.stringify(structuredDetails);
          (row as any).scientific_confirmed_at = scientificEvidence!.confirmed_at;
        }
        row.updated_at = now;
      }
      await this.writeAuditLog({
        action: 'observation.evidence_state_changed',
        targetType: 'observation',
        targetId: observationId,
        reason,
        details: {
          before_state: beforeState,
          after_state: state,
          evidence_state: state,
          ...(structuredDetails ? { scientific_evidence: structuredDetails } : {}),
        },
        actor,
      });
      return;
    }

    const { error } = await (supabase as any).rpc('update_evidence_state_transactional', {
      p_observation_id: observationId,
      p_evidence_state: state,
      p_reason: reason,
      p_actor: actor,
      p_actor_role: actorRole,
      p_scientific_evidence: structuredDetails,
    });

    if (error) {
      logger.error('Transactional evidence state update failed', { error: error.message, observationId });
      throw new ServiceUnavailableError('observation evidence state transactional update', error);
    }
=======
    actor: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await (supabase.from('observations') as any)
      .update({
        evidence_state: state,
        evidence_state_reason: reason,
        evidence_state_changed_at: now,
        evidence_state_changed_by: actor,
        updated_at: now,
      })
      .eq('id', observationId);

    if (error) {
      throw new Error(`Database error setting evidence state: ${error.message}`);
    }

    await this.writeAuditLog({
      action: 'observation.evidence_state_changed',
      targetType: 'observation',
      targetId: observationId,
      reason,
      details: { evidence_state: state },
      actor,
    });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }

  /**
   * Lists media rows for an observation, newest first.
   *
   * Media bytes are never returned. A consumer that needs an image must go
   * through an authorised media endpoint, so a database read cannot become a way
   * to serve private media.
   */
  async listObservationMedia(observationId: string): Promise<ObservationMediaRow[]> {
<<<<<<< HEAD
    if (!isDatabaseConfigured()) {
      return Array.from(this.inMemoryMedia.values())
        .filter((m) => m.observation_id === observationId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }

    try {
      const { data, error } = await (supabase.from('observation_media') as any)
        .select('*')
        .eq('observation_id', observationId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return (data as ObservationMediaRow[]) ?? [];
    } catch (err: unknown) {
      logger.error('Failed to list observation media', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw new ServiceUnavailableError('observation media read', err);
    }
=======
    const { data, error } = await (supabase.from('observation_media') as any)
      .select('*')
      .eq('observation_id', observationId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.warn('Failed to list observation media', { error: error.message });
      return [];
    }

    return (data as ObservationMediaRow[]) ?? [];
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }

  /**
   * Sets media visibility. Publication is always explicit and always audited.
   */
  async setMediaVisibility(
    mediaId: string,
    visibility: 'private' | 'pending' | 'public' | 'hidden',
    reason: string,
    actor: string
  ): Promise<void> {
<<<<<<< HEAD
    this.requireDatabase('media visibility update');

    if (!isDatabaseConfigured()) {
      const row = this.inMemoryMedia.get(mediaId);
      if (row) {
        row.visibility = visibility;
        row.is_public = visibility === 'public';
        row.updated_at = new Date().toISOString();
      }
      await this.writeAuditLog({
        action: 'media.visibility_changed',
        targetType: 'media',
        targetId: mediaId,
        reason,
        details: { visibility },
        actor,
      });
      return;
    }

    const { error } = await (supabase as any).rpc('update_media_visibility_transactional', {
      p_media_id: mediaId,
      p_visibility: visibility,
      p_reason: reason,
      p_actor: actor,
      p_actor_role: 'super_admin',
    });

    if (error) {
      logger.error('Transactional media visibility update failed', { error: error.message, mediaId });
      throw new ServiceUnavailableError('media visibility transactional update', error);
    }
=======
    const { error } = await (supabase.from('observation_media') as any)
      .update({ visibility })
      .eq('id', mediaId);

    if (error) {
      throw new Error(`Database error setting media visibility: ${error.message}`);
    }

    await this.writeAuditLog({
      action: 'media.visibility_changed',
      targetType: 'media',
      targetId: mediaId,
      reason,
      details: { visibility },
      actor,
    });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }

  /**
   * Moderates a media row. The database rejects a hidden or removed row without
   * a recorded actor, so a media item can never disappear without a trace.
   */
  async moderateMedia(
    mediaId: string,
    moderationStatus: MediaModerationStatus,
    reason: string,
    actor: string
  ): Promise<void> {
<<<<<<< HEAD
    this.requireDatabase('media moderation');

    if (!isDatabaseConfigured()) {
      const row = this.inMemoryMedia.get(mediaId);
      if (row) {
        row.moderation_status = moderationStatus;
        row.moderated_by = actor;
        row.moderated_at = new Date().toISOString();
      }
      await this.writeAuditLog({
        action: 'media.moderated',
        targetType: 'media',
        targetId: mediaId,
        reason,
        details: { moderation_status: moderationStatus },
        actor,
      });
      return;
    }

    const { error } = await (supabase as any).rpc('update_media_moderation_transactional', {
      p_media_id: mediaId,
      p_moderation_status: moderationStatus,
      p_reason: reason,
      p_actor: actor,
      p_actor_role: 'super_admin',
    });

    if (error) {
      logger.error('Transactional media moderation update failed', { error: error.message, mediaId });
      throw new ServiceUnavailableError('media moderation transactional update', error);
    }
=======
    const { error } = await (supabase.from('observation_media') as any)
      .update({
        moderation_status: moderationStatus,
        moderated_by: actor,
        moderated_at: new Date().toISOString(),
      })
      .eq('id', mediaId);

    if (error) {
      throw new Error(`Database error moderating media: ${error.message}`);
    }

    await this.writeAuditLog({
      action: 'media.moderated',
      targetType: 'media',
      targetId: mediaId,
      reason,
      details: { moderation_status: moderationStatus },
      actor,
    });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }

  /**
   * Writes one entry to the durable audit log.
   *
<<<<<<< HEAD
   * Fails closed when the database is configured: if the audit record cannot be
   * persisted, the mutation must be rolled back or aborted.
=======
   * An audit write that fails is logged as a warning rather than thrown: the
   * authoritative change has already been applied, and refusing to report success
   * for a completed action would be its own kind of dishonesty.
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
   */
  private async writeAuditLog(entry: {
    action: string;
    targetType: string;
    targetId: string;
    reason: string;
    details?: Record<string, unknown>;
    actor: string;
    actorRole?: 'super_admin' | 'system' | 'contributor';
  }): Promise<void> {
<<<<<<< HEAD
    if (!isDatabaseConfigured()) {
      this.inMemoryAuditLogs.unshift({
        id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        actor: entry.actor,
        actor_role: entry.actorRole ?? 'super_admin',
        action: entry.action,
        target_type: entry.targetType,
        target_id: entry.targetId,
        reason: entry.reason,
        details: entry.details ?? null,
        occurred_at: new Date().toISOString(),
      });
      return;
    }

=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    try {
      const { error } = await (supabase.from('admin_audit_log') as any).insert({
        actor: entry.actor,
        actor_role: entry.actorRole ?? 'super_admin',
        action: entry.action,
        target_type: entry.targetType,
        target_id: entry.targetId,
        reason: entry.reason,
        details: entry.details ?? null,
      });

      if (error) {
<<<<<<< HEAD
        logger.error('Failed to write audit log entry', { action: entry.action, error: error.message });
        throw new ServiceUnavailableError('audit log persistence', error);
      }
    } catch (err: unknown) {
      if (err instanceof ServiceUnavailableError) throw err;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Exception writing audit log entry', { action: entry.action, error: msg });
      throw new ServiceUnavailableError('audit log persistence', err);
=======
        logger.warn('Failed to write audit log entry', { action: entry.action, error: error.message });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.warn('Exception writing audit log entry', { action: entry.action, error: msg });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    }
  }

  /**
   * Reads audit log entries, newest first. Never exposes media paths or
   * coordinates; the details payload is written by this layer only.
   */
  async listAuditLog(options: {
    limit: number;
    offset: number;
    action?: string;
    targetType?: string;
    targetId?: string;
  }): Promise<{ rows: Record<string, unknown>[]; total: number }> {
<<<<<<< HEAD
    if (!isDatabaseConfigured()) {
      const filtered = this.inMemoryAuditLogs.filter((row) => {
        if (options.action && row.action !== options.action) return false;
        if (options.targetType && row.target_type !== options.targetType) return false;
        if (options.targetId && row.target_id !== options.targetId) return false;
        return true;
      });
      return {
        rows: filtered.slice(options.offset, options.offset + options.limit),
        total: filtered.length,
      };
    }

    try {
      let query = (supabase.from('admin_audit_log') as any).select('*', { count: 'exact' });

      if (options.action) query = query.eq('action', options.action);
      if (options.targetType) query = query.eq('target_type', options.targetType);
      if (options.targetId) query = query.eq('target_id', options.targetId);

      const { data, count, error } = await query
        .order('occurred_at', { ascending: false })
        .range(options.offset, options.offset + options.limit - 1);

      if (error) {
        throw new Error(error.message);
      }

      return { rows: (data as Record<string, unknown>[]) ?? [], total: count ?? 0 };
    } catch (err: unknown) {
      logger.error('Failed to read audit log', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw new ServiceUnavailableError('admin audit log read', err);
    }
=======
    let query = (supabase.from('admin_audit_log') as any).select('*', { count: 'exact' });

    if (options.action) query = query.eq('action', options.action);
    if (options.targetType) query = query.eq('target_type', options.targetType);
    if (options.targetId) query = query.eq('target_id', options.targetId);

    const { data, count, error } = await query
      .order('occurred_at', { ascending: false })
      .range(options.offset, options.offset + options.limit - 1);

    if (error) {
      logger.warn('Failed to read audit log', { error: error.message });
      return { rows: [], total: 0 };
    }

    return { rows: (data as Record<string, unknown>[]) ?? [], total: count ?? 0 };
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }
}

export const observationRepository = new ObservationRepository();
