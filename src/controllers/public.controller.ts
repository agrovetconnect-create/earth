import type { Request, Response } from 'express';
import { publicObservationService } from '../services/public-observation.service.js';
import { publicObservationRepository } from '../repositories/public-observation.repository.js';
import { geoscienceIntelligenceService } from '../services/geoscience-intelligence.service.js';
import { logger } from '../utils/logger.js';
import { setPublicHeaders } from '../utils/http.js';
<<<<<<< HEAD
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
=======

// Simple in-memory rate limiter for public endpoints (100 req / 15 min / IP)
const ipRequestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 100;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = ipRequestCounts.get(ip);

  if (!record || now > record.resetTime) {
    ipRequestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  record.count++;
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  return true;
}

/**
 * GET /api/public/observations
 */
export async function getPublicObservations(req: Request, res: Response): Promise<void> {
<<<<<<< HEAD
  if (!(await enforcePublicRateLimit(req, res))) return;
=======
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
    });
    return;
  }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

  try {
    setPublicHeaders(res, 30);
    const result = await publicObservationService.getObservations(req.query);
    res.status(200).json(result);
  } catch (err: unknown) {
<<<<<<< HEAD
    respondPublicError(res, err, 'Error fetching public observations', 'Failed to retrieve geological observations.');
=======
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Error fetching public observations', { error: msg });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve geological observations.',
      },
    });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }
}

/**
 * GET /api/public/observations/unlocated
 *
 * Published observations without a public coordinate. Listed, never mapped: a
 * record whose location was kept private is not placed at a guessed point.
 */
export async function getUnlocatedObservations(req: Request, res: Response): Promise<void> {
<<<<<<< HEAD
  if (!(await enforcePublicRateLimit(req, res))) return;
=======
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
    });
    return;
  }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

  try {
    setPublicHeaders(res, 30);
    const result = await publicObservationService.getUnlocatedObservations(req.query);
    res.status(200).json(result);
  } catch (err: unknown) {
<<<<<<< HEAD
    respondPublicError(
      res,
      err,
      'Error fetching unlocated public observations',
      'Failed to retrieve observations without a location.'
    );
=======
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Error fetching unlocated public observations', { error: msg });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve observations without a location.',
      },
    });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }
}

/**
 * GET /api/public/observations.geojson
 */
export async function getPublicObservationsGeoJson(req: Request, res: Response): Promise<void> {
<<<<<<< HEAD
  if (!(await enforcePublicRateLimit(req, res))) return;
=======
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
    });
    return;
  }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

  try {
    setPublicHeaders(res, 30);
    res.setHeader('Content-Type', 'application/geo+json');
    const geojson = await publicObservationService.getObservationsGeoJson(req.query);
    res.status(200).json(geojson);
  } catch (err: unknown) {
<<<<<<< HEAD
    respondPublicError(res, err, 'Error generating public GeoJSON', 'Failed to generate map data.');
=======
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Error generating public GeoJSON', { error: msg });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to generate map data.',
      },
    });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }
}

/**
 * GET /api/public/observations/:passportId
 */
export async function getPublicObservationByPassportId(req: Request, res: Response): Promise<void> {
<<<<<<< HEAD
  if (!(await enforcePublicRateLimit(req, res))) return;
=======
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
    });
    return;
  }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

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
<<<<<<< HEAD
    respondPublicError(res, err, 'Error fetching public observation by ID', 'Failed to retrieve the Geoscience Passport.');
=======
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Error fetching public observation by ID', { error: msg });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve the Geoscience Passport.',
      },
    });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }
}

/**
 * GET /api/public/stats
 */
export async function getPublicStats(req: Request, res: Response): Promise<void> {
<<<<<<< HEAD
  if (!(await enforcePublicRateLimit(req, res))) return;
=======
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
    });
    return;
  }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

  try {
    setPublicHeaders(res, 60);
    const stats = await publicObservationService.getStats();
    res.status(200).json(stats);
  } catch (err: unknown) {
<<<<<<< HEAD
    respondPublicError(res, err, 'Error fetching public stats', 'Failed to retrieve statistics.');
=======
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Error fetching public stats', { error: msg });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve statistics.',
      },
    });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }
}

/**
 * GET /api/public/districts
 */
export async function getPublicDistricts(req: Request, res: Response): Promise<void> {
<<<<<<< HEAD
  if (!(await enforcePublicRateLimit(req, res))) return;
=======
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
    });
    return;
  }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

  try {
    setPublicHeaders(res, 120);
    const districts = await publicObservationService.getDistricts();
    res.status(200).json(districts);
  } catch (err: unknown) {
<<<<<<< HEAD
    respondPublicError(res, err, 'Error fetching public districts', 'Failed to retrieve districts.');
=======
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Error fetching public districts', { error: msg });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve districts.',
      },
    });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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
