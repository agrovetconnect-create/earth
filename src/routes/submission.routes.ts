import { Router } from 'express';
import { submitPhotoObservationHandler } from '../controllers/submission.controller.js';
import { mobileChatHandler } from '../controllers/mobile-chat.controller.js';
import { attachViewer } from '../utils/user-auth.js';

export const submissionRouter = Router();

/**
 * Mobile & Cross-platform native photo submission endpoint (Stage 9).
 * Invokes the shared GeoAI intelligence pipeline, persists to canonical database,
 * and attaches to the authenticated contributor session if provided.
 */
submissionRouter.post('/api/observations/submit', attachViewer, submitPhotoObservationHandler);
submissionRouter.post('/api/submissions/photo', attachViewer, submitPhotoObservationHandler);

/**
 * Mobile standalone direct chat & GeoAI assistant endpoint.
 * Allows mobile app users to chat, submit photos, share location, and receive analysis
 * directly without requiring WhatsApp.
 */
submissionRouter.post('/api/mobile/chat', attachViewer, mobileChatHandler);

