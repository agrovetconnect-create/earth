import assert from 'node:assert/strict';
import { photoSubmissionService, type PhotoSubmissionInput } from '../src/services/photo-submission.service.js';
import { geminiService } from '../src/services/gemini.service.js';
import { observationRepository } from '../src/repositories/observation.repository.js';
import { observationService } from '../src/services/observation.service.js';
import { GeologicalAnalysisError } from '../src/ai/geological.types.js';
import type { GeoscienceAnalysisResult } from '../src/ai/geological.types.js';
import type { Viewer } from '../src/utils/user-auth.js';
import { mobileChatService } from '../src/services/mobile-chat.service.js';
import { publicObservationRepository } from '../src/repositories/public-observation.repository.js';
import { buildExifJpegBuffer } from '../src/utils/exif-gps.js';
import { communityPostService } from '../src/services/community-post.service.js';
import {
  geoscienceAnalysisService,
  formatWhatsAppPassportResponse,
} from '../src/services/geoscience-analysis.service.js';
import { whatsappMediaService } from '../src/services/whatsapp-media.service.js';
import { whatsappService } from '../src/services/whatsapp.service.js';

console.log('--- Running Stage 9 Photo Submission & Shared GeoAI Test Suite ---');

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err: unknown) {
    failed++;
    console.log(`FAIL  ${name}`);
    console.log(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Valid PNG fixture (magic bytes + 200 bytes padding)
const VALID_PNG_BASE64 = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(200, 2),
]).toString('base64');

// Mock analysis result
const MOCK_AI_RESULT: GeoscienceAnalysisResult = {
  is_rock: true,
  observation_category: 'rock',
  observation_subcategory: 'igneous',
  observation_type: 'granite_outcrop',
  primary_classification: 'igneous',
  possible_name: 'Granite',
  confidence: 'moderate',
  confidence_score: 0.75,
  primary_interpretation: 'Coarse-grained felsic intrusive rock with visible quartz and feldspar.',
  geological_context: 'Consistent with regional granitic intrusions in Rwanda basement complex.',
  observed_features: ['Phaneritic texture', 'Visible quartz grains', 'Pink feldspar crystals'],
  diagnostic_features: ['Interlocking crystalline texture', 'Absence of foliation'],
  reasoning: 'Visual inspection shows crystalline texture indicative of slow plutonic cooling.',
  alternative_possibilities: ['Granodiorite', 'Quartz monzonite'],
  uncertainties: ['Weathering rind may obscure mafic mineral ratios'],
  questions_for_user: ['Is this part of a larger continuous outcrop or a loose boulder?'],
  limitations: ['Macroscopic visual analysis only; no mineral assay or thin section'],
  recommended_next_steps: ['Observe fresh unweathered fracture surface'],
  safety_note: 'Ensure stable footing when sampling near steep quarry faces.',
  blocked_claims: [],
};

// ---------------------------------------------------------------------------
// 1. Validation tests
// ---------------------------------------------------------------------------

