import { demoMapRecords } from './demo-map-records.js';
import { approximateCoordinates } from '../utils/public-location.js';
const DEMO_SITE_SEEDS = [
    {
        id: 'd1000000-0000-4000-8000-000000000007',
        site_code: 'ET-SITE-DEMO-0007',
        title: 'Dark mineral vein in weathered rock (location kept private)',
        description: 'Preliminary AI-assisted reading of a mineral occurrence. The platform never reports ore, grade, value or a commercial conclusion from a photograph.',
        grouping_basis: 'evidence_backed',
        grouping_evidence: 'Preliminary AI-assisted reading of a mineral occurrence.',
        district: 'Gatsibo',
        sector: 'Kiziguro',
        latitude: -2.1605,
        longitude: 30.4771,
        public_location_precision: 'district',
        created_at: '2026-08-25T11:05:00.000Z',
    },
];
function toSiteRecord(seed) {
    return {
        id: seed.id,
        site_code: seed.site_code,
        title: seed.title,
        description: seed.description,
        grouping_basis: seed.grouping_basis,
        grouping_evidence: seed.grouping_evidence,
        district: seed.district,
        sector: seed.sector,
        latitude: seed.latitude,
        longitude: seed.longitude,
        public_location_precision: seed.public_location_precision,
        is_public: true,
        status: 'active',
        created_by: 'demo',
        created_at: seed.created_at,
        updated_at: seed.created_at,
    };
}
export function demoSites() {
    return DEMO_SITE_SEEDS.map(toSiteRecord);
}
// ---------------------------------------------------------------------------
// Site observation views
// ---------------------------------------------------------------------------
export function siteObservationRows() {
    const rows = [];
    for (const rec of demoMapRecords()) {
        const precision = rec.public_location_precision ?? 'district';
        let publicLat = null;
        let publicLon = null;
        if (precision === 'exact' && typeof rec.latitude === 'number' && typeof rec.longitude === 'number') {
            publicLat = rec.latitude;
            publicLon = rec.longitude;
        }
        else if (precision === 'approximate' && typeof rec.latitude === 'number' && typeof rec.longitude === 'number') {
            const approx = approximateCoordinates(rec.latitude, rec.longitude);
            publicLat = approx.lat;
            publicLon = approx.lon;
        }
        rows.push({
            passport_id: rec.passport_id,
            observation_category: rec.observation_category,
            observation_subcategory: rec.observation_subcategory,
            primary_classification: rec.primary_classification,
            possible_name: rec.possible_name ?? null,
            confidence: rec.confidence,
            confidence_score: rec.confidence_score,
            evidence_state: rec.evidence_state,
            verification_status: rec.verification_status ?? 'unverified',
            observed_features: rec.observed_features ?? [],
            reasoning: rec.reasoning ?? '',
            limitations: rec.limitations ?? [],
            recommended_next_steps: rec.recommended_next_steps ?? [],
            safety_note: rec.safety_note ?? null,
            district: rec.district ?? '',
            public_location_precision: precision,
            public_latitude: publicLat,
            public_longitude: publicLon,
            latitude: rec.latitude ?? null,
            longitude: rec.longitude ?? null,
            is_demo: true,
            created_at: rec.created_at ?? '',
        });
    }
    return rows;
}
// ---------------------------------------------------------------------------
// Community records
// ---------------------------------------------------------------------------
const DEMO_CONTRIBUTORS = {
    aline: 'demo:contributor:aline-uwase',
    jean: 'demo:contributor:jean-bosco-habimana',
    eric: 'demo:contributor:eric-niyonsaba',
    claude: 'demo:contributor:claude-mugisha',
    sandrine: 'demo:contributor:sandrine-mukamana',
};
const SITE = (code) => {
    const match = DEMO_SITE_SEEDS.find((s) => s.site_code === code);
    if (!match)
        throw new Error(`Unknown demo site code ${code}`);
    return match.id;
};
const INVESTIGATIONS = [
    {
        id: 'e1000000-0000-4000-8000-000000000007',
        public_id: 'ET-INV-DEMO-0007',
        site_id: SITE('ET-SITE-DEMO-0007'),
        observation_id: 'ET-DEMO-0007',
        question: 'Is the dark vein harder or softer than the host rock around it?',
        status: 'community_supported',
        opened_by: 'eric',
        research_interest: true,
        options: ['Harder quartz or iron vein', 'Softer weathered zone'],
        context: 'A dark, shiny vein runs through the weathered host rock. We are discussing whether it is harder or softer than the surround.',
        category: 'mineral',
        media_ids: ['/media/pool/rock-07.jpg'],
        created_at: '2026-08-25T11:30:00.000Z',
        votes: [
            { contributor: 'eric', option: 'Harder quartz or iron vein', created_at: '2026-08-25T11:30:00.000Z' },
            { contributor: 'aline', option: 'Harder quartz or iron vein', created_at: '2026-08-26T09:15:00.000Z' },
            { contributor: 'jean', option: 'Softer weathered zone', created_at: '2026-08-27T14:20:00.000Z' },
        ],
    },
    {
        id: 'e1000000-0000-4000-8000-000000000008',
        public_id: 'ET-INV-DEMO-0008',
        site_id: null,
        observation_id: null,
        question: 'Are these parallel fracturing lines caused by regional tectonic stress or weathering?',
        status: 'open',
        opened_by: 'aline',
        research_interest: false,
        options: ['Tectonic stress fracture', 'Surface weathering jointing'],
        context: 'Examining regular fractures across a road cut exposure.',
        category: 'geological_structure',
        media_ids: ['/media/pool/rock-13.jpg', '/media/pool/structure-06.jpg'],
        created_at: '2026-08-28T10:00:00.000Z',
        votes: [
            { contributor: 'aline', option: 'Tectonic stress fracture', created_at: '2026-08-28T10:00:00.000Z' },
            { contributor: 'eric', option: 'Surface weathering jointing', created_at: '2026-08-28T12:00:00.000Z' },
        ],
    },
];
const EVIDENCE = [
    {
        id: 'demo-ev-007',
        investigation_id: 'e1000000-0000-4000-8000-000000000007',
        site_id: SITE('ET-SITE-DEMO-0007'),
        observation_id: null,
        contributor: 'aline',
        evidence_type: 'close_up',
        explanation: 'Close-up of the vein edge showing a sharp contact with the weathered host rock.',
        supports_evidence: true,
        is_challenge: false,
        created_at: '2026-08-26T09:20:00.000Z',
    },
];
const QUESTIONS = [
    {
        id: 'f1000000-0000-4000-8000-000000000007',
        public_id: 'ET-Q-DEMO-0007',
        site_id: SITE('ET-SITE-DEMO-0007'),
        observation_id: 'ET-DEMO-0007',
        investigation_id: 'e1000000-0000-4000-8000-000000000007',
        question: 'Does the dark vein extend across the entire outcrop face?',
        asked_by: 'sandrine',
        status: 'open',
        requested_expert: false,
        context: 'I want to know if the vein is continuous or discontinuous.',
        category: 'mineral',
        created_at: '2026-08-26T10:00:00.000Z',
        answers: [
            {
                id: 'demo-ans-007',
                contributor: 'eric',
                answer: 'It appears continuous across the visible portion of the outcrop.',
                created_at: '2026-08-26T11:00:00.000Z',
            },
        ],
    },
];
const VISITS = [
    {
        id: 'demo-vis-007',
        site_id: SITE('ET-SITE-DEMO-0007'),
        contributor: 'aline',
        visited_on: '2026-08-26',
        notes: 'Inspected the outcrop. Location kept private per contributor preference.',
        created_at: '2026-08-26T09:30:00.000Z',
    },
];
/**
 * Builds the fully-shaped demonstration community records.
 *
 * Counters (participant_count, vote_count, answer_count …) are derived from the
 * seed rows exactly as the database recount would, so a displayed count is
 * always the count of the rows that justify it.
 */