<<<<<<< HEAD
  if (!(await enforcePublicRateLimit(req, res))) return;
=======
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
    });
    return;
  }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

  try {
    setPublicHeaders(res, 120);
    const categories = await publicObservationService.getCategoryCounts();
    res.status(200).json(categories);
  } catch (err: unknown) {
<<<<<<< HEAD
    respondPublicError(res, err, 'Error fetching public categories', 'Failed to retrieve observation categories.');
=======
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Error fetching public categories', { error: msg });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve observation categories.',
      },
    });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }
}

/**
 * GET /api/public/observations/:passportId/intelligence
 *
 * Stage 11 — assembles the context-aware intelligence presentation for a public
 * observation from its stored analysis and the genuinely available context.
 */
export async function getObservationIntelligence(req: Request, res: Response): Promise<void> {
<<<<<<< HEAD
  if (!(await enforcePublicRateLimit(req, res))) return;
=======
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' },
    });
    return;
  }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

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
<<<<<<< HEAD
    respondPublicError(
      res,
      err,
      'Error fetching observation intelligence',
      'Failed to assemble the observation intelligence.'
    );
=======
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Error fetching observation intelligence', { error: msg });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to assemble the observation intelligence.' },
    });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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
<<<<<<< HEAD
  if (!(await enforcePublicRateLimit(req, res))) return;
=======
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' },
    });
    return;
  }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

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
<<<<<<< HEAD
    respondPublicError(res, err, 'Error fetching observation context', 'Failed to assemble the observation context.');
=======
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Error fetching observation context', { error: msg });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to assemble the observation context.' },
    });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }
}

/**
 * GET /api/public/observations/:passportId/nearby
 *
 * Stage 11 — bounded, distance-ordered nearby public observations. Density is
 * reported as density and never translated into geological abundance.
 */
export async function getNearbyObservations(req: Request, res: Response): Promise<void> {
<<<<<<< HEAD
  if (!(await enforcePublicRateLimit(req, res))) return;
=======
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' },
    });
    return;
  }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

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
<<<<<<< HEAD
    respondPublicError(res, err, 'Error fetching nearby observations', 'Failed to retrieve nearby observations.');
=======
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Error fetching nearby observations', { error: msg });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve nearby observations.' },
    });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }
}

/**
 * GET /api/public/observations/:passportId/similar
 *
 * Stage 11 — recent public observations in the same category/subcategory
 * (the nearest similarity signal the public data exposes).
 */
export async function getSimilarObservations(req: Request, res: Response): Promise<void> {
<<<<<<< HEAD
  if (!(await enforcePublicRateLimit(req, res))) return;
=======
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' },
    });
    return;
  }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

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
<<<<<<< HEAD
    respondPublicError(res, err, 'Error fetching similar observations', 'Failed to retrieve similar observations.');
=======
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Error fetching similar observations', { error: msg });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve similar observations.' },
    });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }
}

/**
 * GET /api/public/observations/compare?a=…&b=…
 *
 * Stage 11 — side-by-side comparison of two public observations. The two records
 * are never merged into one answer.
 */
export async function compareObservations(req: Request, res: Response): Promise<void> {
<<<<<<< HEAD
  if (!(await enforcePublicRateLimit(req, res))) return;
=======
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' },
    });
    return;
  }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

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
<<<<<<< HEAD
    respondPublicError(res, err, 'Error comparing observations', 'Failed to compare the observations.');
=======
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Error comparing observations', { error: msg });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to compare the observations.' },
    });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }
}

/**
 * GET /api/public/research-opportunities
 *
 * Stage 11 — community-generated research opportunities derived only from real
 * flagged observations and research-interest investigations.
 */
export async function listResearchOpportunities(req: Request, res: Response): Promise<void> {
<<<<<<< HEAD
  if (!(await enforcePublicRateLimit(req, res))) return;
=======
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' },
    });
    return;
  }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

  try {
    const siteCode = String(req.query.site ?? '').trim() || undefined;
    const opportunities = await geoscienceIntelligenceService.listResearchOpportunities({ siteCode });
    setPublicHeaders(res, 120);
    res.status(200).json({ count: opportunities.length, items: opportunities });
  } catch (err: unknown) {
<<<<<<< HEAD
    respondPublicError(res, err, 'Error listing research opportunities', 'Failed to retrieve research opportunities.');
=======
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Error listing research opportunities', { error: msg });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve research opportunities.' },
    });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }
}
