import { Router } from 'express';
import {
  removeAvatarHandler,
  requestCodeHandler,
  sessionHandler,
  setAvatarHandler,
  signOutHandler,
  updateProfileHandler,
  verifyCodeHandler,
  requestEmailCodeHandler,
  verifyEmailCodeHandler,
  linkWhatsAppHandler,
  verifyLinkWhatsAppHandler,
  googleAuthCallbackHandler,
  verifyGoogleChallengeHandler,
  resendGoogleChallengeHandler,
  getProfileHandler,
  restoreGoogleAvatarHandler,
} from '../controllers/auth.controller.js';
import { requireUser } from '../utils/user-auth.js';
import { csrfTokenHandler } from '../middleware/csrf.js';

export const authRouter = Router();

/**
 * Account session & CSRF endpoints.
 */

authRouter.get('/api/auth/csrf', csrfTokenHandler);
authRouter.post('/api/auth/request-code', requestCodeHandler);
authRouter.post('/api/auth/verify-code', verifyCodeHandler);
authRouter.post('/api/auth/request-email-code', requestEmailCodeHandler);
authRouter.post('/api/auth/verify-email-code', verifyEmailCodeHandler);
authRouter.post('/api/auth/google-callback', googleAuthCallbackHandler);
authRouter.post('/api/auth/google/verify-challenge', verifyGoogleChallengeHandler);
authRouter.post('/api/auth/google/resend-challenge', resendGoogleChallengeHandler);
authRouter.get('/api/auth/session', sessionHandler);
authRouter.get('/api/auth/profile', requireUser, getProfileHandler);
authRouter.post('/api/auth/sign-out', signOutHandler);
authRouter.patch('/api/auth/profile', requireUser, updateProfileHandler);
authRouter.post('/api/auth/avatar', requireUser, setAvatarHandler);
authRouter.delete('/api/auth/avatar', requireUser, removeAvatarHandler);
authRouter.post('/api/auth/restore-google-avatar', requireUser, restoreGoogleAvatarHandler);

// Account Linking
authRouter.post('/api/auth/link-whatsapp', requireUser, linkWhatsAppHandler);
authRouter.post('/api/auth/verify-link-whatsapp', requireUser, verifyLinkWhatsAppHandler);

