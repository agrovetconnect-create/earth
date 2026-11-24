import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { logger } from '../utils/logger.js';
import { validationRepository } from '../repositories/validation.repository.js';
import { geminiService } from './gemini.service.js';
/**
 * The lowest number of scored pairs at which any figure is published.
 *
 * This is a display floor, NOT a claim of scientific sufficiency. Below it the
 * engine returns `null` rather than a number that would read as measured. It is
 * deliberately smaller than the reportable thresholds so a small run still shows
 * its real (preliminary) figures. The earlier code used this same `3` but
 * labelled it "sufficient", which conflated "can be computed" with "is
 * scientifically adequate".
 */
const METRIC_MIN_EVALUATED_PAIRS = 3;
/**
 * Builds the sample-size policy from configuration.
 *
 * Every threshold is operator-tunable because "enough specimens" is a function
 * of the claim being made, not a universal constant.
 */
export function defaultSampleSizePolicy() {
    return {
        metric_min_evaluated_pairs: METRIC_MIN_EVALUATED_PAIRS,
        min_answered_total: env.VALIDATION_MIN_ANSWERED_TOTAL,
        min_per_class_support: env.VALIDATION_MIN_PER_CLASS_SUPPORT,
        min_reference_agreement_pct: env.VALIDATION_MIN_REFERENCE_AGREEMENT_PCT,
        max_excluded_ratio_pct: env.VALIDATION_MAX_EXCLUDED_RATIO_PCT,
    };
}
/**
 * Infers an image MIME type from a storage path extension.
 *
 * `validation_images` has no `mime_type` column, so the extension is the only
 * available signal. An unknown extension falls back to `image/jpeg`, which the
 * downstream image validator will still reject if the bytes disagree.
 */
