import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveOfflineDraft,
  getOfflineDrafts,
  getPendingDrafts,
  deleteOfflineDraft,
  updateDraftStatus,
} from '../services/offlineDrafts.ts';
import { prepareImageForUpload, isValidImageForSubmission } from '../utils/imageCompressor.ts';
import { validateWGS84Coordinates, isWithinRwandaBounds } from '../utils/exifExtractor.ts';

test('offline drafts store saves, updates, and filters pending drafts', () => {
  const draft = saveOfflineDraft({
    photoUri: 'file:///data/photo1.jpg',
    title: 'Volcanic Basalt Specimen',
    category: 'rock',
    district: 'Musanze',
    latitude: -1.5,
    longitude: 29.6,
  });

  assert.equal(draft.syncStatus, 'pending');
  assert.equal(getOfflineDrafts().length, 1);
  assert.equal(getPendingDrafts().length, 1);

  updateDraftStatus(draft.id, 'synced');
  assert.equal(getPendingDrafts().length, 0);

  const deleted = deleteOfflineDraft(draft.id);
  assert.equal(deleted, true);
  assert.equal(getOfflineDrafts().length, 0);
});

test('image compressor validates URIs and calculates upload compression estimates', () => {
  assert.equal(isValidImageForSubmission('file:///photo.jpg'), true);
  assert.equal(isValidImageForSubmission('https://example.com/rock.jpg'), true);
  assert.equal(isValidImageForSubmission(''), false);
  assert.equal(isValidImageForSubmission(null), false);

  const result = prepareImageForUpload('file:///photo.jpg', { maxWidth: 1200 });
  assert.ok(result.compressedSizeEstimateBytes < result.originalSizeEstimateBytes);
  assert.equal(result.dimensions.width, 1200);
});

test('exif extractor validates WGS84 coordinates and Rwanda geographic boundaries', () => {
  const valid = validateWGS84Coordinates(-1.9441, 30.0619);
  assert.equal(valid.hasCoordinates, true);
  assert.equal(valid.latitude, -1.9441);
  assert.equal(valid.longitude, 30.0619);

  const invalid = validateWGS84Coordinates(120, 200);
  assert.equal(invalid.hasCoordinates, false);

  assert.equal(isWithinRwandaBounds(-1.9441, 30.0619), true); // Kigali
  assert.equal(isWithinRwandaBounds(48.8566, 2.3522), false); // Paris
});

test('mobile offline map & observation cache computes camera tile packs and serves filtered cached observations when offline', async () => {
  const {
    clearMobileOfflineCache,
    computeMobileCameraTileUrls,
    filterOfflineGeoJson,
    getCachedObservationsGeoJson,
    saveMobileOfflinePack,
    withOfflineFallback,
  } = await import('../services/offlineCache.ts');

  await clearMobileOfflineCache();

  const tileUrls = computeMobileCameraTileUrls(
    { latitude: -1.9403, longitude: 29.8739, zoom: 9 },
    { radiusTiles: 1, maxTiles: 24 }
  );
  assert.ok(tileUrls.length > 0 && tileUrls.length <= 24);
  assert.match(tileUrls[0] ?? '', /^https:\/\/tile\.openstreetmap\.org\/9\/\d+\/\d+\.png$/);

  const sampleGeoJson = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'Point', coordinates: [29.63, -1.5] },
        properties: {
          passport_id: 'ET-MOB-1',
          observation_category: 'rock',
          district: 'Musanze',
          evidence_state: 'ai_assisted',
        },
      },
      {
        type: 'Feature' as const,
        geometry: { type: 'Point', coordinates: [30.06, -1.94] },
        properties: {
          passport_id: 'ET-MOB-2',
          observation_category: 'mineral',
          district: 'Gasabo',
          evidence_state: 'expert_reviewed',
        },
      },
    ],
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('TILE', { status: 200 });
  try {
    const stats = await saveMobileOfflinePack({
      camera: { latitude: -1.9403, longitude: 29.8739, zoom: 9 },
      observationsGeoJson: sampleGeoJson,
      maxTiles: 8,
    });
    assert.equal(stats.cachedObservations, 2);
    assert.ok(stats.cachedTiles > 0);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const filtered = filterOfflineGeoJson(sampleGeoJson, { category: 'rock', district: 'Musanze' });
  assert.equal(filtered.features.length, 1);

  const enrichedGeoJson = {
    type: 'FeatureCollection' as const,
    features: [
      {
        ...sampleGeoJson.features[0]!,
        properties: {
          ...sampleGeoJson.features[0]!.properties,
          confidence: 'moderate',
          verification_status: 'unverified',
        },
      },
      {
        ...sampleGeoJson.features[1]!,
        properties: {
          ...sampleGeoJson.features[1]!.properties,
          confidence: 'high',
          verification_status: 'verified',
        },
      },
    ],
  };
  assert.equal(filterOfflineGeoJson(enrichedGeoJson, { confidence: 'high' }).features.length, 1);
  assert.equal(filterOfflineGeoJson(enrichedGeoJson, { verification: 'verified' }).features[0]?.properties?.passport_id, 'ET-MOB-2');
  assert.equal(filterOfflineGeoJson(enrichedGeoJson, { confidence: 'low' }).features.length, 0);

  const recovered = await withOfflineFallback(
    async () => {
      throw Object.assign(new Error('Offline'), { kind: 'network' });
    },
    async () => {},
    () => getCachedObservationsGeoJson({ district: 'Gasabo' })
  );
  assert.equal(recovered.features.length, 1);
  assert.equal(recovered.features[0]?.properties?.passport_id, 'ET-MOB-2');

  await clearMobileOfflineCache();
});
