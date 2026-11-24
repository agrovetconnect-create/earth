import { logger } from '../utils/logger.js';
import { signOut, updateProfile, linkWhatsApp, verifyLinkWhatsApp, syncGoogleOAuthUser, verifyGoogleChallenge, resendGoogleChallenge, restoreGoogleAvatar, TRUSTED_DEVICE_COOKIE_NAME, } from '../services/auth.service.js';
import { supabase } from '../config/supabase.js';
import { isSupabaseUrlConfigured } from '../config/database-config.js';
import { profileService } from '../services/profile.service.js';
import { UserAvatarError, removeAvatar as removeAvatarService, setAvatar as setAvatarService, } from '../services/user-avatar.service.js';
import { extractUserSessionToken, resolveUserFromToken, USER_SESSION_COOKIE_NAME, viewerFromUser, } from '../utils/user-auth.js';
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
function isHttpsRequest(req) {
    if (!req)
        return env.IS_PRODUCTION;
    if (req.secure)
        return true;
    const proto = String(req.headers?.['x-forwarded-proto'] ?? '').split(',')[0].trim().toLowerCase();
    return proto === 'https' || env.IS_PRODUCTION;
}
function setUserSessionCookie(res, token, req) {
    const isHttps = isHttpsRequest(req);
    res.setHeader('Cache-Control', 'no-store');
    res.cookie(USER_SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: isHttps,
        sameSite: isHttps ? 'none' : 'lax',
        path: '/',
        maxAge: env.AUTH_SESSION_TTL_SECONDS * 1000,
    });
}
function clearUserSessionCookie(res, req) {
    const isHttps = isHttpsRequest(req);
    res.setHeader('Cache-Control', 'no-store');
    res.clearCookie(USER_SESSION_COOKIE_NAME, {
        httpOnly: true,
        secure: isHttps,
        sameSite: isHttps ? 'none' : 'lax',
        path: '/',
    });
}
function setTrustedDeviceCookie(res, deviceToken, req) {
    if (!deviceToken)
        return;
    const isHttps = isHttpsRequest(req);
    res.cookie(TRUSTED_DEVICE_COOKIE_NAME, deviceToken, {
        httpOnly: true,
        secure: isHttps,
        sameSite: isHttps ? 'none' : 'lax',
        path: '/',
        maxAge: 365 * 24 * 60 * 60 * 1000,
    });
}
/**
 * Answers a database-outage failure as a 503 rather than a generic 500, so a
 * caller can tell "the store is down, try again" from "the request was bad".
 */
function answerUnavailable(res, err) {
    if (isServiceUnavailableError(err)) {
        fail(res, 503, 'DATABASE_UNAVAILABLE', "We're having trouble right now. Please try again shortly.");
        return true;
    }
    return false;
}
/**
 * GET /api/auth/config
 * Public non-secret configuration telling web & mobile clients which Supabase
 * project URL to use for Google OAuth sign-in.
 */
export async function authConfigHandler(_req, res) {
    const configured = isSupabaseUrlConfigured(env.SUPABASE_URL);
    const supabaseUrl = configured ? env.SUPABASE_URL.trim().replace(/\/$/, '') : null;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
        method: 'google_supabase',
        google_enabled: configured,
        supabase_url: supabaseUrl,
    });
}
/**
 * POST /api/auth/request-code (retired — Google via Supabase only)
 */
export async function requestCodeHandler(_req, res) {
    res.status(403).json({
        error: {
            code: 'GOOGLE_AUTH_ONLY',
            message: 'Sign in is only available using Google via Supabase.',
        },
    });
}
/**
 * POST /api/auth/verify-code (retired — Google via Supabase only)
 */
export async function verifyCodeHandler(_req, res) {
    res.status(403).json({
        error: {
            code: 'GOOGLE_AUTH_ONLY',
            message: 'Sign in is only available using Google via Supabase.',
        },
    });
}
/**
 * GET /api/auth/session
 *
 * Always answers 200 so the client can decide whether to show a sign-in form,
 * but only reports an identity it resolved from a stored session.
 */
