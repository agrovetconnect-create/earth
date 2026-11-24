import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  fetchGoogleAuthConfig,
  refreshSession,
  verifyGoogleChallenge,
  resendGoogleChallenge,
  useCommunityUser,
} from '../services/communityAuth.js';
import type { CommunityUser } from '../types/communityPosts.js';
import { useDialogFocus } from '../hooks/useDialogFocus.js';

/** Cooldown timer for resending verification codes. */
const RESEND_COOLDOWN_SECONDS = 600;

export interface InitialGoogleChallenge {
  challengeId: string;
  maskedEmail: string;
  message?: string;
}

interface GeneralLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** A user finished verifying: route to My Earth Talk. */
  onUserLogin: (user: CommunityUser) => void;
  /** Opens directly into email OTP verification if ever requested by the server. */
  initialChallenge?: InitialGoogleChallenge | null;
}

function buildSupabaseGoogleAuthorizeUrl(supabaseUrl: string): string {
  const redirectUrl = `${window.location.origin}/auth/callback`;
  return `${supabaseUrl.replace(/\/$/, '')}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}`;
}

export const GeneralLoginModal: React.FC<GeneralLoginModalProps> = ({
  isOpen,
  onClose,
  onUserLogin,
  initialChallenge = null,
}) => {
  const [authMode, setAuthMode] = useState<'choose' | 'verify_challenge'>('choose');
  const [challengeId, setChallengeId] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [resolvedSupabaseUrl, setResolvedSupabaseUrl] = useState<string>(() => {
    const viteUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
    return viteUrl && viteUrl !== 'https://mock-project-id.supabase.co' ? viteUrl : '';
  });
  const communityUser = useCommunityUser();
  const codeInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogFocus<HTMLDivElement>(isOpen);

  const isInIframe = useMemo(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !communityUser) return;
    onUserLogin(communityUser);
  }, [isOpen, communityUser, onUserLogin]);

  useEffect(() => {
    if (!isOpen || resolvedSupabaseUrl) return;
    let cancelled = false;
    fetchGoogleAuthConfig()
      .then((cfg) => {
        if (!cancelled && cfg.supabase_url) {
          setResolvedSupabaseUrl(cfg.supabase_url.trim().replace(/\/$/, ''));
        }
      })
      .catch(() => {
        // Handled when user triggers Google login
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, resolvedSupabaseUrl]);

  useEffect(() => {
    if (!isOpen) return;
    const syncAuth = () => {
      void refreshSession().then((user) => {
        if (user) {
          onUserLogin(user);
        }
      });
    };

    const onWindowMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'ET_OAUTH_AUTH_SUCCESS') {
        syncAuth();
      }
    };
    window.addEventListener('message', onWindowMessage);

    let channel: BroadcastChannel | null = null;
    const onBroadcast = (event: MessageEvent) => {
      if (event.data?.type === 'et_auth_updated') {
        syncAuth();
      }
    };
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('earth-talk-auth');
      channel.addEventListener('message', onBroadcast);
    }

    return () => {
      window.removeEventListener('message', onWindowMessage);
      if (channel) {
        channel.removeEventListener('message', onBroadcast);
        channel.close();
      }
    };
  }, [isOpen, onUserLogin]);

  useEffect(() => {
    if (isOpen && initialChallenge) {
      setAuthMode('verify_challenge');
      setChallengeId(initialChallenge.challengeId);
      setMaskedEmail(initialChallenge.maskedEmail || 'your Google account email');
      setCode('');
      setError(null);
      setStatusMessage(initialChallenge.message || null);
      setResendIn(RESEND_COOLDOWN_SECONDS);
    }
  }, [isOpen, initialChallenge]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => {
      setResendIn((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  useEffect(() => {
    if (isOpen && authMode === 'verify_challenge') {
      codeInputRef.current?.focus();
    }
  }, [isOpen, authMode]);

  if (!isOpen) return null;

  const reset = () => {
    setAuthMode('choose');
    setChallengeId('');
    setMaskedEmail('');
    setCode('');
    setError(null);
    setStatusMessage(null);
    setIsLoading(false);
    setResendIn(0);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const oauthUrl = resolvedSupabaseUrl ? buildSupabaseGoogleAuthorizeUrl(resolvedSupabaseUrl) : '';

  const handleGoogleLogin = async () => {
    setError(null);
    let activeSupabaseUrl = resolvedSupabaseUrl;
    if (!activeSupabaseUrl) {
      setIsLoading(true);
      try {
        const cfg = await fetchGoogleAuthConfig();
        if (cfg.supabase_url) {
          activeSupabaseUrl = cfg.supabase_url.trim().replace(/\/$/, '');
          setResolvedSupabaseUrl(activeSupabaseUrl);
        }
      } catch {
        // Handled below
      } finally {
        setIsLoading(false);
      }
    }

    if (!activeSupabaseUrl || activeSupabaseUrl === 'https://mock-project-id.supabase.co') {
      setStatusMessage(null);
      setError('Google sign-in is not available on this site yet. Please try again later.');
      return;
    }

    const targetUrl = buildSupabaseGoogleAuthorizeUrl(activeSupabaseUrl);
    if (isInIframe) {
      const popup = window.open(targetUrl, 'earth_talk_google_auth', 'width=540,height=700');
      if (!popup) {
        setError('Please allow popups for this site to sign in with Google.');
        return;
      }
      setStatusMessage('Complete Google sign-in in the new window — this window will update automatically.');
      return;
    }

    setIsLoading(true);
    setStatusMessage('Redirecting to Google for secure sign-in...');
    window.location.href = targetUrl;
  };

  const handleVerifyChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit verification code received in your email.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatusMessage('Verifying code...');
    try {
      const session = await verifyGoogleChallenge(challengeId, code.trim());
      setStatusMessage('Verification successful!');
      onUserLogin(session.user);
      handleClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'The verification code could not be verified.');
      setCode('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendChallenge = async () => {
    if (resendIn > 0 || isLoading) return;
    setIsLoading(true);
    setError(null);
    setStatusMessage('Sending new verification code...');
    try {
      const res = await resendGoogleChallenge(challengeId);
      setChallengeId(res.challenge_id);
      setCode('');
      setResendIn(RESEND_COOLDOWN_SECONDS);
      setStatusMessage(res.message || 'New verification code sent to your email.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not resend verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  const googleButtonContent = (
    <>
      <svg className="w-5 h-5 mr-3 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.19v3.15C3.17 21.31 7.23 24 12 24z"/>
        <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.19C.43 8.12 0 9.87 0 11.7s.43 3.58 1.19 5.12l4.09-3.15z"/>
        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.23 0 3.17 2.69 1.19 6.58l4.09 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
      </svg>
      Continue with Google
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b0b0c]/60">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Sign in to Earth Talk"
        className="relative w-full max-w-md max-h-[90dvh] overflow-y-auto g-scroll bg-white border border-[#e3e3e3] rounded-xl shadow-[var(--g-elev-3)] text-[#1f1f1f]"
      >
        <div className="flex items-center justify-between gap-3 px-6 py-5 border-b border-[#e3e3e3]">
          <div className="flex items-center space-x-3 min-w-0">
            <img
              src="/icon.png"
              alt="Earth Talk"
              className="h-10 w-10 shrink-0 rounded-xl object-contain select-none"
            />
            <div className="min-w-0">
              <h2 className="text-lg font-medium text-[#1f1f1f]">
                {authMode === 'verify_challenge' ? 'Verify your account' : 'Sign in to Earth Talk'}
              </h2>
              {authMode === 'choose' && (
                <p className="text-xs text-[#5e5e5e]">
                  Use your Google account to continue securely.
                </p>
              )}
              {authMode === 'verify_challenge' && (
                <p className="text-xs text-[#5e5e5e]">
                  Enter the code sent to your email.
                </p>
              )}
            </div>
          </div>
          <button type="button" onClick={handleClose} aria-label="Close" className="g-icon-btn">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="flex items-start space-x-3 p-3.5 rounded-xl bg-[#fce8e6] text-[#c5221f] text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {statusMessage && !error && (
            <div className="flex items-center space-x-2.5 p-3 rounded-lg bg-[#e8f5e9] border border-[#2e7d32]/20 text-[#1b5e20] text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {authMode === 'choose' && (
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <p className="text-sm text-[#444746]">
                  Continue with your Google account to submit field observations, sync your private map, and join discussions.
                </p>
              </div>

              {isInIframe && oauthUrl ? (
                <a
                  href={oauthUrl}
                  target="_blank"
                  rel="opener"
                  onClick={() => {
                    setError(null);
                    setStatusMessage('Complete Google sign-in in the new tab — this window will update automatically.');
                  }}
                  className="w-full flex items-center justify-center h-12 px-4 rounded-lg border border-[#747775] bg-white text-[#1f1f1f] font-medium text-sm hover:bg-[#f8f9fa] transition shadow-sm"
                >
                  {googleButtonContent}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleGoogleLogin()}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center h-12 px-4 rounded-lg border border-[#747775] bg-white text-[#1f1f1f] font-medium text-sm hover:bg-[#f8f9fa] transition shadow-sm disabled:opacity-50"
                >
                  {googleButtonContent}
                </button>
              )}
            </div>
          )}

          {authMode === 'verify_challenge' && (
            <form onSubmit={handleVerifyChallenge} className="space-y-5">
              <div className="text-[#3c4043]">
                <p className="text-sm leading-relaxed">
                  Account saved. Code sent to{' '}
                  <span className="font-mono font-medium text-[#0b57d0]">{maskedEmail}</span>.
                  Enter it below. Use the same Google account for a new code.
                </p>
              </div>

              <div>
                <label htmlFor="verification-code" className="block text-xs font-medium text-[#3c4043] mb-1.5">
                  Verification code
                </label>
                <input
                  id="verification-code"
                  ref={codeInputRef}
                  type="text"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full h-12 px-3 text-center tracking-widest text-xl font-mono rounded-lg bg-white border border-[#c7c7c7] text-[#1f1f1f] focus:outline-none focus:border-[#0b57d0] focus:shadow-[inset_0_0_0_1px_#0b57d0]"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || code.length !== 6}
                className="g-btn g-btn-filled w-full h-11 text-sm font-medium disabled:opacity-50"
              >
                {isLoading ? 'Verifying code...' : 'Verify and sign in'}
              </button>

              <div className="flex items-center justify-between pt-1 text-xs">
                <span className="text-[#5e5e5e]">Didn't receive the code?</span>
                <button
                  type="button"
                  onClick={handleResendChallenge}
                  disabled={resendIn > 0 || isLoading}
                  className="text-[#1a73e8] font-medium disabled:opacity-40 hover:underline"
                >
                  {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}

          <div className="pt-2 border-t border-[#e3e3e3] flex items-center justify-center space-x-2 text-[11px] text-[#707579]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#137333]" />
            <span>Secure Google sign-in for Earth Talk</span>
          </div>
        </div>
      </div>
    </div>
  );
};
