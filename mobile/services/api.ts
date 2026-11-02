<<<<<<< HEAD
import type {
  CommunityEvidenceType,
  CommunityInvestigation,
  CommunityInvestigationsResponse,
  CommunityPostDetail,
  CommunityVoteResult,
  ContributorTokenResponse,
  FileAbuseReportInput,
  FiledAbuseReport,
  GeoJsonCollection,
  MyDiscussionThread,
  ObservationComparisonResponse,
  ObservationDetail,
  ObservationFilters,
  ObservationSummary,
  Paginated,
  PhotoSubmissionRequest,
  PhotoSubmissionResponse,
  PublicAnswerItem,
  PublicCategory,
  PublicComment,
  PublicCommentResponse,
  PublicDistrict,
  PublicEvidenceItem,
  PublicMediaItem,
  PublicQuestionDetail,
  PublicQuestionSummary,
  PublicReputationSummary,
  PublicSite,
  PublicStats,
  PublicVisit,
  PublicVisitsResponse,
  RelatedObservationsResponse,
  ResearchOpportunitiesResponse,
  SamePlaceObservations,
  SiteExplorerPayload,
  SitesResponse,
  SiteTimelineEntry,
  UpdatePostPatch,
} from '../types/api';
import { getCurrentAppLanguage } from '../utils/language.ts';
=======
import type { GeoJsonCollection, ObservationDetail, ObservationSummary, Paginated, PublicCategory, ObservationFilters, PublicSite, SitesResponse, CommunityInvestigationsResponse, CommunityInvestigation, CommunityVoteResult, ContributorTokenResponse, PublicVisitsResponse, PublicVisit, PublicCommentResponse, PublicComment } from '../types/api';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly kind: 'configuration' | 'network' | 'timeout' | 'http' | 'malformed' | 'not-found' | 'unauthorized' | 'forbidden' | 'rate-limit' | 'server';
  constructor(message: string, status?: number, code?: string, kind: ApiError['kind'] = 'http') { super(message); this.name = 'ApiError'; this.status = status; this.code = code; this.kind = kind; }
}
export function getApiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (!raw) throw new ApiError('API address is not configured. Set EXPO_PUBLIC_API_BASE_URL and restart Expo.', undefined, undefined, 'configuration');
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new ApiError('API address is invalid. Use a complete URL such as http://192.168.1.10:3000.', undefined, undefined, 'configuration'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new ApiError('API address must be an HTTP(S) origin without credentials, path, query, or fragment.', undefined, undefined, 'configuration');
  if (process.env.NODE_ENV === 'production' && (parsed.protocol !== 'https:' || isLoopbackHost(parsed.hostname))) throw new ApiError('Production builds require a non-loopback HTTPS API origin.', undefined, undefined, 'configuration');
  return parsed.toString().replace(/\/$/, '');
}
function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '::' || host === '0.0.0.0' || host === '10.0.2.2' || host.startsWith('127.');
}
<<<<<<< HEAD
type RequestOptions = { signal?: AbortSignal; method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; headers?: Record<string, string> };
=======
type RequestOptions = { signal?: AbortSignal; method?: 'GET' | 'POST' | 'PATCH'; body?: unknown; headers?: Record<string, string> };
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
async function request<T>(path: string, validate: (value: unknown) => value is T, options?: RequestOptions, nullOn404?: false): Promise<T>;
async function request<T>(path: string, validate: (value: unknown) => value is T, options: RequestOptions | undefined, nullOn404: true): Promise<T | null>;
async function request<T>(path: string, validate: (value: unknown) => value is T, options: RequestOptions = {}, nullOn404 = false): Promise<T | null> {
  if (options.signal?.aborted) {
    const reason = options.signal.reason;
    throw reason instanceof Error ? reason : new Error('Request cancelled.');
  }
  const base = getApiBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const onAbort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener('abort', onAbort, { once: true });
  try {
<<<<<<< HEAD
    const headers = {
      Accept: 'application/json',
      'Accept-Language': getCurrentAppLanguage(),
      'X-Client-Platform': 'mobile',
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    };
=======
    const headers = { Accept: 'application/json', ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...options.headers };
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    const response = await fetch(`${base}${path}`, { method: options.method ?? 'GET', headers, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }), signal: controller.signal });
    if (response.status === 404 && nullOn404) return null;
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = isRecord(body) ? body.error : undefined;
      const message = typeof error === 'string' ? error : isRecord(error) && typeof error.message === 'string' ? error.message : `Request failed (${response.status}).`;
      const code = isRecord(error) && typeof error.code === 'string' ? error.code : undefined;
      const kind: ApiError['kind'] = response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : response.status === 404 ? 'not-found' : response.status === 429 ? 'rate-limit' : response.status >= 500 ? 'server' : 'http';
      throw new ApiError(message, response.status, code, kind);
    }
    if (!validate(body)) throw new ApiError('The server returned data in an unexpected format.', undefined, undefined, 'malformed');
    return body;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (options.signal?.aborted) throw error;
    if (controller.signal.aborted) throw new ApiError('The request timed out. Check your connection and try again.', undefined, undefined, 'timeout');
    throw new ApiError('Could not reach Earth Talk. Check the API address and your network connection.', undefined, undefined, 'network');
  } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', onAbort); }
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isString(value: unknown): value is string { return typeof value === 'string'; }
export function isObservationSummary(value: unknown): value is ObservationSummary {
  return isRecord(value) && isString(value.passport_id) && isString(value.observation_category) && isString(value.observation_subcategory) && isString(value.classification) && isString(value.confidence) && (value.verification_status === 'unverified' || value.verification_status === 'expert_verified') && isString(value.created_at) && (value.district === null || isString(value.district)) && typeof value.confidence_score === 'number' && Number.isFinite(value.confidence_score) && value.confidence_score >= 0 && value.confidence_score <= 1 && ['private', 'district', 'approximate', 'exact'].includes(String(value.location_precision)) && (value.primary_interpretation === null || isString(value.primary_interpretation)) && (value.possible_name === null || isString(value.possible_name)) && (value.post_title === undefined || value.post_title === null || isString(value.post_title)) && (value.evidence_state === undefined || value.evidence_state === null || isString(value.evidence_state)) && (value.published_at === undefined || value.published_at === null || isString(value.published_at)) && (value.latitude === undefined || typeof value.latitude === 'number' && Number.isFinite(value.latitude)) && (value.longitude === undefined || typeof value.longitude === 'number' && Number.isFinite(value.longitude)) && (value.is_research_opportunity === undefined || value.is_research_opportunity === null || typeof value.is_research_opportunity === 'boolean') && (value.is_demo === undefined || typeof value.is_demo === 'boolean');
}
function isObservationList(value: unknown): value is Paginated<ObservationSummary> {
  return isRecord(value) && Array.isArray(value.data) && value.data.every(isObservationSummary) && isRecord(value.pagination) && typeof value.pagination.page === 'number' && typeof value.pagination.limit === 'number' && typeof value.pagination.total === 'number' && typeof value.pagination.totalPages === 'number';
}
function isObservationDetail(value: unknown): value is ObservationDetail {
  return isObservationSummary(value) && isRecord(value) && isStringArray(value.observed_features) && isString(value.reasoning) && isStringArray(value.limitations) && isStringArray(value.recommended_next_steps) && isString(value.safety_note) && (value.uncertainties === undefined || isStringArray(value.uncertainties)) && (value.diagnostic_features === undefined || isStringArray(value.diagnostic_features)) && (value.geological_context === undefined || value.geological_context === null || isString(value.geological_context)) && (value.data_quality_status === undefined || isString(value.data_quality_status)) && (value.research_opportunity_count === undefined || value.research_opportunity_count === null || typeof value.research_opportunity_count === 'number' && Number.isFinite(value.research_opportunity_count)) && (value.media_count === undefined || value.media_count === null || typeof value.media_count === 'number' && Number.isFinite(value.media_count)) && (value.public_media_count === undefined || value.public_media_count === null || typeof value.public_media_count === 'number' && Number.isFinite(value.public_media_count)) && (value.primary_media_url === undefined || value.primary_media_url === null || isString(value.primary_media_url)) && (value.site_title === undefined || value.site_title === null || isString(value.site_title)) && (value.site_code === undefined || value.site_code === null || isString(value.site_code)) && (value.sector === undefined || value.sector === null || isString(value.sector));
}
function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every(isString); }
function isSite(value: unknown): value is PublicSite { return isRecord(value) && isString(value.site_id) && isString(value.site_code) && isString(value.title) && (value.district === null || isString(value.district)) && (value.description === null || isString(value.description)) && (value.is_demo === undefined || typeof value.is_demo === 'boolean'); }
<<<<<<< HEAD
function isDistrict(value: unknown): value is PublicDistrict { return isRecord(value) && isString(value.name) && typeof value.observation_count === 'number'; }
function isStats(value: unknown): value is PublicStats {
  return (
    isRecord(value) &&
    typeof value.total_observations === 'number' &&
    typeof value.districts_with_observations === 'number' &&
    typeof value.rock_categories === 'number' &&
    typeof value.verified_observations === 'number' &&
    typeof value.unverified_observations === 'number' &&
    typeof value.recent_observations === 'number'
  );
}
function isCategory(value: unknown): value is PublicCategory { return isRecord(value) && isString(value.category) && isString(value.label) && typeof value.observation_count === 'number' && Number.isFinite(value.observation_count); }
function isSites(value: unknown): value is SitesResponse { return isRecord(value) && Array.isArray(value.rows) && typeof value.total === 'number' && value.rows.every(isSite); }
function isGeoJson(value: unknown): value is GeoJsonCollection { return isRecord(value) && value.type === 'FeatureCollection' && Array.isArray(value.features) && value.features.every((f) => isRecord(f) && f.type === 'Feature' && (f.geometry === null || isRecord(f.geometry)) && (f.properties === undefined || isRecord(f.properties))); }

