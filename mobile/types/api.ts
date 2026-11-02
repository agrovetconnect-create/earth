export interface ObservationSummary {
  passport_id: string;
  observation_category: string;
  observation_subcategory: string;
  primary_interpretation: string | null;
  classification: string;
  possible_name: string | null;
  confidence: string;
  confidence_score: number;
  verification_status: 'unverified' | 'expert_verified';
  evidence_state?: string | null;
  district: string | null;
  location_precision: 'private' | 'district' | 'approximate' | 'exact';
  latitude?: number;
  longitude?: number;
  created_at: string;
  post_title?: string | null;
  published_at?: string | null;
  is_research_opportunity?: boolean | null;
  is_demo?: boolean;
}
<<<<<<< HEAD

=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
export interface ObservationDetail extends ObservationSummary {
  geological_context?: string | null;
  observed_features: string[];
  diagnostic_features?: string[];
  reasoning: string;
  limitations: string[];
  uncertainties?: string[];
  recommended_next_steps: string[];
  safety_note: string;
  data_quality_status?: string;
  is_research_opportunity?: boolean | null;
  research_opportunity_count?: number | null;
  media_count?: number | null;
  public_media_count?: number | null;
  primary_media_url?: string | null;
  site_title?: string | null;
  site_code?: string | null;
  sector?: string | null;
}
<<<<<<< HEAD

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface PublicSite {
  site_id: string;
  site_code: string;
  title: string;
  district: string | null;
  description: string | null;
  latitude?: number | null;
  longitude?: number | null;
  observation_count?: number;
  visit_count?: number;
  investigation_count?: number;
  question_count?: number;
  evidence_count?: number;
  highest_evidence_state?: string | null;
  is_demo?: boolean;
}

export interface SitesResponse {
  rows: PublicSite[];
  total: number;
}

export interface PublicCategory {
  category: string;
  label: string;
  observation_count: number;
}

export interface PublicDistrict {
  name: string;
  observation_count: number;
}

export interface PublicStats {
  total_observations: number;
  districts_with_observations: number;
  rock_categories: number;
  verified_observations: number;
  unverified_observations: number;
  recent_observations: number;
}

export interface ResearchOpportunity {
  opportunity_id: string;
  public_id: string;
  label: string;
  basis: 'observation' | 'community';
  question: string;
  summary: string;
  observation_category: string | null;
  observation_subcategory: string | null;
  site_id: string | null;
  site_code: string | null;
  site_title: string | null;
  district: string | null;
  observation_count: number;
  investigation_count: number;
  evidence_count: number;
  contributor_count: number;
  highest_evidence_state: string | null;
  status: string;
  created_at: string;
  last_activity_at: string;
  disclaimer: string;
}

export interface ResearchOpportunitiesResponse {
  count: number;
  items: ResearchOpportunity[];
}

export interface ObservationComparisonRow {
  label: string;
  valueA: string | null;
  valueB: string | null;
  note: string;
}

export interface ObservationComparisonResponse {
  comparison: ObservationComparisonRow[];
  expertSeparationNote: string;
}

export interface RelatedObservationItem {
  passport_id: string;
  observation_category: string;
  observation_subcategory: string;
  possible_name: string | null;
  confidence: string;
  district: string | null;
  distance_km: number | null;
  created_at: string;
}

export interface RelatedObservationsResponse {
  available: boolean;
  count: number;
  radius_km?: number;
  items: RelatedObservationItem[];
  note: string;
}

export interface ObservationFilters {
  search?: string;
  category?: string;
  classification?: string;
  evidence_state?: string;
  confidence?: string;
  verification?: string;
  district?: string;
  bbox?: string;
}

export interface GeoJsonFeature {
  type: 'Feature';
  geometry: { type?: unknown; coordinates?: unknown } | null;
  properties?: Record<string, unknown>;
}

export interface GeoJsonCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

export interface CommunityInvestigation {
  public_id: string;
  question: string;
  status: string;
  site_id: string | null;
  observation_id: string | null;
  passport_id: string | null;
  site_code?: string | null;
  participant_count: number;
  evidence_count: number;
  vote_count: number;
  research_interest?: boolean;
  options: string[];
  checklist?: Array<{ id: string; text: string; check_count: number; viewer_checked: boolean }>;
  context?: string | null;
  category?: string | null;
  media_ids?: string[];
  vote_distribution: Array<{ option: string; count: number; share_pct?: number }>;
  opened_by_handle?: string | null;
  viewer_is_owner?: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at?: string;
  disclaimer?: string;
}

