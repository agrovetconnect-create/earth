import type { Request, Response } from 'express';
import { publicObservationService } from '../services/public-observation.service.js';
import { publicObservationRepository } from '../repositories/public-observation.repository.js';
import { geoscienceIntelligenceService } from '../services/geoscience-intelligence.service.js';
import { logger } from '../utils/logger.js';
import { setPublicHeaders } from '../utils/http.js';
import { isServiceUnavailableError } from '../utils/service-error.js';
import { checkDistributedRateLimit } from '../utils/rate-limiter.js';
import { hashRequestIp } from '../utils/user-auth.js';
import { env } from '../config/env.js';

function respondPublicError(res: Response, err: unknown, logContext: string, fallbackMessage: string): void {
  const msg = err instanceof Error ? err.message : 'Unknown error';
  logger.error(logContext, { error: msg });
  if (isServiceUnavailableError(err)) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Public geoscience records are temporarily unavailable because the database could not be reached.',
      },
    });
    return;
  }
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: fallbackMessage,
    },
  });
}

async function enforcePublicRateLimit(req: Request, res: Response): Promise<boolean> {
  const ipHash = hashRequestIp(req);
  const allowed = await checkDistributedRateLimit(
    `public_api:${ipHash}`,
    env.PUBLIC_API_RATE_LIMIT_PER_MINUTE,
    60_000
  );
  if (!allowed) {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
    });
    return false;
  }
  return true;
}

/**
 * GET /api/public/observations
 */
export async function getPublicObservations(req: Request, res: Response): Promise<void> {
  if (!(await enforcePublicRateLimit(req, res))) return;

  try {
    setPublicHeaders(res, 30);
    const result = await publicObservationService.getObservations(req.query);
    res.status(200).json(result);
  } catch (err: unknown) {
    respondPublicError(res, err, 'Error fetching public observations', 'Failed to retrieve geological observations.');
  }
}

/**
 * GET /api/public/observations/unlocated
 *
 * Published observations without a public coordinate. Listed, never mapped: a
 * record whose location was kept private is not placed at a guessed point.
 */
export async function getUnlocatedObservations(req: Request, res: Response): Promise<void> {
  if (!(await enforcePublicRateLimit(req, res))) return;

  try {
    setPublicHeaders(res, 30);
    const result = await publicObservationService.getUnlocatedObservations(req.query);
    res.status(200).json(result);
  } catch (err: unknown) {
    respondPublicError(
      res,
      err,
      'Error fetching unlocated public observations',
      'Failed to retrieve observations without a location.'
    );
  }
}

/**
 * GET /api/public/observations.geojson
 */
export async function getPublicObservationsGeoJson(req: Request, res: Response): Promise<void> {
  if (!(await enforcePublicRateLimit(req, res))) return;

  try {
    setPublicHeaders(res, 30);
    res.setHeader('Content-Type', 'application/geo+json');
    const geojson = await publicObservationService.getObservationsGeoJson(req.query);
    res.status(200).json(geojson);
  } catch (err: unknown) {
    respondPublicError(res, err, 'Error generating public GeoJSON', 'Failed to generate map data.');
  }
}

/**
 * GET /api/public/observations/:passportId
 */
export async function getPublicObservationByPassportId(req: Request, res: Response): Promise<void> {
  if (!(await enforcePublicRateLimit(req, res))) return;

  try {
    const { passportId } = req.params;
    const observation = await publicObservationService.getObservationByPassportId(passportId);

    if (!observation) {
      // 404 without leaking whether private record exists
      res.status(404).json({
        error: {
          code: 'PUBLIC_OBSERVATION_NOT_FOUND',
          message: 'Public observation not found.',
        },
      });
      return;
    }

    setPublicHeaders(res, 60);
    res.status(200).json(observation);
  } catch (err: unknown) {
    respondPublicError(res, err, 'Error fetching public observation by ID', 'Failed to retrieve the Geoscience Passport.');
  }
}