export async function sessionHandler(req, res) {
    try {
        const token = extractUserSessionToken(req);
        const resolved = token ? await resolveUserFromToken(token) : null;
        const viewer = resolved ? await viewerFromUser(resolved.user) : null;
        const profile = resolved
            ? (await profileService.getProfile(resolved.user.id).catch(() => null)) ||
                (resolved.user.email
                    ? await profileService.getProfileByEmail(resolved.user.email).catch(() => null)
                    : null)
            : null;
        res.setHeader('Cache-Control', 'private, no-store');
        res.status(200).json({
            authenticated: Boolean(resolved),
            expires_at: resolved?.expiresAt ?? null,
            user: viewer
                ? {
                    public_user_id: viewer.publicUserId,
                    display_name: viewer.displayName,
                    email: viewer.email,
                    avatar_url: viewer.avatarUrl,
                    is_whatsapp_linked: viewer.isWhatsAppLinked,
                    is_demo: viewer.isDemo,
                    display_name_updated_at: resolved?.user.display_name_updated_at ?? null,
                    avatar_source: profile?.avatar_source ?? (viewer.avatarUrl ? 'google' : null),
                    google_display_name: profile?.google_display_name ?? null,
                    google_avatar_url: profile?.google_avatar_url ?? null,
                    is_google_authenticated: Boolean(resolved?.user.email),
                }
                : null,
        });
    }
    catch (err) {
        logger.error('Session lookup failed', { error: String(err) });
        if (answerUnavailable(res, err))
            return;
        res.status(200).json({ authenticated: false, user: null });
    }
}
/**
 * POST /api/auth/sign-out
 */
export async function signOutHandler(req, res) {
    try {
        await signOut(extractUserSessionToken(req));
        clearUserSessionCookie(res, req);
        res.status(200).json({ ok: true });
    }
    catch (err) {
        logger.error('Sign-out failed', { error: String(err) });
        clearUserSessionCookie(res, req);
        if (answerUnavailable(res, err))
            return;
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Sign-out failed.' },
        });
    }
}
/**
 * PATCH /api/auth/profile
 * Body: { display_name: string | null }
 */
export async function updateProfileHandler(req, res) {
    try {
        if (!req.viewer) {
            res.status(401).json({
                error: { code: 'AUTH_REQUIRED', message: 'Sign in to change your profile.' },
            });
            return;
        }
        const body = bodyOf(req);
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
    }
    catch (err) {
        logger.error('Profile update failed', { error: String(err) });
        if (answerUnavailable(res, err))
            return;
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'The profile could not be updated.' },
        });
    }
}
/**
 * POST /api/auth/avatar
 * Body: { content_base64: string, mime_type?: string }
 */
export async function setAvatarHandler(req, res) {
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
    }
    catch (err) {
        if (err instanceof UserAvatarError) {
            res.status(err.status).json({ error: { code: err.code, message: err.message } });
            return;
        }
        logger.error('Profile photo upload failed', { error: String(err) });
        if (answerUnavailable(res, err))
            return;
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'The profile photo could not be saved.' },
        });
    }
}
/**
 * DELETE /api/auth/avatar
 */
export async function removeAvatarHandler(req, res) {
    try {
        if (!req.viewer) {
            res.status(401).json({
                error: { code: 'AUTH_REQUIRED', message: 'Sign in to change your photo.' },
            });
            return;
        }
        await removeAvatarService(req.viewer);
        res.status(200).json({ ok: true });
    }
    catch (err) {
        logger.error('Profile photo removal failed', { error: String(err) });
        if (answerUnavailable(res, err))
            return;
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'The profile photo could not be removed.' },
        });
    }
}
/**
 * POST /api/auth/request-email-code (retired — Google via Supabase only)
 */