export interface CommunityInvestigationsResponse {
  rows: CommunityInvestigation[];
  total: number;
}

export interface CommunityVoteResult {
  option: string;
  changed: boolean;
  message: string;
}

export interface ContributorTokenResponse {
  contributor_token: string;
  handle_preview: string;
  note: string;
}

export interface PublicVisit {
  id: string;
  site_id: string;
  contributor_handle: string;
  visited_on: string;
  notes: string | null;
  media_id: string | null;
  created_at: string;
}

export interface PublicVisitsResponse {
  rows: PublicVisit[];
}

export interface PublicComment {
  comment_id: string;
  parent_comment_id: string | null;
  author: { public_user_id: string; display_name: string | null; is_demo?: boolean };
  body: string;
  created_at: string;
  edited_at?: string | null;
  moderation_status: string;
  reply_count: number;
  replies: PublicComment[];
  is_demo?: boolean;
}

export interface PublicCommentResponse {
  data: PublicComment[];
  total: number;
}

// ---------------------------------------------------------------------------
// Stage 8 Full Community Discovery & Site Explorer Contracts
// ---------------------------------------------------------------------------
export type CommunityEvidenceType =
  | 'close_up'
  | 'fresh_surface'
  | 'texture'
  | 'outcrop'
  | 'environment'
  | 'video'
  | 'field_note'
  | 'comparison'
  | 'discussion'
  | 'reference';

export interface PublicEvidenceItem {
  id: string;
  evidence_type: CommunityEvidenceType;
  explanation: string | null;
  supports_evidence: boolean;
  is_challenge: boolean;
  contributor_handle: string;
  observation_id: string | null;
  site_id: string | null;
  media_id: string | null;
  media_ids: string[];
  created_at: string;
}