/**
 * GET /api/public/stats
 */
export async function getPublicStats(req: Request, res: Response): Promise<void> {
  if (!(await enforcePublicRateLimit(req, res))) return;

  try {
    setPublicHeaders(res, 60);
    const stats = await publicObservationService.getStats();
    res.status(200).json(stats);
  } catch (err: unknown) {
    respondPublicError(res, err, 'Error fetching public stats', 'Failed to retrieve statistics.');
  }
}

/**
 * GET /api/public/districts
 */
export async function getPublicDistricts(req: Request, res: Response): Promise<void> {
  if (!(await enforcePublicRateLimit(req, res))) return;

  try {
    setPublicHeaders(res, 120);
    const districts = await publicObservationService.getDistricts();
    res.status(200).json(districts);
  } catch (err: unknown) {
    respondPublicError(res, err, 'Error fetching public districts', 'Failed to retrieve districts.');
  }
}

/**
 * GET /api/public/categories
 *
 * Returns the observation-category breakdown of public observations, including
 * categories that currently have zero observations. Used by the map filter and
 * the category layers, so the client never has to guess a category list or
 * invent a count for a category it has not heard of.
 */
export async function getPublicCategories(req: Request, res: Response): Promise<void> {
  if (!(await enforcePublicRateLimit(req, res))) return;

  try {
    setPublicHeaders(res, 120);
    const categories = await publicObservationService.getCategoryCounts();
    res.status(200).json(categories);
  } catch (err: unknown) {
    respondPublicError(res, err, 'Error fetching public categories', 'Failed to retrieve observation categories.');
  }
}

/**
 * GET /api/public/observations/:passportId/intelligence
 *
 * Stage 11 — assembles the context-aware intelligence presentation for a public
 * observation from its stored analysis and the genuinely available context.
 */
export async function getObservationIntelligence(req: Request, res: Response): Promise<void> {
  if (!(await enforcePublicRateLimit(req, res))) return;

  try {
    const { passportId } = req.params;
    const intelligence = await geoscienceIntelligenceService.getObservationIntelligence(passportId);
    if (!intelligence) {
      res.status(404).json({
        error: { code: 'PUBLIC_OBSERVATION_NOT_FOUND', message: 'Public observation not found.' },
      });
      return;
    }
    setPublicHeaders(res, 60);
    res.status(200).json(intelligence);
  } catch (err: unknown) {
    respondPublicError(
      res,
      err,
      'Error fetching observation intelligence',
      'Failed to assemble the observation intelligence.'
    );
  }
}

/**
 * GET /api/public/observations/:passportId/context
 *
 * Stage 11 — the honest, bounded context an interpretation can draw on: nearby
 * observations, the site, community activity, expert review and geological
 * dataset status. Unavailable sources are reported as unavailable.
 */
export async function getObservationContext(req: Request, res: Response): Promise<void> {
  if (!(await enforcePublicRateLimit(req, res))) return;

  try {
    const { passportId } = req.params;
    const observation = await publicObservationService.getObservationByPassportId(passportId);
    if (!observation) {
      res.status(404).json({
        error: { code: 'PUBLIC_OBSERVATION_NOT_FOUND', message: 'Public observation not found.' },
      });
      return;
    }
    setPublicHeaders(res, 60);
    const context = await geoscienceIntelligenceService.collectObservationContext(passportId);
    res.status(200).json(context);
  } catch (err: unknown) {
    respondPublicError(res, err, 'Error fetching observation context', 'Failed to assemble the observation context.');
  }
}

/**
 * GET /api/public/observations/:passportId/nearby
 *
 * Stage 11 — bounded, distance-ordered nearby public observations. Density is
 * reported as density and never translated into geological abundance.
 */
