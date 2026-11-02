import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
<<<<<<< HEAD
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
=======
  ArrowLeft,
  Lock,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { loginExpert } from '../services/expertApi.js';
import { requestCode, verifyCode } from '../services/communityAuth.js';
import type { ExpertUser } from '../types/expert.js';
import type { CommunityUser } from '../types/communityPosts.js';

/** How long a contributor waits before they can request another code. */
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
const RESEND_COOLDOWN_SECONDS = 30;

interface GeneralLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
<<<<<<< HEAD
  /** A user finished verifying: route to My Earth Talk. */
  onUserLogin: (user: CommunityUser) => void;
}

/**
 * Earth Talk Sign-In Modal: Google OAuth with Conditional Email Verification.
=======
  /** A WhatsApp contributor finished verifying: route to My Earth Talk. */
  onUserLogin: (user: CommunityUser) => void;
  /** The administrator signed in: route to Expert reviews. */
  onAdminLogin: (expert: ExpertUser) => void;
}

/**
 * One sign-in surface for both audiences.
 *
 * A contributor signs in with the WhatsApp phone number they used for Earth
 * Talk and a one-time code - there is no password. The administrator signs in
 * with the configured administrator email and password. The single credential
 * field decides which of the two it is by its shape, so there is one entry
 * point rather than two separate portals, and the destination is chosen by what
 * the backend returns: a contributor lands on My Earth Talk, the administrator
 * on Expert reviews. No account is invented here; both paths call the same
 * authenticated endpoints the platform already exposes.
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
 */