=======
function isCategory(value: unknown): value is PublicCategory { return isRecord(value) && isString(value.category) && isString(value.label) && typeof value.observation_count === 'number' && Number.isFinite(value.observation_count); }
function isSites(value: unknown): value is SitesResponse { return isRecord(value) && Array.isArray(value.rows) && typeof value.total === 'number' && value.rows.every(isSite); }
function isGeoJson(value: unknown): value is GeoJsonCollection { return isRecord(value) && value.type === 'FeatureCollection' && Array.isArray(value.features) && value.features.every((f) => isRecord(f) && f.type === 'Feature' && (f.geometry === null || isRecord(f.geometry)) && (f.properties === undefined || isRecord(f.properties))); }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
export function fetchObservations(page = 1, limit = 20, signal?: AbortSignal, filters: ObservationFilters = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters.search?.trim()) query.set('search', filters.search.trim().slice(0, 100));
  if (filters.category) query.set('category', filters.category);
<<<<<<< HEAD
  if (filters.classification) query.set('classification', filters.classification);
  if (filters.evidence_state) query.set('evidence_state', filters.evidence_state);
  if (filters.confidence) query.set('confidence', filters.confidence);
  if (filters.verification) query.set('verification', filters.verification);
  if (filters.district) query.set('district', filters.district);
  if (filters.bbox) query.set('bbox', filters.bbox);
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  return request(`/api/public/observations?${query}`, isObservationList, { signal });
}
export function fetchObservation(id: string, signal?: AbortSignal) { return request(`/api/public/observations/${encodeURIComponent(id)}`, isObservationDetail, { signal }, true); }
export function fetchCategories(signal?: AbortSignal) { return request('/api/public/categories', (value): value is PublicCategory[] => Array.isArray(value) && value.every(isCategory), { signal }); }
<<<<<<< HEAD
export function fetchDistricts(signal?: AbortSignal) { return request('/api/public/districts', (value): value is PublicDistrict[] => Array.isArray(value) && value.every(isDistrict), { signal }); }
export function fetchPublicStats(signal?: AbortSignal) { return request('/api/public/stats', isStats, { signal }); }
export function fetchUnlocatedObservations(page = 1, limit = 20, signal?: AbortSignal, filters: ObservationFilters = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters.search?.trim()) query.set('search', filters.search.trim().slice(0, 100));
  if (filters.category) query.set('category', filters.category);
  if (filters.classification) query.set('classification', filters.classification);
  if (filters.evidence_state) query.set('evidence_state', filters.evidence_state);
  if (filters.confidence) query.set('confidence', filters.confidence);
  if (filters.verification) query.set('verification', filters.verification);
  if (filters.district) query.set('district', filters.district);
  return request(`/api/public/observations/unlocated?${query}`, isObservationList, { signal });
}
export function fetchSites(signal?: AbortSignal, district?: string) {
  const query = new URLSearchParams({ limit: '50' });
  if (district?.trim()) query.set('district', district.trim());
  return request(`/api/community/sites?${query}`, isSites, { signal });
}
export function fetchSitesGeoJson(signal?: AbortSignal, district?: string) {
  const query = new URLSearchParams({ limit: '500' });
  if (district?.trim()) query.set('district', district.trim());
  return request(`/api/community/sites.geojson?${query}`, isGeoJson, { signal });
}
export function fetchSiteExplorer(siteId: string, signal?: AbortSignal) {
  const isExplorer = (value: unknown): value is SiteExplorerPayload =>
    isRecord(value) && isSite(value.site) && Array.isArray(value.observations) && Array.isArray(value.timeline) && isRecord(value.community);
  return request(`/api/community/sites/${encodeURIComponent(siteId)}/explorer`, isExplorer, { signal }, true);
}
export function fetchSiteDetail(siteId: string, signal?: AbortSignal) {
  return fetchSiteExplorer(siteId, signal).then((payload) => payload?.site ?? null);
}
export function fetchSiteTimeline(siteCode: string, signal?: AbortSignal) {
  const isTimeline = (value: unknown): value is SiteTimelineEntry[] =>
    Array.isArray(value) && value.every((e) => isRecord(e) && isString(e.event_type) && isString(e.event_at) && isString(e.summary));
  return request(`/api/community/sites/${encodeURIComponent(siteCode)}/timeline`, isTimeline, { signal });
}
export function fetchResearchOpportunities(signal?: AbortSignal, siteCode?: string) {
  const query = siteCode?.trim() ? `?site=${encodeURIComponent(siteCode.trim())}` : '';
  return request(
    `/api/public/research-opportunities${query}`,
    (value): value is ResearchOpportunitiesResponse =>
      isRecord(value) && typeof value.count === 'number' && Array.isArray(value.items),
    { signal }
  );
}
export function compareObservations(passportA: string, passportB: string, signal?: AbortSignal) {
  const isComparison = (value: unknown): value is ObservationComparisonResponse =>
    isRecord(value) &&
    Array.isArray(value.comparison) &&
    value.comparison.every(
      (r) =>
        isRecord(r) &&
        isString(r.label) &&
        (r.valueA === null || isString(r.valueA)) &&
        (r.valueB === null || isString(r.valueB)) &&
        isString(r.note)
    ) &&
    isString(value.expertSeparationNote);
  return request(
    `/api/public/observations/compare?a=${encodeURIComponent(passportA.trim())}&b=${encodeURIComponent(passportB.trim())}`,
    isComparison,
    { signal }
  );
}
export function fetchNearbyObservations(passportId: string, signal?: AbortSignal) {
  const valid = (value: unknown): value is RelatedObservationsResponse =>
    isRecord(value) && typeof value.available === 'boolean' && typeof value.count === 'number' && Array.isArray(value.items) && isString(value.note);
  return request(`/api/public/observations/${encodeURIComponent(passportId)}/nearby`, valid, { signal });
}
export function fetchSimilarObservations(passportId: string, signal?: AbortSignal) {
  const valid = (value: unknown): value is RelatedObservationsResponse =>
    isRecord(value) && typeof value.available === 'boolean' && typeof value.count === 'number' && Array.isArray(value.items) && isString(value.note);
  return request(`/api/public/observations/${encodeURIComponent(passportId)}/similar`, valid, { signal });
}
=======
export function fetchSites(signal?: AbortSignal) { return request('/api/community/sites?limit=50', isSites, { signal }); }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
export function fetchObservationMapData(signal?: AbortSignal, filters: ObservationFilters = {}) {
  const query = new URLSearchParams();
  if (filters.search?.trim()) query.set('search', filters.search.trim().slice(0, 100));
  if (filters.category) query.set('category', filters.category);
<<<<<<< HEAD
  if (filters.classification) query.set('classification', filters.classification);
  if (filters.evidence_state) query.set('evidence_state', filters.evidence_state);
  if (filters.confidence) query.set('confidence', filters.confidence);
  if (filters.verification) query.set('verification', filters.verification);
  if (filters.district) query.set('district', filters.district);
  if (filters.bbox) query.set('bbox', filters.bbox);
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  const suffix = query.size ? `?${query.toString()}` : '';
  return request(`/api/public/observations.geojson${suffix}`, isGeoJson, { signal });
}

