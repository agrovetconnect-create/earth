import express, { type Request, type Response, type NextFunction } from 'express';
<<<<<<< HEAD
import http from 'node:http';
import path from 'path';
import fs from 'fs';
import crypto from 'node:crypto';
import { env, verifyInternalServiceKey } from './config/env.js';
import { supabase } from './config/supabase.js';
import { isDatabaseConfigured } from './utils/admin-auth.js';
=======
import path from 'path';
import fs from 'fs';
import crypto from 'node:crypto';
import { env } from './config/env.js';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
import { logger } from './utils/logger.js';
import { webhookRouter } from './routes/webhook.routes.js';
import { publicRouter } from './routes/public.routes.js';
import { expertRouter } from './routes/expert.routes.js';
import { researchRouter } from './routes/research.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { validationRouter } from './routes/validation.routes.js';
import { validationIsDurable } from './repositories/validation.repository.js';
import { communityRouter } from './routes/community.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { userRouter } from './routes/user.routes.js';
import { postsRouter } from './routes/posts.routes.js';
<<<<<<< HEAD
import { submissionRouter } from './routes/submission.routes.js';
import { staffRouter } from './routes/staff.routes.js';
import { appDistributionRouter } from './routes/app-distribution.routes.js';
import { observationService } from './services/observation.service.js';
import { webhookQueueService } from './services/webhook-queue.service.js';
import { csrfAndOriginProtection, parseCookieHeader } from './middleware/csrf.js';
import {
  startRateLimitCleanupTimer,
  stopRateLimitCleanupTimer,
} from './utils/rate-limiter.js';
=======
import { observationService } from './services/observation.service.js';
import { webhookQueueService } from './services/webhook-queue.service.js';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
import { registerDemoObservationRecords } from './data/demo-map-records.js';
import { registerDemoCommunityRecords } from './data/demo-community.registration.js';

/**
 * Demonstration posts (Stage 12) are served by the post card straight from
 * `demo-posts.ts`, but the map, the observation list and the GeoJSON layer read
 * the public repository. Registering them here keeps the two views agreeing
 * about what exists; the repository refuses them again on every read when
 * `DEMO_POSTS_ENABLED` is off, which is the default in production.
 */
const registeredDemoRecords = registerDemoObservationRecords();
if (env.DEMO_POSTS_ENABLED) {
  logger.info(`Registered ${registeredDemoRecords} labelled demonstration posts on the public map`);
}

/**
 * Demonstration community data (geological sites, investigations, questions,
 * evidence, visits) is registered up front so the site explorer and the
 * community discovery feed agree with the demo posts about what exists.
 */
const registeredDemoCommunity = registerDemoCommunityRecords();
if (env.DEMO_POSTS_ENABLED) {
  logger.info(`Registered ${registeredDemoCommunity} labelled demonstration community records`);
}

<<<<<<< HEAD
=======
// Initialize Express app
const app = express();

>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
/**
 * Product identity. Defined once so the name, the tagline and the current
 * stage cannot drift apart between `/health`, `/` and the startup log, which is
 * exactly how the server ended up reporting "Stage 7" while running Stage 10.
 */
const PLATFORM = {
  name: 'Earth Talk',
  tagline: 'Discover Earth. Together.',
  previousName: 'Rock Talk',
  /** Highest implemented stage. See README.md for the stage table. */
  stage: 13,
} as const;

<<<<<<< HEAD
const healthPayload = async () => {
  const dbConfigured = isDatabaseConfigured();
  let dbStatus = 'unconfigured';
  if (dbConfigured) {
    try {
      const { error } = await supabase.from('observations').select('id', { count: 'exact', head: true }).limit(1);
      dbStatus = error ? 'error' : 'connected';
    } catch {
      dbStatus = 'unreachable';
    }
  }

  return {
    project: PLATFORM.name,
    tagline: PLATFORM.tagline,
    status: 'online',
    stage: PLATFORM.stage,
    database: {
      configured: dbConfigured,
      status: dbStatus,
    },
    ai: {
      ready: Boolean(env.GEMINI_API_KEY && !env.GEMINI_API_KEY.includes('not_configured')),
      model: env.GEMINI_MODEL,
    },
    timestamp: new Date().toISOString(),
  };
};