export async function requestEmailCodeHandler(_req, res) {
    res.status(403).json({
        error: {
            code: 'GOOGLE_AUTH_ONLY',
            message: 'Sign in is only available using Google via Supabase.',
        },
    });
}
/**
 * POST /api/auth/verify-email-code (retired — Google via Supabase only)
 */
export async function verifyEmailCodeHandler(_req, res) {
    res.status(403).json({
        error: {
            code: 'GOOGLE_AUTH_ONLY',
            message: 'Sign in is only available using Google via Supabase.',
        },
    });
}
/**
 * POST /api/auth/link-whatsapp
 */
export async function linkWhatsAppHandler(req, res) {
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
    }
    catch (err) {
        logger.error('WhatsApp link request failed', { error: String(err) });
        if (answerUnavailable(res, err))
            return;
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to initiate linking.' } });
    }
}
/**
 * POST /api/auth/verify-link-whatsapp
 */
export async function verifyLinkWhatsAppHandler(req, res) {
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
    }
    catch (err) {
        logger.error('WhatsApp link verification failed', { error: String(err) });
        if (answerUnavailable(res, err))
            return;
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to verify linking.' } });
    }
}
/**
 * POST /api/auth/google-callback
 * Body: { access_token?: string, code?: string, email?: string, displayName?: string, avatarUrl?: string }
 */
export async function googleAuthCallbackHandler(req, res) {
    try {
        const body = bodyOf(req);
        const bearerHeader = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
            ? req.headers.authorization.slice(7).trim()
            : '';
        const accessToken = typeof body.access_token === 'string' ? body.access_token.trim() : bearerHeader;
        const authCode = typeof body.code === 'string' ? body.code.trim() : '';
        let email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        let displayName = typeof body.displayName === 'string' ? body.displayName.trim() : null;
        let avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : null;
        let supabaseUserId;
        let verifiedBySupabaseOAuth = false;
        if (accessToken || authCode) {
            let sbUser = null;
            if (accessToken) {
                const { data, error } = await supabase.auth.getUser(accessToken);
                if (error || !data?.user?.email) {
                    logger.error('Supabase OAuth token verification failed', {
                        message: error?.message ?? 'No user email returned',
                        status: error?.status,
                    });
                    res.status(401).json({
                        error: { code: 'AUTH_REQUIRED', message: 'Google OAuth token could not be verified with Supabase.' },
                    });
                    return;
                }
                sbUser = data.user;
            }
            else if (authCode) {
                const { data, error } = await supabase.auth.exchangeCodeForSession(authCode);
                if (error || !data?.user?.email) {
                    logger.error('Supabase OAuth code exchange failed', {
                        message: error?.message ?? 'No user email returned',
                        status: error?.status,
                    });
                    res.status(401).json({
                        error: { code: 'AUTH_REQUIRED', message: 'Google OAuth code could not be verified with Supabase.' },
                    });
                    return;
                }
                sbUser = data.user;
            }
            if (sbUser) {
                const appMeta = sbUser.app_metadata || {};
                const providers = Array.isArray(appMeta.providers) ? appMeta.providers : [];
                const identities = Array.isArray(sbUser.identities) ? sbUser.identities : [];
                const hasProviderMetadata = Boolean(appMeta.provider) || providers.length > 0 || identities.length > 0;
                const isGoogleProvider = appMeta.provider === 'google' ||
                    providers.includes('google') ||
                    identities.some((id) => id?.provider === 'google');
                if (!hasProviderMetadata || !isGoogleProvider) {
                    res.status(403).json({
                        error: {
                            code: 'GOOGLE_AUTH_ONLY',
                            message: 'Sign in is only available using Google via Supabase.',
                        },
                    });
                    return;
                }
                verifiedBySupabaseOAuth = true;
                supabaseUserId = sbUser.id;
                email = String(sbUser.email).trim().toLowerCase();
                const meta = sbUser.user_metadata || {};
                displayName = (typeof meta.full_name === 'string' && meta.full_name.trim())
                    || (typeof meta.name === 'string' && meta.name.trim())
                    || displayName;
                avatarUrl = (typeof meta.avatar_url === 'string' && meta.avatar_url.trim())
                    || (typeof meta.picture === 'string' && meta.picture.trim())
                    || avatarUrl;
            }
        }
        else {
            res.status(401).json({
                error: { code: 'AUTH_REQUIRED', message: 'A verified Supabase Google OAuth session is required.' },
            });
            return;
        }
        if (!email || (!verifiedBySupabaseOAuth && !email.endsWith('@gmail.com'))) {
            res.status(400).json({
                error: { code: 'INVALID_EMAIL', message: 'Please sign in with a verified Google account.' },
            });
            return;
        }
        const result = await syncGoogleOAuthUser({ id: supabaseUserId, email, displayName, avatarUrl, verifiedBySupabaseOAuth }, req);
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
        setUserSessionCookie(res, result.token, req);
        setTrustedDeviceCookie(res, result.deviceToken, req);
        const isMobile = req.headers['x-client-platform'] === 'mobile';
        res.status(200).json({
            ok: true,
            authenticated: true,
            verification_required: false,
            ...(isMobile ? { token: result.token, device_token: result.deviceToken } : {}),
            expires_at: result.expiresAt,
            user: result.user,
        });
    }
    catch (err) {
        logger.error('Google OAuth callback failed', { error: String(err) });
        if (answerUnavailable(res, err))
            return;
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Google authentication could not be completed.' },
        });
    }
}
/**
 * POST /api/auth/google/verify-challenge
 * Body: { challenge_id: string, code: string, displayName?: string, avatarUrl?: string }
 */