function isInvestigation(value: unknown): value is CommunityInvestigation {
  return isRecord(value) && isString(value.public_id) && isString(value.question) && isString(value.status) && (value.site_id === null || isString(value.site_id)) && (value.observation_id === null || isString(value.observation_id)) && (value.passport_id === null || isString(value.passport_id)) && isStringArray(value.options) && Array.isArray(value.vote_distribution) && value.vote_distribution.every((item) => isRecord(item) && isString(item.option) && typeof item.count === 'number' && Number.isFinite(item.count)) && typeof value.participant_count === 'number' && typeof value.evidence_count === 'number' && typeof value.vote_count === 'number' && isString(value.created_at) && typeof value.is_demo === 'boolean';
}
function isInvestigations(value: unknown): value is CommunityInvestigationsResponse { return isRecord(value) && Array.isArray(value.rows) && value.rows.every(isInvestigation) && typeof value.total === 'number'; }
function isVoteResult(value: unknown): value is CommunityVoteResult { return isRecord(value) && isString(value.option) && typeof value.changed === 'boolean' && isString(value.message); }
function isTokenResponse(value: unknown): value is ContributorTokenResponse { return isRecord(value) && isString(value.contributor_token) && value.contributor_token.length >= 16 && isString(value.handle_preview) && isString(value.note); }
function isVisits(value: unknown): value is PublicVisitsResponse { return isRecord(value) && Array.isArray(value.rows) && value.rows.every((row) => isRecord(row) && isString(row.id) && isString(row.site_id) && isString(row.contributor_handle) && isString(row.visited_on) && (row.notes === null || isString(row.notes)) && (row.media_id === null || isString(row.media_id)) && isString(row.created_at)); }
<<<<<<< HEAD
function isVisit(value: unknown): value is PublicVisit { return isRecord(value) && isString(value.id) && isString(value.site_id) && isString(value.contributor_handle) && isString(value.visited_on) && (value.notes === null || isString(value.notes)) && (value.media_id === null || isString(value.media_id)) && isString(rowMediaOrNull(value.media_id) ?? '') && isString(value.created_at); }
function rowMediaOrNull(v: unknown): string | null { return v === null ? '' : isString(v) ? v : null; }
export interface CmsGuideSection { id: string; title: string; number?: string; content: string; }
export interface CmsGuide { title: string; subtitle: string; lastUpdated: string; sections: CmsGuideSection[]; }
function isCmsGuide(value: unknown): value is CmsGuide { return isRecord(value) && isString(value.title) && isString(value.subtitle) && Array.isArray(value.sections); }
export function fetchCmsGuide(page: 'about' | 'how-it-works' | 'terms' | 'privacy', signal?: AbortSignal) { return request(`/api/control/cms/${page}`, isCmsGuide, { signal }); }

