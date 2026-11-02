import { Router } from 'express';
import {
  removeAvatarHandler,
  requestCodeHandler,
  sessionHandler,
  setAvatarHandler,
  signOutHandler,
  updateProfileHandler,
  verifyCodeHandler,
<<<<<<< HEAD
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
=======
} from '../controllers/auth.controller.js';
import { requireUser } from '../utils/user-auth.js';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

export const authRouter = Router();

/**
<<<<<<< HEAD
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
=======
 * WhatsApp verification login (Stage 12).
 *
 * Every response is content-free with respect to secrets: a code is delivered
 * only over WhatsApp (or the development console) and a session token is
 * returned exactly once, when the matching code is verified.
 */

authRouter.post('/api/auth/request-code', requestCodeHandler);
authRouter.post('/api/auth/verify-code', verifyCodeHandler);
authRouter.get('/api/auth/session', sessionHandler);
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
authRouter.post('/api/auth/sign-out', signOutHandler);
authRouter.patch('/api/auth/profile', requireUser, updateProfileHandler);
authRouter.post('/api/auth/avatar', requireUser, setAvatarHandler);
authRouter.delete('/api/auth/avatar', requireUser, removeAvatarHandler);
<<<<<<< HEAD
authRouter.post('/api/auth/restore-google-avatar', requireUser, restoreGoogleAvatarHandler);

// Account Linking
authRouter.post('/api/auth/link-whatsapp', requireUser, linkWhatsAppHandler);
authRouter.post('/api/auth/verify-link-whatsapp', requireUser, verifyLinkWhatsAppHandler);

=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
