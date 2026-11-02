import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  loginWithGoogle,
  verifyGoogleChallenge,
  resendGoogleChallenge,
} from '../services/communityAuth.js';
import type { CommunityUser } from '../types/communityPosts.js';

/** Cooldown timer for resending verification codes. */
const RESEND_COOLDOWN_SECONDS = 30;

interface GeneralLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** A user finished verifying: route to My Earth Talk. */
  onUserLogin: (user: CommunityUser) => void;
}

/**
 * Earth Talk Sign-In Modal: Google OAuth with Conditional Email Verification.
 */
export const GeneralLoginModal: React.FC<GeneralLoginModalProps> = ({
  isOpen,
  onClose,
  onUserLogin,
}) => {
  const [authMode, setAuthMode] = useState<'choose' | 'verify_challenge'>('choose');
  const [challengeId, setChallengeId] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

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

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    setStatusMessage('Connecting to Google Identity...');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const redirectUrl = `${window.location.origin}/auth/callback`;
      if (supabaseUrl && supabaseUrl !== 'https://mock-project-id.supabase.co') {
        window.location.href = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}`;
        return;
      }

      // Execute Google authentication flow
      const res = await loginWithGoogle('contributor.earthtalk@gmail.com', 'Google Contributor', null);
      if (res.verification_required && res.challenge_id) {
        setAuthMode('verify_challenge');
        setChallengeId(res.challenge_id);
        setMaskedEmail(res.masked_email || 'your Google account email');
        setResendIn(RESEND_COOLDOWN_SECONDS);
        setStatusMessage('Verification code sent to your Google account email.');
      } else if (res.user) {
        setStatusMessage('Sign-in successful!');
        onUserLogin(res.user);
        handleClose();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google authentication failed');
    } finally {
      setIsLoading(false);
    }
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
      setStatusMessage('New verification code sent to your email.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not resend verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b0b0c]/60">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sign in to Earth Talk"
        className="relative w-full max-w-md bg-white border border-[#e3e3e3] rounded-xl shadow-[var(--g-elev-3)] overflow-hidden text-[#1f1f1f]"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#e3e3e3]">
          <div className="flex items-center space-x-3">
            <img
              src="/icon.png"
              alt="Earth Talk"
              className="h-10 w-10 shrink-0 rounded-xl object-contain select-none"
            />
            <div>
              <h2 className="text-lg font-medium text-[#1f1f1f]">
                {authMode === 'verify_challenge' ? 'Verify your account' : 'Sign in to Earth Talk'}
              </h2>
              <p className="text-xs text-[#5e5e5e]">
                {authMode === 'verify_challenge'
                  ? 'Complete additional security verification to proceed.'
                  : 'Sign in to continue your geoscience journey.'}
              </p>
            </div>
          </div>
          <button type="button" onClick={handleClose} aria-label="Close" className="g-icon-btn">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="flex items-start space-x-3 p-3.5 rounded-xl bg-[#ffdad8] border border-[#d32f28]/30 text-[#c5221f] text-sm">
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

          {/* MODE: CHOOSE (Primary Sign In Screen with ONLY Google Sign In) */}
          {authMode === 'choose' && (
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <p className="text-sm text-[#444746]">
                  Sign in using your Google account to contribute observations, track research, and access Earth Talk features.
                </p>
              </div>

              {/* ONLY Google Sign-In Button */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full flex items-center justify-center h-12 px-4 rounded-lg border border-[#747775] bg-white text-[#1f1f1f] font-medium text-sm hover:bg-[#f8f9fa] transition shadow-sm disabled:opacity-50"
              >
                <svg className="w-5 h-5 mr-3 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.19v3.15C3.17 21.31 7.23 24 12 24z"/>
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.19C.43 8.12 0 9.87 0 11.7s.43 3.58 1.19 5.12l4.09-3.15z"/>
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.23 0 3.17 2.69 1.19 6.58l4.09 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                </svg>
                Continue with Google
              </button>
            </div>
          )}

          {/* MODE: VERIFY CHALLENGE (Dedicated Verification Screen) */}
          {authMode === 'verify_challenge' && (
            <form onSubmit={handleVerifyChallenge} className="space-y-5">
              <div className="p-3.5 rounded-lg bg-[#f0f4f9] border border-[#d3e3fd] text-[#041e49]">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#0b57d0] mb-0.5">
                  Email Verification
                </p>
                <p className="text-sm font-medium">
                  Code sent to <span className="font-mono text-[#0b57d0]">{maskedEmail}</span>
                </p>
              </div>

              <div>
                <label htmlFor="verification-code" className="block text-xs font-medium text-[#3c4043] mb-1.5">
                  6-digit verification code
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
                <p className="mt-1.5 text-[11px] text-[#5e5e5e]">
                  Enter the 6-digit code received in your Google account email inbox.
                </p>
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

              <div className="pt-2 text-center border-t border-[#e3e3e3]">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('choose');
                    setCode('');
                    setError(null);
                    setStatusMessage(null);
                  }}
                  className="text-xs text-[#1a73e8] hover:underline"
                >
                  Sign in with a different Google account
                </button>
              </div>
            </form>
          )}

          <div className="pt-2 border-t border-[#e3e3e3] flex items-center justify-center space-x-2 text-[11px] text-[#707579]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#137333]" />
            <span>Protected sign-in with Google Identity</span>
          </div>
        </div>
      </div>
    </div>
  );
};