function isComment(value: unknown): boolean { return isRecord(value) && isString(value.comment_id) && (value.parent_comment_id === null || isString(value.parent_comment_id)) && isRecord(value.author) && isString(value.author.public_user_id) && (value.author.display_name === null || isString(value.author.display_name)) && isString(value.body) && isString(value.created_at) && isString(value.moderation_status) && typeof value.reply_count === 'number' && Array.isArray(value.replies) && value.replies.every(isComment); }
=======
function isVisit(value: unknown): value is PublicVisit { return isRecord(value) && isString(value.id) && isString(value.site_id) && isString(value.contributor_handle) && isString(value.visited_on) && (value.notes === null || isString(value.notes)) && (value.media_id === null || isString(value.media_id)) && isString(value.created_at); }
function isComment(value: unknown): boolean { return isRecord(value) && isString(value.comment_id) && (value.parent_comment_id === null || isString(value.parent_comment_id)) && isRecord(value.author) && isString(value.author.public_user_id) && isString(value.author.display_name) && isString(value.body) && isString(value.created_at) && isString(value.moderation_status) && typeof value.reply_count === 'number' && Array.isArray(value.replies) && value.replies.every(isComment); }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
function isCommentResponse(value: unknown): value is PublicCommentResponse { return isRecord(value) && Array.isArray(value.data) && value.data.every(isComment) && typeof value.total === 'number'; }

export interface AccountUser {
  public_user_id: string;
  display_name: string | null;
  is_demo: boolean;
<<<<<<< HEAD
  email?: string | null;
  is_whatsapp_linked?: boolean;
  display_name_updated_at: string | null;
  avatar_url?: string | null;
  avatar_source?: 'google' | 'custom' | null;
  google_display_name?: string | null;
  google_avatar_url?: string | null;
  is_google_authenticated?: boolean;
=======
  display_name_updated_at: string | null;
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
}
export interface AccountObservation {
  passport_id: string; title: string; is_public: boolean; observation_category: string; created_at: string;
  comment_count: number; media_count: number; open_question_count: number; location_precision: string;
  latitude?: number | null; longitude?: number | null;
}
export interface AuthCodeRequested { delivery: 'whatsapp' | 'development_console'; message: string; expires_in_seconds: number }
export interface AuthSession { authenticated: boolean; user: AccountUser | null }
function isAccountUser(value: unknown): value is AccountUser {
  return isRecord(value) && isString(value.public_user_id) && (value.display_name === null || isString(value.display_name)) && typeof value.is_demo === 'boolean' && (value.display_name_updated_at === null || isString(value.display_name_updated_at));
}
function isAuthCodeRequested(value: unknown): value is AuthCodeRequested {
  return isRecord(value) && (value.delivery === 'whatsapp' || value.delivery === 'development_console') && isString(value.message) && typeof value.expires_in_seconds === 'number' && Number.isFinite(value.expires_in_seconds);
}
function isAuthSession(value: unknown): value is AuthSession {
  return isRecord(value) && typeof value.authenticated === 'boolean' && (value.user === null || isAccountUser(value.user));
}
<<<<<<< HEAD
function isVerifiedSessionRaw(value: unknown): value is { token: string; expires_at?: string; expiresAt?: string; user: AccountUser } {
  return (
    isRecord(value) &&
    isString(value.token) &&
    value.token.startsWith('rt_session_') &&
    (isString(value.expires_at) || isString(value.expiresAt)) &&
    isAccountUser(value.user)
  );
}
function normalizeVerifiedSession(raw: { token: string; expires_at?: string; expiresAt?: string; user: AccountUser }): { token: string; expires_at: string; user: AccountUser } {
  return {
    token: raw.token,
    expires_at: isString(raw.expires_at) ? raw.expires_at : String(raw.expiresAt),
    user: raw.user,
  };
}
/** @deprecated Use requestEmailAuthCode */
export function requestAuthCode(phone: string, signal?: AbortSignal) {
  return request('/api/auth/request-code', isAuthCodeRequested, { method: 'POST', body: { phone }, signal });
}
/** @deprecated Use verifyEmailAuthCode */
export async function verifyAuthCode(phone: string, code: string, signal?: AbortSignal) {
  const raw = await request('/api/auth/verify-code', isVerifiedSessionRaw, { method: 'POST', body: { phone, code }, signal });
  return normalizeVerifiedSession(raw);
}
export function requestEmailAuthCode(email: string, signal?: AbortSignal) {
  return request('/api/auth/request-email-code', (value): value is { ok: true } => isRecord(value) && value.ok === true, { method: 'POST', body: { email }, signal });
}
export async function verifyEmailAuthCode(email: string, code: string, signal?: AbortSignal) {
  const raw = await request('/api/auth/verify-email-code', isVerifiedSessionRaw, { method: 'POST', body: { email, code }, signal });
  return normalizeVerifiedSession(raw);
}
export interface MobileGoogleAuthResponse {
  ok?: boolean;
  authenticated?: boolean;
  verification_required?: boolean;
  challenge_id?: string;
  email?: string;
  masked_email?: string;
  purpose?: string;
  expires_in_seconds?: number;
  message?: string;
  token?: string;
  expires_at?: string;
  user?: AccountUser;
}

export async function loginWithGoogle(
  email: string,
  displayName?: string | null,
  avatarUrl?: string | null,
  signal?: AbortSignal
): Promise<MobileGoogleAuthResponse> {
  const isAuthResponse = (value: unknown): value is MobileGoogleAuthResponse =>
    isRecord(value) && (typeof value.ok === 'boolean' || typeof value.authenticated === 'boolean' || typeof value.verification_required === 'boolean');

  return request(
    '/api/auth/google-callback',
    isAuthResponse,
    { method: 'POST', body: { email, displayName, avatarUrl }, signal }
  );
}

export function verifyGoogleChallengeApi(
  challengeId: string,
  code: string,
  displayName?: string | null,
  avatarUrl?: string | null,
  signal?: AbortSignal
) {
  return request(
    '/api/auth/google/verify-challenge',
    (value): value is { ok: true; authenticated: true; token: string; expires_at: string; user: AccountUser } =>
      isRecord(value) && value.ok === true && isString(value.token) && isAccountUser(value.user),
    { method: 'POST', body: { challenge_id: challengeId, code, displayName, avatarUrl }, signal }
  );
}

