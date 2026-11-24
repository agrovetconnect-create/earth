import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { assertImageMetadataIsReal, assertPredictionIsScorable, calculateConsensus, } from './validation-store.js';
/**
 * Durable validation store backed by the Stage 7 schema.
 *
 * This is what makes a validation run outlive the process that produced it.
 * The in-memory `ValidationRepository` is retained for tests and for a
 * deployment with no database, but when Supabase is configured this store is
 * authoritative: datasets, specimens, reference labels, runs, predictions and
 * error records are written to the tables from migrations 010 and 015 and read
 * back unchanged after a restart.
 *
 * A failed database operation throws rather than degrading to an empty result.
 * The records are scientific evidence, and "no data" and "database unavailable"
 * must never be presented as the same answer.
 */
export class SupabaseValidationRepository {
    isDurable = true;
    fail(operation, err) {
        logger.error('Validation database operation failed', {
            operation,
            error: err instanceof Error ? err.message : String(err),
        });
        throw new Error(`Validation database ${operation} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    static isUniqueViolation(err) {
        return err?.code === '23505';
    }
    // -------------------------------------------------------------
    // Dataset Management
    // -------------------------------------------------------------
    async createDataset(dataset) {
        const { data, error } = await supabase.from('validation_datasets')
            .insert({
            dataset_code: dataset.dataset_code,
            name: dataset.name,
            description: dataset.description,
            version: dataset.version,
            status: dataset.status,
            target_classification_level: dataset.target_classification_level,
            created_by: dataset.created_by,
        })
            .select('*')
            .single();
        if (error) {
            if (SupabaseValidationRepository.isUniqueViolation(error)) {
                throw new Error(`Dataset '${dataset.dataset_code}' version ${dataset.version} already exists.`);
            }
            this.fail('dataset creation', error);
        }
        return { ...data, sample_count: 0 };
    }
    async getDatasetById(id) {
        const { data, error } = await supabase.from('validation_datasets')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error)
            this.fail('dataset lookup', error);
        if (!data)
            return null;
        const { count, error: countError } = await supabase.from('validation_samples')
            .select('id', { count: 'exact', head: true })
            .eq('dataset_id', id);
        if (countError)
            this.fail('dataset sample count', countError);
        return { ...data, sample_count: count ?? 0 };
    }
    async getDatasetByCode(code) {
        const { data, error } = await supabase.from('validation_datasets')
            .select('*')
            .eq('dataset_code', code)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error)
            this.fail('dataset lookup', error);
        if (!data)
            return null;
        const { count, error: countError } = await supabase.from('validation_samples')
            .select('id', { count: 'exact', head: true })
            .eq('dataset_id', data.id);
        if (countError)
            this.fail('dataset sample count', countError);
        return { ...data, sample_count: count ?? 0 };
    }
    async listDatasets() {
        const { data, error } = await supabase.from('validation_datasets')
            .select('*')
            .order('created_at', { ascending: false });
        if (error)
            this.fail('dataset list', error);
        const datasets = (data ?? []);
        if (datasets.length === 0)
            return [];
        // One query for every sample's dataset id, tallied here, rather than a
        // count round-trip per dataset.
        const { data: sampleRows, error: sampleError } = await supabase.from('validation_samples')
            .select('dataset_id')
            .in('dataset_id', datasets.map((d) => d.id));
        if (sampleError)
            this.fail('dataset sample count', sampleError);
        const counts = new Map();
        for (const row of (sampleRows ?? [])) {
            counts.set(row.dataset_id, (counts.get(row.dataset_id) || 0) + 1);
        }
        return datasets.map((d) => ({ ...d, sample_count: counts.get(d.id) ?? 0 }));
    }
    async lockDataset(id) {
        const now = new Date().toISOString();
        const { data, error } = await supabase.from('validation_datasets')
            .update({ status: 'locked', locked_at: now, updated_at: now })
            .eq('id', id)
            .select('*')
            .maybeSingle();
        if (error)
            this.fail('dataset lock', error);
        if (!data)
            throw new Error('Dataset not found');
        return data;
    }
    // -------------------------------------------------------------
    // Sample Management
    // -------------------------------------------------------------
    async createSample(sample) {
        const dataset = await this.getDatasetById(sample.dataset_id);
        if (!dataset)
            throw new Error('Associated validation dataset not found.');
        if (dataset.status === 'locked') {
            throw new Error('Cannot add samples to a locked dataset. Please create a new dataset version.');
        }
        const { data, error } = await supabase.from('validation_samples')
            .insert({
            dataset_id: sample.dataset_id,
            sample_code: sample.sample_code,
            source_type: sample.source_type,
            collection_date: sample.collection_date ?? null,
            country: sample.country,
            district: sample.district ?? null,
            site_description: sample.site_description ?? null,
            specimen_notes: sample.specimen_notes ?? null,
            sample_status: sample.sample_status,
            data_partition: sample.data_partition,
            research_use_consent: sample.research_use_consent,
            image_use_consent: sample.image_use_consent,
        })
            .select('*')
            .single();
        if (error) {
            if (SupabaseValidationRepository.isUniqueViolation(error)) {
                throw new Error(`Sample code '${sample.sample_code}' already exists.`);
            }
            this.fail('sample creation', error);
        }
        return data;
    }
    async getSampleById(id) {
        const { data, error } = await supabase.from('validation_samples')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error)
            this.fail('sample lookup', error);
        if (!data)
            return null;
        const [images, labels] = await Promise.all([
            this.imagesForSamples([id]),
            this.labelsForSamples([id]),
        ]);
        return this.assembleSample(data, images.get(id) ?? [], labels.get(id) ?? []);
    }
    async getSampleByCode(code) {
        const { data, error } = await supabase.from('validation_samples')
            .select('*')
            .eq('sample_code', code)
            .maybeSingle();
        if (error)
            this.fail('sample lookup', error);
        if (!data)
            return null;
        return this.getSampleById(data.id);
    }
    async listSamplesByDataset(datasetId) {
        const { data, error } = await supabase.from('validation_samples')
            .select('*')
            .eq('dataset_id', datasetId)
            .order('created_at', { ascending: true });
        if (error)
            this.fail('sample list', error);
        const samples = (data ?? []);
        if (samples.length === 0)
            return [];
        const ids = samples.map((s) => s.id);
        const [images, labels] = await Promise.all([
            this.imagesForSamples(ids),
            this.labelsForSamples(ids),
        ]);
        return samples.map((s) => this.assembleSample(s, images.get(s.id) ?? [], labels.get(s.id) ?? []));
    }
    assembleSample(sample, images, labels) {
        return {
            ...sample,
            images,
            reference_labels: labels,
            consensus: calculateConsensus(sample.id, labels),
        };
    }
    async imagesForSamples(sampleIds) {
        const grouped = new Map();
        if (sampleIds.length === 0)
            return grouped;
        const { data, error } = await supabase.from('validation_images')
            .select('*')
            .in('sample_id', sampleIds);
        if (error)
            this.fail('image list', error);
        for (const row of (data ?? [])) {
            const list = grouped.get(row.sample_id) ?? [];
            list.push(this.normaliseImage(row));
            grouped.set(row.sample_id, list);
        }
        return grouped;
    }
    async labelsForSamples(sampleIds) {
        const grouped = new Map();
        if (sampleIds.length === 0)
            return grouped;
        const { data, error } = await supabase.from('validation_reference_labels')
            .select('*')
            .in('sample_id', sampleIds);
        if (error)
            this.fail('reference label list', error);
        for (const row of (data ?? [])) {
            const list = grouped.get(row.sample_id) ?? [];
            list.push(row);
            grouped.set(row.sample_id, list);
        }
        return grouped;
    }
    normaliseImage(row) {
        return {
            ...row,
            file_size_bytes: row.file_size_bytes === null || row.file_size_bytes === undefined
                ? row.file_size_bytes
                : Number(row.file_size_bytes),
        };
    }
    // -------------------------------------------------------------
    // Image Metadata & Duplicate Check
    // -------------------------------------------------------------
    async addSampleImage(image) {
        const { data: sample, error: sampleError } = await supabase.from('validation_samples')
            .select('id, dataset_id')
            .eq('id', image.sample_id)
            .maybeSingle();
        if (sampleError)
            this.fail('sample lookup', sampleError);
        if (!sample)
            throw new Error('Target validation sample not found');
        const dataset = await this.getDatasetById(sample.dataset_id);
        if (dataset && dataset.status === 'locked') {
            throw new Error('Cannot add images to a locked dataset.');
        }
        assertImageMetadataIsReal(image);
        // Duplicate detection: an identical image hash already registered to a
        // different specimen means the same photograph was submitted twice.
        const { data: existing, error: existingError } = await supabase.from('validation_images')
            .select('sample_id')
            .eq('image_hash', image.image_hash);
        if (existingError)
            this.fail('image duplicate check', existingError);
        const duplicate = (existing ?? []).find((row) => row.sample_id !== image.sample_id);
        if (duplicate) {
            throw new Error(`Duplicate image detected! Exact image hash already registered for specimen '${duplicate.sample_id}'.`);
        }
        const { data, error } = await supabase.from('validation_images')
            .insert({
            sample_id: image.sample_id,
            storage_path: image.storage_path,
            image_hash: image.image_hash,
            image_width: image.image_width ?? null,
            image_height: image.image_height ?? null,
            file_size_bytes: image.file_size_bytes ?? null,
            lighting_condition: image.lighting_condition ?? null,
            background_condition: image.background_condition ?? null,
            view_type: image.view_type,
            scale_reference_present: image.scale_reference_present,
            quality_status: image.quality_status,
            quality_notes: image.quality_notes ?? null,
        })
            .select('*')
            .single();
        if (error)
            this.fail('image creation', error);
        return this.normaliseImage(data);
    }
    // -------------------------------------------------------------
    // Reference Labels & Consensus
    // -------------------------------------------------------------
    async addReferenceLabel(label) {
        const { data: sample, error: sampleError } = await supabase.from('validation_samples')
            .select('id, dataset_id')
            .eq('id', label.sample_id)
            .maybeSingle();
        if (sampleError)
            this.fail('sample lookup', sampleError);
        if (!sample)
            throw new Error('Validation sample not found');
        const dataset = await this.getDatasetById(sample.dataset_id);
        if (dataset && dataset.status === 'locked') {
            throw new Error('Cannot add or modify reference labels on a locked dataset.');
        }
        // One review per expert: re-submitting replaces that expert's vote.
        const { data, error } = await supabase.from('validation_reference_labels')
            .upsert({
            sample_id: label.sample_id,
            reviewer_id: label.reviewer_id,
            reviewer_name: label.reviewer_name,
            reviewer_role: label.reviewer_role,
            reviewer_organization: label.reviewer_organization,
            classification: label.classification,
            rock_name: label.rock_name ?? null,
            confidence: label.confidence,
            diagnostic_features: label.diagnostic_features,
            notes: label.notes ?? null,
            reference_method: label.reference_method,
        }, { onConflict: 'sample_id,reviewer_id' })
            .select('*')
            .single();
        if (error)
            this.fail('reference label submission', error);
        // Recompute the panel status from the persisted votes.
        const labels = (await this.labelsForSamples([label.sample_id])).get(label.sample_id) ?? [];
        const consensus = calculateConsensus(label.sample_id, labels);
        const nextStatus = consensus.is_disputed ? 'disputed' : 'labeled';
        const { error: statusError } = await supabase.from('validation_samples')
            .update({ sample_status: nextStatus, updated_at: new Date().toISOString() })
            .eq('id', label.sample_id);
        if (statusError)
            this.fail('sample status update', statusError);
        return data;
    }
    // -------------------------------------------------------------
    // AI Runs & Predictions
    // -------------------------------------------------------------
    async createAiRun(run) {
        const { data, error } = await supabase.from('validation_ai_runs')
            .insert({
            dataset_id: run.dataset_id,
            run_code: run.run_code,
            model_name: run.model_name,
            prompt_version: run.prompt_version,
            analysis_version: run.analysis_version,
            application_version: run.application_version,
            status: run.status,
            total_samples: run.total_samples,
            successful_samples: run.successful_samples,
            failed_samples: run.failed_samples,
            is_partial_run: run.is_partial_run,
            started_at: run.started_at ?? null,
            completed_at: run.completed_at ?? null,
        })
            .select('*')
            .single();
        if (error)
            this.fail('AI run creation', error);
        return data;
    }
    async getAiRunById(id) {
        const { data, error } = await supabase.from('validation_ai_runs')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error)
            this.fail('AI run lookup', error);
        return data ?? null;
    }
    async listAiRuns(datasetId) {
        let query = supabase.from('validation_ai_runs')
            .select('*')
            .order('created_at', { ascending: false });
        if (datasetId)
            query = query.eq('dataset_id', datasetId);
        const { data, error } = await query;
        if (error)
            this.fail('AI run list', error);
        return (data ?? []);
    }
    async updateAiRunStatus(runId, updates) {
        const { data, error } = await supabase.from('validation_ai_runs')
            .update(updates)
            .eq('id', runId)
            .select('*')
            .maybeSingle();
        if (error)
            this.fail('AI run update', error);
        if (!data)
            throw new Error('AI run not found');
        return data;
    }
    async recordPrediction(pred) {
        assertPredictionIsScorable(pred);
        const { data, error } = await supabase.from('validation_ai_predictions')
            .insert({
            run_id: pred.run_id,
            sample_id: pred.sample_id,
            image_id: pred.image_id ?? null,
            is_rock: pred.is_rock,
            classification: pred.classification,
            possible_name: pred.possible_name ?? null,
            confidence: pred.confidence,
            confidence_score: pred.confidence_score ?? null,
            observed_features: pred.observed_features,
            reasoning: pred.reasoning,
            limitations: pred.limitations,
            response_time_ms: pred.response_time_ms,
            model_name: pred.model_name,
            prompt_version: pred.prompt_version,
        })
            .select('*')
            .single();
        if (error)
            this.fail('prediction record', error);
        return this.normalisePrediction(data);
    }
    async getPredictionsByRun(runId) {
        const { data, error } = await supabase.from('validation_ai_predictions')
            .select('*')
            .eq('run_id', runId);
        if (error)
            this.fail('prediction list', error);
        return (data ?? []).map((p) => this.normalisePrediction(p));
    }
    normalisePrediction(row) {
        // PostgREST returns `numeric` as a string to preserve precision. The metric
        // engine expects a number, so it is coerced here, at the boundary.
        const score = row.confidence_score;
        return {
            ...row,
            confidence_score: score === null || score === undefined ? row.confidence_score : Number(score),
        };
    }
    // -------------------------------------------------------------
    // Error Categorization
    // -------------------------------------------------------------
    async recordError(err) {
        const { data, error } = await supabase.from('validation_errors')
            .insert({
            run_id: err.run_id,
            sample_id: err.sample_id,
            reference_classification: err.reference_classification,
            ai_classification: err.ai_classification,
            ai_confidence: err.ai_confidence,
            error_category: err.error_category,
            error_notes: err.error_notes ?? null,
            annotated_by: err.annotated_by ?? null,
        })
            .select('*')
            .single();
        if (error)
            this.fail('error record', error);
        return data;
    }
    async getErrorsByRun(runId) {
        const { data, error } = await supabase.from('validation_errors')
            .select('*')
            .eq('run_id', runId);
        if (error)
            this.fail('error list', error);
        return (data ?? []);
    }
}