const clientDist = path.resolve(process.cwd(), 'dist/client');

// Initialize Express app and shared HTTP server
const app = express();
const server = http.createServer(app);

// Trust first reverse proxy (Render / load balancers) so req.ip is correct
app.set('trust proxy', 1);
=======
const healthPayload = () => ({
  project: PLATFORM.name,
  tagline: PLATFORM.tagline,
  status: 'online',
  stage: PLATFORM.stage,
});
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

// Request ID and Request Logging Middleware (Section 17)
app.use((req: any, res: Response, next: NextFunction) => {
  const reqId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.requestId = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
});

// Production Security Headers (Section 28)
if (env.ENABLE_SECURITY_HEADERS) {
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
<<<<<<< HEAD
    if (env.IS_PRODUCTION) {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    }
=======
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    next();
  });
}

// Explicit CORS configuration (Section 29)
app.use((req: Request, res: Response, next: NextFunction) => {
<<<<<<< HEAD
  res.setHeader('Vary', 'Origin');
  const allowed = (env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-CSRF-Token, X-Staff-Token, X-Expert-Token, X-Contributor-Token, X-Client-Platform, X-Request-Id'
    );
=======
  const allowed = (env.CORS_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    // PATCH is required: the admin moderation routes (media visibility,
    // media moderation, observation publication) are all PATCH. Omitting it
    // made the browser preflight reject those calls before they were sent.
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Expert-Token, X-Request-Id');
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// Parse incoming JSON requests with safe body-size limit (Section 7)
<<<<<<< HEAD
=======
//
// The `verify` hook keeps the exact raw bytes of the request. Meta signs the
// raw body, so the webhook signature can only be checked against these bytes,
// never against a re-serialized object.
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
app.use(
  express.json({
    limit: '10mb',
    verify: (req: Request, _res: Response, buf: Buffer) => {
      (req as unknown as { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

<<<<<<< HEAD
// MapLibre Web Worker handler — ensures CSP-safe, non-module worker script is always served without syntax errors
app.get('/maplibre-gl-worker.mjs', (_req: Request, res: Response) => {
  const workerPath = path.resolve(process.cwd(), 'public/maplibre-gl-worker.mjs');
  if (fs.existsSync(workerPath)) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(workerPath);
    return;
  }
  res.status(404).end();
});

// Public static client bundle in production
=======
// Public static client bundle in production
const clientDist = path.resolve(process.cwd(), 'dist/client');
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
if (env.IS_PRODUCTION && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false }));
}

// Health Check endpoint
<<<<<<< HEAD
app.get('/health', async (_req: Request, res: Response) => {
  const payload = await healthPayload();
  const status = payload.database.status === 'error' || payload.database.status === 'unreachable' ? 503 : 200;
  res.status(status).json(payload);
});

// Root endpoint
app.get('/', async (req: Request, res: Response, next: NextFunction) => {
=======
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json(healthPayload());
});

// Root endpoint: returns JSON health status for API/curl clients, and passes browser requests to SPA
app.get('/', (req: Request, res: Response, next: NextFunction) => {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  const isBrowser = req.headers.accept?.includes('text/html');
  const isExplicitJson = req.headers.accept?.includes('application/json') || req.query.format === 'json';
  const isCurl = req.headers['user-agent']?.toLowerCase().includes('curl');

  if (isExplicitJson || (isCurl && !isBrowser)) {
<<<<<<< HEAD
    const payload = await healthPayload();
    res.status(200).json(payload);
=======
    res.status(200).json(healthPayload());
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    return;
  }

  const indexPath = path.resolve(process.cwd(), 'dist/client/index.html');
  if (env.IS_PRODUCTION && fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
    return;
  }

  next();
});

<<<<<<< HEAD
// Safe cookie parsing middleware preserving '=' padding and resisting malformed '%' sequences
app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as any).cookies = parseCookieHeader(req.headers.cookie);
  next();
});

// Origin/Referer enforcement & double-submit CSRF verification for cookie-authenticated mutations
app.use(csrfAndOriginProtection);

// Section 54: Optional internal authenticated test endpoint using INTERNAL_SERVICE_KEY
app.get('/internal/observations/:passportId', async (req: Request, res: Response) => {
  const internalKey = req.headers['x-internal-key'] || req.headers['x-admin-key'];
  if (!verifyInternalServiceKey(internalKey)) {
    res.status(401).json({ error: 'Unauthorized internal service key' });
=======
// Section 54: Optional internal authenticated test endpoint for development
app.get('/internal/observations/:passportId', async (req: Request, res: Response) => {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== env.SUPABASE_SECRET_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    return;
  }

  try {
    const observation = await observationService.getObservationByPassportId(req.params.passportId);
    if (!observation) {
      res.status(404).json({ error: 'Observation not found' });
      return;
    }

<<<<<<< HEAD
=======
    // Never expose secret database credentials or sensitive details
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    res.status(200).json(observation);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Database lookup error';
    logger.error('Error in internal observation lookup', { error: msg });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register Public Map & Observation API routes (Stage 4)
app.use(publicRouter);

// Register Expert Verification API routes (Stage 5)
app.use(expertRouter);

// Register Research Analytics & Dataset Export routes (Stage 6)
app.use(researchRouter);

// Register Compliance & Admin routes (Stage 6)
app.use(adminRouter);

// Register Field Validation & Evaluation routes (Stage 7)
app.use(validationRouter);

// Register Community Discovery & Geological Site routes (Stage 8)
app.use(communityRouter);

// Register WhatsApp verification login routes (Stage 12)
app.use(authRouter);
app.use(userRouter);

// Register community observation post, comment and media routes (Stage 12)
app.use(postsRouter);

<<<<<<< HEAD
// Register Staff & Control Center routes (Stage 13)
app.use(staffRouter);

// Register Mobile App Distribution routes
app.use(appDistributionRouter);

// Register mobile & cross-platform photo submission routes (Stage 9)
app.use(submissionRouter);

// Register Webhook routes (Stages 1-3)
app.use(webhookRouter);

// Vite middleware in development mode (initialized asynchronously so port 3000 binds immediately)
type ViteDevServerInstance = Awaited<ReturnType<(typeof import('vite'))['createServer']>>;
let resolvedVite: ViteDevServerInstance | null = null;

if (!env.IS_PRODUCTION) {
  let viteFailed = false;

  const disableHmr = process.env.DISABLE_HMR === 'true';
  const viteReady = import('vite')
    .then(({ createServer: createViteServer }) =>
      createViteServer({
        server: {
          middlewareMode: true,
          ws: disableHmr ? false : (server as any),
          ...(disableHmr ? { hmr: false } : {}),
        },
        appType: 'spa',
      })
    )
    .then((vite) => {
      resolvedVite = vite;
      return vite;
    })
    .catch((err: unknown) => {
      viteFailed = true;
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('Could not initialize Vite dev middleware; falling back to static files', { error: msg });
      return null;
    });

  const fallbackStatic = express.static(clientDist, { index: false });

  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (
      req.path === '/health' ||
      req.path.startsWith('/api') ||
      req.path.startsWith('/webhook') ||
      req.path.startsWith('/internal')
    ) {
      next();
      return;
    }

    const vite = resolvedVite ?? (viteFailed ? null : await viteReady);
    if (vite) {
      vite.middlewares(req, res, next);
      return;
    }

    if (fs.existsSync(clientDist)) {
      fallbackStatic(req, res, next);
      return;
    }

    next();
  });
=======
// Register Webhook routes (Stages 1-3)
app.use(webhookRouter);

// Vite middleware in development mode
if (!env.IS_PRODUCTION) {
  try {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('Could not initialize Vite dev middleware; falling back to static files', { error: msg });
    if (fs.existsSync(clientDist)) {
      app.use(express.static(clientDist, { index: false }));
    }
  }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
}

// SPA client routing fallback for HTML GET requests (excluding /api and /webhook)
app.get('*', (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/webhook') || req.path.startsWith('/internal')) {
    return next();
  }

  const indexPath = path.resolve(process.cwd(), 'dist/client/index.html');
  if (fs.existsSync(indexPath) && req.headers.accept?.includes('text/html')) {
    res.sendFile(indexPath);
    return;
  }

  next();
});

// 404 Catch-all for unknown routes
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Global unexpected error handler
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const errorMessage = err instanceof Error ? err.message : 'Unknown server error';
  logger.error('Unexpected server error', { error: errorMessage });
  res.status(500).json({
    error: 'Internal server error',
  });
});

// Start HTTP server on configured port
<<<<<<< HEAD
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    const fallbackPort = env.PORT === 3000 ? 3001 : 3000;
    logger.warn(`Port ${env.PORT} is already in use; falling back to port ${fallbackPort}`, { error: error.message });
    server.listen(fallbackPort, '0.0.0.0');
  }
});