await test('submission rejects empty or blank image payload', async () => {
  await assert.rejects(
    async () => {
      await photoSubmissionService.submitObservation({
        content_base64: '',
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof GeologicalAnalysisError);
      assert.equal(err.category, 'IMAGE_VALIDATION_ERROR');
      return true;
    }
  );
});

await test('submission rejects non-base64 malformed string', async () => {
  await assert.rejects(
    async () => {
      await photoSubmissionService.submitObservation({
        content_base64: 'this-is-not-valid-base64-content!@#$%',
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof GeologicalAnalysisError);
      assert.equal(err.category, 'IMAGE_VALIDATION_ERROR');
      return true;
    }
  );
});

await test('submission rejects invalid magic bytes (fake image)', async () => {
  const fakeBytesBase64 = Buffer.from('Hello world, I am plain text, not an image! ' + 'x'.repeat(200)).toString('base64');
  await assert.rejects(
    async () => {
      await photoSubmissionService.submitObservation({
        content_base64: fakeBytesBase64,
        mime_type: 'image/jpeg',
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof GeologicalAnalysisError);
      assert.equal(err.category, 'MEDIA_VALIDATION_ERROR');
      return true;
    }
  );
});

await test('submission rejects invalid coordinates out of bounds', async () => {
  await assert.rejects(
    async () => {
      await photoSubmissionService.submitObservation({
        content_base64: VALID_PNG_BASE64,
        location: {
          latitude: 195.0, // Invalid: > 90
          longitude: 30.0,
        },
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof Error);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// 2. Shared GeoAI Pipeline & Persistence Tests
// ---------------------------------------------------------------------------

await test('valid photo submission calls shared GeoAI pipeline and creates persistent observation', async () => {
  // Mock geminiService.analyzeGeoscienceMedia to return consistent test fixture
  const originalAnalyze = geminiService.analyzeGeoscienceMedia;
  let analyzeCalled = false;

  geminiService.analyzeGeoscienceMedia = async () => {
    analyzeCalled = true;
    return MOCK_AI_RESULT;
  };

  try {
    const mockViewer: Viewer = {
      userId: 'usr_test_contributor_001',
      publicUserId: 'USR-8821',
      displayName: 'Alice Geologist',
      isDemo: false,
    };

    const submissionInput: PhotoSubmissionInput = {
      content_base64: VALID_PNG_BASE64,
      mime_type: 'image/png',
      caption: 'Found on hill slope near Musanze.',
      post_title: 'Musanze Granite Outcrop',
      location: {
        latitude: -1.498,
        longitude: 29.633,
        accuracy_meters: 10,
        district: 'Musanze',
        public_location_precision: 'approximate',
      },
      is_public: true,
    };

    const result = await photoSubmissionService.submitObservation(submissionInput, mockViewer);

    assert.ok(analyzeCalled, 'geminiService.analyzeGeoscienceMedia must be invoked');
    assert.equal(result.status, 'completed');
    assert.match(result.passport_id, /^RT-RW-\d{6}$/, 'Must generate valid sequential passport ID');
    assert.equal(result.category, 'rock');
    assert.equal(result.subcategory, 'igneous');
    assert.equal(result.primary_classification, 'igneous');
    assert.equal(result.possible_name, 'Granite');
    assert.equal(result.confidence, 'moderate');
    assert.equal(result.confidence_score, 0.75);
    assert.equal(result.evidence_state, 'ai_assisted', 'New submission must begin at ai_assisted');
    assert.equal(result.is_public, true);
    assert.ok(result.media.sha256, 'Media SHA256 checksum must be computed');
    assert.equal(result.media.mime_type, 'image/png');

    // Verify stored observation record
    const stored = await observationService.getObservationByPassportId(result.passport_id);
    assert.ok(stored, 'Observation must be retrievable by passport ID');
    assert.equal(stored?.source, 'mobile', 'Source must be recorded as mobile');
    assert.equal(stored?.owner_user_id, mockViewer.userId, 'Owner must be bound to viewer');
    assert.equal(stored?.post_title, 'Musanze Granite Outcrop');
  } finally {
    geminiService.analyzeGeoscienceMedia = originalAnalyze;
  }
});

await test('anonymous photo submission succeeds with default pseudonymous hash and private location', async () => {
  const originalAnalyze = geminiService.analyzeGeoscienceMedia;
  geminiService.analyzeGeoscienceMedia = async () => MOCK_AI_RESULT;

  try {
    const result = await photoSubmissionService.submitObservation(
      {
        content_base64: VALID_PNG_BASE64,
        caption: 'Anonymous rock find',
      },
      null, // anonymous guest viewer
      '192.168.1.100' // client IP
    );

    assert.equal(result.status, 'completed');
    assert.match(result.passport_id, /^RT-RW-\d{6}$/);
    assert.equal(result.evidence_state, 'ai_assisted');

    const stored = await observationService.getObservationByPassportId(result.passport_id);
    assert.ok(stored);
    assert.equal(stored?.owner_user_id, null, 'Anonymous submission has no owner_user_id');
    assert.ok(stored?.source_user_hash, 'Must generate salted pseudonymous user hash');
  } finally {
    geminiService.analyzeGeoscienceMedia = originalAnalyze;
  }
});

// ---------------------------------------------------------------------------
// 3. Image-Only GeoAI, Supporting Video Media, Earlier EXIF GPS, & Post-Pin Privacy/Edit Tests
// ---------------------------------------------------------------------------

const VALID_MP4_BASE64 = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
  Buffer.alloc(200, 5),
]).toString('base64');

await test('GeoAI strictly rejects standalone video analysis; videos attach as supporting post/pin media without AI calls', async () => {
  const originalAnalyze = geminiService.analyzeGeoscienceMedia;
  let analyzeCallCount = 0;
  geminiService.analyzeGeoscienceMedia = async () => {
    analyzeCallCount++;
    return MOCK_AI_RESULT;
  };

  try {
    // 1. Direct submission of MP4 as primary analyzed media must be rejected (image-only GeoAI)
    await assert.rejects(
      async () => {
        await photoSubmissionService.submitObservation({
          content_base64: VALID_MP4_BASE64,
          mime_type: 'video/mp4',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof GeologicalAnalysisError);
        return true;
      }
    );
    assert.equal(analyzeCallCount, 0, 'Gemini must NOT be called for standalone video');

    const viewer: Viewer = {
      userId: 'usr_mobile_video_001',
      publicUserId: 'USR-9901',
      displayName: 'FieldObserver',
      isDemo: false,
    };

    // 2. Sending MP4 in mobile chat with NO active passport prompts for a photo first (0 AI calls)
    const videoFirstResp = await mobileChatService.processChatMessage(
      {
        media_base64: VALID_MP4_BASE64,
        mime_type: 'video/mp4',
        message: 'Short outcrop pan in Musanze',
      },
      viewer,
      '10.0.0.12'
    );
    assert.equal(videoFirstResp.type, 'text');
    assert.equal(analyzeCallCount, 0, 'Video without active photo passport must not call Gemini');

    // 3. Send primary specimen photo -> runs GeoAI (1 call) and returns private draft_summary BEFORE pinning
    const draftResp = await mobileChatService.processChatMessage(
      {
        media_base64: VALID_PNG_BASE64,
        mime_type: 'image/png',
        message: 'Specimen close-up from Musanze road cut',
      },
      viewer,
      '10.0.0.12'
    );
    assert.equal(analyzeCallCount, 1, 'Gemini must be called once for primary specimen photo');
    assert.equal(draftResp.type, 'draft_summary', 'Must return draft_summary before pinning');
    assert.equal(draftResp.awaiting_pin_confirmation, true, 'Must await explicit pin confirmation');
    const passportId = draftResp.pending_passport_id!;
    assert.ok(passportId, 'Must return pending_passport_id');

    const beforePublicDetail = await publicObservationRepository.findPublicObservationByPassport(passportId);
    assert.equal(beforePublicDetail, null, 'Unconfirmed draft must NOT appear in public repository yet');

    // 4. Attach supporting MP4 outcrop video to active passport -> stores video with ZERO extra AI calls
    const videoAttachResp = await mobileChatService.processChatMessage(
      {
        pending_passport_id: passportId,
        media_base64: VALID_MP4_BASE64,
        mime_type: 'video/mp4',
        message: '360° outcrop wall context clip',
      },
      viewer,
      '10.0.0.12'
    );
    assert.equal(analyzeCallCount, 1, 'Attaching supporting video must NOT invoke Gemini');
    assert.equal(videoAttachResp.type, 'passport');

    // 5. Confirm pin after reviewing summary -> publishes to public map with chosen precision
    const confirmResp = await mobileChatService.processChatMessage(
      {
        pending_passport_id: passportId,
        pin_decision: 'pin_approximate',
        location: {
          latitude: -1.498,
          longitude: 29.633,
          district: 'Musanze',
        },
      },
      viewer,
      '10.0.0.12'
    );

    assert.equal(confirmResp.type, 'passport');
    assert.equal(confirmResp.awaiting_pin_confirmation, false);
    assert.equal(confirmResp.pin_confirmation?.is_public, true);
    assert.equal(confirmResp.pin_confirmation?.precision, 'approximate');
    assert.equal(confirmResp.pin_confirmation?.district, 'Musanze');

    const postDetail = await communityPostService.getPost(passportId, viewer);
    assert.ok(postDetail, 'Post detail must load');
    assert.equal(postDetail?.media.length, 2, 'Post must include primary image + supporting video');
    assert.equal(postDetail?.media.some((m) => m.kind === 'video'), true, 'Supporting video must be present in gallery');
  } finally {
    geminiService.analyzeGeoscienceMedia = originalAnalyze;
  }
});

await test('earlier photo taken outside app auto-recovers EXIF GPS & warns on Live GPS > 0.5 km mismatch, plus supports post-pin unpin/private/edit via contributor token', async () => {
  const originalAnalyze = geminiService.analyzeGeoscienceMedia;
  let analyzeCalls = 0;
  geminiService.analyzeGeoscienceMedia = async () => {
    analyzeCalls++;
    return MOCK_AI_RESULT;
  };

  try {
    const contributorToken = 'contrib_tok_geologist_device_0001';
    const exifJpegBase64 = buildExifJpegBuffer({
      latitude: -1.5008,
      longitude: 29.6342,
      altitudeMeters: 1865,
      capturedAt: '2026:10:18 11:15:30',
    }).toString('base64');

    // 1. Submit earlier Musanze photo while device live GPS is in Kigali (~65 km away) + bundled supporting video & scale photo
    const mismatchResult = await photoSubmissionService.submitObservation(
      {
        content_base64: exifJpegBase64,
        mime_type: 'image/jpeg',
        caption: 'Uploaded from Kigali office after weekend Musanze fieldwork',
        specimen_context: 'outcrop_in_situ',
        has_scale_reference: true,
        has_fresh_surface: true,
        contributor_token: contributorToken,
        location: {
          latitude: -1.9501, // Kigali office live GPS
          longitude: 30.0588,
          public_location_precision: 'approximate',
        },
        supporting_media: [
          {
            content_base64: VALID_MP4_BASE64,
            mime_type: 'video/mp4',
            caption: 'Outcrop dip & strike pan',
            role: 'video',
          },
          {
            content_base64: VALID_PNG_BASE64,
            mime_type: 'image/png',
            caption: 'Fresh fracture with coin scale',
            role: 'scale',
          },
        ],
        is_public: true,
      },
      null,
      '10.0.0.88'
    );

    assert.equal(analyzeCalls, 1, 'Only primary JPEG analyzed by GeoAI; supporting video & photo stored directly');
    assert.equal(mismatchResult.exif_location?.has_gps, true, 'Must detect embedded EXIF GPS');
    assert.ok(
      Math.abs((mismatchResult.exif_location?.latitude ?? 0) - -1.5008) < 0.001,
      'Must recover Musanze latitude from EXIF'
    );
    assert.ok(
      (mismatchResult.exif_location?.gps_mismatch_km ?? 0) > 50,
      'Must flag > 50 km mismatch between Musanze EXIF GPS and Kigali live GPS'
    );
    assert.equal(mismatchResult.supporting_media_stored.length, 2, 'Both supporting media items must be stored');

    const passportId = mismatchResult.passport_id;

    // 2. Submit another earlier photo WITHOUT live GPS -> server recovers EXIF GPS automatically (held private until confirmed)
    const recoveredOnly = await photoSubmissionService.submitObservation(
      {
        content_base64: exifJpegBase64,
        mime_type: 'image/jpeg',
        contributor_token: contributorToken,
        is_public: false,
      },
      null,
      '10.0.0.88'
    );
    assert.ok(recoveredOnly.location !== null, 'EXIF GPS must auto-attach when client omits location');
    assert.equal(recoveredOnly.location?.origin, 'photo_exif', 'Recovered location origin must be photo_exif');
    assert.equal(recoveredOnly.exif_location?.suggested_district, 'Musanze');

    // 3. Owner using ONLY contributorToken (no OTP login) edits coordinates to the true Musanze EXIF point
    const relocated = await communityPostService.updatePost(
      passportId,
      null,
      {
        post_title: 'Corrected Musanze Outcrop',
        latitude: -1.5008,
        longitude: 29.6342,
        district: 'Musanze',
        location_precision: 'approximate',
      },
      contributorToken
    );
    assert.equal(relocated.title, 'Corrected Musanze Outcrop');
    assert.equal(relocated.location.district, 'Musanze');
    assert.equal(relocated.viewer_is_owner, true);

    const geoBeforeUnpin = await publicObservationRepository.findPublicObservationsGeoJson({ page: 1, limit: 100 });
    assert.equal(
      geoBeforeUnpin.features.some((f) => f.properties.passport_id === passportId),
      true,
      'Pinned public post must appear in map GeoJSON'
    );

    // 4. Owner removes pin from public map (location_precision = 'private') while keeping post readable
    await communityPostService.updatePost(
      passportId,
      null,
      { location_precision: 'private' },
      contributorToken
    );
    const geoAfterUnpin = await publicObservationRepository.findPublicObservationsGeoJson({ page: 1, limit: 100 });
    assert.equal(
      geoAfterUnpin.features.some((f) => f.properties.passport_id === passportId),
      false,
      'Unpinned post must immediately vanish from public map GeoJSON'
    );

    // 5. Owner removes supporting video media item, then makes entire observation private
    const videoMedia = relocated.media.find((m) => m.kind === 'video');
    assert.ok(videoMedia, 'Supporting video must exist before removal');
    const afterMediaDelete = await communityPostService.removeMedia(
      passportId,
      null,
      videoMedia!.media_id,
      contributorToken
    );
    assert.equal(afterMediaDelete.media.length, 2, 'Video removed, primary + scale images remain');

    await communityPostService.updatePost(
      passportId,
      null,
      { is_public: false },
      contributorToken
    );
    const publicLookupAfterPrivate = await publicObservationRepository.findPublicObservationByPassport(passportId);
    assert.equal(publicLookupAfterPrivate, null, 'Privatized post must be removed from public observation index');
  } finally {
    geminiService.analyzeGeoscienceMedia = originalAnalyze;
  }
});

await test('mobile chat pre-shared location pin is held privately, attached to photo draft, and supports follow-up Q&A + commands', async () => {
  const originalAnalyze = geminiService.analyzeGeoscienceMedia;
  const originalAnswerQ = geminiService.answerGeoscienceQuestion;
  geminiService.analyzeGeoscienceMedia = async () => MOCK_AI_RESULT;
  geminiService.answerGeoscienceQuestion = async (q, ctx) =>
    `Contextual answer for ${ctx?.passportId ?? 'none'}: ${q}`;

  try {
    const viewer: Viewer = {
      userId: 'usr_mobile_prepin_002',
      publicUserId: 'USR-9902',
      displayName: 'RwandaExplorer',
      isDemo: false,
    };

    // 1. Share location pin BEFORE sending media
    const locAck = await mobileChatService.processChatMessage(
      {
        location: {
          latitude: -1.676,
          longitude: 29.261,
          district: 'Rubavu',
        },
      },
      viewer,
      '10.0.0.15'
    );
    assert.equal(locAck.type, 'location_acknowledged');
    assert.equal(locAck.pending_location?.district, 'Rubavu');

    // 2. Send photo -> consumes held location, STILL shows summary before public pinning
    const draft = await mobileChatService.processChatMessage(
      {
        media_base64: VALID_PNG_BASE64,
        mime_type: 'image/png',
      },
      viewer,
      '10.0.0.15'
    );
    assert.equal(draft.type, 'draft_summary');
    assert.equal(draft.pending_location?.district, 'Rubavu');
    const passportId = draft.pending_passport_id!;

    // 3. Answer follow-up question / ask question on active passport
    const qaResp = await mobileChatService.processChatMessage(
      {
        pending_passport_id: passportId,
        message: 'It is part of a continuous ridge exposure; could it be granodiorite?',
      },
      viewer,
      '10.0.0.15'
    );
    assert.equal(qaResp.type, 'text');
    assert.ok(qaResp.reply.includes(passportId), 'Q&A must receive active passport context');
    const updatedObs = await observationRepository.findByPassportId(passportId);
    assert.ok(
      updatedObs?.user_report?.includes('continuous ridge exposure'),
      'Follow-up field answer must be appended to observation user_report'
    );

    // 4. Choose keep_private -> remains private
    const keepPriv = await mobileChatService.processChatMessage(
      {
        pending_passport_id: passportId,
        pin_decision: 'keep_private',
      },
      viewer,
      '10.0.0.15'
    );
    assert.equal(keepPriv.pin_confirmation?.is_public, false);
    assert.equal(keepPriv.pin_confirmation?.precision, 'private');

    // 5. Verify native community commands work in mobile chat
    const helpCmd = await mobileChatService.processChatMessage({ message: 'COMMUNITYHELP' }, viewer);
    assert.equal(helpCmd.type, 'help');
    assert.ok(helpCmd.reply.includes('INVESTIGATE'));

    const repCmd = await mobileChatService.processChatMessage({ message: 'REP' }, viewer);
    assert.ok(repCmd.reply.includes('YOUR CONTRIBUTIONS'));
  } finally {
    geminiService.analyzeGeoscienceMedia = originalAnalyze;
    geminiService.answerGeoscienceQuestion = originalAnswerQ;
  }
});

// ---------------------------------------------------------------------------
// Test 12: Non-geoscience submissions (shoes, clothes, off-topic prompts) are
// rejected with mission/goal/scope warning and create ZERO junk passports
// ---------------------------------------------------------------------------
await test('Non-geoscience photos (shoes, clothes) and off-topic chat messages warn user without creating Passports', async () => {
  const originalAnalyze = geminiService.analyzeGeoscienceMedia;
  const originalDownload = whatsappMediaService.downloadMedia;
  const originalSendWhatsApp = whatsappService.sendTextMessage;

  const sentWhatsAppReplies: string[] = [];

  try {
    // A. Direct photo submission with an image of shoes -> throws NON_GEOSCIENCE_SUBMISSION, no DB row
    geminiService.analyzeGeoscienceMedia = async () => ({
      ...MOCK_AI_RESULT,
      is_rock: false,
      is_geoscience_relevant: false,
      observation_category: 'non_geoscience',
      observation_subcategory: 'not_geoscience',
      observation_type: 'everyday_object',
      primary_classification: 'non_rock',
      possible_name: null,
      primary_interpretation: 'Pair of athletic shoes on indoor floor with no geological content',
      reasoning: 'Observed footwear; no geological material present.',
    });

    let rejectedError: unknown = null;
    try {
      await photoSubmissionService.submitObservation(
        {
          content_base64: VALID_PNG_BASE64,
          mime_type: 'image/png',
          caption: 'Testing AI with my shoes',
        },
        null,
        '10.0.0.88'
      );
    } catch (err: unknown) {
      rejectedError = err;
    }

    assert.ok(rejectedError instanceof GeologicalAnalysisError, 'Must throw GeologicalAnalysisError');
    assert.equal(rejectedError.category, 'NON_GEOSCIENCE_SUBMISSION');
    assert.ok(rejectedError.message.includes('shoes or footwear'), 'Warning must name detected shoes');
    assert.ok(rejectedError.message.includes('Our Mission & Goal'), 'Warning must state mission and goal');
    assert.ok(rejectedError.message.includes('What was observed'), 'Warning must list What was observed scope');
    assert.ok(rejectedError.message.includes('Rock type'), 'Warning must list Rock type scope');
    assert.ok(rejectedError.message.includes('Evidence state'), 'Warning must list Evidence state scope');

    // B. Mobile chat with clothes photo -> returns domain_warning without creating passport
    geminiService.analyzeGeoscienceMedia = async () => ({
      ...MOCK_AI_RESULT,
      is_rock: false,
      is_geoscience_relevant: false,
      observation_category: 'non_geoscience',
      observation_subcategory: 'not_geoscience',
      observation_type: 'everyday_object',
      primary_classification: 'non_rock',
      possible_name: null,
      primary_interpretation: 'Folded shirt and clothes on a bed',
      reasoning: 'Observed clothing/apparel; unrelated to geoscience.',
    });

    const clothesChatResp = await mobileChatService.processChatMessage(
      {
        image_base64: VALID_PNG_BASE64,
        image_mime_type: 'image/png',
        message: 'Testing with clothes',
      },
      null,
      '10.0.0.89'
    );
    assert.equal(clothesChatResp.type, 'domain_warning');
    assert.equal(clothesChatResp.passport, undefined, 'Must not return a created passport');
    assert.ok(clothesChatResp.reply.includes('clothes or apparel'));
    assert.ok(clothesChatResp.reply.includes('No Geoscience Passport was created'));

    // C. Off-topic text while an active Passport is open -> warns & does NOT pollute user_report
    geminiService.analyzeGeoscienceMedia = async () => MOCK_AI_RESULT;
    const validPassport = await photoSubmissionService.submitObservation(
      {
        content_base64: VALID_PNG_BASE64,
        mime_type: 'image/png',
        caption: 'Fresh granite outcrop near Huye.',
      },
      null,
      '10.0.0.90'
    );

    const offTopicTextResp = await mobileChatService.processChatMessage(
      {
        pending_passport_id: validPassport.passport_id,
        message: 'Where can I buy new sneakers and fashion clothes online?',
      },
      null,
      '10.0.0.90'
    );
    assert.equal(offTopicTextResp.type, 'domain_warning');
    const unchangedObs = await observationRepository.findByPassportId(validPassport.passport_id);
    assert.ok(
      !unchangedObs?.user_report?.includes('sneakers'),
      'Off-topic chat prompt must NOT be appended to active Passport user_report'
    );

    // D. Off-topic ASK command in mobile chat -> domain_warning
    const offTopicAsk = await mobileChatService.processChatMessage(
      {
        message: 'ASK Best shoes and jacket for a wedding?',
      },
      null,
      '10.0.0.90'
    );
    assert.equal(offTopicAsk.type, 'domain_warning');

    // E. WhatsApp media pipeline with non-geoscience image -> warns user, creates NO DB observation
    whatsappMediaService.downloadMedia = async () => ({
      buffer: Buffer.from(VALID_PNG_BASE64, 'base64'),
      mimeType: 'image/png',
      fileSize: 208,
    });
    whatsappService.sendTextMessage = async (_to: string, body: string) => {
      sentWhatsAppReplies.push(body);
    };
    geminiService.analyzeGeoscienceMedia = async () => ({
      ...MOCK_AI_RESULT,
      is_rock: false,
      is_geoscience_relevant: false,
      observation_category: 'non_geoscience',
      observation_subcategory: 'not_geoscience',
      primary_classification: 'non_rock',
      possible_name: null,
      primary_interpretation: 'Pair of leather boots on carpet',
    });

    const nonGeoMsgId = `wamid.non_geo_shoes_${Date.now()}`;
    const outcome = await geoscienceAnalysisService.processRockImage({
      senderPhoneNumber: '250788000999',
      messageId: nonGeoMsgId,
      mediaId: 'media_shoes_test',
      declaredMimeType: 'image/png',
      caption: 'Testing your AI',
    });
    assert.equal(outcome.state, 'completed');
    assert.equal(
      outcome.state === 'completed' ? outcome.passportId : undefined,
      undefined,
      'Non-geoscience WhatsApp media must not produce a passportId'
    );
    const savedNonGeo = await observationService.getObservationBySourceMessageId(nonGeoMsgId);
    assert.equal(savedNonGeo, null, 'No observation row may be stored for non-geoscience media');
    assert.ok(sentWhatsAppReplies[0]?.includes('shoes or footwear'));
    assert.ok(sentWhatsAppReplies[0]?.includes('Our Mission & Goal'));

    // F. Valid non-rock geoscience categories (layers, landforms, fossils) format cleanly in WhatsApp
    const layerReply = formatWhatsAppPassportResponse(
      {
        ...MOCK_AI_RESULT,
        is_rock: false,
        is_geoscience_relevant: true,
        observation_category: 'geological_layer',
        observation_subcategory: 'sedimentary_layering',
        primary_classification: 'non_rock',
        possible_name: null,
        primary_interpretation: 'Alternating sedimentary beds exposed in road cut',
      },
      'ET-RW-999901'
    );
    assert.ok(layerReply.includes('Your Geoscience Passport has been created.'));
    assert.ok(layerReply.includes('What was observed: Geological layer'));
    assert.ok(layerReply.includes('Evidence state: AI-assisted preliminary reading'));
  } finally {
    geminiService.analyzeGeoscienceMedia = originalAnalyze;
    whatsappMediaService.downloadMedia = originalDownload;
    whatsappService.sendTextMessage = originalSendWhatsApp;
  }
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log(`Stage 9 Photo Submission Suite: ${passed} passed, ${failed} failed`);
console.log('============================================================');

if (failed > 0) {
  process.exit(1);
}