export interface PublicQuestionSummary {
  public_id: string;
  question: string;
  status: string;
  site_id: string | null;
  observation_id: string | null;
  investigation_id: string | null;
  passport_id: string | null;
  answer_count: number;
  vote_count: number;
  asked_by_handle: string;
  requested_expert: boolean;
  context: string | null;
  category: string | null;
  media_ids: string[];
  is_demo?: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicAnswerItem {
  id: string;
  answer: string;
  contributor_handle: string;
  evidence_id: string | null;
  media_ids: string[];
  is_expert: boolean;
  created_at: string;
}

export interface PublicQuestionDetail extends PublicQuestionSummary {
  answers: PublicAnswerItem[];
}

export interface PublicReputationSummary {
  public_handle: string;
  observations_count: number;
  evidence_count: number;
  votes_count: number;
  questions_count: number;
  answers_count: number;
  visits_count: number;
  investigations_count: number;
  districts_represented: number;
  achievements: Array<{ id: string; label: string; description: string; earned: boolean }>;
  disclaimer: string;
}

export interface SiteTimelineEntry {
  event_type: string;
  event_at: string;
  ref_id: string;
  summary: string;
}

export interface SiteExplorerPayload {
  site: PublicSite;
  observations: Array<{
    passport_id: string;
    observation_category: string;
    observation_subcategory: string;
    classification: string;
    possible_name: string | null;
    confidence: string;
    confidence_score: number;
    evidence_state: string;
    district: string | null;
    created_at: string;
  }>;
  timeline: SiteTimelineEntry[];
  nearby: Array<{
    passport_id: string;
    possible_name: string | null;
    observation_category: string;
    distance_km: number;
  }>;
  ai_interpretation: {
    passport_id: string;
    primary_classification: string;
    possible_name: string | null;
    confidence: string;
    confidence_score: number;
    observed_features: string[];
    reasoning: string;
    limitations: string[];
    safety_note: string;
    disclaimer: string;
  } | null;
  community: {
    investigation_count: number;
    question_count: number;
    evidence_count: number;
    visit_count: number;
    vote_count: number;
    participants: number;
    note: string;
  };
  expert_review: {
    reviewer_label: string;
    status: string;
    expert_classification: string | null;
    expert_rock_name: string | null;
    expert_confidence: string | null;
    expert_notes: string | null;
    scientific_remarks: string | null;
    created_at: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Stage 12 Full Post, Owner Controls, My Questions & Abuse Reporting Contracts
// ---------------------------------------------------------------------------
export type LocationPrivacyLevel = 'private' | 'exact' | 'approximate' | 'district';

export interface PublicMediaItem {
  media_id: string;
  kind: 'image' | 'video';
  role: string;
  caption: string | null;
  mime_type: string;
  sort_order: number;
  url: string | null;
  poster_url: string | null;
  available: boolean;
  is_demo: boolean;
  demo_note: string | null;
  created_at: string;
}

export interface PostQuestion {
  question_id: string;
  question: string;
  asked_by: 'ai';
  asked_at: string;
  status: 'open' | 'answered';
  answer: string | null;
  answered_at: string | null;
  answered_by: string | null;
  is_public: boolean;
  is_demo: boolean;
}

export interface PublicObservationAttachment {
  attachment_id: string;
  kind: string;
  title: string;
  description: string | null;
  url: string;
  filename: string;
  mime_type: string;
  size_bytes: number | null;
  created_at: string;
  allow_download: boolean;
  is_demo: boolean;
}

export interface SamePlaceObservations {
  available: boolean;
  count: number;
  note: string;
  items: Array<{
    passport_id: string;
    title: string;
    observation_category: string;
    district: string | null;
    created_at: string;
    is_demo: boolean;
  }>;
}

export interface CommunityPostDetail {
  passport_id: string;
  title: string;
  observation_category: string;
  observation_subcategory: string;
  is_public: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  owner: { public_user_id: string; display_name: string | null; is_demo: boolean } | null;
  location: {
    address: string | null;
    district: string | null;
    sector: string | null;
    cell: string | null;
    village: string | null;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
    precision: LocationPrivacyLevel;
    approximate: boolean;
    privacy_note: string;
  };
  user_report: string | null;
  ai: {
    primary_interpretation: string | null;
    observed_features: string[];
    diagnostic_features: string[];
    reasoning: string;
    alternative_possibilities: string[];
    uncertainties: string[];
    limitations: string[];
    recommended_next_steps: string[];
    safety_note: string;
    confidence: string;
    confidence_score: number;
    evidence_state: string | null;
    disclaimer: string;
  };
  media: PublicMediaItem[];
  questions: PostQuestion[];
  open_questions: PostQuestion[];
  comment_count: number;
  can_comment: boolean;
  viewer_is_owner: boolean;
  attachments: PublicObservationAttachment[];
  same_place: SamePlaceObservations;
}

export interface UpdatePostPatch {
  post_title?: string | null;
  user_report?: string | null;
  is_public?: boolean;
  location_precision?: LocationPrivacyLevel;
  latitude?: number | null;
  longitude?: number | null;
  district?: string | null;
  location_text?: string | null;
}

export interface MyDiscussionThread {
  comment_id: string;
  passport_id: string;
  post_title: string;
  body: string;
  created_at: string;
  moderation_status: string;
  reply_count: number;
  replies: PublicComment[];
}

export const ABUSE_REPORT_REASONS = [
  'incorrect_information',
  'privacy_concern',
  'misleading_claim',
  'commercial_or_spam',
  'abusive_content',
  'duplicate_record',
  'sensitive_location',
  'safety_principles',
  'other',
] as const;

export type AbuseReportReason = (typeof ABUSE_REPORT_REASONS)[number];

export type AbuseReportTargetType =
  | 'observation'
  | 'investigation'
  | 'question'
  | 'comment'
  | 'site'
  | 'evidence'
  | 'media';

export interface FileAbuseReportInput {
  target_type: AbuseReportTargetType;
  target_id: string;
  reason_code: AbuseReportReason;
  details?: string | null;
  observation_passport_id?: string | null;
}

export interface FiledAbuseReport {
  public_id: string;
  status: string;
  reason_code: AbuseReportReason;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Stage 9 Photo & Video Submission Contracts
// ---------------------------------------------------------------------------
export type SpecimenContextType =
  | 'in_situ_outcrop'
  | 'road_cut'
  | 'loose_float'
  | 'stream_cobble'
  | 'quarry_exposure'
  | 'hand_sample'
  | 'unknown';

export interface SupportingMediaSubmissionItem {
  content_base64: string;
  mime_type?: string;
  caption?: string;
  role?: string;
}

export interface PhotoSubmissionRequest {
  content_base64: string;
  mime_type?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';
  caption?: string;
  post_title?: string;
  is_public?: boolean;
  site_id?: string;
  specimen_context?: SpecimenContextType;
  has_scale_reference?: boolean;
  has_fresh_surface?: boolean;
  supporting_media?: SupportingMediaSubmissionItem[];
  contributor_token?: string;
  location?: {
    latitude?: number;
    longitude?: number;
    accuracy_meters?: number;
    location_text?: string;
    district?: string;
    sector?: string;
    cell?: string;
    village?: string;
    public_location_precision?: 'private' | 'district' | 'approximate' | 'exact';
  };
}

export interface PhotoSubmissionResponse {
  status: 'completed';
  passport_id: string;
  category: string;
  subcategory: string;
  primary_classification: string;
  possible_name: string | null;
  confidence: string;
  confidence_score: number;
  primary_interpretation: string;
  geological_context: string | null;
  observed_features: string[];
  diagnostic_features: string[];
  reasoning: string;
  uncertainties: string[];
  limitations: string[];
  recommended_next_steps: string[];
  safety_note: string;
  evidence_state: string;
  is_public: boolean;
  media: {
    mime_type: string;
    file_size_bytes: number;
    sha256: string;
  };
  supporting_media_count?: number;
  location_attached: boolean;
  exif_location?: {
    has_gps: boolean;
    found: boolean;
    detected: boolean;
    latitude: number | null;
    longitude: number | null;
    altitude_meters: number | null;
    accuracy_meters: number | null;
    captured_at: string | null;
    within_rwanda: boolean;
    suggested_district: string | null;
    inferred_district: string | null;
    gps_mismatch_km: number | null;
  } | null;
  gps_mismatch_km?: number | null;
  disclaimer: string;
}
=======
export interface Paginated<T> { data: T[]; pagination: { page: number; limit: number; total: number; totalPages: number } }
export interface PublicSite { site_id: string; site_code: string; title: string; district: string | null; description: string | null; is_demo?: boolean }
export interface SitesResponse { rows: PublicSite[]; total: number }
export interface PublicCategory { category: string; label: string; observation_count: number }
export interface ObservationFilters { search?: string; category?: string }
export interface GeoJsonFeature { type: 'Feature'; geometry: { type?: unknown; coordinates?: unknown } | null; properties?: Record<string, unknown> }
export interface GeoJsonCollection { type: 'FeatureCollection'; features: GeoJsonFeature[] }
export interface CommunityInvestigation {
  public_id: string; question: string; status: string; site_id: string | null; observation_id: string | null; passport_id: string | null;
  site_code?: string | null; participant_count: number; evidence_count: number; vote_count: number; research_interest?: boolean;
  options: string[]; checklist?: Array<{ id: string; text: string; check_count: number; viewer_checked: boolean }>;
  context?: string | null; category?: string | null; media_ids?: string[]; vote_distribution: Array<{ option: string; count: number; share_pct?: number }>;
  opened_by_handle?: string | null; viewer_is_owner?: boolean; is_demo: boolean; created_at: string; updated_at?: string; disclaimer?: string;
}
export interface CommunityInvestigationsResponse { rows: CommunityInvestigation[]; total: number }
export interface CommunityVoteResult { option: string; changed: boolean; message: string }
export interface ContributorTokenResponse { contributor_token: string; handle_preview: string; note: string }
export interface PublicVisit { id: string; site_id: string; contributor_handle: string; visited_on: string; notes: string | null; media_id: string | null; created_at: string }
export interface PublicVisitsResponse { rows: PublicVisit[] }
export interface PublicComment {
  comment_id: string; parent_comment_id: string | null; author: { public_user_id: string; display_name: string; is_demo?: boolean };
  body: string; created_at: string; edited_at?: string | null; moderation_status: string; reply_count: number; replies: PublicComment[]; is_demo?: boolean;
}
export interface PublicCommentResponse { data: PublicComment[]; total: number }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