export function resendGoogleChallengeApi(
  challengeId: string,
  signal?: AbortSignal
) {
  return request(
    '/api/auth/google/resend-challenge',
    (value): value is { ok: true; challenge_id: string; expires_in_seconds: number } =>
      isRecord(value) && value.ok === true && isString(value.challenge_id),
    { method: 'POST', body: { challenge_id: challengeId }, signal }
  );
}
export function restoreGoogleAvatar(token: string, signal?: AbortSignal) {
  return request(
    '/api/auth/restore-google-avatar',
    (value): value is { ok: true; avatar_url: string | null; avatar_source: string } =>
      isRecord(value) && value.ok === true,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: {}, signal }
  );
=======
function isVerifiedSession(value: unknown): value is { token: string; expires_at: string; user: AccountUser } {
  return isRecord(value) && isString(value.token) && value.token.startsWith('rt_session_') && isString(value.expires_at) && isAccountUser(value.user);
}
export function requestAuthCode(phone: string, signal?: AbortSignal) {
  return request('/api/auth/request-code', isAuthCodeRequested, { method: 'POST', body: { phone }, signal });
}
export function verifyAuthCode(phone: string, code: string, signal?: AbortSignal) {
  return request('/api/auth/verify-code', isVerifiedSession, { method: 'POST', body: { phone, code }, signal });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
}
export function fetchAuthSession(token: string, signal?: AbortSignal) {
  return request('/api/auth/session', isAuthSession, { headers: { Authorization: `Bearer ${token}` }, signal });
}
export function signOutAuthSession(token: string, signal?: AbortSignal) {
  return request('/api/auth/sign-out', (value): value is { ok: true } => isRecord(value) && value.ok === true, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: {}, signal });
}
export function updateAccountProfile(token: string, displayName: string | null, signal?: AbortSignal) {
  return request('/api/auth/profile', (value): value is { user: AccountUser } => isRecord(value) && isAccountUser(value.user), { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: { display_name: displayName }, signal });
}
<<<<<<< HEAD
export function linkWhatsAppAccount(token: string, phone: string, signal?: AbortSignal) {
  return request('/api/auth/link-whatsapp', (value): value is { ok: true; message: string } => isRecord(value) && value.ok === true, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: { phone }, signal });
}
export function verifyWhatsAppLink(token: string, phone: string, code: string, signal?: AbortSignal) {
  return request('/api/auth/verify-link-whatsapp', (value): value is { ok: true; message: string } => isRecord(value) && value.ok === true, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: { phone, code }, signal });
}
export function fetchMyObservations(token?: string | null, signal?: AbortSignal, contributorToken?: string | null) {
  const headers: Record<string, string> = {};
  if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`;
  if (contributorToken?.trim()) headers['X-Contributor-Token'] = contributorToken.trim();
  const valid = (value: unknown): value is { data: AccountObservation[] } => isRecord(value) && Array.isArray(value.data) && value.data.every((item) => isRecord(item) && isString(item.passport_id) && isString(item.title) && typeof item.is_public === 'boolean' && isString(item.observation_category) && isString(item.created_at) && ['district', 'approximate', 'exact', 'private'].includes(String(item.location_precision)) && ['comment_count', 'media_count', 'open_question_count'].every((key) => typeof item[key] === 'number' && Number.isFinite(item[key])) && (item.latitude === undefined || item.latitude === null || typeof item.latitude === 'number' && Number.isFinite(item.latitude)) && (item.longitude === undefined || item.longitude === null || typeof item.longitude === 'number' && Number.isFinite(item.longitude)));
  return request('/api/me/observations', valid, { headers, signal });
}
export function fetchMyDiscussionQuestions(token: string, signal?: AbortSignal) {
  const valid = (value: unknown): value is { data: MyDiscussionThread[] } =>
    isRecord(value) && Array.isArray(value.data) && value.data.every((row) => isRecord(row) && isString(row.comment_id) && isString(row.passport_id) && isString(row.body));
  return request('/api/me/questions', valid, { headers: { Authorization: `Bearer ${token}` }, signal });
}

// ---------------------------------------------------------------------------
// Stage 12 Post Detail, Owner Management, Questions, Media & Same-Place
// ---------------------------------------------------------------------------
function isCommunityPostDetail(value: unknown): value is CommunityPostDetail {
  return (
    isRecord(value) &&
    isString(value.passport_id) &&
    isString(value.title) &&
    typeof value.is_public === 'boolean' &&
    isRecord(value.location) &&
    isRecord(value.ai) &&
    Array.isArray(value.media) &&
    Array.isArray(value.questions) &&
    Array.isArray(value.open_questions) &&
    typeof value.viewer_is_owner === 'boolean'
  );
}

function buildOwnerHeaders(token?: string | null, contributorToken?: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`;
  if (contributorToken?.trim()) headers['X-Contributor-Token'] = contributorToken.trim();
  return headers;
}

export function fetchPostDetail(
  passportId: string,
  token?: string | null,
  signal?: AbortSignal,
  contributorToken?: string | null
) {
  const headers = buildOwnerHeaders(token, contributorToken);
  return request(`/api/posts/${encodeURIComponent(passportId)}`, isCommunityPostDetail, { headers, signal }, true);
}

export function fetchSamePlaceObservations(
  passportId: string,
  token?: string | null,
  signal?: AbortSignal,
  contributorToken?: string | null
) {
  const headers = buildOwnerHeaders(token, contributorToken);
  const valid = (value: unknown): value is SamePlaceObservations =>
    isRecord(value) && typeof value.available === 'boolean' && typeof value.count === 'number' && Array.isArray(value.items);
  return request(`/api/posts/${encodeURIComponent(passportId)}/same-place`, valid, { headers, signal });
}

export function updateMyPost(
  passportId: string,
  patch: UpdatePostPatch,
  token?: string | null,
  signal?: AbortSignal,
  contributorToken?: string | null
) {
  const headers = buildOwnerHeaders(token, contributorToken);
  if (!headers.Authorization && !headers['X-Contributor-Token']) {
    throw new ApiError('Sign in or use the device that submitted this observation to edit it.', undefined, undefined, 'configuration');
  }
  return request(`/api/posts/${encodeURIComponent(passportId)}`, isCommunityPostDetail, {
    method: 'PATCH',
    headers,
    body: patch,
    signal,
  });
}

