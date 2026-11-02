<<<<<<< HEAD
import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { LOCALES, setPreference, usePreferences } from '../services/preferences.js';
import { useTranslator } from '../i18n.js';
=======
import React from 'react';
import { Check } from 'lucide-react';
import { LOCALES, setPreference, usePreferences } from '../services/preferences.js';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

interface LanguageCardProps {
  /** Called after a locale is chosen, so a popover can dismiss itself. */
  onSelect?: () => void;
}

/**
 * LANGUAGE.
 *
<<<<<<< HEAD
 * A compact card of locales that anchors to the footer's Language row or a
 * standalone page header. Choosing one switches the interface language
 * immediately - there is no separate screen to visit and nothing to confirm.
 * Record content is never translated: a contribution keeps the language its
 * author wrote it in.
 */
export const LanguageCard: React.FC<LanguageCardProps> = ({ onSelect }) => {
  const { locale } = usePreferences();
  const t = useTranslator();
=======
 * A compact card of locales that anchors to the footer's Language row. Choosing
 * one switches the language the sidebar chrome is shown in immediately - there
 * is no separate screen to visit and nothing to confirm. Record content is
 * never translated: a contribution keeps the language its author wrote it in.
 */
export const LanguageCard: React.FC<LanguageCardProps> = ({ onSelect }) => {
  const { locale } = usePreferences();
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

  return (
    <div
      role="menu"
<<<<<<< HEAD
      aria-label={t('Language')}
      className="w-60 rounded-xl border border-[#e3e3e3] bg-white p-1.5 shadow-[var(--g-elev-3)]"
=======
      aria-label="Language"
      className="w-56 rounded-xl border border-[#e3e3e3] bg-white p-1.5 shadow-[var(--g-elev-3)]"
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    >
      {LOCALES.map((option) => {
        const active = option.id === locale;
        return (
          <button
            key={option.id}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            onClick={() => {
              setPreference('locale', option.id);
              onSelect?.();
            }}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
              active ? 'bg-[#e8f0fe]' : 'hover:bg-[#f0f4f9]'
            }`}
          >
            <img
              src={option.flag}
              alt=""
              loading="lazy"
              className="h-5 w-auto shrink-0 rounded-[3px] ring-1 ring-black/10"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-[#1f1f1f]">{option.nativeLabel}</span>
              {option.nativeLabel !== option.label && (
                <span className="block truncate font-mono text-[11px] text-[#5e5e5e]">{option.label}</span>
              )}
            </span>
            {active && <Check className="h-4 w-4 shrink-0 text-[#0b57d0]" aria-hidden="true" />}
          </button>
        );
      })}
<<<<<<< HEAD

    </div>
  );
};

interface LanguagePickerButtonProps {
  align?: 'left' | 'right';
  className?: string;
}

/**
 * Compact header language trigger for standalone screens and dialogs where the
 * main navigation sidebar is not visible.
 */
export const LanguagePickerButton: React.FC<LanguagePickerButtonProps> = ({
  align = 'right',
  className = '',
}) => {
  const { locale } = usePreferences();
  const t = useTranslator();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeOption = LOCALES.find((item) => item.id === locale) ?? LOCALES[0];

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('Language')}: ${activeOption.nativeLabel}`}
        title={`${t('Language')}: ${activeOption.nativeLabel}`}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#dadce0] bg-white px-2.5 text-[12px] font-medium text-[#1f1f1f] transition-colors hover:bg-[#f8fafd] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b57d0] whitespace-nowrap shrink-0"
      >
        <img
          src={activeOption.flag}
          alt=""
          loading="lazy"
          className="h-3.5 w-auto shrink-0 rounded-[2px] ring-1 ring-black/10"
        />
        <span className="uppercase tracking-wide">{activeOption.id}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[#5e5e5e]" aria-hidden="true" />
      </button>
      {open && (
        <div
          className={`absolute top-full z-50 mt-1.5 ${
            align === 'left' ? 'left-0' : 'right-0'
          }`}
        >
          <LanguageCard onSelect={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
};

=======
    </div>
  );
};
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