export const GeneralLoginModal: React.FC<GeneralLoginModalProps> = ({
  isOpen,
  onClose,
  onUserLogin,
<<<<<<< HEAD
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

=======
  onAdminLogin,
}) => {
  const [step, setStep] = useState<'credential' | 'code'>('credential');
  const [credential, setCredential] = useState('');
  const [passcode, setPasscode] = useState('');
  const [code, setCode] = useState('');
  const [delivery, setDelivery] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const credentialInputRef = useRef<HTMLInputElement>(null);

  // A fresh code can be requested again after a short cooldown, so a contributor
  // who never received the first message is not stuck waiting out its whole
  // lifetime. The countdown is purely the button's gate; the server still
  // enforces its own per-number rate limit.
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => {
      setResendIn((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

<<<<<<< HEAD
  useEffect(() => {
    if (isOpen && authMode === 'verify_challenge') {
      codeInputRef.current?.focus();
    }
  }, [isOpen, authMode]);
=======
  // Return the caret to the credential field whenever the first step is shown,
  // so going back to enter a different number is ready to type immediately.
  useEffect(() => {
    if (isOpen && step === 'credential') credentialInputRef.current?.focus();
  }, [isOpen, step]);

  const isEmail = credential.includes('@');
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

  if (!isOpen) return null;

  const reset = () => {
<<<<<<< HEAD
    setAuthMode('choose');
    setChallengeId('');
    setMaskedEmail('');
    setCode('');
    setError(null);
    setStatusMessage(null);
=======
    setStep('credential');
    setCredential('');
    setPasscode('');
    setCode('');
    setDelivery(null);
    setHint(null);
    setExpiresIn(null);
    setError(null);
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    setIsLoading(false);
    setResendIn(0);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

<<<<<<< HEAD
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
=======
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEmail) {
      const email = credential;
      if (!email.trim()) {
        setError('Please enter the administrator email address');
        return;
      }
      if (!passcode) {
        setError('Please enter the administrator password');
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const res = await loginExpert(email.trim(), passcode);
        onAdminLogin(res.expert);
        handleClose();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Sign-in failed');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const digits = credential.replace(/\D/g, '');
    if (!digits) {
      setError('Enter the phone number you used for Earth Talk.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await requestCode(credential.trim());
      setDelivery(result.delivery);
      setExpiresIn(result.expires_in_seconds);
      setHint(result.message);
      setStep('code');
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-in request failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = code.replace(/\D/g, '');
    if (!digits) {
      setError('Enter the code you received on WhatsApp.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const resolved = await verifyCode(credential.trim(), code.trim());
      onUserLogin(resolved.user);
      handleClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'The code could not be verified.');
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      setCode('');
    } finally {
      setIsLoading(false);
    }
  };

<<<<<<< HEAD
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
=======
  const handleResend = async () => {
    if (resendIn > 0 || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await requestCode(credential.trim());
      setDelivery(result.delivery);
      setExpiresIn(result.expires_in_seconds);
      setHint(result.message);
      setCode('');
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not resend the code.');
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    } finally {
      setIsLoading(false);
    }
  };

<<<<<<< HEAD
=======
  // Abandons the code step and clears everything tied to the number that was
  // tried, so the next attempt genuinely starts from a blank credential.
  const handleUseDifferentNumber = () => {
    setStep('credential');
    setCredential('');
    setPasscode('');
    setCode('');
    setDelivery(null);
    setHint(null);
    setExpiresIn(null);
    setResendIn(0);
    setError(null);
  };

>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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
<<<<<<< HEAD
              <h2 className="text-lg font-medium text-[#1f1f1f]">
                {authMode === 'verify_challenge' ? 'Verify your account' : 'Sign in to Earth Talk'}
              </h2>
              <p className="text-xs text-[#5e5e5e]">
                {authMode === 'verify_challenge'
                  ? 'Complete additional security verification to proceed.'
                  : 'Sign in to continue your geoscience journey.'}
=======
              <h2 className="text-lg font-medium text-[#1f1f1f]">Sign in with WhatsApp</h2>
              <p className="text-xs text-[#5e5e5e]">
                {step === 'code'
                  ? 'Enter the 6-digit code we sent you on WhatsApp'
                  : isEmail
                    ? 'Administrator portal sign-in'
                    : 'A 6-digit verification code will be sent to your WhatsApp'}
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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

<<<<<<< HEAD
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
=======
          {step === 'credential' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-credential" className="block text-xs font-medium text-[#3c4043] mb-1.5">
                  WhatsApp phone number
                </label>
                <div className="relative">
                  <input
                    id="login-credential"
                    ref={credentialInputRef}
                    type="text"
                    inputMode={isEmail ? 'email' : 'tel'}
                    placeholder="+250 7__ ___ ____ or you@example.org"
                    value={credential}
                    onChange={(e) => setCredential(e.target.value)}
                    autoComplete="username"
                    className="w-full h-11 px-3.5 pr-10 rounded-lg bg-white border border-[#c7c7c7] text-[#1f1f1f] placeholder-[#8f8f8f] text-sm focus:outline-none focus:border-[#0b57d0] focus:shadow-[inset_0_0_0_1px_#0b57d0]"
                  />
                  {isEmail ? (
                    <ShieldCheck className="w-4 h-4 text-[#8f8f8f] absolute right-3.5 top-3.5" />
                  ) : (
                    <Smartphone className="w-4 h-4 text-[#8f8f8f] absolute right-3.5 top-3.5" />
                  )}
                </div>
                {!isEmail && (
                  <p className="mt-1.5 text-[11px] text-[#5e5e5e]">
                    A six-digit code is sent to this WhatsApp number. Contributors need no password.
                  </p>
                )}
              </div>

              {isEmail && (
                <div>
                  <label htmlFor="login-passcode" className="block text-xs font-medium text-[#3c4043] mb-1.5">
                    Administrator password
                  </label>
                  <div className="relative">
                    <input
                      id="login-passcode"
                      type="password"
                      placeholder="••••••••••••"
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      autoComplete="current-password"
                      className="w-full h-11 px-3.5 pr-10 rounded-lg bg-white border border-[#c7c7c7] text-[#1f1f1f] placeholder-[#8f8f8f] text-sm focus:outline-none focus:border-[#0b57d0] focus:shadow-[inset_0_0_0_1px_#0b57d0]"
                    />
                    <Lock className="w-4 h-4 text-[#8f8f8f] absolute right-3.5 top-3.5" />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="g-btn g-btn-filled w-full disabled:opacity-50"
              >
                {isLoading ? (
                  <span>{isEmail ? 'Authenticating…' : 'Requesting code…'}</span>
                ) : isEmail ? (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Sign in</span>
                  </>
                ) : (
                  <>
                    <MessageCircle className="w-4 h-4" />
                    <span>Send me a code</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label htmlFor="login-code" className="block text-xs font-medium text-[#3c4043] mb-1.5">
                  Six-digit verification code
                </label>
                <input
                  id="login-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="••••••"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-lg bg-white border border-[#c7c7c7] text-center tracking-[0.5em] text-[#1f1f1f] placeholder-[#c7c7c7] text-lg font-medium focus:outline-none focus:border-[#0b57d0] focus:shadow-[inset_0_0_0_1px_#0b57d0]"
                />
                {delivery === 'development_console' && (
                  <p className="mt-1.5 text-[11px] text-[#5e5e5e]">
                    Development build: the code is printed in the server console, because no WhatsApp
                    provider is configured on this deployment.
                  </p>
                )}
                {hint && delivery !== 'development_console' && (
                  <p className="mt-1.5 text-[11px] text-[#5e5e5e]">{hint}</p>
                )}
                {expiresIn !== null && (
                  <p className="mt-1 text-[11px] text-[#5e5e5e]">
                    The code expires in {expiresIn} second{expiresIn === 1 ? '' : 's'}.
                  </p>
                )}
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
              </div>

              <button
                type="submit"
<<<<<<< HEAD
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
=======
                disabled={isLoading}
                className="g-btn g-btn-filled w-full disabled:opacity-50"
              >
                {isLoading ? (
                  <span>Verifying…</span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Sign in</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={isLoading || resendIn > 0}
                className="g-btn g-btn-tonal w-full disabled:opacity-50"
              >
                <MessageCircle className="w-4 h-4" />
                <span>
                  {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                </span>
              </button>

              <button
                type="button"
                className="g-btn g-btn-text w-full text-[13px]"
                onClick={handleUseDifferentNumber}
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Use a different number</span>
              </button>
            </form>
          )}
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
        </div>
      </div>
    </div>
  );
};
