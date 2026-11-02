import React from 'react';
import { X, MessageCircle } from 'lucide-react';
import { whatsAppUrl } from '../services/whatsapp.js';

interface WhatsAppCtaModalProps {
  isOpen: boolean;
  onClose: () => void;
  whatsappNumber?: string;
}

/**
 * Dedicated WhatsApp channel guide modal.
 *
 * Web photo & supporting media uploads are accessed directly from the Web UI
 * rather than through the WhatsApp action.
 */
export const WhatsAppCtaModal: React.FC<WhatsAppCtaModalProps> = ({
  isOpen,
  onClose,
  whatsappNumber,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0b0c]/60 p-4"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-[#e3e3e3] bg-white text-[#1f1f1f] shadow-[var(--g-elev-3)]">
        <div className="flex items-center justify-between border-b border-[#e3e3e3] px-6 py-5">
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="" referrerPolicy="no-referrer" className="h-10 w-10 rounded-xl object-contain" />
            <div>
              <h3 className="text-base font-medium">Start on WhatsApp</h3>
              <p className="text-xs text-[#5e5e5e]">Earth Talk WhatsApp Citizen Science Channel</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="g-icon-btn">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <p className="text-sm leading-relaxed text-[#3c4043]">
            Send a specimen or outcrop photograph to Earth Talk on WhatsApp to receive a preliminary
            GeoAI interpretation, share field location coordinates, and manage your Geoscience Passport
            from your phone.
          </p>

          <a
            href={whatsAppUrl(undefined, whatsappNumber)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#16a34a] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#15803d] whitespace-nowrap"
          >
            <MessageCircle className="w-4 h-4 shrink-0" />
            <span>Continue on WhatsApp</span>
          </a>
        </div>
      </div>
    </div>
  );
};

