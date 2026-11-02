import type {
  CommunityPostDetail,
  CreateCommentResult,
  FileAbuseReportInput,
  FiledAbuseReport,
  MyDiscussionThread,
  MyPostSummary,
  PublicComment,
} from '../types/communityPosts.js';
import { ensureContributorToken } from './communityApi.js';
import { getCommunityAuthHeaders, getCommunitySession } from './communityAuth.js';
import { requestJson } from './http.js';

const AUTH_HEADERS = getCommunityAuthHeaders;
const ACCEPT = { Accept: 'application/json' };

function combine(headers?: HeadersInit): Record<string, string> {
  return {
    ...AUTH_HEADERS(),
    ...(headers as Record<string, string> | undefined),
  };
}

/** Fallback when the server sends no readable error text. */
function requestFailed(res: Response): string {
  return `Request failed (${res.status}).`;
}

/** GET /api/posts/:passportId */
export async function fetchPost(
  passportId: string,
  headers?: HeadersInit
): Promise<CommunityPostDetail | null> {
  return requestJson<CommunityPostDetail | null>(
    `/api/posts/${encodeURIComponent(passportId)}`,
    { headers: combine(headers), nullOn404: true, errorMessage: requestFailed }
  );
}

/** GET /api/posts/:passportId/comments */
export async function fetchComments(passportId: string): Promise<PublicComment[]> {
  const data = await requestJson<{ data: PublicComment[] }>(
    `/api/posts/${encodeURIComponent(passportId)}/comments`,
    { headers: combine(ACCEPT), errorMessage: requestFailed }
  );
  return data.data;
}

/** POST /api/posts/:passportId/comments */
export async function createComment(
  passportId: string,
  body: string,
  parentCommentId: string | null
): Promise<CreateCommentResult> {
  return requestJson<CreateCommentResult>(
    `/api/posts/${encodeURIComponent(passportId)}/comments`,
    {
      method: 'POST',
      headers: combine(ACCEPT),
      json: {
        body,
        ...(parentCommentId ? { parent_comment_id: parentCommentId } : {}),
      },
      errorMessage: requestFailed,
    }
  );
}

/**
 * POST /api/community/reports
 *
 * Files an abuse report. Available to everyone, signed in or not: a reader who
 * cannot report harmful content cannot protect themselves. A report is an
 * allegation and does not by itself hide or change anything.
 */
export async function reportContent(
  input: FileAbuseReportInput
): Promise<{ report: FiledAbuseReport; message: string }> {
  await ensureContributorToken();
  return requestJson<{ report: FiledAbuseReport; message: string }>('/api/community/reports', {
    method: 'POST',
    headers: combine(ACCEPT),
    json: input,
    errorMessage: requestFailed,
  });
}

/** POST /api/posts/:passportId/questions/:questionId/answer */
export async function answerQuestion(
  passportId: string,
  questionId: string,
  answer: string
): Promise<CommunityPostDetail> {
  return requestJson<CommunityPostDetail>(
    `/api/posts/${encodeURIComponent(passportId)}/questions/${encodeURIComponent(questionId)}/answer`,
    { method: 'POST', headers: combine(ACCEPT), json: { answer }, errorMessage: requestFailed }
  );
}

export interface UpdatePostPatch {
  post_title?: string | null;
  user_report?: string | null;
  is_public?: boolean;
  location_precision?: string;
  latitude?: number | null;
  longitude?: number | null;
  district?: string | null;
  location_text?: string | null;
}

/** PATCH /api/posts/:passportId */
export async function updatePost(
  passportId: string,
  patch: UpdatePostPatch
): Promise<CommunityPostDetail> {
  return requestJson<CommunityPostDetail>(
    `/api/posts/${encodeURIComponent(passportId)}`,
    { method: 'PATCH', headers: combine(ACCEPT), json: patch, errorMessage: requestFailed }
  );
}

