import type { Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { 
  requestCode, 
  signOut, 
  updateProfile, 
  verifyCode, 
  requestEmailCode, 
  verifyEmailCode,
  linkWhatsApp,
  verifyLinkWhatsApp,
  syncGoogleOAuthUser,
  verifyGoogleChallenge,
  resendGoogleChallenge,
  restoreGoogleAvatar
} from '../services/auth.service.js';
import { profileService } from '../services/profile.service.js';
import {
  UserAvatarError,
  removeAvatar as removeAvatarService,
  setAvatar as setAvatarService,
} from '../services/user-avatar.service.js';
import {
  extractUserSessionToken,
  resolveUserFromToken,
  USER_SESSION_COOKIE_NAME,
  viewerFromUser,
} from '../utils/user-auth.js';
import type { AuthenticatedUserRequest } from '../utils/user-auth.js';
import { bodyOf, fail } from '../utils/http.js';
import { isServiceUnavailableError } from '../utils/service-error.js';
import { env } from '../config/env.js';

/**
 * Account session authentication.
 *
 * Browser sessions are delivered exclusively via HttpOnly SameSite=Lax cookies
 * (`et_user_session`). Native mobile SecureStore clients (`X-Client-Platform: mobile`)
 * receive the opaque bearer token once upon OTP verification.
 */

function setUserSessionCookie(res: Response, token: string): void {
  res.setHeader('Cache-Control', 'no-store');
  res.cookie(USER_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.IS_PRODUCTION,
    sameSite: 'lax',
    path: '/',
    maxAge: env.AUTH_SESSION_TTL_SECONDS * 1000,
  });
}

function clearUserSessionCookie(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.clearCookie(USER_SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: env.IS_PRODUCTION,
    sameSite: 'lax',
    path: '/',
  });
}

/**
 * Answers a database-outage failure as a 503 rather than a generic 500, so a
 * caller can tell "the store is down, try again" from "the request was bad".
 */
function answerUnavailable(res: Response, err: unknown): boolean {
  if (isServiceUnavailableError(err)) {
    fail(
      res,
      503,
      'DATABASE_UNAVAILABLE',
      'The service is temporarily unavailable because the database could not be reached. Please try again shortly.'
    );
    return true;
  }
  return false;
}

/**
 * POST /api/auth/request-code
 * Body: { phone: string }
 */
export async function requestCodeHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = bodyOf(req) as any;
    const phone = typeof body.phone === 'string' ? body.phone : '';
    const result = await requestCode(phone, req);

    if (!result.ok) {
      res.status(result.status).json({
        error: { code: result.code, message: result.error },
      });
      return;
    }

    res.status(200).json({
      delivery: result.delivery,
      message: result.message,
      expires_in_seconds: result.expiresInSeconds,
    });
  } catch (err) {
    logger.error('Verification code request failed', { error: String(err) });
    if (answerUnavailable(res, err)) return;
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'The sign-in request could not be processed.' },
    });
  }
}

/**
 * POST /api/auth/verify-code
 * Body: { phone: string, code: string }
 */
export async function verifyCodeHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = bodyOf(req);
    const phone = typeof body.phone === 'string' ? body.phone : '';
    const code = typeof body.code === 'string' ? body.code : '';
    const result = await verifyCode(phone, code, req);

    if (!result.ok) {
      res.status(result.status).json({
        error: { code: result.code, message: result.error },
      });
      return;
    }

    setUserSessionCookie(res, result.token);
    const isMobile = req.headers['x-client-platform'] === 'mobile';

    res.status(200).json({
      ok: true,
      authenticated: true,
      ...(isMobile ? { token: result.token } : {}),
      expires_at: result.expiresAt,
      user: result.user,
    });
  } catch (err) {
    logger.error('Verification failed', { error: String(err) });
    if (answerUnavailable(res, err)) return;
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'The code could not be verified.' },
    });
  }
}

/**
 * GET /api/auth/session
 *
 * Always answers 200 so the client can decide whether to show a sign-in form,
 * but only reports an identity it resolved from a stored session.
 */
export async function sessionHandler(req: Request, res: Response): Promise<void> {
  try {
    const token = extractUserSessionToken(req);
    const resolved = token ? await resolveUserFromToken(token) : null;
    const viewer = resolved ? await viewerFromUser(resolved.user) : null;
    res.setHeader('Cache-Control', 'private, no-store');

    res.status(200).json({
      authenticated: Boolean(resolved),
      user: viewer
        ? {
            public_user_id: viewer.publicUserId,
            display_name: viewer.displayName,
            email: viewer.email,
            is_whatsapp_linked: viewer.isWhatsAppLinked,
            is_demo: viewer.isDemo,
            display_name_updated_at: resolved?.user.display_name_updated_at ?? null,
          }
        : null,
    });
  } catch (err) {
    logger.error('Session lookup failed', { error: String(err) });
    if (answerUnavailable(res, err)) return;
    res.status(200).json({ authenticated: false, user: null });
  }
}

