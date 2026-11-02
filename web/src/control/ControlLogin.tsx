import React, { useState } from 'react';
import { controlApi } from '../services/controlApi.js';
import { LogIn, ShieldCheck, ArrowLeft, AlertCircle } from 'lucide-react';

export const ControlLogin: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Staff email address is required.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await controlApi.login({ email: email.trim(), password });
      onLogin();
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[#f8fafd] px-4 py-8">
      <div className="w-full max-w-md bg-white border border-[#dadce0] shadow-sm rounded-2xl p-8">
        {/* Brand Lockup */}
        <div className="flex flex-col items-center text-center mb-7">
          <img
            src="/logo_withsubtitle.png"
            alt="Earth Talk"
            className="h-10 w-auto object-contain mb-3 select-none"
            onError={(e) => {
              // Fallback to icon or hidden if logo missing
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#e8f0fe] text-[#0b57d0] mb-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Control Center Portal</span>
          </div>
          <p className="text-sm text-[#5e5e5e]">
            Authorized staff and controller access
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs sm:text-sm">{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-[#444746] mb-1.5">
              Staff Email Address
            </label>
            <input
              type="email"
              required
              autoComplete="username"
              className="g-input w-full rounded-lg h-11 px-3.5 text-sm"
              placeholder="controller@earthtalk.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#444746] mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              className="g-input w-full rounded-lg h-11 px-3.5 text-sm"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="g-btn g-btn-filled w-full h-11 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] active:bg-[#062e6f] text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-60"
          >
            {loading ? (
              <span>Verifying credentials...</span>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Sign In to Control Center</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-7 pt-6 border-t border-[#e3e3e3] flex flex-col items-center gap-3">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0b57d0] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Earth Talk Public Map</span>
          </a>
          <p className="text-[11px] text-[#8f8f8f] text-center leading-relaxed">
            Restricted administrative system. All authentication attempts and operations are audited.
          </p>
        </div>
      </div>
    </div>
  );
};