/** POST /api/posts/:passportId/media */
export async function addPostMedia(
  passportId: string,
  input: {
    content_base64: string;
    mime_type?: string;
    caption?: string | null;
    role?: string;
  }
): Promise<{ media: CommunityPostDetail['media'][number] }> {
  return requestJson<{ media: CommunityPostDetail['media'][number] }>(
    `/api/posts/${encodeURIComponent(passportId)}/media`,
    {
      method: 'POST',
      headers: combine(ACCEPT),
      json: input,
      errorMessage: requestFailed,
    }
  );
}

/** DELETE /api/posts/:passportId/media/:mediaId */
export async function removePostMedia(
  passportId: string,
  mediaId: string
): Promise<CommunityPostDetail> {
  return requestJson<CommunityPostDetail>(
    `/api/posts/${encodeURIComponent(passportId)}/media/${encodeURIComponent(mediaId)}`,
    {
      method: 'DELETE',
      headers: combine(ACCEPT),
      errorMessage: requestFailed,
    }
  );
}

/** PATCH /api/posts/:passportId/attachments/:attachmentId (download on/off). */
export async function updateAttachmentDownload(
  passportId: string,
  attachmentId: string,
  allowDownload: boolean
): Promise<CommunityPostDetail> {
  return requestJson<CommunityPostDetail>(
    `/api/posts/${encodeURIComponent(passportId)}/attachments/${encodeURIComponent(attachmentId)}`,
    {
      method: 'PATCH',
      headers: combine(ACCEPT),
      json: { allow_download: allowDownload },
      errorMessage: requestFailed,
    }
  );
}

/** GET /api/me/observations */
export async function fetchMyPosts(): Promise<MyPostSummary[]> {
  try {
    const data = await requestJson<{ data: MyPostSummary[] }>('/api/me/observations', {
      headers: combine(ACCEPT),
      errorMessage: requestFailed,
    });
    return Array.isArray(data.data) ? data.data : [];
  } catch {
    return [];
  }
}

/** GET /api/me/questions */
export async function fetchMyQuestions(): Promise<MyDiscussionThread[]> {
  const data = await requestJson<{ data: MyDiscussionThread[] }>('/api/me/questions', {
    headers: combine(ACCEPT),
    errorMessage: requestFailed,
  });
  return data.data;
}

// ---------------------------------------------------------------------------
// Direct Web Field Observation Submission & Pin Confirmation
// ---------------------------------------------------------------------------
export interface WebPhotoSubmissionInput {
  content_base64: string;
  mime_type?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';
  caption?: string;
  primary_media_caption?: string;
  post_title?: string;
  specimen_context?:
    | 'in_situ_outcrop'
    | 'road_cut_exposure'
    | 'loose_float_talus'
    | 'stream_cobble'
    | 'quarry_mine'
    | 'hand_sample_core';
  has_scale_reference?: boolean;
  has_fresh_surface?: boolean;
  supporting_media?: Array<{
    content_base64: string;
    mime_type?: string;
    caption?: string;
    role?: string;
  }>;
  location?: {
    latitude?: number | null;
    longitude?: number | null;
    accuracy_meters?: number | null;
    district?: string | null;
    sector?: string | null;
    cell?: string | null;
    village?: string | null;
    location_text?: string | null;
    public_location_precision?: 'private' | 'district' | 'approximate' | 'exact';
  };
  is_public?: boolean;
}

export interface WebPhotoSubmissionResult {
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
  alternative_possibilities?: string[];
  uncertainties: string[];
  questions_for_user?: string[];
  limitations: string[];
  recommended_next_steps: string[];
  safety_note: string;
  evidence_state: string;
  is_public: boolean;
  supporting_media_count?: number;
  exif_location?: {
    found: boolean;
    latitude: number;
    longitude: number;
    altitude_meters: number | null;
    accuracy_meters: number | null;
    captured_at: string | null;
    inferred_district: string | null;
    within_rwanda: boolean;
  } | null;
  gps_mismatch_km?: number | null;
  disclaimer: string;
}

