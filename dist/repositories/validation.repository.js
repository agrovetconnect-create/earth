import crypto from 'node:crypto';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { assertImageMetadataIsReal, assertPredictionIsScorable, calculateConsensus, } from './validation-store.js';
import { SupabaseValidationRepository } from './validation-supabase.repository.js';
/**
 * In-memory store for Stage 7 validation records.
 *
 * PERSISTENCE STATUS: nothing here is written to disk or to Supabase. Every
 * dataset, specimen, image, reference label, run, prediction and error is lost
 * when the process exits. This class is used for tests and for a deployment
 * with no database configured. When Supabase is configured the service is
 * constructed with `SupabaseValidationRepository` instead, which persists the
 * same records in the schema from migration 010 (and 015) and survives a
 * restart.
 *
 * The limitation is disclosed rather than hidden because the records are
 * scientific evidence. A validation run that disappears on restart cannot be
 * reproduced, audited or published, so an operator must be told before entering
 * a real reference set rather than after discovering the loss.
 */
export class ValidationRepository {
    /** Whether records survive a restart. Read this before trusting stored results. */
    static IS_DURABLE = false;
    /** Instance form of the durability flag, so a store can be examined uniformly. */
    isDurable = false;
    datasets = new Map();
    samples = new Map();
    images = new Map();
    referenceLabels = new Map(); // sample_id -> labels
    aiRuns = new Map();
    aiPredictions = new Map(); // run_id -> predictions
    errors = new Map(); // run_id -> errors
    seenImageHashes = new Map(); // image_hash -> sample_id
    // -------------------------------------------------------------
    // Dataset Management
    // -------------------------------------------------------------
    async createDataset(dataset) {
        // Uniqueness is (dataset_code, version), not dataset_code alone. A locked
        // dataset cannot be extended - the error that tells an admin to "create a
        // new dataset version" was previously impossible to follow, because the
        // code alone was already taken. Versioning is the only sanctioned way to
        // add specimens after a freeze, so the key has to admit it.
        const existing = Array.from(this.datasets.values()).find((d) => d.dataset_code === dataset.dataset_code && d.version === dataset.version);
        if (existing) {
            throw new Error(`Dataset '${dataset.dataset_code}' version ${dataset.version} already exists.`);
        }
        const record = {
            ...dataset,
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            locked_at: null,
            sample_count: 0,
        };
        this.datasets.set(record.id, record);
        return record;
    }
    async getDatasetById(id) {
        const d = this.datasets.get(id);
        if (!d)
            return null;
        const sampleCount = Array.from(this.samples.values()).filter((s) => s.dataset_id === id).length;
        return { ...d, sample_count: sampleCount };
    }
    async getDatasetByCode(code) {
        const d = Array.from(this.datasets.values()).find((item) => item.dataset_code === code);
        if (!d)
            return null;
        const sampleCount = Array.from(this.samples.values()).filter((s) => s.dataset_id === d.id).length;
        return { ...d, sample_count: sampleCount };
    }
    async listDatasets() {
        return Array.from(this.datasets.values()).map((d) => {
            const sampleCount = Array.from(this.samples.values()).filter((s) => s.dataset_id === d.id).length;
            return { ...d, sample_count: sampleCount };
        });
    }
    async lockDataset(id) {
        const dataset = this.datasets.get(id);
        if (!dataset)
            throw new Error('Dataset not found');
        dataset.status = 'locked';
        // A freeze has its own timestamp. `updated_at` is bumped by every write, so
        // reusing it would make the instant of the freeze unverifiable - which is
        // the one thing a validation record has to be able to prove.
        dataset.locked_at = new Date().toISOString();
        dataset.updated_at = dataset.locked_at;
        return dataset;
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
        const existingCode = Array.from(this.samples.values()).find((s) => s.sample_code === sample.sample_code);
        if (existingCode) {
            throw new Error(`Sample code '${sample.sample_code}' already exists.`);
        }
        const record = {
            ...sample,
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        this.samples.set(record.id, record);
        return record;
    }
    async getSampleById(id) {
        const s = this.samples.get(id);
        if (!s)
            return null;
        const imgs = Array.from(this.images.values()).filter((img) => img.sample_id === id);
        const labels = this.referenceLabels.get(id) || [];
        const consensus = this.calculateConsensus(id, labels);
        return {
            ...s,
            images: imgs,
            reference_labels: labels,
            consensus,
        };
    }
    async getSampleByCode(code) {
        const s = Array.from(this.samples.values()).find((item) => item.sample_code === code);
        if (!s)
            return null;
        return this.getSampleById(s.id);
    }
    async listSamplesByDataset(datasetId) {
        const list = Array.from(this.samples.values()).filter((s) => s.dataset_id === datasetId);
        return Promise.all(list.map((s) => this.getSampleById(s.id)));
    }
    // -------------------------------------------------------------
    // Image Metadata & Duplicate Check
    // -------------------------------------------------------------
    assertImageMetadataIsReal(image) {
        assertImageMetadataIsReal(image);
    }
    async addSampleImage(image) {
        const sample = this.samples.get(image.sample_id);
        if (!sample)
            throw new Error('Target validation sample not found');
        const dataset = this.datasets.get(sample.dataset_id);
        if (dataset && dataset.status === 'locked') {
            throw new Error('Cannot add images to a locked dataset.');
        }
        this.assertImageMetadataIsReal(image);
        // Check duplicate image hash across dataset
        const existingSampleId = this.seenImageHashes.get(image.image_hash);
        if (existingSampleId && existingSampleId !== image.sample_id) {
            throw new Error(`Duplicate image detected! Exact image hash already registered for specimen '${existingSampleId}'.`);
        }
        const record = {
            ...image,
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
        };
        this.images.set(record.id, record);
        this.seenImageHashes.set(image.image_hash, image.sample_id);
        return record;
    }
    // -------------------------------------------------------------
    // Reference Labels & Consensus
    // -------------------------------------------------------------
    async addReferenceLabel(label) {
        const sample = this.samples.get(label.sample_id);
        if (!sample)
            throw new Error('Validation sample not found');
        const dataset = this.datasets.get(sample.dataset_id);
        if (dataset && dataset.status === 'locked') {
            throw new Error('Cannot add or modify reference labels on a locked dataset.');
        }
        const labels = this.referenceLabels.get(label.sample_id) || [];
        // Multiple experts: ensure one review per expert
        const existingIdx = labels.findIndex((l) => l.reviewer_id === label.reviewer_id);
        const record = {
            ...label,
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
        };
        if (existingIdx >= 0) {
            labels[existingIdx] = record;
        }
        else {
            labels.push(record);
        }
        this.referenceLabels.set(label.sample_id, labels);
        // Update sample status based on consensus
        const consensus = this.calculateConsensus(label.sample_id, labels);
        if (consensus.is_disputed) {
            sample.sample_status = 'disputed';
        }
        else if (consensus.reviewer_count >= 1) {
            sample.sample_status = 'labeled';
        }
        sample.updated_at = new Date().toISOString();
        return record;
    }
    calculateConsensus(sampleId, labels) {
        // Delegates to the shared implementation so the memory store and the
        // database-backed store never disagree about a panel's consensus.
        return calculateConsensus(sampleId, labels);
    }
    // -------------------------------------------------------------
    // AI Runs & Predictions
    // -------------------------------------------------------------
    async createAiRun(run) {
        const record = {
            ...run,
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
        };
        this.aiRuns.set(record.id, record);
        return record;
    }
    async getAiRunById(id) {
        return this.aiRuns.get(id) || null;
    }
    async listAiRuns(datasetId) {
        const list = Array.from(this.aiRuns.values());
        if (datasetId)
            return list.filter((r) => r.dataset_id === datasetId);
        return list;
    }
    async updateAiRunStatus(runId, updates) {
        const run = this.aiRuns.get(runId);
        if (!run)
            throw new Error('AI run not found');
        Object.assign(run, updates);
        return run;
    }
    async recordPrediction(pred) {
        assertPredictionIsScorable(pred);
        const record = {
            ...pred,
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
        };
        const list = this.aiPredictions.get(pred.run_id) || [];
        list.push(record);
        this.aiPredictions.set(pred.run_id, list);
        return record;
    }
    async getPredictionsByRun(runId) {
        return this.aiPredictions.get(runId) || [];
    }
    // -------------------------------------------------------------
    // Error Categorization
    // -------------------------------------------------------------
    async recordError(err) {
        const record = {
            ...err,
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
        };
        const list = this.errors.get(err.run_id) || [];
        list.push(record);
        this.errors.set(err.run_id, list);
        return record;
    }
    async getErrorsByRun(runId) {
        return this.errors.get(runId) || [];
    }
}
/**
 * Chooses the durable store when the database is configured.
 *
 * Validation records are scientific evidence. When Supabase is available they
 * are persisted in the tables from migration 010 (and 015) and survive a
 * restart. Only when no database is configured does the process-memory store
 * stand in, and then the server says so at startup.
 */
export function createValidationRepository() {
    if (isDatabaseConfigured())
        return new SupabaseValidationRepository();
    return new ValidationRepository();
}
export const validationRepository = createValidationRepository();
/** True when the active validation store persists records across restarts. */
export const validationIsDurable = validationRepository.isDurable;