export function answerPostQuestion(
  passportId: string,
  questionId: string,
  answer: string,
  token?: string | null,
  signal?: AbortSignal,
  contributorToken?: string | null
) {
  const clean = answer.trim();
  const headers = buildOwnerHeaders(token, contributorToken);
  if (!clean || (!headers.Authorization && !headers['X-Contributor-Token'])) {
    throw new ApiError('Enter an answer from the owner account or device.', undefined, undefined, 'configuration');
  }
  return request(
    `/api/posts/${encodeURIComponent(passportId)}/questions/${encodeURIComponent(questionId)}/answer`,
    isCommunityPostDetail,
    {
      method: 'POST',
      headers,
      body: { answer: clean },
      signal,
    }
  );
}

export function addPostMedia(
  passportId: string,
  input: { content_base64: string; mime_type?: string; caption?: string; role?: string },
  token?: string | null,
  signal?: AbortSignal,
  contributorToken?: string | null
) {
  const headers = buildOwnerHeaders(token, contributorToken);
  if (!input.content_base64.trim() || (!headers.Authorization && !headers['X-Contributor-Token'])) {
    throw new ApiError('Select a photo or video to attach to your observation.', undefined, undefined, 'configuration');
  }
  const valid = (value: unknown): value is { media: PublicMediaItem; post?: CommunityPostDetail | null } =>
    isRecord(value) && isRecord(value.media) && isString(value.media.media_id);
  return request(`/api/posts/${encodeURIComponent(passportId)}/media`, valid, {
    method: 'POST',
    headers,
    body: input,
    signal,
  });
}

export function removePostMedia(
  passportId: string,
  mediaId: string,
  token?: string | null,
  signal?: AbortSignal,
  contributorToken?: string | null
) {
  const headers = buildOwnerHeaders(token, contributorToken);
  if (!headers.Authorization && !headers['X-Contributor-Token']) {
    throw new ApiError('Only the observation owner can remove attached media.', undefined, undefined, 'configuration');
  }
  return request(`/api/posts/${encodeURIComponent(passportId)}/media/${encodeURIComponent(mediaId)}`, isCommunityPostDetail, {
    method: 'DELETE',
    headers,
    signal,
  });
}

export function updatePostAttachmentDownload(
  passportId: string,
  attachmentId: string,
  allowDownload: boolean,
  token: string,
  signal?: AbortSignal
) {
  if (!token.trim()) throw new ApiError('Sign in to update attachment download settings.', undefined, undefined, 'configuration');
  return request(
    `/api/posts/${encodeURIComponent(passportId)}/attachments/${encodeURIComponent(attachmentId)}`,
    isCommunityPostDetail,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: { allow_download: allowDownload },
      signal,
    }
  );
}

=======
export function fetchMyObservations(token: string, signal?: AbortSignal) {
  const valid = (value: unknown): value is { data: AccountObservation[] } => isRecord(value) && Array.isArray(value.data) && value.data.every((item) => isRecord(item) && isString(item.passport_id) && isString(item.title) && typeof item.is_public === 'boolean' && isString(item.observation_category) && isString(item.created_at) && ['district', 'approximate', 'exact', 'private'].includes(String(item.location_precision)) && ['comment_count', 'media_count', 'open_question_count'].every((key) => typeof item[key] === 'number' && Number.isFinite(item[key])) && (item.latitude === undefined || item.latitude === null || typeof item.latitude === 'number' && Number.isFinite(item.latitude)) && (item.longitude === undefined || item.longitude === null || typeof item.longitude === 'number' && Number.isFinite(item.longitude)));
  return request('/api/me/observations', valid, { headers: { Authorization: `Bearer ${token}` }, signal });
}
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
export function createObservationComment(passportId: string, body: string, token: string, parentCommentId?: string, signal?: AbortSignal) {
  const clean = body.trim();
  if (!clean || !token.trim()) throw new ApiError('Sign in and enter a comment before submitting.', undefined, undefined, 'configuration');
  const isCreatedComment = (value: unknown): value is { comment: PublicComment; message: string } => isRecord(value) && isComment(value.comment) && isString(value.message);
  return request(`/api/posts/${encodeURIComponent(passportId)}/comments`, isCreatedComment, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: { body: clean, ...(parentCommentId ? { parent_comment_id: parentCommentId } : {}) }, signal });
}
<<<<<<< HEAD

// ---------------------------------------------------------------------------
// Stage 8 Full Community Discovery Writes & Reads
// ---------------------------------------------------------------------------
export function fetchInvestigations(signal?: AbortSignal, contributorToken?: string | null) {
  const headers: Record<string, string> = {};
  if (contributorToken?.trim()) headers['X-Contributor-Token'] = contributorToken.trim();
  return request('/api/community/investigations?status=open&limit=50&offset=0', isInvestigations, { headers, signal });
}
export function openCommunityInvestigation(
  input: {
    question: string;
    siteId?: string | null;
    passportId?: string | null;
    researchInterest?: boolean;
    options?: string[];
    checklist?: string[];
    context?: string | null;
    category?: string | null;
  },
  contributorToken: string,
  signal?: AbortSignal
) {
  if (!input.question.trim() || !contributorToken.trim()) {
    throw new ApiError('A question and contributor token are required.', undefined, undefined, 'configuration');
  }
  return request('/api/community/investigations', isInvestigation, {
    method: 'POST',
    headers: { 'X-Contributor-Token': contributorToken },
    body: {
      question: input.question.trim(),
      site_id: input.siteId ?? null,
      passport_id: input.passportId ?? null,
      research_interest: input.researchInterest ?? false,
      options: input.options ?? [],
      checklist: input.checklist ?? [],
      context: input.context ?? null,
      category: input.category ?? null,
      media_ids: [],
    },
    signal,
  });
}
export function updateCommunityInvestigation(
  publicId: string,
  input: { question?: string; context?: string | null; options?: string[]; checklist?: string[]; researchInterest?: boolean },
  contributorToken: string,
  signal?: AbortSignal
) {
  if (!contributorToken.trim()) throw new ApiError('Contributor token required.', undefined, undefined, 'configuration');
  return request(`/api/community/investigations/${encodeURIComponent(publicId)}`, isInvestigation, {
    method: 'PATCH',
    headers: { 'X-Contributor-Token': contributorToken },
    body: {
      ...(input.question !== undefined ? { question: input.question } : {}),
      ...(input.context !== undefined ? { context: input.context } : {}),
      ...(input.options !== undefined ? { options: input.options } : {}),
      ...(input.checklist !== undefined ? { checklist: input.checklist } : {}),
      ...(input.researchInterest !== undefined ? { research_interest: input.researchInterest } : {}),
    },
    signal,
  });
}
export function toggleInvestigationChecklist(
  publicId: string,
  itemId: string,
  checked: boolean,
  contributorToken: string,
  signal?: AbortSignal
) {
  if (!itemId.trim() || !contributorToken.trim()) {
    throw new ApiError('Checklist item and contributor token are required.', undefined, undefined, 'configuration');
  }
  const valid = (value: unknown): value is { checked: boolean; check_count: number; message: string } =>
    isRecord(value) && typeof value.checked === 'boolean' && typeof value.check_count === 'number' && isString(value.message);
  return request(`/api/community/investigations/${encodeURIComponent(publicId)}/checklist`, valid, {
    method: 'POST',
    headers: { 'X-Contributor-Token': contributorToken },
    body: { item_id: itemId, checked },
    signal,
  });
}

