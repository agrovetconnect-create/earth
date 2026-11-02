import React from 'react';
import { MapPinned } from 'lucide-react';
import {
  EVIDENCE_STATE_HEX,
  EVIDENCE_STATE_LABELS,
  NO_EVIDENCE_HEX,
  type EvidenceState,
  type PublicSiteGeoJson,
} from '../types/community.js';

interface SitesPanelProps {
  sites: PublicSiteGeoJson | null;
  selectedSiteId: string | null;
  onSelect: (siteId: string) => void;
  onShowOnMap: (siteId: string) => void;
}

/**
 * Published geological sites, listed in the sidebar.
 *
 * A site that has no authorised public coordinate is never listed here and is
 * never drawn on the map: it would have to be placed at a guessed position. The
 * absence is deliberate, not a loading failure.
 */
export const SitesPanel: React.FC<SitesPanelProps> = ({
  sites,
  selectedSiteId,
  onSelect,
  onShowOnMap,
}) => {
  const features = sites?.features ?? [];

  return (
<<<<<<< HEAD
    <section className="g-panel space-y-3" aria-label="Geological sites">
      <div className="flex items-center justify-between pb-2 border-b border-[#e3e3e3]">
        <div>
          <h3 className="text-sm font-semibold text-[#1f1f1f]">Published geological sites</h3>
          <p className="text-[11px] text-[#5e5e5e] mt-0.5">
            Verified study locations and outcrop clusters across Rwanda
          </p>
        </div>
        <span className="px-2.5 py-0.5 rounded-full bg-[#e8f0fe] text-[#0b57d0] text-xs font-mono font-medium">
          {features.length}
        </span>
      </div>

      {features.length === 0 ? (
        <div className="mx-auto max-w-[240px] py-7 text-center">
          <div className="relative mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[#e8f0fe]">
            <span className="absolute -right-1 top-1 h-3.5 w-3.5 rounded-full bg-[#fef7e0]" />
            <span className="absolute -left-1 bottom-2 h-2.5 w-2.5 rounded-full bg-[#e6f4ea]" />
            <MapPinned className="h-7 w-7 text-[#0b57d0]" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <div className="text-sm font-medium text-[#1f1f1f]">No sites found</div>
          <div className="mt-1 text-[11px] leading-relaxed text-[#5e5e5e]">
            No geological sites have been published yet in this area.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {features.map((feature) => {
            const p = feature.properties;
            const state: EvidenceState | null = p.highest_evidence_state;
            const badgeColor = state ? EVIDENCE_STATE_HEX[state] : NO_EVIDENCE_HEX;
            const label = state ? EVIDENCE_STATE_LABELS[state] : 'Nothing established';

            return (
              <div
                key={p.site_id}
                className={`group relative flex flex-col rounded-xl border transition-all duration-200 bg-white shadow-2xs hover:shadow-md hover:border-[#0b57d0]/40 overflow-hidden ${
                  selectedSiteId === p.site_id
                    ? 'border-[#0b57d0] ring-2 ring-[#0b57d0]/20 bg-[#f8fafd]'
                    : 'border-[#e3e3e3]'
                }`}
              >
                {/* Top color indicator bar */}
                <div
                  className="h-1.5 w-full shrink-0"
                  style={{ backgroundColor: badgeColor }}
                  aria-hidden="true"
                />

                <div className="p-3.5 flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="text-left min-w-0 flex-1"
                      onClick={() => onSelect(p.site_id)}
                    >
                      <h4 className="text-[14px] font-bold text-[#1f1f1f] group-hover:text-[#0b57d0] transition-colors leading-snug truncate">
                        {p.title}
                      </h4>
                      <p className="text-[11px] text-[#5e5e5e] flex items-center gap-1.5 mt-0.5 truncate font-mono">
                        <span className="bg-[#f0f4f9] px-1.5 py-0.5 rounded text-[#0b57d0] font-semibold">{p.site_code}</span>
                        <span>·</span>
                        <span>{p.district ? `${p.district} District` : 'Rwanda'}</span>
                      </p>
                    </button>

                    <button
                      type="button"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#f0f4f9] text-[#0b57d0] text-xs font-semibold hover:bg-[#d3e3fd] transition-colors shrink-0"
                      onClick={() => onShowOnMap(p.site_id)}
                      title="Locate site on map"
                    >
                      <MapPinned className="w-3.5 h-3.5" />
                      <span>Map</span>
                    </button>
                  </div>

                  {p.description && (
                    <p className="text-xs text-[#3c4043] line-clamp-2 leading-relaxed">
                      {p.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-[#f0f0f0] text-[11px]">
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium shadow-2xs"
                      style={{ backgroundColor: `${badgeColor}15`, color: badgeColor }}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: badgeColor }} />
                      {label}
                    </span>

                    <span className="text-[#5e5e5e] font-mono font-medium">
                      {p.observation_count} {p.observation_count === 1 ? 'observation' : 'observations'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
=======
    <section className="g-panel" aria-label="Geological sites">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[13px] font-medium text-[#1f1f1f]">Published sites</h3>
        <span className="text-[11px] text-[#5e5e5e] font-mono">{features.length}</span>
      </div>
      <p className="text-[10px] text-[#5e5e5e] mb-2">
        Colour shows evidence strength, not rock quality. Community agreement is not scientific confirmation.
      </p>

      {features.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#c7c7c7] bg-[#f8fafd] px-3 py-4 text-center text-[11px] text-[#5e5e5e]">
          No site has a public coordinate yet.
        </div>
      ) : (
        <ul className="-mx-4">
          {features.map((feature) => {
            const p = feature.properties;
            const state: EvidenceState | null = p.highest_evidence_state;
            return (
              <li key={p.site_id}>
                <div
                  className="g-list-row"
                  aria-selected={selectedSiteId === p.site_id}
                  role="group"
                >
                  <button
                    type="button"
                    className="flex items-start gap-2 min-w-0 flex-1 text-left"
                    onClick={() => onSelect(p.site_id)}
                  >
                    <span
                      className="mt-1 w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white"
                      style={{ background: state ? EVIDENCE_STATE_HEX[state] : NO_EVIDENCE_HEX }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-[#1f1f1f] truncate">
                        {p.title}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-[#5e5e5e] truncate">
                        <span className="font-mono">{p.site_code}</span> ·{' '}
                        {p.district ? `${p.district} District` : 'Rwanda'} ·{' '}
                        {p.location_precision.replace('_', ' ')}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="g-chip">
                          {state ? EVIDENCE_STATE_LABELS[state] : 'Nothing established'}
                        </span>
                        <span className="g-chip">
                          <MapPinned className="w-3 h-3" aria-hidden="true" />
                          {p.observation_count} obs
                        </span>
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="g-btn g-btn-text h-8 px-2 text-[11px] shrink-0"
                    onClick={() => onShowOnMap(p.site_id)}
                  >
                    Map
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      )}
    </section>
  );
};