export function buildDemoCommunityData() {
    const contributorHash = (who) => DEMO_CONTRIBUTORS[who];
    const investigations = INVESTIGATIONS.map((inv) => {
        const totalVotes = inv.votes.length;
        const participants = new Set(inv.votes.map((v) => contributorHash(v.contributor))).size;
        return {
            id: inv.id,
            public_id: inv.public_id,
            site_id: inv.site_id,
            observation_id: inv.observation_id,
            question: inv.question,
            status: inv.status,
            opened_by_hash: contributorHash(inv.opened_by),
            is_public: true,
            participant_count: participants,
            evidence_count: 0,
            vote_count: totalVotes,
            research_interest: inv.research_interest,
            options: inv.options,
            context: inv.context,
            category: inv.category,
            media_ids: inv.media_ids ?? [],
            is_demo: true,
            created_at: inv.created_at,
            updated_at: inv.votes[inv.votes.length - 1]?.created_at ?? inv.created_at,
        };
    });
    const votes = INVESTIGATIONS.flatMap((inv, invIndex) => inv.votes.map((v, voteIndex) => ({
        id: `demo-vote-${inv.id}-${voteIndex}`,
        investigation_id: inv.id,
        contributor_hash: contributorHash(v.contributor),
        option: v.option,
        created_at: v.created_at,
        updated_at: v.created_at,
    })));
    const evidence = EVIDENCE.map((e) => ({
        id: e.id,
        investigation_id: e.investigation_id,
        site_id: e.site_id,
        observation_id: e.observation_id,
        media_id: null,
        media_ids: [],
        contributor_hash: contributorHash(e.contributor),
        evidence_type: e.evidence_type,
        explanation: e.explanation,
        supports_evidence: e.supports_evidence,
        is_challenge: e.is_challenge,
        moderation_status: 'visible',
        created_at: e.created_at,
        updated_at: e.created_at,
    }));
    const questions = QUESTIONS.map((q) => ({
        id: q.id,
        public_id: q.public_id,
        site_id: q.site_id,
        observation_id: q.observation_id,
        investigation_id: q.investigation_id,
        question: q.question,
        contributor_hash: contributorHash(q.asked_by),
        status: q.status,
        is_public: true,
        answer_count: q.answers.length,
        vote_count: 0,
        requested_expert: q.requested_expert,
        context: q.context,
        category: q.category,
        media_ids: [],
        is_demo: true,
        created_at: q.created_at,
        updated_at: q.created_at,
    }));
    const answers = QUESTIONS.flatMap((q) => q.answers.map((a) => ({
        id: a.id,
        question_id: q.id,
        contributor_hash: contributorHash(a.contributor),
        answer: a.answer,
        evidence_id: null,
        media_ids: [],
        is_expert: a.is_expert === true,
        created_at: a.created_at,
    })));
    const visits = VISITS.map((v) => ({
        id: v.id,
        site_id: v.site_id,
        contributor_hash: contributorHash(v.contributor),
        visited_on: v.visited_on,
        notes: v.notes,
        media_id: null,
        created_at: v.created_at,
    }));
    for (const inv of investigations) {
        inv.evidence_count = evidence.filter((e) => e.investigation_id === inv.id && e.moderation_status === 'visible').length;
    }
    return { investigations, votes, evidence, questions, answers, visits };
}
// ---------------------------------------------------------------------------
// Highest demo evidence state
// ---------------------------------------------------------------------------
/**
 * Derives the highest evidence state a demonstration site may claim.
 *
 * Mirrors the platform ladder: never `scientifically_confirmed` (no laboratory
 * or documented-reference basis exists), and `community_investigated` only when
 * the seed actually carries two or more substantive evidence items.
 */
export function demoSiteEvidenceState(input) {
    if (input.unresolved)
        return 'unresolved';
    if (input.rejected)
        return 'rejected';
    if (input.evidenceCount < 0)
        return 'ai_assisted';
    if (input.evidenceCount >= 2)
        return 'community_investigated';
    if (input.distinctParticipants >= 3)
        return 'community_supported';
    return 'ai_assisted';
}