export async function submitWebPhotoObservation(
  payload: WebPhotoSubmissionInput
): Promise<WebPhotoSubmissionResult> {
  if (!getCommunitySession()?.user) {
    throw new Error('Sign in is required to submit a field observation.');
  }
  return requestJson<WebPhotoSubmissionResult>('/api/observations/submit', {
    method: 'POST',
    headers: combine(ACCEPT),
    json: { ...payload },
    errorMessage: requestFailed,
  });
}

export interface WebPinConfirmationResponse {
  reply: string;
  type: string;
  pin_confirmation?: {
    passport_id: string;
    is_public: boolean;
    precision: 'private' | 'district' | 'approximate' | 'exact';
    district: string | null;
    public_latitude: number | null;
    public_longitude: number | null;
  };
}

export interface WebChatLocationPayload {
  latitude?: number | null;
  longitude?: number | null;
  accuracy_meters?: number | null;
  district?: string | null;
  sector?: string | null;
  cell?: string | null;
  village?: string | null;
  address?: string | null;
}

export interface WebChatMessageRequest {
  message?: string;
  image_base64?: string;
  media_base64?: string;
  mime_type?: string;
  audio_base64?: string;
  audio_mime_type?: string;
  primary_media_caption?: string;
  post_title?: string;
  attach_to_active_passport?: boolean;
  supporting_media?: Array<{
    content_base64: string;
    mime_type?: string;
    caption?: string;
    role?: string;
  }>;
  location?: WebChatLocationPayload;
  pending_passport_id?: string;
  pin_decision?: 'pin_exact' | 'pin_approximate' | 'pin_district' | 'keep_private';
}

export interface WebChatMessageResponse {
  reply: string;
  type:
    | 'text'
    | 'passport'
    | 'draft_summary'
    | 'location_acknowledged'
    | 'help'
    | 'voice_reply'
    | 'domain_warning';
  passport?: WebPhotoSubmissionResult & Record<string, unknown>;
  pin_confirmation?: {
    passport_id: string;
    is_public: boolean;
    precision: 'private' | 'district' | 'approximate' | 'exact';
    district: string | null;
    public_latitude: number | null;
    public_longitude: number | null;
  };
  pending_passport_id?: string | null;
  pending_location?: {
    latitude: number | null;
    longitude: number | null;
    district: string | null;
    sector?: string | null;
    cell?: string | null;
    village?: string | null;
    address: string | null;
  } | null;
  awaiting_pin_confirmation?: boolean;
  questions_for_user?: string[];
  transcript?: string;
  suggested_actions?: string[];
}

export async function sendWebChatMessage(
  payload: WebChatMessageRequest
): Promise<WebChatMessageResponse> {
  if (!getCommunitySession()?.user) {
    throw new Error('Sign in is required to submit a field observation.');
  }
  return requestJson<WebChatMessageResponse>('/api/mobile/chat', {
    method: 'POST',
    headers: combine(ACCEPT),
    json: { ...payload },
    errorMessage: requestFailed,
  });
}

export async function confirmWebObservationPin(input: {
  passport_id: string;
  pin_decision: 'pin_exact' | 'pin_approximate' | 'pin_district' | 'keep_private';
  post_title?: string;
  location?: {
    latitude?: number | null;
    longitude?: number | null;
    district?: string | null;
    sector?: string | null;
    cell?: string | null;
    village?: string | null;
    address?: string | null;
  };
}): Promise<WebPinConfirmationResponse> {
  if (!getCommunitySession()?.user) {
    throw new Error('Sign in is required to confirm a field observation pin.');
  }
  return requestJson<WebPinConfirmationResponse>('/api/mobile/chat', {
    method: 'POST',
    headers: combine(ACCEPT),
    json: {
      pending_passport_id: input.passport_id,
      pin_decision: input.pin_decision,
      post_title: input.post_title,
      location: input.location,
    },
    errorMessage: requestFailed,
  });
}