export async function getNearbyObservations(req: Request, res: Response): Promise<void> {
  if (!(await enforcePublicRateLimit(req, res))) return;

  try {
    const { passportId } = req.params;
    const observation = await publicObservationService.getObservationByPassportId(passportId);
    if (!observation) {
      res.status(404).json({
        error: { code: 'PUBLIC_OBSERVATION_NOT_FOUND', message: 'Public observation not found.' },
      });
      return;
    }
    const nearby = await publicObservationRepository.findNearbyPublicObservations({
      passportId,
      radiusKm: 25,
      limit: 12,
    });
    setPublicHeaders(res, 60);
    res.status(200).json({
      available: nearby.length > 0,
      count: nearby.length,
      radius_km: 25,
      items: nearby,
      note:
        nearby.length > 0
          ? 'Nearby observation density does not imply geological abundance.'
          : 'No nearby public observations share an exact published coordinate within the search radius.',
    });
  } catch (err: unknown) {
    respondPublicError(res, err, 'Error fetching nearby observations', 'Failed to retrieve nearby observations.');
  }
}

/**
 * GET /api/public/observations/:passportId/similar
 *
 * Stage 11 — recent public observations in the same category/subcategory
 * (the nearest similarity signal the public data exposes).
 */
export async function getSimilarObservations(req: Request, res: Response): Promise<void> {
  if (!(await enforcePublicRateLimit(req, res))) return;

  try {
    const { passportId } = req.params;
    const observation = await publicObservationService.getObservationByPassportId(passportId);
    if (!observation) {
      res.status(404).json({
        error: { code: 'PUBLIC_OBSERVATION_NOT_FOUND', message: 'Public observation not found.' },
      });
      return;
    }
    const similar = await publicObservationRepository.findSimilarPublicObservations({
      passportId,
      limit: 8,
    });
    setPublicHeaders(res, 60);
    res.status(200).json({
      available: similar.length > 0,
      count: similar.length,
      items: similar,
      note:
        similar.length > 0
          ? 'Same-category/same-subcategory public records. Having the same category does not make an identification a confirmation.'
          : 'No public observations share the same category and subcategory.',
    });
  } catch (err: unknown) {
    respondPublicError(res, err, 'Error fetching similar observations', 'Failed to retrieve similar observations.');
  }
}

/**
 * GET /api/public/observations/compare?a=…&b=…
 *
 * Stage 11 — side-by-side comparison of two public observations. The two records
 * are never merged into one answer.
 */
export async function compareObservations(req: Request, res: Response): Promise<void> {
  if (!(await enforcePublicRateLimit(req, res))) return;

  try {
    const passportA = String(req.query.a ?? '').trim().toUpperCase();
    const passportB = String(req.query.b ?? '').trim().toUpperCase();
    if (!passportA || !passportB) {
      res.status(400).json({
        error: { code: 'INVALID_PARAMETERS', message: 'Both a and b passport ids are required.' },
      });
      return;
    }
    const comparison = await geoscienceIntelligenceService.compareObservations(passportA, passportB);
    if (!comparison) {
      res.status(404).json({
        error: { code: 'PUBLIC_OBSERVATION_NOT_FOUND', message: 'One or both public observations were not found.' },
      });
      return;
    }
    setPublicHeaders(res, 60);
    res.status(200).json(comparison);
  } catch (err: unknown) {
    respondPublicError(res, err, 'Error comparing observations', 'Failed to compare the observations.');
  }
}

/**
 * GET /api/public/research-opportunities
 *
 * Stage 11 — community-generated research opportunities derived only from real
 * flagged observations and research-interest investigations.
 */
export async function listResearchOpportunities(req: Request, res: Response): Promise<void> {
  if (!(await enforcePublicRateLimit(req, res))) return;

  try {
    const siteCode = String(req.query.site ?? '').trim() || undefined;
    const opportunities = await geoscienceIntelligenceService.listResearchOpportunities({ siteCode });
    setPublicHeaders(res, 120);
    res.status(200).json({ count: opportunities.length, items: opportunities });
  } catch (err: unknown) {
    respondPublicError(res, err, 'Error listing research opportunities', 'Failed to retrieve research opportunities.');
  }
}