/**
 * POST /api/auth/sign-out
 */
export async function signOutHandler(req: Request, res: Response): Promise<void> {
  try {
    await signOut(extractUserSessionToken(req));
    clearUserSessionCookie(res);
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error('Sign-out failed', { error: String(err) });
    clearUserSessionCookie(res);
    if (answerUnavailable(res, err)) return;
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Sign-out failed.' },
    });
  }
}

/**
 * PATCH /api/auth/profile
 * Body: { display_name: string | null }
 */
export async function updateProfileHandler(
  req: AuthenticatedUserRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.viewer) {
      res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Sign in to change your profile.' },
      });
      return;
    }

    const body = bodyOf(req) as any;
    const raw = body.display_name;
    const displayName = raw === null ? null : typeof raw === 'string' ? raw : undefined;

    if (displayName === undefined) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'A display name or null is required.' },
      });
      return;
    }

    const result = await updateProfile(req.viewer, displayName);
    if (!result.ok) {
      res.status(result.status).json({
        error: { code: result.code, message: result.error },
      });
      return;
    }

    res.status(200).json({ user: result.user });
  } catch (err) {
    logger.error('Profile update failed', { error: String(err) });
    if (answerUnavailable(res, err)) return;
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'The profile could not be updated.' },
    });
  }
}

/**
 * POST /api/auth/avatar
 * Body: { content_base64: string, mime_type?: string }
 */
export async function setAvatarHandler(
  req: AuthenticatedUserRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.viewer) {
      res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Sign in to change your photo.' },
      });
      return;
    }

    const body = bodyOf(req);
    const result = await setAvatarService(req.viewer, {
      contentBase64: typeof body.content_base64 === 'string' ? body.content_base64 : '',
      mimeType: typeof body.mime_type === 'string' ? body.mime_type : null,
    });
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof UserAvatarError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    logger.error('Profile photo upload failed', { error: String(err) });
    if (answerUnavailable(res, err)) return;
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'The profile photo could not be saved.' },
    });
  }
}

/**
 * DELETE /api/auth/avatar
 */
export async function removeAvatarHandler(
  req: AuthenticatedUserRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.viewer) {
      res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Sign in to change your photo.' },
      });
      return;
    }
    await removeAvatarService(req.viewer);
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error('Profile photo removal failed', { error: String(err) });
    if (answerUnavailable(res, err)) return;
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'The profile photo could not be removed.' },
    });
  }
}

/**
 * POST /api/auth/request-email-code
 * Body: { email: string, purpose?: string }
 */
export async function requestEmailCodeHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = bodyOf(req);
    const email = typeof body.email === 'string' ? body.email : '';
    const purpose = typeof body.purpose === 'string' ? body.purpose : 'registration';
    
    const result = await requestEmailCode(email, purpose as any, req);

    if (!result.ok) {
      res.status(result.status || 400).json({
        error: { code: result.code, message: result.error },
      });
      return;
    }

    res.status(200).json(result);
  } catch (err) {
    logger.error('Email code request failed', { error: String(err) });
    if (answerUnavailable(res, err)) return;
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'The email verification request could not be processed.' },
    });
  }
}

/**
 * POST /api/auth/verify-email-code
 * Body: { email: string, code: string }
 */
export async function verifyEmailCodeHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = bodyOf(req);
    const email = typeof body.email === 'string' ? body.email : '';
    const code = typeof body.code === 'string' ? body.code : '';
    
    const result = await verifyEmailCode(email, code, req);

    if (!result.ok) {
      res.status(result.status || 400).json({
        error: { code: result.code, message: result.error },
      });
      return;
    }

    const { token, ...publicResult } = result;
    setUserSessionCookie(res, token);
    const isMobile = req.headers['x-client-platform'] === 'mobile';

    res.status(200).json({
      ...publicResult,
      authenticated: true,
      ...(isMobile ? { token } : {}),
      expires_at: result.expiresAt,
    });
  } catch (err) {
    logger.error('Email verification failed', { error: String(err) });
    if (answerUnavailable(res, err)) return;
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'The code could not be verified.' },
    });
  }
}

/**
 * POST /api/auth/link-whatsapp
 */
