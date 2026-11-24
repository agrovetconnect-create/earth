import React from 'react';
import { Info, MapPin, Menu, Search, X } from 'lucide-react';
import { GeologicalSiteCard } from './GeologicalSiteCard.js';
import type { ObservationFilters } from '../types/public.js';
import type { PublicObservationSummary } from '../types/public.js';

interface GeoscienceSitesViewProps {
  posts: PublicObservationSummary[];
  filters: ObservationFilters;
  onFiltersChange: (filters: ObservationFilters) => void;
  loading: boolean;
  isNarrow: boolean;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onSelectPost: (passportId: string) => void;
}

export const GeoscienceSitesView: React.FC<GeoscienceSitesViewProps> = ({
  posts,
  filters,
  onFiltersChange,
  loading,
  isNarrow,
  sidebarOpen,
  onOpenSidebar,
  onSelectPost,
}) => {
  const [showInfo, setShowInfo] = React.useState(false);

  const setSearch = (search: string) =>
    onFiltersChange({ ...filters, search: search || undefined });

  return (
    <div className="min-h-dvh bg-[#f0f4f9] text-[#1f1f1f] flex flex-col selection:bg-[#d3e3fd] selection:text-[#041e49]">
      <main className="mx-auto flex w-full max-w-6xl flex-1 px-4 py-8">
        <div className="w-full space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              {isNarrow && (
                <button
                  type="button"
                  onClick={onOpenSidebar}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dadce0] bg-white text-[#5e5e5e] shadow-2xs hover:bg-[#f8faff] hover:text-[#0b57d0] transition-colors"
                  title="Open sidebar"
                  aria-label="Open sidebar"
                >
                  <Menu className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
              <div className="min-w-0">
                <h1 className="truncate text-[22px] font-semibold text-[#1f1f1f] tracking-tight sm:text-[26px]">
                  Posts without a published location
                </h1>
                <p className="mt-0.5 hidden text-xs text-[#5e5e5e] sm:block sm:text-[13px]">
                  Published field posts that have no public map coordinate.
                </p>
              </div>
              <div className="relative shrink-0 sm:hidden">
                <button
                  type="button"
                  onClick={() => setShowInfo((open) => !open)}
                  className="flex h-10 w-10 items-center justify-center text-[#5e5e5e] transition-colors hover:text-[#0b57d0]"
                  title="About this view"
                  aria-label="About this view"
                  aria-expanded={showInfo}
                >
                  <Info className="h-5 w-5" aria-hidden="true" />
                </button>
                {showInfo && (
                  <div
                    role="note"
                    className="absolute right-0 top-full z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-[#dde3ea] bg-white p-3 text-xs shadow-[0_8px_24px_rgba(60,64,67,0.16)]"
                  >
                    <p className="font-medium text-[#1f1f1f]">Posts without a published location</p>
                    <p className="mt-1 text-[#5e5e5e]">
                      Published field posts that have no public map coordinate.
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:w-80 sm:flex-none">
                <Search
                  className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5e5e5e]"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={filters.search ?? ''}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search sites, districts or posts"
                  aria-label="Search sites, districts or posts"
                  className="h-11 w-full rounded-full border border-[#dadce0] bg-white pl-11 pr-10 text-sm text-[#1f1f1f] outline-none transition placeholder:text-[#80868b] focus:border-[#0b57d0] focus:ring-4 focus:ring-[#0b57d0]/10"
                />
                {filters.search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-[#5e5e5e] transition-colors hover:bg-[#e8eaed] hover:text-[#1f1f1f]"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              <span className="inline-flex shrink-0 items-center rounded-full bg-[#d3e3fd] px-3 py-1 text-xs font-medium text-[#041e49]">
                {posts.length} listed
              </span>
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-[#5e5e5e]">Loading published posts…</div>
          ) : posts.length === 0 ? (
            <section className="rounded-3xl border border-[#dde3ea] bg-white px-6 py-16 text-center shadow-[0_1px_2px_rgba(60,64,67,0.08)]">
              <MapPin className="mx-auto h-10 w-10 text-[#8f8f8f]" strokeWidth={1.5} aria-hidden="true" />
              <p className="mt-4 text-base font-medium text-[#1f1f1f]">
                No published post is missing a location
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-[#5e5e5e]">
                Every published post has a coordinate, so nothing is waiting to be placed on the map.
              </p>
            </section>
          ) : (
            <div
              className={`grid grid-cols-1 gap-6 items-stretch ${
                sidebarOpen ? 'lg:grid-cols-2' : 'lg:grid-cols-3'
              }`}
            >
              {posts.map((post) => (
                <GeologicalSiteCard
                  key={post.passport_id}
                  post={post}
                  onClick={() => onSelectPost(post.passport_id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
