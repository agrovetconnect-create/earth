import React from 'react';
import type { AppView } from '../navigation.js';

interface ViewNote {
  title: string;
  bullets: string[];
}

const VIEW_NOTES: Partial<Record<AppView, ViewNote>> = {
  'how-it-works': {
    title: 'The pipeline',
    bullets: [
      'A WhatsApp photo is downloaded over an authenticated connection and validated before analysis.',
      'Gemini returns a structured interpretation against a strict runtime schema.',
      'The record is persisted and a Geoscience Passport is returned to the sender.',
    ],
  },
  about: {
    title: 'Data honesty',
    bullets: [
      'No fabricated observations, users, experts, votes, visits, locations or metrics.',
      'Production repositories hold no seed data; they return empty results or an explicit unavailable.',
      'An unconfigured database yields an honest empty read, never a fake success.',
    ],
  },
};

interface ViewInfoPanelProps {
  view: AppView;
}

/** Context panel for the sidebar: what the open view means and what it cannot claim. */
export const ViewInfoPanel: React.FC<ViewInfoPanelProps> = ({ view }) => {
  const note = VIEW_NOTES[view];

  if (!note) return null;

  return (
    <section className="g-panel" aria-label="About this view">
      <h3 className="text-[13px] font-medium text-[#1f1f1f]">{note.title}</h3>
      <ul className="mt-2 space-y-2">
        {note.bullets.map((bullet) => (
          <li key={bullet} className="flex gap-2 text-[11px] leading-snug text-[#5e5e5e]">
            <span className="mt-[6px] w-1 h-1 rounded-full bg-[#0b57d0] shrink-0" aria-hidden="true" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