export function fetchCommunityEvidence(params: { siteId?: string; investigationId?: string } = {}, signal?: AbortSignal) {
  const query = new URLSearchParams();
  if (params.siteId) query.set('site_id', params.siteId);
  if (params.investigationId) query.set('investigation_id', params.investigationId);
  const suffix = query.size ? `?${query}` : '';
  const valid = (value: unknown): value is { rows: PublicEvidenceItem[] } =>
    isRecord(value) && Array.isArray(value.rows) && value.rows.every((r) => isRecord(r) && isString(r.id) && isString(r.evidence_type));
  return request(`/api/community/evidence${suffix}`, valid, { signal });
}

export function submitCommunityEvidence(
  input: {
    investigationId?: string | null;
    siteId?: string | null;
    evidenceType: CommunityEvidenceType;
    explanation: string;
  },
  contributorToken: string,
  signal?: AbortSignal
) {
  if (!input.explanation.trim() || !contributorToken.trim()) {
    throw new ApiError('Explanation and contributor token are required.', undefined, undefined, 'configuration');
  }
  const valid = (value: unknown): value is PublicEvidenceItem =>
    isRecord(value) && isString(value.id) && isString(value.evidence_type);
  return request('/api/community/evidence', valid, {
    method: 'POST',
    headers: { 'X-Contributor-Token': contributorToken },
    body: {
      investigation_id: input.investigationId ?? null,
      site_id: input.siteId ?? null,
      observation_id: null,
      evidence_type: input.evidenceType,
      explanation: input.explanation.trim(),
      media_ids: [],
    },
    signal,
  });
}

export function fetchCommunityQuestions(params: { siteId?: string; limit?: number } = {}, signal?: AbortSignal) {
  const query = new URLSearchParams();
  if (params.siteId) query.set('site_id', params.siteId);
  query.set('limit', String(params.limit ?? 50));
  const valid = (value: unknown): value is { rows: PublicQuestionSummary[]; total: number } =>
    isRecord(value) && Array.isArray(value.rows) && value.rows.every((q) => isRecord(q) && isString(q.public_id) && isString(q.question));
  return request(`/api/community/questions?${query}`, valid, { signal });
}

export function fetchCommunityQuestionDetail(publicId: string, signal?: AbortSignal) {
  const valid = (value: unknown): value is PublicQuestionDetail =>
    isRecord(value) && isString(value.public_id) && isString(value.question) && Array.isArray(value.answers);
  return request(`/api/community/questions/${encodeURIComponent(publicId)}`, valid, { signal });
}

export function askCommunityQuestion(
  input: {
    question: string;
    siteId?: string | null;
    investigationId?: string | null;
    requestedExpert?: boolean;
    context?: string | null;
  },
  contributorToken: string,
  signal?: AbortSignal
) {
  if (!input.question.trim() || !contributorToken.trim()) {
    throw new ApiError('A question and contributor token are required.', undefined, undefined, 'configuration');
  }
  const valid = (value: unknown): value is PublicQuestionSummary =>
    isRecord(value) && isString(value.public_id) && isString(value.question);
  return request('/api/community/questions', valid, {
    method: 'POST',
    headers: { 'X-Contributor-Token': contributorToken },
    body: {
      question: input.question.trim(),
      site_id: input.siteId ?? null,
      investigation_id: input.investigationId ?? null,
      requested_expert: input.requestedExpert ?? false,
      context: input.context ?? null,
      media_ids: [],
    },
    signal,
  });
}

export function answerCommunityQuestion(publicId: string, answer: string, contributorToken: string, signal?: AbortSignal) {
  if (!answer.trim() || !contributorToken.trim()) {
    throw new ApiError('An answer and contributor token are required.', undefined, undefined, 'configuration');
  }
  const valid = (value: unknown): value is PublicAnswerItem =>
    isRecord(value) && isString(value.id) && isString(value.answer);
  return request(`/api/community/questions/${encodeURIComponent(publicId)}/answers`, valid, {
    method: 'POST',
    headers: { 'X-Contributor-Token': contributorToken },
    body: { answer: answer.trim(), media_ids: [] },
    signal,
  });
}

export function fetchMyReputation(contributorToken: string, signal?: AbortSignal) {
  const headers: Record<string, string> = {};
  if (contributorToken.trim()) headers['X-Contributor-Token'] = contributorToken.trim();
  const valid = (value: unknown): value is PublicReputationSummary =>
    isRecord(value) && isString(value.public_handle) && typeof value.observations_count === 'number' && typeof value.votes_count === 'number';
  return request('/api/community/me/reputation', valid, { headers, signal });
}

export function fileCommunityAbuseReport(
  input: FileAbuseReportInput,
  contributorToken?: string | null,
  sessionToken?: string | null,
  signal?: AbortSignal
) {
  const headers: Record<string, string> = {};
  if (contributorToken?.trim()) headers['X-Contributor-Token'] = contributorToken.trim();
  if (sessionToken?.trim()) headers.Authorization = `Bearer ${sessionToken.trim()}`;
  const valid = (value: unknown): value is { report: FiledAbuseReport; message: string } =>
    isRecord(value) && isRecord(value.report) && isString(value.report.public_id) && isString(value.message);
  return request('/api/community/reports', valid, {
    method: 'POST',
    headers,
    body: input,
    signal,
  });
}