export async function verifyGoogleChallengeHandler(req, res) {
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
        setUserSessionCookie(res, result.token, req);
        setTrustedDeviceCookie(res, result.deviceToken, req);
        const isMobile = req.headers['x-client-platform'] === 'mobile';
        res.status(200).json({
            ok: true,
            authenticated: true,
            verification_required: false,
            ...(isMobile ? { token: result.token, device_token: result.deviceToken } : {}),
            expires_at: result.expiresAt,
            user: result.user,
        });
    }
    catch (err) {
        logger.error('Google verification challenge failed', { error: String(err) });
        if (isServiceUnavailableError(err)) {
            fail(res, 503, 'VERIFICATION_UNAVAILABLE', 'Verification is temporarily unavailable. Wait a moment and try the code again, or request a new code.');
            return;
        }
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'The verification code could not be verified.' },
        });
    }
}
/**
 * POST /api/auth/google/resend-challenge
 * Body: { challenge_id: string }
 */
export async function resendGoogleChallengeHandler(req, res) {
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
    }
    catch (err) {
        logger.error('Google resend challenge failed', { error: String(err) });
        if (answerUnavailable(res, err))
            return;
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'The verification code could not be resent.' },
        });
    }
}
/**
 * GET /api/auth/profile
 */
export async function getProfileHandler(req, res) {
    try {
        if (!req.viewer) {
            res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to view your profile.' } });
            return;
        }
        const profile = (await profileService.getProfile(req.viewer.userId)) ||
            (req.viewer.email ? await profileService.getProfileByEmail(req.viewer.email) : null);
        res.status(200).json({ profile });
    }
    catch (err) {
        logger.error('Fetch profile failed', { error: String(err) });
        if (answerUnavailable(res, err))
            return;
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Could not load profile.' } });
    }
}
/**
 * POST /api/auth/restore-google-avatar
 */
export async function restoreGoogleAvatarHandler(req, res) {
    try {
        if (!req.viewer) {
            res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Sign in first.' } });
            return;
        }
        const result = await restoreGoogleAvatar(req.viewer);
        res.status(200).json(result);
    }
    catch (err) {
        logger.error('Restore Google avatar failed', { error: String(err) });
        if (answerUnavailable(res, err))
            return;
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to restore Google profile image.' } });
    }
}
