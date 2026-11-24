import { createClient } from '@supabase/supabase-js';
import { validatePublicFilters } from '../src/utils/public-filters.js';
import { resolvePublicCoordinates } from '../src/utils/public-location.js';

type AnyRecord = Record<string, any>;

const PUBLIC_OBSERVATION_VIEW_COLUMNS = [
  'passport_id',
  'observation_category',
  'observation_subcategory',
  'observation_type',
  'primary_interpretation',
  'geological_context',
  'primary_classification',
  'possible_name',
  'confidence',
  'confidence_score',
  'verification_status',
  'evidence_state',
  'community_status',
  'observed_features',
  'diagnostic_features',
  'uncertainties',
  'reasoning',
  'limitations',
  'recommended_next_steps',
  'safety_note',
  'data_quality_status',
  'is_research_opportunity',
  'research_opportunity_count',
  'media_count',
  'public_media_count',
  'primary_media_url',
  'site_title',
  'sector',
  'created_at',
  'published_at',
  'district',
  'site_code',
  'public_location_precision',
  'public_latitude',
  'public_longitude',
  'approximate_latitude',
  'approximate_longitude',
  'post_title',
  'user_report',
  'is_demo',
].join(', ');

let recordsCache: { expiresAt: number; records: AnyRecord[] } | null = null;

function normalizeQuery(query: any): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query ?? {})) {
    if (Array.isArray(value)) {
      if (typeof value[0] === 'string') result[key] = value[0];
    } else if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}

function publicCoordinates(rec: AnyRecord): { latitude: number | null; longitude: number | null } {
  return {
    latitude: rec.public_latitude ?? rec.approximate_latitude ?? rec.latitude ?? null,
    longitude: rec.public_longitude ?? rec.approximate_longitude ?? rec.longitude ?? null,
  };
}

function applyFilters(records: AnyRecord[], filters: ReturnType<typeof validatePublicFilters>): AnyRecord[] {
  return records.filter((rec) => {
    if (filters.rejectedFilters && filters.rejectedFilters.length > 0) return false;

    if (filters.district && (rec.district || '').toLowerCase() !== filters.district.toLowerCase()) return false;

    if (filters.classification && (rec.primary_classification || '').toLowerCase() !== filters.classification.toLowerCase()) {
      return false;
    }

    if (filters.category && (rec.observation_category || 'unknown').toLowerCase() !== filters.category) return false;

    if (filters.subcategory && (rec.observation_subcategory || 'unknown').toLowerCase() !== filters.subcategory) {
      return false;
    }

    if (filters.evidence_state && (rec.evidence_state || '').toLowerCase() !== filters.evidence_state) return false;

    if (filters.community_status && (rec.community_status || 'not_started').toLowerCase() !== filters.community_status) {
      return false;
    }

    if (filters.has_investigation !== undefined) {
      const started = Boolean(rec.community_status && rec.community_status !== 'not_started');
      if (started !== filters.has_investigation) return false;
    }

    if (filters.research_opportunity !== undefined) {
      const flagged = rec.is_research_opportunity ?? rec.research_opportunity ?? null;
      if (flagged === null) {
        if (filters.research_opportunity) return false;
      } else if (Boolean(flagged) !== filters.research_opportunity) {
        return false;
      }
    }

    if (filters.has_evidence !== undefined) {
      if (((rec.media_count ?? 0) > 0) !== filters.has_evidence) return false;
    }

    if (filters.site && (rec.site_code || '').toLowerCase() !== filters.site.toLowerCase()) return false;

    if (filters.confidence && (rec.confidence || '').toLowerCase() !== filters.confidence) return false;

    if (filters.verification && (rec.verification_status || '').toLowerCase() !== filters.verification) return false;

    if (filters.fromDate && new Date(rec.created_at) < filters.fromDate) return false;
    if (filters.toDate && new Date(rec.created_at) > filters.toDate) return false;

    if (filters.search) {
      const query = filters.search.toLowerCase();
      const matches =
        (rec.passport_id || '').toLowerCase().includes(query) ||
        (rec.possible_name || '').toLowerCase().includes(query) ||
        (rec.district || '').toLowerCase().includes(query) ||
        (rec.primary_classification || '').toLowerCase().includes(query) ||
        (rec.observation_category || '').toLowerCase().includes(query) ||
        (rec.observation_subcategory || '').toLowerCase().includes(query) ||
        (rec.primary_interpretation || '').toLowerCase().includes(query);
      if (!matches) return false;
    }

    return true;
  });
}

async function loadRecords(): Promise<AnyRecord[]> {
  if (recordsCache && recordsCache.expiresAt > Date.now()) return recordsCache.records;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase is not configured');

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Supabase query timeout')), 10_000);
  });

  try {
    const query = client
      .from('public_observations' as any)
      .select(PUBLIC_OBSERVATION_VIEW_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(2000);

    const { data, error } = await Promise.race([query, timeout]);
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) throw new Error('public_observations view returned an invalid payload');

    const records = (data as AnyRecord[]).filter((rec) => !rec.is_demo);
    recordsCache = { expiresAt: Date.now() + 10_000, records };
    return records;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function sendJson(res: any, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/geo+json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any): Promise<void> {
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    sendJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } });
    return;
  }

  if (req.method === 'HEAD') {
    res.statusCode = 200;
    res.end();
    return;
  }

  try {
    const filters = validatePublicFilters(normalizeQuery(req.query));
    const records = await loadRecords();
    const filtered = applyFilters(records, filters);
    const features: AnyRecord[] = [];

    for (const rec of filtered) {
      const raw = publicCoordinates(rec);
      const coords = resolvePublicCoordinates({
        precision: (rec.public_location_precision as any) || 'district',
        district: rec.district,
        latitude: raw.latitude,
        longitude: raw.longitude,
      });
      if (!coords) continue;

      if (filters.bbox) {
        const { minLon, minLat, maxLon, maxLat } = filters.bbox;
        if (
          coords.longitude < minLon ||
          coords.longitude > maxLon ||
          coords.latitude < minLat ||
          coords.latitude > maxLat
        ) {
          continue;
        }
      }

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [coords.longitude, coords.latitude],
        },
        properties: {
          passport_id: rec.passport_id,
          post_title: rec.post_title ?? rec.title ?? null,
          title:
            rec.post_title ??
            rec.title ??
            rec.possible_name ??
            (rec.primary_interpretation ? rec.primary_interpretation.split('.')[0].slice(0, 60) : null),
          observation_category: rec.observation_category || 'unknown',
          observation_subcategory: rec.observation_subcategory || 'unknown',
          primary_interpretation: rec.primary_interpretation ?? null,
          classification: rec.primary_classification,
          possible_name: rec.possible_name ?? null,
          confidence: rec.confidence ?? null,
          verification_status: rec.verification_status ?? null,
          evidence_state: rec.evidence_state ?? null,
          is_research_opportunity: rec.is_research_opportunity ?? rec.research_opportunity ?? false,
          media_count: rec.media_count ?? 0,
          primary_media_url: rec.primary_media_url ?? null,
          district: rec.district || null,
          created_at: rec.created_at,
          is_demo: rec.is_demo ?? false,
        },
      });
    }

    sendJson(res, 200, { type: 'FeatureCollection', features });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    sendJson(res, 503, {
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Map observations are temporarily unavailable.',
      },
    });
  }
}