=======
export function fetchInvestigations(signal?: AbortSignal) { return request('/api/community/investigations?status=open&limit=50&offset=0', isInvestigations, { signal }); }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
export function fetchSiteVisits(siteId: string, signal?: AbortSignal) { return request(`/api/community/sites/${encodeURIComponent(siteId)}/visits`, isVisits, { signal }); }
export function fetchObservationComments(passportId: string, signal?: AbortSignal) { return request(`/api/posts/${encodeURIComponent(passportId)}/comments`, isCommentResponse, { signal }); }
export function fetchContributorToken(signal?: AbortSignal) { return request('/api/community/contributor-token', isTokenResponse, { method: 'POST', body: {}, signal }); }
export function castInvestigationVote(publicId: string, option: string, token: string, signal?: AbortSignal) {
  if (!option.trim() || !token.trim()) throw new ApiError('A vote option and secure contributor token are required.', undefined, undefined, 'configuration');
  return request(`/api/community/investigations/${encodeURIComponent(publicId)}/vote`, isVoteResult, { method: 'POST', body: { option }, headers: { 'X-Contributor-Token': token }, signal });
}
<<<<<<< HEAD
export function recordSiteVisit(siteId: string, visitedOn: string, token: string, signal?: AbortSignal, notes?: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visitedOn) || !token.trim()) throw new ApiError('A visit date and secure contributor token are required.', undefined, undefined, 'configuration');
  return request(`/api/community/sites/${encodeURIComponent(siteId)}/visits`, isVisit, {
    method: 'POST',
    body: { visited_on: visitedOn, ...(notes?.trim() ? { notes: notes.trim() } : {}) },
    headers: { 'X-Contributor-Token': token },
    signal,
  });
}

function isPhotoSubmissionResponse(value: unknown): value is PhotoSubmissionResponse {
  return (
    isRecord(value) &&
    value.status === 'completed' &&
    isString(value.passport_id) &&
    isString(value.category) &&
    isString(value.subcategory) &&
    isString(value.primary_classification) &&
    (value.possible_name === null || isString(value.possible_name)) &&
    isString(value.confidence) &&
    typeof value.confidence_score === 'number' &&
    Number.isFinite(value.confidence_score) &&
    isString(value.primary_interpretation) &&
    (value.geological_context === null || isString(value.geological_context)) &&
    isStringArray(value.observed_features) &&
    isStringArray(value.diagnostic_features) &&
    isString(value.reasoning) &&
    isStringArray(value.uncertainties) &&
    isStringArray(value.limitations) &&
    isStringArray(value.recommended_next_steps) &&
    isString(value.safety_note) &&
    isString(value.evidence_state) &&
    typeof value.is_public === 'boolean' &&
    isRecord(value.media) &&
    isString(value.media.mime_type) &&
    typeof value.media.file_size_bytes === 'number' &&
    isString(value.media.sha256) &&
    typeof value.location_attached === 'boolean' &&
    isString(value.disclaimer)
  );
}

export function submitPhotoObservation(
  payload: PhotoSubmissionRequest,
  token?: string | null,
  signal?: AbortSignal,
  contributorToken?: string | null
): Promise<PhotoSubmissionResponse> {
  const headers: Record<string, string> = {};
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  const effectiveContrib = contributorToken?.trim() || payload.contributor_token?.trim();
  if (effectiveContrib) {
    headers['X-Contributor-Token'] = effectiveContrib;
  }
  return request('/api/observations/submit', isPhotoSubmissionResponse, {
    method: 'POST',
    headers,
    body: {
      ...payload,
      ...(effectiveContrib ? { contributor_token: effectiveContrib } : {}),
    },
    signal,
  });
}

export type MobilePinDecision = 'pin_exact' | 'pin_approximate' | 'pin_district' | 'keep_private';

export interface MobileChatLocationPayload {
  latitude?: number | null;
  longitude?: number | null;
  accuracy_meters?: number | null;
  district?: string | null;
  address?: string | null;
}

export interface MobileChatMessagePayload {
  message?: string;
  image_base64?: string;
  media_base64?: string;
  mime_type?: string;
  audio_base64?: string;
  audio_mime_type?: string;
  location?: MobileChatLocationPayload;
  pending_passport_id?: string;
  pin_decision?: MobilePinDecision;
  post_title?: string;
  contributor_token?: string;
}

export interface MobilePinConfirmationSummary {
  passport_id: string;
  is_public: boolean;
  precision: 'private' | 'district' | 'approximate' | 'exact';
  district: string | null;
  public_latitude: number | null;
  public_longitude: number | null;
}

export interface MobileChatMessageResult {
  reply: string;
  type:
    | 'text'
    | 'passport'
    | 'draft_summary'
    | 'location_acknowledged'
    | 'help'
    | 'voice_reply'
    | 'domain_warning';
  passport?: Record<string, unknown>;
  pin_confirmation?: MobilePinConfirmationSummary;
  pending_passport_id?: string | null;
  pending_location?: {
    latitude: number | null;
    longitude: number | null;
    district: string | null;
    address: string | null;
  } | null;
  awaiting_pin_confirmation?: boolean;
  questions_for_user?: string[];
  transcript?: string;
  suggested_actions?: string[];
}

function isMobileChatMessageResult(value: unknown): value is MobileChatMessageResult {
  return (
    isRecord(value) &&
    isString(value.reply) &&
    [
      'text',
      'passport',
      'draft_summary',
      'location_acknowledged',
      'help',
      'voice_reply',
      'domain_warning',
    ].includes(String(value.type))
  );
}

export function sendMobileChatMessage(
  payload: MobileChatMessagePayload,
  sessionToken?: string | null,
  signal?: AbortSignal,
  contributorToken?: string | null
): Promise<MobileChatMessageResult> {
  const headers: Record<string, string> = {};
  if (sessionToken?.trim()) {
    headers.Authorization = `Bearer ${sessionToken.trim()}`;
  }
  const effectiveContrib = contributorToken?.trim() || payload.contributor_token?.trim();
  if (effectiveContrib) {
    headers['X-Contributor-Token'] = effectiveContrib;
  }
  return request('/api/mobile/chat', isMobileChatMessageResult, {
    method: 'POST',
    headers,
    body: {
      ...payload,
      ...(effectiveContrib ? { contributor_token: effectiveContrib } : {}),
    },
    signal,
  });
=======
export function recordSiteVisit(siteId: string, visitedOn: string, token: string, signal?: AbortSignal) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visitedOn) || !token.trim()) throw new ApiError('A visit date and secure contributor token are required.', undefined, undefined, 'configuration');
  return request(`/api/community/sites/${encodeURIComponent(siteId)}/visits`, isVisit, { method: 'POST', body: { visited_on: visitedOn }, headers: { 'X-Contributor-Token': token }, signal });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
}
