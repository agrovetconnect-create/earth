import React, { useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.js';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    if (compact) {
      return (
        <button
          type="button"
          onClick={install}
          title="Install Earth Talk App"
          aria-label="Install Earth Talk App"
          className="g-icon-btn h-11 w-11 text-[#0b57d0]"
        >
          <Download className="h-5 w-5" aria-hidden="true" />
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={install}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#e8f0fe] text-[#0b57d0] hover:bg-[#d3e3fd] transition-colors text-xs font-semibold cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <Download className="w-4 h-4 text-[#0b57d0]" />
          <span>Install Earth Talk App</span>
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white font-mono">PWA</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        {compact ? (
          <button
            type="button"
            onClick={() => setShowIOSGuide(true)}
            title="Install on iOS Home Screen"
            aria-label="Install on iOS Home Screen"
            className="g-icon-btn h-11 w-11 text-[#0b57d0]"
          >
            <Download className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowIOSGuide(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-[#f0f4f9] text-[#1f1f1f] hover:bg-[#e8f0fe] transition-colors text-xs font-medium cursor-pointer"
          >
            <Smartphone className="w-4 h-4 text-[#0b57d0]" />
            <span>Install on iOS Home Screen</span>
          </button>
        )}

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-[#dadce0]">
              <h3 className="text-base font-semibold text-[#1f1f1f]">Install on iPhone / iPad</h3>
              <p className="mt-2 text-xs text-[#5e5e5e] leading-relaxed">
                1. Tap the <strong>Share</strong> button in your Safari toolbar.<br />
                2. Scroll down and select <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-xl bg-[#0b57d0] py-2 text-xs font-semibold text-white hover:bg-[#1b65e0] transition-colors cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