server.listen(env.PORT, '0.0.0.0', () => {
=======
const server = app.listen(env.PORT, '0.0.0.0', () => {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  logger.info('Server started');
  logger.info(`${PLATFORM.name} Stage ${PLATFORM.stage} listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
  logger.info(`Gemini model configured: ${env.GEMINI_MODEL}`);
  logger.info(`Supabase URL configured: ${env.SUPABASE_URL}`);
  logger.info(`Health check endpoint: http://localhost:${env.PORT}/`);
  logger.info(`Public API endpoint: http://localhost:${env.PORT}/api/public/observations`);
  logger.info(`Expert API endpoint: http://localhost:${env.PORT}/api/expert/observations`);
  logger.info(`Research API endpoint: http://localhost:${env.PORT}/api/research/summary`);
  logger.info(`Validation API endpoint: http://localhost:${env.PORT}/api/research/validation/datasets`);
if (validationIsDurable) {
  logger.info(
    'Validation datasets, specimens, labels and evaluation runs are persisted to the database and survive restart.'
  );
} else {
  logger.warn(
    'Validation datasets, specimens, labels and evaluation runs are held in process memory and are NOT persisted. ' +
      'They are lost on restart. Migration 010 defines the durable schema, but no database is configured, so the in-memory repository is in use rather than the database-backed one. ' +
      'Do not enter a real validation reference set on this deployment.'
  );
}
  logger.info(`Community API endpoint: http://localhost:${env.PORT}/api/community/sites`);
  logger.info(`Webhook endpoint: http://localhost:${env.PORT}/webhook`);

  // Start draining the inbound-event queue. Jobs are persisted before Meta is
  // acknowledged, so a crash between the ack and the work no longer drops a
  // submission: the worker recovers it on the next start or tick. When a
  // database is configured the queue verifies the schema is reachable and logs
  // "Durable webhook queue enabled" only after that check passes; otherwise it
  // reports the exact blocker (or, with no database at all, warns that the
  // process-local queue is not durable).
<<<<<<< HEAD
  startRateLimitCleanupTimer();

=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  void webhookQueueService.start().catch((err: unknown) => {
    logger.error('Failed to start webhook queue worker', {
      error: err instanceof Error ? err.message : String(err),
    });
  });
});

// Last-resort safety net. Without these handlers an uncaught throw or a
// rejected promise that nothing awaits takes the whole process down with no
// log. We record the fault so it is diagnosable, and keep serving: the HTTP
// layer itself still has its own error handler, so a single bad request or a
// fire-and-forget rejection does not turn into an outage.
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

<<<<<<< HEAD
// Graceful shutdown: stop accepting new connections, drain in-flight webhook
// queue work, then exit cleanly.
let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}; shutting down`);
  stopRateLimitCleanupTimer();
  const forceExitTimer = setTimeout(() => {
    logger.warn('Forcing shutdown after timeout');
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  void (async () => {
    await webhookQueueService.drain(5_000);
    await resolvedVite?.close().catch(() => undefined);
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  })();
=======
// Graceful shutdown: stop accepting new connections, let in-flight requests
// finish, then exit. A hard timeout guarantees the process still goes down if a
// connection refuses to close.
const shutdown = (signal: string) => {
  logger.info(`Received ${signal}; shutting down`);
  webhookQueueService.stop();
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn('Forcing shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
export { server };