export async function linkWhatsAppHandler(req: AuthenticatedUserRequest, res: Response): Promise<void> {
  try {
    if (!req.viewer) {
      res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Sign in first.' } });
      return;
    }
    const body = bodyOf(req);
    const phone = typeof body.phone === 'string' ? body.phone : '';
    
    const result = await linkWhatsApp(req.viewer, phone, req);
    if (!result.ok) {
      res.status(result.status || 400).json({ error: { code: result.code, message: result.error } });
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    logger.error('WhatsApp link request failed', { error: String(err) });
    if (answerUnavailable(res, err)) return;
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to initiate linking.' } });
  }
}

/**
 * POST /api/auth/verify-link-whatsapp
 */
export async function verifyLinkWhatsAppHandler(req: AuthenticatedUserRequest, res: Response): Promise<void> {
  try {
    if (!req.viewer) {
      res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Sign in first.' } });
      return;
    }
    const body = bodyOf(req);
    const phone = typeof body.phone === 'string' ? body.phone : '';
    const code = typeof body.code === 'string' ? body.code : '';
    
    const result = await verifyLinkWhatsApp(req.viewer, phone, code);
    if (!result.ok) {
      res.status(result.status || 400).json({ error: { code: result.code, message: result.error } });
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    logger.error('WhatsApp link verification failed', { error: String(err) });
    if (answerUnavailable(res, err)) return;
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to verify linking.' } });
  }
}

/**
 * POST /api/auth/google-callback
 * Body: { email: string, displayName?: string, avatarUrl?: string }
 */
export async function googleAuthCallbackHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = bodyOf(req);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : null;
    const avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : null;

    if (!email || !email.endsWith('@gmail.com')) {
      res.status(400).json({
        error: { code: 'INVALID_EMAIL', message: 'Please sign in with a verified @gmail.com address.' },
      });
      return;
    }

    const result = await syncGoogleOAuthUser({ email, displayName, avatarUrl }, req);

    if (!result.ok) {
      res.status(result.status || 400).json({
        error: { code: result.code, message: result.error },
      });
      return;
    }

    if (result.verification_required) {
      res.status(200).json(result);
      return;
    }

    setUserSessionCookie(res, result.token);
    const isMobile = req.headers['x-client-platform'] === 'mobile';

    res.status(200).json({
      ok: true,
      authenticated: true,
      verification_required: false,
      ...(isMobile ? { token: result.token } : {}),
      expires_at: result.expiresAt,
      user: result.user,
    });
  } catch (err) {
    logger.error('Google OAuth callback failed', { error: String(err) });
    if (answerUnavailable(res, err)) return;
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Google authentication could not be completed.' },
    });
  }
}

/**
 * POST /api/auth/google/verify-challenge
 * Body: { challenge_id: string, code: string, displayName?: string, avatarUrl?: string }
 */
export async function verifyGoogleChallengeHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = bodyOf(req);
    const challengeId = typeof body.challenge_id === 'string' ? body.challenge_id : '';
    const code = typeof body.code === 'string' ? body.code : '';
    const displayName = typeof body.displayName === 'string' ? body.displayName : undefined;
    const avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl : undefined;

    const result = await verifyGoogleChallenge(challengeId, code, req, { displayName, avatarUrl });

    if (!result.ok) {
      res.status(result.status || 400).json({
        error: { code: result.code, message: result.error },
      });
      return;
    }

    setUserSessionCookie(res, result.token);
    const isMobile = req.headers['x-client-platform'] === 'mobile';

    res.status(200).json({
      ok: true,
      authenticated: true,
      verification_required: false,
      ...(isMobile ? { token: result.token } : {}),
      expires_at: result.expiresAt,
      user: result.user,
    });
  } catch (err) {
    logger.error('Google verification challenge failed', { error: String(err) });
    if (answerUnavailable(res, err)) return;
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'The verification code could not be verified.' },
    });
  }
}

/**
 * POST /api/auth/google/resend-challenge
 * Body: { challenge_id: string }
 */
export async function resendGoogleChallengeHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = bodyOf(req);
    const challengeId = typeof body.challenge_id === 'string' ? body.challenge_id : '';

    const result = await resendGoogleChallenge(challengeId, req);

    if (!result.ok) {
      res.status(result.status || 400).json({
        error: { code: result.code, message: result.error },
      });
      return;
    }

    res.status(200).json(result);
  } catch (err) {
    logger.error('Google resend challenge failed', { error: String(err) });
    if (answerUnavailable(res, err)) return;
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'The verification code could not be resent.' },
    });
  }
}

/**
 * GET /api/auth/profile
 */
export async function getProfileHandler(req: AuthenticatedUserRequest, res: Response): Promise<void> {
  try {
    if (!req.viewer) {
      res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to view your profile.' } });
      return;
    }

    const profile = await profileService.getProfile(req.viewer.userId);
    res.status(200).json({ profile });
  } catch (err) {
    logger.error('Fetch profile failed', { error: String(err) });
    if (answerUnavailable(res, err)) return;
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Could not load profile.' } });
  }
}

/**
 * POST /api/auth/restore-google-avatar
 */
export async function restoreGoogleAvatarHandler(req: AuthenticatedUserRequest, res: Response): Promise<void> {
  try {
    if (!req.viewer) {
      res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Sign in first.' } });
      return;
    }

    const result = await restoreGoogleAvatar(req.viewer);
    res.status(200).json(result);
  } catch (err) {
    logger.error('Restore Google avatar failed', { error: String(err) });
    if (answerUnavailable(res, err)) return;
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to restore Google profile image.' } });
  }
}
