import { env } from '../config/env.js';
import { resolvePublicCoordinates } from '../utils/public-location.js';
import { expertRepository } from '../repositories/expert.repository.js';
import { dataQualityService } from './data-quality.service.js';
export class ResearchAnalyticsService {
    repo;
    qualityService;
    auditLogs = [];
    requestCounter = 0;
    startTime = Date.now();
    constructor(repo = expertRepository, qualityService = dataQualityService) {
        this.repo = repo;
        this.qualityService = qualityService;
    }
    recordRequest() {
        this.requestCounter += 1;
    }
    /**
     * Log an audited compliance event.
     */
    logComplianceEvent(event) {
        const record = {
            ...event,
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
        };
        this.auditLogs.unshift(record);
        if (this.auditLogs.length > 500) {
            this.auditLogs.pop();
        }
        return record;
    }
    getComplianceLogs() {
        return [...this.auditLogs];
    }
    async loadDetailsBatch(passportIds) {
        if (passportIds.length === 0)
            return [];
        if (typeof this.repo.getObservationDetailsForExpert === 'function') {
            return this.repo.getObservationDetailsForExpert(passportIds);
        }
        const resolved = await Promise.all(passportIds.map((pid) => this.repo.getObservationForExpert(pid)));
        return resolved.filter((item) => Boolean(item));
    }
    /**
     * Generates comprehensive research-grade analytics.
     */
    async getResearchSummary() {
        const { data: summaries } = await this.repo.findObservationsForReview({ limit: 1000 });
        const fullObservations = await this.loadDetailsBatch(summaries.map((s) => s.passport_id));
        // 1. Observation Stats
        const total = fullObservations.length;
        const completed = fullObservations.filter((o) => o.status === 'completed').length;
        const failed = fullObservations.filter((o) => o.status === 'failed').length;
        const rock_count = fullObservations.filter((o) => o.ai_analysis?.is_rock).length;
        const non_rock_count = fullObservations.filter((o) => o.ai_analysis && !o.ai_analysis.is_rock).length;
        const insufficient_image_count = fullObservations.filter((o) => o.ai_analysis?.primary_classification === 'insufficient_image').length;
        // 2. Classification Stats
        const classification_stats = {
            igneous: 0,
            sedimentary: 0,
            metamorphic: 0,
            unclassified: 0,
            non_rock: 0,
            insufficient_image: 0,
        };
        fullObservations.forEach((o) => {
            const cls = o.ai_analysis?.primary_classification || 'unclassified';
            classification_stats[cls] = (classification_stats[cls] || 0) + 1;
        });
        // 3. Verification Stats
        const verification_stats = {
            unverified: fullObservations.filter((o) => o.verification_status === 'unverified').length,
            under_review: fullObservations.filter((o) => o.verification_status === 'under_review').length,
            expert_verified: fullObservations.filter((o) => o.verification_status === 'expert_verified').length,
            rejected: fullObservations.filter((o) => o.verification_status === 'rejected').length,
        };
        // 4. Geographic Stats (Scientific honesty: observation counts != geological abundance)
        const districtMap = new Map();
        fullObservations.forEach((o) => {
            const district = o.location?.district || 'Unknown District';
            const entry = districtMap.get(district) || { count: 0, classifications: {}, verified: 0 };
            entry.count += 1;
            const cls = o.ai_analysis?.primary_classification || 'unclassified';
            entry.classifications[cls] = (entry.classifications[cls] || 0) + 1;
            if (o.verification_status === 'expert_verified') {
                entry.verified += 1;
            }
            districtMap.set(district, entry);
        });
        const districts = Array.from(districtMap.entries()).map(([district, val]) => ({
            district,
            observation_count: val.count,
            percentage_of_total: total > 0 ? Math.round((val.count / total) * 1000) / 10 : 0,
            classifications: val.classifications,
            verified_count: val.verified,
        }));
        districts.sort((a, b) => b.observation_count - a.observation_count);
        // 5. Data Quality Stats
        const qualityAssessments = fullObservations.map((o) => this.qualityService.assessObservationQuality(o));
        const avgScore = qualityAssessments.length > 0
            ? Math.round((qualityAssessments.reduce((acc, q) => acc + q.overall_score, 0) / qualityAssessments.length) * 10) / 10
            : 0;
        const score_distribution = {
            high: qualityAssessments.filter((q) => q.completeness_category === 'high').length,
            good: qualityAssessments.filter((q) => q.completeness_category === 'good').length,
            moderate: qualityAssessments.filter((q) => q.completeness_category === 'moderate').length,
            low: qualityAssessments.filter((q) => q.completeness_category === 'low').length,
        };
        const duplicate_suspects_count = qualityAssessments.filter((q) => q.duplicate_risk_flag).length;
        // 6. Temporal Stats
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const observations_today = fullObservations.filter((o) => new Date(o.created_at) >= oneDayAgo).length;
        const observations_this_week = fullObservations.filter((o) => new Date(o.created_at) >= oneWeekAgo).length;
        const observations_this_month = fullObservations.filter((o) => new Date(o.created_at) >= oneMonthAgo).length;
        // 7. AI vs Expert Evaluation (Section 14 & 15)
        const ai_vs_expert = this.evaluateAiVsExpert(fullObservations);
        return {
            dataset_version: env.RESEARCH_DATASET_VERSION || 'RT-RW-RESEARCH-2026-001',
            generated_at: new Date().toISOString(),
            observation_stats: {
                total,
                completed,
                failed,
                rock_count,
                non_rock_count,
                insufficient_image_count,
            },
            classification_stats,
            verification_stats,
            geographic_stats: {
                total_districts_represented: districts.filter((d) => d.district !== 'Unknown District').length,
                total_rwanda_districts: 30,
                districts,
                scientific_note: 'Observation distribution reflects citizen volunteer participation and phone network coverage. It must not be inferred as geological rock abundance or ore reserves.',
            },
            temporal_stats: {
                observations_today,
                observations_this_week,
                observations_this_month,
            },
            data_quality_stats: {
                average_score: avgScore,
                score_distribution,
                duplicate_suspects_count,
            },
            ai_vs_expert,
            operational_metrics: {
                total_requests: this.requestCounter,
                ai_analyses_completed: completed,
                // REAL DATA POLICY: these are `null` rather than invented constants.
                // Inference latency, database write counts and rate-limit events are not
                // currently instrumented, so reporting a number here would be fabricating
                // an operational measurement. `null` means "not measured".
                average_ai_duration_ms: null,
                database_operations_count: null,
                rate_limit_events_count: null,
                metrics_instrumented: false,
                metrics_note: 'Latency, database operation counts and rate-limit events are not instrumented. Null means not measured, not zero.',
                uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
            },
        };
    }
    /**
     * Rigorous AI vs Expert evaluation logic.
     * Compares AI preliminary prediction against expert reference decision.
     */
    evaluateAiVsExpert(observations) {
        // Only observations that have an authoritative expert verification
        const verifiedObservations = observations.filter((o) => o.latest_verification && o.latest_verification.expert_classification);
        const eligible_sample_count = verifiedObservations.length;
        const sufficient_sample_size = eligible_sample_count >= 3;
        if (!sufficient_sample_size) {
            return {
                total_expert_reviewed: eligible_sample_count,
                eligible_sample_count,
                sufficient_sample_size: false,
                disclaimer: 'Insufficient expert-reviewed samples for reliable performance estimation (minimum 3 expert-verified specimens required).',
                overall_agreement_count: 0,
                overall_disagreement_count: 0,
                agreement_rate_pct: 0,
                macro_f1: 0,
                confusion_matrix: [],
                class_metrics: {},
            };
        }
        let agreementCount = 0;
        let disagreementCount = 0;
        const matrixMap = new Map();
        const classes = ['igneous', 'sedimentary', 'metamorphic'];
        // Track per-class True Positives, False Positives, False Negatives
        const tp = { igneous: 0, sedimentary: 0, metamorphic: 0 };
        const fp = { igneous: 0, sedimentary: 0, metamorphic: 0 };
        const fn = { igneous: 0, sedimentary: 0, metamorphic: 0 };
        const support = { igneous: 0, sedimentary: 0, metamorphic: 0 };
        for (const obs of verifiedObservations) {
            const aiCls = obs.ai_analysis.primary_classification;
            const expCls = obs.latest_verification.expert_classification;
            const key = `${aiCls}__${expCls}`;
            matrixMap.set(key, (matrixMap.get(key) || 0) + 1);
            if (aiCls === expCls) {
                agreementCount += 1;
                if (tp[expCls] !== undefined)
                    tp[expCls] += 1;
            }
            else {
                disagreementCount += 1;
                if (fp[aiCls] !== undefined)
                    fp[aiCls] += 1;
                if (fn[expCls] !== undefined)
                    fn[expCls] += 1;
            }
            if (support[expCls] !== undefined) {
                support[expCls] += 1;
            }
        }
        const confusion_matrix = [];
        matrixMap.forEach((count, key) => {
            const [ai_classification, expert_classification] = key.split('__');
            confusion_matrix.push({ ai_classification, expert_classification, count });
        });
        const class_metrics = {};
        let f1Sum = 0;
        let evaluatedClassesCount = 0;
        for (const c of classes) {
            const truePos = tp[c] || 0;
            const falsePos = fp[c] || 0;
            const falseNeg = fn[c] || 0;
            const supp = support[c] || 0;
            const precision = truePos + falsePos > 0 ? Math.round((truePos / (truePos + falsePos)) * 1000) / 1000 : 0;
            const recall = truePos + falseNeg > 0 ? Math.round((truePos / (truePos + falseNeg)) * 1000) / 1000 : 0;
            const f1 = precision + recall > 0 ? Math.round(((2 * precision * recall) / (precision + recall)) * 1000) / 1000 : 0;
            class_metrics[c] = { precision, recall, f1, support: supp };
            if (supp > 0) {
                f1Sum += f1;
                evaluatedClassesCount += 1;
            }
        }
        const macro_f1 = evaluatedClassesCount > 0 ? Math.round((f1Sum / evaluatedClassesCount) * 1000) / 1000 : 0;
        const agreement_rate_pct = eligible_sample_count > 0 ? Math.round((agreementCount / eligible_sample_count) * 1000) / 10 : 0;
        return {
            total_expert_reviewed: eligible_sample_count,
            eligible_sample_count,
            sufficient_sample_size: true,
            disclaimer: 'Metrics measure observed agreement between AI preliminary model and authorized expert reference decisions. This does not represent official laboratory assays.',
            overall_agreement_count: agreementCount,
            overall_disagreement_count: disagreementCount,
            agreement_rate_pct,
            macro_f1,
            confusion_matrix,
            class_metrics,
        };
    }
    /**
     * Generates research CSV export with strict privacy whitelisting (Section 18).
     * EXCLUDES: Phone numbers, source_message_id, session tokens, exact coordinates.
     */
    async exportObservationsCsv(actorId = 'anonymous') {
        const { data: summaries } = await this.repo.findObservationsForReview({ limit: 1000 });
        const rows = [];
        // Header row
        // Category and evidence state lead the export. A dataset that opens with the
        // legacy rock classification alone would make every fossil, landform and
        // mineral indistinguishable from a rock, and would hide that an
        // `expert_reviewed` reading is not the same thing as a confirmed one.
        rows.push([
            'observation_id',
            'passport_id',
            'observation_category',
            'observation_subcategory',
            'classification',
            'possible_name',
            'ai_confidence',
            'ai_confidence_score',
            'evidence_state',
            'verification_status',
            'expert_classification',
            'expert_decision',
            'data_quality_score',
            'district',
            'public_location_precision',
            'created_at',
            'expert_reviewed_at',
        ].join(','));
        const sanitizeCsvCell = (value) => {
            let text = String(value ?? '');
            if (/^[=+\-@\t\r]/.test(text.trimStart())) {
                text = `'${text}`;
            }
            return `"${text.replace(/"/g, '""')}"`;
        };
        const details = await this.loadDetailsBatch(summaries.map((s) => s.passport_id));
        for (const detail of details) {
            const quality = this.qualityService.assessObservationQuality(detail);
            const row = [
                sanitizeCsvCell(detail.id),
                sanitizeCsvCell(detail.passport_id),
                sanitizeCsvCell(detail.ai_analysis.observation_category),
                sanitizeCsvCell(detail.ai_analysis.observation_subcategory),
                sanitizeCsvCell(detail.ai_analysis.primary_classification),
                sanitizeCsvCell(detail.ai_analysis.possible_name || ''),
                sanitizeCsvCell(detail.ai_analysis.confidence),
                detail.ai_analysis.confidence_score,
                sanitizeCsvCell(detail.evidence_state || ''),
                sanitizeCsvCell(detail.verification_status),
                sanitizeCsvCell(detail.latest_verification?.expert_classification || ''),
                sanitizeCsvCell(detail.latest_verification?.status || ''),
                quality.overall_score,
                sanitizeCsvCell(detail.location?.district || ''),
                sanitizeCsvCell(detail.location?.precision || 'district'),
                sanitizeCsvCell(detail.created_at),
                sanitizeCsvCell(detail.latest_verification?.created_at || ''),
            ];
            rows.push(row.join(','));
        }
        // Log export event for audit compliance
        this.logComplianceEvent({
            event_id: `exp_csv_${Date.now()}`,
            actor_id: actorId,
            actor_role: 'researcher',
            event_type: 'research_export_created',
            target_type: 'dataset_export_csv',
            target_id: env.RESEARCH_DATASET_VERSION || 'RT-RW-RESEARCH-2026-001',
            request_id: crypto.randomUUID(),
            metadata: { record_count: rows.length - 1, format: 'csv' },
        });
        return rows.join('\n');
    }
    /**
     * Generates research GeoJSON export with privacy-generalized coordinates (Section 19).
     */
    async exportObservationsGeoJson(actorId = 'anonymous') {
        const { data: summaries } = await this.repo.findObservationsForReview({ limit: 1000 });
        const features = [];
        const details = await this.loadDetailsBatch(summaries.map((s) => s.passport_id));
        for (const detail of details) {
            if (!detail || !detail.location) {
                continue;
            }
            // Both gates apply here, and neither alone is enough.
            //
            // This export reads a raw record, so the true coordinate is present even
            // where the contributor never consented to it being shared - authorisation
            // to download a dataset is not consent to publish someone's home. The
            // consent gate is applied first, downgrading an exact coordinate to its
            // district before generalizing, so the resolver never sees a precise
            // value it would faithfully hand back.
            const precision = detail.location.precision;
            const effectivePrecision = (precision !== 'exact' || detail.location.is_public) && precision !== 'private'
                ? precision
                : 'district';
            const coords = resolvePublicCoordinates({
                precision: effectivePrecision,
                district: detail.location.district,
                latitude: detail.location.latitude,
                longitude: detail.location.longitude,
            });
            if (!coords) {
                // No coordinate the privacy policy will yield. The record is still in the
                // CSV export; dropping it from the map silently would look like it does
                // not exist.
                continue;
            }
            const quality = this.qualityService.assessObservationQuality(detail);
            features.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [coords.longitude, coords.latitude],
                },
                properties: {
                    passport_id: detail.passport_id,
                    observation_category: detail.ai_analysis.observation_category,
                    observation_subcategory: detail.ai_analysis.observation_subcategory,
                    classification: detail.ai_analysis.primary_classification,
                    possible_name: detail.ai_analysis.possible_name,
                    confidence: detail.ai_analysis.confidence,
                    confidence_score: detail.ai_analysis.confidence_score,
                    evidence_state: detail.evidence_state,
                    verification_status: detail.verification_status,
                    expert_classification: detail.latest_verification?.expert_classification || null,
                    district: detail.location.district,
                    sector: detail.location.sector,
                    precision: effectivePrecision,
                    data_quality_score: quality.overall_score,
                    created_at: detail.created_at,
                },
            });
        }
        this.logComplianceEvent({
            event_id: `exp_geojson_${Date.now()}`,
            actor_id: actorId,
            actor_role: 'researcher',
            event_type: 'research_export_created',
            target_type: 'dataset_export_geojson',
            target_id: env.RESEARCH_DATASET_VERSION || 'RT-RW-RESEARCH-2026-001',
            request_id: crypto.randomUUID(),
            metadata: { feature_count: features.length, format: 'geojson' },
        });
        return {
            type: 'FeatureCollection',
            dataset_version: env.RESEARCH_DATASET_VERSION || 'RT-RW-RESEARCH-2026-001',
            generated_at: new Date().toISOString(),
            license: 'Open Access Research Use — Rwanda Geological Citizen Science',
            features,
        };
    }
}
export const researchAnalyticsService = new ResearchAnalyticsService();