function inferImageMimeType(storagePath) {
    if (!storagePath)
        return 'image/jpeg';
    const ext = storagePath.toLowerCase().split('.').pop() ?? '';
    switch (ext) {
        case 'png':
            return 'image/png';
        case 'webp':
            return 'image/webp';
        case 'heic':
        case 'heif':
            return 'image/heic';
        default:
            return 'image/jpeg';
    }
}
export class ValidationEvaluationService {
    repo;
    constructor(repo = validationRepository) {
        this.repo = repo;
    }
    // -------------------------------------------------------------
    // Dataset & Sample Workflows
    // -------------------------------------------------------------
    async createDataset(input) {
        return this.repo.createDataset(input);
    }
    async getDataset(id) {
        return this.repo.getDatasetById(id);
    }
    async listDatasets() {
        return this.repo.listDatasets();
    }
    async lockDataset(id) {
        return this.repo.lockDataset(id);
    }
    async registerSample(sample) {
        // Consent is what makes the specimen usable for research at all, so it is
        // checked before the record exists rather than after. A reference set built
        // from material photographed without permission cannot be published or
        // exported, and finding that out at export time wastes the whole run.
        if (sample.research_use_consent !== true || sample.image_use_consent !== true) {
            throw new Error('Specimen rejected: both research_use_consent and image_use_consent must be granted. A specimen photographed without recorded consent cannot enter the validation reference set.');
        }
        if (typeof sample.sample_code !== 'string' || sample.sample_code.trim() === '') {
            throw new Error('Specimen rejected: sample_code is required and cannot be blank.');
        }
        return this.repo.createSample(sample);
    }
    async getSample(id) {
        return this.repo.getSampleById(id);
    }
    async listSamples(datasetId) {
        return this.repo.listSamplesByDataset(datasetId);
    }
    async addImage(image) {
        return this.repo.addSampleImage(image);
    }
    async submitReferenceLabel(label) {
        return this.repo.addReferenceLabel(label);
    }
    // -------------------------------------------------------------
    // AI Evaluation Run Execution
    // -------------------------------------------------------------
    async createAndExecuteRun(datasetId, options = {}) {
        const dataset = await this.repo.getDatasetById(datasetId);
        if (!dataset)
            throw new Error('Dataset not found');
        const samples = await this.repo.listSamplesByDataset(datasetId);
        if (samples.length === 0) {
            throw new Error('Dataset contains no samples to evaluate.');
        }
        const runCode = `RUN-${new Date().toISOString().substring(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const modelName = options.modelName || env.GEMINI_MODEL || 'gemini-4-hydrogen';
        const promptVersion = options.promptVersion || 'v2.1-geological-evaluation';
        // How many specimens this run will actually attempt. The per-run cap exists
        // to bound cost, so a capped run is partial by definition; recording that up
        // front stops a truncated run from ever reading as a dataset-wide result.
        const maxSamples = Math.min(options.maxSamples || env.VALIDATION_MAX_SAMPLES_PER_RUN || 50, samples.length);
        const isPartialRun = maxSamples < samples.length;
        const run = await this.repo.createAiRun({
            dataset_id: datasetId,
            run_code: runCode,
            model_name: modelName,
            prompt_version: promptVersion,
            analysis_version: '1.0',
            application_version: '1.0.0',
            status: 'running',
            total_samples: maxSamples,
            successful_samples: 0,
            failed_samples: 0,
            is_partial_run: isPartialRun,
            started_at: new Date().toISOString(),
            completed_at: null,
        });
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < maxSamples; i++) {
            const sample = samples[i];
            try {
                const primaryImage = sample.images && sample.images.length > 0 ? sample.images[0] : null;
                // Obtain preliminary AI prediction (deterministic reproduction or Gemini prediction)
                const prediction = await this.generateSamplePrediction(sample, primaryImage, modelName, promptVersion);
                await this.repo.recordPrediction({
                    run_id: run.id,
                    sample_id: sample.id,
                    image_id: primaryImage?.id || null,
                    is_rock: prediction.is_rock,
                    classification: prediction.classification,
                    possible_name: prediction.possible_name,
                    confidence: prediction.confidence,
                    confidence_score: prediction.confidence_score,
                    observed_features: prediction.observed_features,
                    reasoning: prediction.reasoning,
                    limitations: prediction.limitations,
                    response_time_ms: prediction.response_time_ms,
                    // The model that actually answered, not the one requested. On a quota
                    // error the analysis service falls back to a smaller model, and
                    // recording the requested name would attribute these predictions to a
                    // model that never saw the specimen.
                    model_name: prediction.model_used || modelName,
                    prompt_version: promptVersion,
                });
                // Error detection against consensus reference
                if (sample.consensus && sample.consensus.majority_classification) {
                    if (sample.consensus.majority_classification !== prediction.classification) {
                        const errCategory = this.determineInitialErrorCategory(sample.consensus.majority_classification, prediction.classification, primaryImage, sample.consensus);
                        await this.repo.recordError({
                            run_id: run.id,
                            sample_id: sample.id,
                            reference_classification: sample.consensus.majority_classification,
                            ai_classification: prediction.classification,
                            ai_confidence: prediction.confidence,
                            error_category: errCategory,
                            error_notes: `AI predicted '${prediction.classification}' but expert consensus determined '${sample.consensus.majority_classification}'.`,
                            annotated_by: 'system_auto_detect',
                        });
                    }
                }
                successCount++;
            }
            catch (err) {
                logger.error('Failed to process sample in validation AI run', {
                    sampleId: sample.id,
                    error: err instanceof Error ? err.message : String(err),
                });
                failCount++;
            }
        }
        // `total_samples` is the number of specimens attempted, so the accounting
        // always reconciles: successful + failed === total. Return the persisted
        // record rather than the pre-update object, which would still read
        // `running` with zeroed counters under a database-backed repository.
        return this.repo.updateAiRunStatus(run.id, {
            status: 'completed',
            completed_at: new Date().toISOString(),
            total_samples: successCount + failCount,
            successful_samples: successCount,
            failed_samples: failCount,
            is_partial_run: isPartialRun,
        });
    }
    /**
     * Loads the real image bytes for a validation sample.
     *
     * No object-storage backend is wired up yet, so this legitimately returns
     * `null`. Returning `null` is the honest answer: it tells the caller that the
     * sample cannot be scored, rather than letting a stand-in "prediction" enter
     * the dataset and later be reported as a scientific measurement.
     */
    async loadValidationImageBytes(image) {
        if (!image || !image.storage_path)
            return null;
        const rawPath = image.storage_path.trim();
        if (!rawPath)
            return null;
        let bytes = null;
        // 1. Safe local file lookup within bounded workspace validation directories
        const allowedRoots = [
            path.resolve(process.cwd(), 'data/validation-images'),
            path.resolve(process.cwd(), 'public/media'),
        ];
        if (!rawPath.includes(':') && !path.isAbsolute(rawPath)) {
            for (const root of allowedRoots) {
                const candidate = path.resolve(root, rawPath);
                if (candidate.startsWith(root + path.sep) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                    bytes = fs.readFileSync(candidate);
                    break;
                }
            }
        }
        // 2. Supabase Storage download (`bucket:objectPath` or default `validation-images` bucket)
        if (!bytes && isDatabaseConfigured()) {
            const colonIdx = rawPath.indexOf(':');
            const bucket = colonIdx > 0 ? rawPath.slice(0, colonIdx).trim() : 'validation-images';
            const objectPath = colonIdx > 0 ? rawPath.slice(colonIdx + 1).trim() : rawPath;
            if (bucket && objectPath && !objectPath.includes('..')) {
                try {
                    const { data, error } = await supabase.storage.from(bucket).download(objectPath);
                    if (error) {
                        logger.warn('Failed to download validation image from storage', {
                            imageId: image.id,
                            bucket,
                            error: error.message,
                        });
                    }
                    else if (data) {
                        bytes = Buffer.from(await data.arrayBuffer());
                    }
                }
                catch (err) {
                    logger.warn('Unexpected error downloading validation image', {
                        imageId: image.id,
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            }
        }
        if (!bytes || bytes.length === 0) {
            logger.warn('Validation image bytes could not be retrieved', {
                imageId: image.id,
                storagePath: image.storage_path,
            });
            return null;
        }
        if (image.image_hash) {
            const actualHash = crypto.createHash('sha256').update(bytes).digest('hex');
            if (actualHash.toLowerCase() !== image.image_hash.trim().toLowerCase()) {
                logger.error('Validation image SHA-256 verification failed', {
                    imageId: image.id,
                });
                return null;
            }
        }
        return bytes;
    }
    /**
     * Produces a REAL model prediction for one validation sample.
     *
     * The previous implementation keyword-matched `specimen_notes` for words like
     * "schist" and returned a hard-coded `confidence_score: 0.88` with a randomised
     * latency. That is not a model evaluation at all: it measured a `switch`
     * statement and reported the result as model accuracy.
     *
     * This now calls the real configured Gemini model on the real specimen image.
     * If the image bytes cannot be retrieved the sample is failed rather than
     * scored, so a run over a dataset with no real imagery produces zero
     * predictions and therefore no metrics.
     */
    async generateSamplePrediction(sample, image, modelName, promptVersion) {
        const imageBytes = await this.loadValidationImageBytes(image);
        if (!imageBytes) {
            throw new Error(`Sample '${sample.sample_code}' has no retrievable image bytes, so no real model prediction can be made. ` +
                'A specimen image must be uploaded to object storage before this sample can be evaluated.');
        }
        const mimeType = inferImageMimeType(image?.storage_path);
        const startedAt = Date.now();
        // Delegate to the same analysis path used by the live WhatsApp pipeline so
        // validation measures the deployed system rather than a parallel code path.
        const result = await geminiService.analyzeRockImage(imageBytes, mimeType, sample.specimen_notes ?? undefined);
        return {
            is_rock: result.is_rock,
            classification: result.primary_classification,
            possible_name: result.possible_name ?? '',
            confidence: result.confidence,
            confidence_score: result.confidence_score,
            observed_features: result.observed_features ?? [],
            reasoning: result.reasoning,
            limitations: result.limitations ?? [],
            response_time_ms: Date.now() - startedAt,
            model_used: result.model_used || modelName,
        };
    }
    determineInitialErrorCategory(refCls, aiCls, image, consensus) {
        // Checked before anything else. When the expert panel did not agree, the
        // record is evidence about the reference set, not about the model: blaming
        // the model for disagreeing with a contested label would misfile the cause.
        if (consensus?.is_disputed) {
            return 'expert_disagreement';
        }
        if (image?.quality_status === 'needs_review') {
            return 'poor_image_quality';
        }
        if (image?.lighting_condition === 'smartphone_flash') {
            return 'lighting';
        }
        // A model that declined to call the specimen a rock failed for a different
        // reason than one that confused two rock classes, and pooling the two would
        // make the error breakdown describe a model that never made the mistake.
        if (aiCls === 'non_rock' || aiCls === 'insufficient_image') {
            return 'non_rock_confusion';
        }
        // "Unclassified" means the model saw the specimen and withheld a call, which
        // is a different failure from guessing one of the rock classes wrongly.
        if (aiCls === 'unclassified') {
            return 'insufficient_context';
        }
        // Between two of the three evaluated rock classes, any disagreement is a
        // class confusion. Splitting these further by guessing at the cause -
        // "weathering", "mixed sample" - would be an invented geological claim, so
        // the automatic classifier stops at what the recorded evidence supports and
        // a human annotates the reason afterwards.
        return 'visual_similarity';
    }
    /**
     * Categories this classifier does not produce on its own.
     *
     * `weathering` and `mixed_or_complex_sample` describe the specimen, not the
     * disagreement. Nothing in the stored image metadata identifies them, so
     * inferring one from a class pair would assert a cause the system cannot
     * observe. They are assigned by a reviewer looking at the specimen, which is
     * what `ValidationErrorRecord.annotated_by` exists for.
     */
    static REVIEWER_ASSIGNED_CATEGORIES = [
        'weathering',
        'mixed_or_complex_sample',
        // The catch-all, kept for a reviewer who has not yet decided. It is never
        // inferred: every combination the classifier sees has a specific answer.
        'unknown',
    ];
    // -------------------------------------------------------------
    // Statistical Evaluation Engine
    // -------------------------------------------------------------
    /**
     * Evaluates a run against the configured sample-size policy.
     *
     * The judgement is expressed as a status plus the individual criteria that
     * were checked, so a reader can see exactly which requirement was unmet rather
     * than a bare boolean. The status is always relative to an intended claim.
     */
    static assessReadiness(claim, policy, ctx) {
        const criteria = [];
        const answeredTotal = {
            criterion: 'answered_total',
            requirement: `at least ${policy.min_answered_total} scored pairs`,
            observed: `${ctx.scoredPairs} scored pair(s)`,
            met: ctx.scoredPairs >= policy.min_answered_total,
        };
        const perClassSupport = {
            criterion: 'per_class_support',
            requirement: `every evaluated class has at least ${policy.min_per_class_support} references`,
            observed: `weakest class has ${ctx.weakestClassSupport} reference(s)`,
            met: ctx.scoredPairs > 0 && ctx.weakestClassSupport >= policy.min_per_class_support,
        };
        const referenceQuality = {
            criterion: 'reference_quality',
            requirement: `lowest reference consensus is at least ${policy.min_reference_agreement_pct}%`,
            observed: ctx.minReferenceAgreementPct === null
                ? 'no scored references'
                : `${ctx.minReferenceAgreementPct}%`,
            met: ctx.minReferenceAgreementPct !== null &&
                ctx.minReferenceAgreementPct >= policy.min_reference_agreement_pct,
        };
        const exclusionRatio = {
            criterion: 'exclusion_ratio',
            requirement: `excluded share is at most ${policy.max_excluded_ratio_pct}%`,
            observed: `${ctx.excludedRatioPct}%`,
            met: ctx.excludedRatioPct <= policy.max_excluded_ratio_pct,
        };
        if (claim === 'exploratory_signal') {
            criteria.push({
                criterion: 'any_scored_pair',
                requirement: `at least ${policy.metric_min_evaluated_pairs} scored pair(s)`,
                observed: `${ctx.scoredPairs} scored pair(s)`,
                met: ctx.scoredPairs >= policy.metric_min_evaluated_pairs,
            });
        }
        else if (claim === 'class_level_performance') {
            criteria.push(answeredTotal, perClassSupport);
        }
        else {
            criteria.push(answeredTotal, perClassSupport, referenceQuality, exclusionRatio);
        }
        const blocking = criteria.filter((c) => !c.met);
        let status;
        if (ctx.scoredPairs === 0) {
            status = 'not_measured';
        }
        else if (ctx.scoredPairs < policy.metric_min_evaluated_pairs) {
            status = 'insufficient_data';
        }
        else if (blocking.length === 0) {
            status = 'reportable';
        }
        else {
            status = 'preliminary';
        }
        const note = status === 'reportable'
            ? `The dataset satisfies the configured policy for a '${claim}' claim.`
            : status === 'preliminary'
                ? `Real figures are computable, but the dataset does not yet satisfy the policy for a '${claim}' claim. Treat these as preliminary.`
                : status === 'insufficient_data'
                    ? 'Too few scored pairs to publish any performance figure.'
                    : 'No scored pair exists, so nothing has been measured.';
        return {
            status,
            intended_claim: claim,
            policy,
            criteria,
            blocking_reasons: blocking.map((c) => `${c.criterion}: required ${c.requirement}, observed ${c.observed}`),
            note,
        };
    }
    async computeRunEvaluation(runId, options = {}) {
        const run = await this.repo.getAiRunById(runId);
        if (!run)
            throw new Error('AI run not found');
        const dataset = await this.repo.getDatasetById(run.dataset_id);
        const predictions = await this.repo.getPredictionsByRun(runId);
        const samples = await this.repo.listSamplesByDataset(run.dataset_id);
        const sampleMap = new Map(samples.map((s) => [s.id, s]));
        const claim = options.claim ?? 'dataset_validation';
        const policy = { ...defaultSampleSizePolicy(), ...(options.policy ?? {}) };
        // Classes evaluated. This list is exactly the three rock classes; every
        // macro average and the confusion matrix depend on it, so growth would shift
        // the platform's reported numbers silently.
        const classes = ['igneous', 'sedimentary', 'metamorphic'];
        const pairs = [];
        let excludedNoReference = 0;
        let excludedDisputedReference = 0;
        let excludedNonRockReference = 0;
        let excludedAbstention = 0;
        const isRockClass = (c) => c === 'igneous' || c === 'sedimentary' || c === 'metamorphic';
        for (const pred of predictions) {
            const sample = sampleMap.get(pred.sample_id);
            if (!sample || !sample.consensus || !sample.consensus.majority_classification) {
                excludedNoReference++;
                continue;
            }
            // A disputed reference is evidence about the reference set, not the model,
            // so it never enters a clean evaluation.
            if (sample.consensus.is_disputed) {
                excludedDisputedReference++;
                continue;
            }
            // The reference must be one of the evaluated rock classes. A consensus on
            // `non_rock` cannot be scored against a rock class.
            if (!isRockClass(sample.consensus.majority_classification)) {
                excludedNonRockReference++;
                continue;
            }
            // A model that withheld a call did not answer the question this metric
            // asks, which is "given a specimen of known class, which class do you
            // name?". Scoring `insufficient_image`, `unclassified` and `non_rock` as
            // false negatives would report a refusal as a misclassification, and would
            // make the accuracy depend on how often the model declined rather than on
            // how often it was right. They are recorded as abstentions and stay visible
            // in the counts and error analysis instead.
            if (!isRockClass(pred.classification)) {
                excludedAbstention++;
                continue;
            }
            pairs.push({
                sample_id: sample.id,
                reference_class: sample.consensus.majority_classification,
                predicted_class: pred.classification,
                confidence: pred.confidence,
                reference_agreement_pct: sample.consensus.consensus_percentage,
            });
        }
        const attempted = predictions.length;
        const eligible = attempted - excludedNoReference - excludedDisputedReference - excludedNonRockReference;
        const scoredPairs = pairs.length;
        const excludedTotal = excludedNoReference + excludedDisputedReference + excludedNonRockReference + excludedAbstention;
        const pct = (numerator, denominator) => denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;
        const counts = {
            attempted_predictions: attempted,
            eligible_pairs: eligible,
            scored_pairs: scoredPairs,
            correct: 0,
            incorrect: 0,
            abstentions: excludedAbstention,
            excluded_no_reference: excludedNoReference,
            excluded_disputed_reference: excludedDisputedReference,
            excluded_non_rock_reference: excludedNonRockReference,
            excluded_abstention: excludedAbstention,
            answered_coverage_pct: pct(scoredPairs, eligible),
            dataset_coverage_pct: pct(scoredPairs, samples.length),
            abstention_rate_pct: pct(excludedAbstention, eligible),
        };
        // Which models actually produced these predictions. A run whose rows were
        // served by more than one model cannot be summarised by a single accuracy
        // figure: the pooled number describes neither model.
        const modelsObserved = Array.from(new Set(predictions.map((p) => p.model_name).filter((name) => Boolean(name)))).sort();
        const isMixedModelRun = modelsObserved.length > 1;
        // Per-class reference support among the scored pairs.
        const classSupports = classes.map((c) => pairs.filter((p) => p.reference_class === c).length);
        const weakestClassSupport = classSupports.length > 0 ? Math.min(...classSupports) : 0;
        const minReferenceAgreementPct = scoredPairs > 0 ? Math.min(...pairs.map((p) => p.reference_agreement_pct)) : null;
        const excludedRatioPct = attempted > 0 ? Math.round((excludedTotal / attempted) * 1000) / 10 : 0;
        const readiness = ValidationEvaluationService.assessReadiness(claim, policy, {
            scoredPairs,
            weakestClassSupport,
            minReferenceAgreementPct,
            excludedRatioPct,
        });
        const baseFields = {
            run_id: run.id,
            dataset_code: dataset?.dataset_code || 'UNKNOWN',
            dataset_version: dataset?.version || '1.0',
            model_name: run.model_name,
            prompt_version: run.prompt_version,
            evaluation_timestamp: new Date().toISOString(),
            total_evaluated_samples: attempted,
            valid_samples: scoredPairs,
            excluded_samples: excludedTotal,
            is_partial_run: run.is_partial_run,
            is_mixed_model_run: isMixedModelRun,
            models_observed: modelsObserved,
            counts,
            readiness,
        };
        // REAL DATA POLICY: too few scored pairs means "not measured" or "not yet
        // measurable", never "scored zero". Returning 0 here would present a
        // fabricated catastrophic result; null presents the truth.
        if (scoredPairs < policy.metric_min_evaluated_pairs) {
            const notMeasured = scoredPairs === 0;
            return {
                ...baseFields,
                correct_classifications: 0,
                incorrect_classifications: 0,
                agreement_rate_pct: null,
                macro_precision: null,
                macro_recall: null,
                macro_f1: null,
                weighted_f1: null,
                metrics_are_real_measurements: false,
                per_class_metrics: {},
                confusion_matrix: [],
                confidence_analysis: [],
                sufficient_sample_size: false,
                disclaimer: notMeasured
                    ? 'No validated field dataset available yet. No specimen image has been scored against a reference label, so no accuracy, precision, recall or F1 figure can be reported. A null value means not measured.'
                    : `Evaluation dataset is still too small to publish any performance figure (${scoredPairs} scored pair(s); at least ${policy.metric_min_evaluated_pairs} required before a number is shown). Metrics are null because they would be statistically meaningless on so few specimens.`,
            };
        }
        // 1. Confusion Matrix: Rows = Reference, Columns = Predicted
        const matrixCount = new Map();
        let correctCount = 0;
        for (const p of pairs) {
            const key = `${p.reference_class}__${p.predicted_class}`;
            matrixCount.set(key, (matrixCount.get(key) || 0) + 1);
            if (p.reference_class === p.predicted_class) {
                correctCount++;
            }
        }
        const confusion_matrix = [];
        matrixCount.forEach((cnt, key) => {
            const [ref, pred] = key.split('__');
            confusion_matrix.push({ reference_class: ref, predicted_class: pred, count: cnt });
        });
        counts.correct = correctCount;
        counts.incorrect = scoredPairs - correctCount;
        // 2. Per-class metrics
        const per_class_metrics = {};
        let sumPrecision = 0;
        let sumRecall = 0;
        let sumF1 = 0;
        let weightedF1Sum = 0;
        let activeClasses = 0;
        for (const c of classes) {
            let tp = 0;
            let fp = 0;
            let fn = 0;
            let support = 0;
            for (const p of pairs) {
                if (p.reference_class === c) {
                    support++;
                    if (p.predicted_class === c) {
                        tp++;
                    }
                    else {
                        fn++;
                    }
                }
                else if (p.predicted_class === c) {
                    fp++;
                }
            }
            const precision = tp + fp > 0 ? Math.round((tp / (tp + fp)) * 1000) / 1000 : 0;
            const recall = tp + fn > 0 ? Math.round((tp / (tp + fn)) * 1000) / 1000 : 0;
            const f1 = precision + recall > 0 ? Math.round(((2 * precision * recall) / (precision + recall)) * 1000) / 1000 : 0;
            per_class_metrics[c] = {
                precision,
                recall,
                f1,
                support,
                true_positives: tp,
                false_positives: fp,
                false_negatives: fn,
            };
            if (support > 0) {
                sumPrecision += precision;
                sumRecall += recall;
                sumF1 += f1;
                weightedF1Sum += f1 * support;
                activeClasses++;
            }
        }
        const macro_precision = activeClasses > 0 ? Math.round((sumPrecision / activeClasses) * 1000) / 1000 : 0;
        const macro_recall = activeClasses > 0 ? Math.round((sumRecall / activeClasses) * 1000) / 1000 : 0;
        const macro_f1 = activeClasses > 0 ? Math.round((sumF1 / activeClasses) * 1000) / 1000 : 0;
        const weighted_f1 = scoredPairs > 0 ? Math.round((weightedF1Sum / scoredPairs) * 1000) / 1000 : 0;
        const agreementRate = scoredPairs > 0 ? Math.round((correctCount / scoredPairs) * 1000) / 10 : 0;
        // 3. Confidence Analysis
        const tiers = ['high', 'moderate', 'low'];
        const confidence_analysis = tiers.map((tier) => {
            const tierPairs = pairs.filter((p) => p.confidence === tier);
            const tierCorrect = tierPairs.filter((p) => p.reference_class === p.predicted_class).length;
            return {
                tier,
                total: tierPairs.length,
                correct: tierCorrect,
                accuracy_pct: tierPairs.length > 0 ? Math.round((tierCorrect / tierPairs.length) * 1000) / 10 : 0,
            };
        });
        const sufficientSampleSize = readiness.status === 'reportable';
        const reportable = readiness.status === 'reportable';
        const caveat = isMixedModelRun
            ? `MIXED MODEL RUN. These predictions were served by ${modelsObserved.length} different models (${modelsObserved.join(', ')}), so the figures below describe no single model and are not a model validation. A quota error appears to have forced a fallback part-way through the run. Re-run the evaluation on one model to obtain a valid result.`
            : run.is_partial_run
                ? `PARTIAL RUN. These metrics are real measurements, but they cover only ${scoredPairs} of the ${samples.length} specimens in dataset '${dataset?.dataset_code || 'UNKNOWN'}'. The per-run sample cap stopped the run early, so this is not a validation of the dataset and must not be reported as a dataset-wide accuracy.`
                : reportable
                    ? 'Performance metrics describe model behaviour on this controlled validation dataset, where predictions came from the configured model run against real specimen images. Results must not be extrapolated as universal field accuracy across unmapped terrains.'
                    : `PRELIMINARY. These figures are real measurements over ${scoredPairs} scored pair(s), but the dataset does not yet meet the configured policy for a '${claim}' claim (${readiness.blocking_reasons.join('; ')}). Do not report them as a validated result.`;
        return {
            ...baseFields,
            correct_classifications: correctCount,
            incorrect_classifications: scoredPairs - correctCount,
            agreement_rate_pct: agreementRate,
            macro_precision,
            macro_recall,
            macro_f1,
            weighted_f1,
            per_class_metrics,
            confusion_matrix,
            confidence_analysis,
            sufficient_sample_size: sufficientSampleSize,
            // A mixed-model run produces real numbers, but they are not a measurement
            // of any single model, so they are not a validation of one.
            metrics_are_real_measurements: !isMixedModelRun,
            disclaimer: caveat,
        };
    }
    // -------------------------------------------------------------
    // Error Analysis
    // -------------------------------------------------------------
    async getRunErrors(runId) {
        // Confirm the run exists before answering. An unknown run id and a run that
        // genuinely produced no errors would otherwise return the same empty list,
        // and a caller reviewing a validation would read "no errors found" where the
        // truth is "no such run".
        const run = await this.repo.getAiRunById(runId);
        if (!run)
            throw new Error('Run not found');
        return this.repo.getErrorsByRun(runId);
    }
    // -------------------------------------------------------------
    // Reproducible Research Export (CSV, JSON, GeoJSON)
    // -------------------------------------------------------------
    async exportEvaluationCsv(runId) {
        const run = await this.repo.getAiRunById(runId);
        if (!run)
            throw new Error('Run not found');
        const dataset = await this.repo.getDatasetById(run.dataset_id);
        const predictions = await this.repo.getPredictionsByRun(runId);
        const samples = await this.repo.listSamplesByDataset(run.dataset_id);
        const sampleMap = new Map(samples.map((s) => [s.id, s]));
        const rows = [];
        rows.push([
            'dataset_code',
            'dataset_version',
            'run_code',
            'model_name',
            'prompt_version',
            'sample_code',
            'source_type',
            'district',
            'reference_classification',
            'reference_consensus_pct',
            'ai_predicted_classification',
            'ai_confidence',
            'ai_confidence_score',
            'is_match',
            'response_time_ms',
        ].join(','));
        const sanitizeCsvCell = (value) => {
            let text = String(value ?? '');
            if (/^[=+\-@\t\r]/.test(text.trimStart())) {
                text = `'${text}`;
            }
            return `"${text.replace(/"/g, '""')}"`;
        };
        for (const pred of predictions) {
            const sample = sampleMap.get(pred.sample_id);
            const refCls = sample?.consensus?.majority_classification || 'unreviewed';
            const consensusPct = sample?.consensus?.consensus_percentage || 0;
            const isMatch = refCls !== 'unreviewed' ? refCls === pred.classification : false;
            const row = [
                sanitizeCsvCell(dataset?.dataset_code || ''),
                sanitizeCsvCell(dataset?.version || ''),
                sanitizeCsvCell(run.run_code),
                sanitizeCsvCell(run.model_name),
                sanitizeCsvCell(run.prompt_version),
                sanitizeCsvCell(sample?.sample_code || ''),
                sanitizeCsvCell(sample?.source_type || ''),
                sanitizeCsvCell(sample?.district || ''),
                sanitizeCsvCell(refCls),
                consensusPct,
                sanitizeCsvCell(pred.classification),
                sanitizeCsvCell(pred.confidence),
                pred.confidence_score || 0,
                isMatch ? 1 : 0,
                pred.response_time_ms,
            ];
            rows.push(row.join(','));
        }
        return rows.join('\n');
    }
    async exportEvaluationJson(runId) {
        const run = await this.repo.getAiRunById(runId);
        if (!run)
            throw new Error('Run not found');
        const dataset = await this.repo.getDatasetById(run.dataset_id);
        const evaluation = await this.computeRunEvaluation(runId);
        const errors = await this.getRunErrors(runId);
        return {
            dataset: {
                code: dataset?.dataset_code,
                name: dataset?.name,
                version: dataset?.version,
            },
            evaluation_run: {
                run_code: run.run_code,
                model_name: run.model_name,
                prompt_version: run.prompt_version,
                completed_at: run.completed_at,
            },
            evaluation,
            errors,
        };
    }
}
export const validationEvaluationService = new ValidationEvaluationService();
