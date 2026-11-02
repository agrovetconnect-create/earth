import React, { useState, useRef, useEffect, useMemo } from 'react';
import { History, Menu, Search, X } from 'lucide-react';
import { SearchBar } from './SearchBar.js';
import {
  useRecentSearches,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
} from '../services/recentSearches.js';
import { closeMapFilter, onCloseMapSearch } from '../services/mapOverlayEvents.js';
import type {
  PublicObservationGeoJson,
  PublicDistrictCount,
  PublicCategoryCount,
} from '../types/public.js';
import { categoryLabel, type PublicSiteGeoJson } from '../types/community.js';

export type SearchSuggestionKind = 'observation' | 'site' | 'page' | 'recent';

export interface AutocompleteSuggestion {
  id: string;
  kind: SearchSuggestionKind;
  title: string;
  subtitle?: string;
  searchValue: string;
  passportId?: string;
  siteId?: string;
  pageId?: string;
  pagePanel?: string;
}

export interface SearchPage {
  id: string;
  label: string;
  subtitle?: string;
  panel?: string;
}

interface MapSearchOverlayProps {
  value: string;
  onSearch: (value: string) => void;
  /** Rendered inside the field at its right edge, behind a divider. */
  trailing?: React.ReactNode;
  /** Callback to open the navigation sidebar */
  onOpenSidebar?: () => void;
  /** Whether the sidebar open icon button should be shown (e.g. on mobile/tablet or when hidden) */
  showSidebarButton?: boolean;
  /** Live district dataset for autocomplete */
  districts?: PublicDistrictCount[];
  /** Live category dataset for autocomplete */
  categories?: PublicCategoryCount[];
  /** Published geological sites dataset for autocomplete */
  sites?: PublicSiteGeoJson | null;
  /** Observations currently on the map */
  observations?: PublicObservationGeoJson | null;
  /** Website destinations to include in search */
  pages?: SearchPage[];
  onSelectObservation?: (passportId: string) => void;
  onSelectSite?: (siteId: string) => void;
  onSelectPage?: (pageId: string, panel?: string) => void;
  /** Loading indicator state during fetch */
  loading?: boolean;
}

/**
 * Highlights the matched characters in the suggestion title.
 */
function highlightMatch(text: string, query: string) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return <span>{text}</span>;

  const index = text.toLowerCase().indexOf(trimmed);
  if (index === -1) return <span>{text}</span>;

  const before = text.slice(0, index);
  const match = text.slice(index, index + trimmed.length);
  const after = text.slice(index + trimmed.length);

  return (
    <span>
      {before}
      <span className="font-semibold text-[#0b57d0] bg-[#e8f0fe] rounded px-0.5">{match}</span>
      {after}
    </span>
  );
}

/**
 * The search field that sits on top of the map canvas, as it does in Google Maps.
 * Includes a sidebar toggle icon on phones and tablets, persistent recent searches,
 * and real-time autocomplete suggestions.
 */
export const MapSearchOverlay: React.FC<MapSearchOverlayProps> = ({
  value,
  onSearch,
  trailing,
  onOpenSidebar,
  showSidebarButton = true,
  sites = null,
  observations = null,
  pages = [],
  onSelectObservation,
  onSelectSite,
  onSelectPage,
  loading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const recentSearches = useRecentSearches();

  const openSearch = () => {
    setIsOpen(true);
    closeMapFilter();
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => onCloseMapSearch(() => setIsOpen(false)), []);

  const query = value.trim().toLowerCase();

  // Search everything the map and the website publish: observations, sites,
  // destinations and the reader's own recent searches. Results are one flat
  // list with no type headings, icons or counts.
  const { suggestions } = useMemo(() => {
    const matches = (...values: Array<string | null | undefined>) =>
      values.some((value) => (value ?? '').toLowerCase().includes(query));

    if (!query) {
      return {
        suggestions: recentSearches.slice(0, 8).map((item): AutocompleteSuggestion => ({
          id: `recent-${item}`,
          kind: 'recent' as const,
          title: item,
          searchValue: item,
        })),
      };
    }

    const observationSuggestions: AutocompleteSuggestion[] = (observations?.features ?? [])
      .filter((feature) => {
        const p = feature.properties;
        return matches(
          p.post_title,
          p.possible_name,
          p.primary_interpretation,
          p.passport_id,
          p.district,
          p.observation_category,
          p.observation_subcategory
        );
      })
      .slice(0, 6)
      .map((feature) => {
        const p = feature.properties;
        const subtitle = [p.district, categoryLabel(p.observation_category)]
          .filter(Boolean)
          .join(' · ');
        return {
          id: `observation-${p.passport_id}`,
          kind: 'observation' as const,
          title: p.post_title || p.possible_name || p.primary_interpretation || p.passport_id,
          subtitle,
          searchValue: p.post_title || p.possible_name || p.passport_id,
          passportId: p.passport_id,
        };
      });

    const siteSuggestions: AutocompleteSuggestion[] = (sites?.features ?? [])
      .filter((feature) => {
        const p = feature.properties;
        return matches(p.title, p.site_code, p.description, p.district);
      })
      .slice(0, 5)
      .map((feature) => {
        const p = feature.properties;
        return {
          id: `site-${p.site_id}`,
          kind: 'site' as const,
          title: p.title,
          subtitle: [p.district, 'Geological site'].filter(Boolean).join(' · '),
          searchValue: p.title,
          siteId: p.site_id,
        };
      });

    const pageSuggestions: AutocompleteSuggestion[] = pages
      .filter((page) => page.label.toLowerCase().includes(query))
      .slice(0, 6)
      .map((page) => ({
        id: `page-${page.id}-${page.panel ?? ''}`,
        kind: 'page' as const,
        title: page.label,
        subtitle: page.subtitle ?? 'Website page',
        searchValue: page.label,
        pageId: page.id,
        pagePanel: page.panel,
      }));

    const recentSuggestions: AutocompleteSuggestion[] = recentSearches
      .filter((item) => item.toLowerCase().includes(query) && item.toLowerCase() !== query)
      .slice(0, 4)
      .map((item) => ({
        id: `recent-${item}`,
        kind: 'recent' as const,
        title: item,
        searchValue: item,
      }));

    const ordered = [
      ...observationSuggestions,
      ...siteSuggestions,
      ...pageSuggestions,
      ...recentSuggestions,
    ].sort((a, b) => {
      const aStarts = a.title.toLowerCase().startsWith(query) ? 0 : 1;
      const bStarts = b.title.toLowerCase().startsWith(query) ? 0 : 1;
      return aStarts - bStarts;
    });

    return { suggestions: ordered };
  }, [query, observations, sites, pages, recentSearches]);

  // The flat list is also the keyboard-navigation list.
  const allFlattenedSuggestions = suggestions;

  // Reset keyboard index on query changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [query]);

  const handleSelect = (item: AutocompleteSuggestion) => {
    if (item.kind === 'observation' && item.passportId && onSelectObservation) {
      onSelectObservation(item.passportId);
    } else if (item.kind === 'site' && item.siteId && onSelectSite) {
      onSelectSite(item.siteId);
    } else if (item.kind === 'page' && item.pageId && onSelectPage) {
      onSelectPage(item.pageId, item.pagePanel);
    } else {
      onSearch(item.searchValue);
    }
    if (item.kind !== 'page') addRecentSearch(item.searchValue);
    setIsOpen(false);
  };

  const handleSubmit = (searchText: string) => {
    if (searchText.trim()) {
      addRecentSearch(searchText);
    }
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || allFlattenedSuggestions.length === 0) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % allFlattenedSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev <= 0 ? allFlattenedSuggestions.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < allFlattenedSuggestions.length) {
        e.preventDefault();
        handleSelect(allFlattenedSuggestions[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSelectedIndex(-1);
    }
  };

  const hasSuggestions = allFlattenedSuggestions.length > 0;

  return (
    <div className="absolute top-4 left-4 right-4 z-20 pointer-events-none">
      <div
        ref={containerRef}
        className="pointer-events-auto flex items-center gap-2 max-w-[500px] relative"
      >
        {onOpenSidebar && (
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Open sidebar"
            title="Open sidebar"
            className={`h-10 w-10 items-center justify-center rounded-full bg-white border border-[#dadce0] shadow-[var(--g-elev-2)] text-[#444746] hover:bg-[#f0f4f9] active:bg-[#e8f0fe] transition-colors shrink-0 cursor-pointer ${
              showSidebarButton ? 'flex' : 'flex lg:hidden'
            }`}
          >
            <Menu className="w-5 h-5 text-[#444746]" aria-hidden="true" />
          </button>
        )}

        <div className="flex-1 min-w-0 relative">
          <SearchBar
            value={value}
            onSearch={(text) => {
              onSearch(text);
              openSearch();
            }}
            onSubmit={handleSubmit}
            onFocus={openSearch}
            onKeyDown={handleKeyDown}
            placeholder="Search everything on the map and website"
            trailing={trailing}
            loading={loading}
          />

          {/* Autocomplete & Suggestions Dropdown */}
          {isOpen && (hasSuggestions || query) && (
            <div
              className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-[var(--g-elev-3)] border border-[#dadce0] overflow-hidden z-30 animate-in fade-in zoom-in-95 duration-100 max-h-[420px] overflow-y-auto g-scroll"
              role="listbox"
              aria-label="Search suggestions"
            >
              {query && !hasSuggestions && !loading && (
                <div className="px-3.5 py-4 text-center text-xs text-[#5f6368]">
                  No results found
                </div>
              )}

              {!query && recentSearches.length > 0 && (
                <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#f1f3f4] bg-[#f8fafd]">
                  <span className="text-[11px] font-semibold tracking-wider uppercase text-[#5f6368]">
                    Recent searches
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearRecentSearches();
                    }}
                    className="text-[11px] font-medium text-[#1a73e8] hover:text-[#174ea6] hover:underline cursor-pointer"
                  >
                    Clear all
                  </button>
                </div>
              )}

              {suggestions.length > 0 && (
                <ul className="py-1">
                  {suggestions.map((item) => {
                    const overallIdx = allFlattenedSuggestions.findIndex((s) => s.id === item.id);
                    const isHighlighted = selectedIndex === overallIdx;
                    return (
                      <li key={item.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelect(item)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSelect(item);
                            }
                          }}
                          className={`w-full flex items-center justify-between px-3.5 py-2 transition-colors cursor-pointer text-left ${
                            isHighlighted ? 'bg-[#e8f0fe]' : 'hover:bg-[#f0f4f9] active:bg-[#e8f0fe]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {item.kind === 'recent' ? (
                              <History
                                className="w-4 h-4 text-[#70757a] shrink-0"
                                aria-hidden="true"
                              />
                            ) : (
                              <Search
                                className="w-4 h-4 text-[#70757a] shrink-0"
                                aria-hidden="true"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-[13px] text-[#202124] truncate">
                                {highlightMatch(item.title, query)}
                              </div>
                              {item.subtitle && (
                                <div className="mt-0.5 text-[11px] leading-4 text-[#5f6368] truncate">
                                  {item.subtitle}
                                </div>
                              )}
                            </div>
                          </div>
                          {item.kind === 'recent' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeRecentSearch(item.searchValue);
                              }}
                              title={`Remove "${item.searchValue}" from history`}
                              aria-label={`Remove "${item.searchValue}" from history`}
                              className="p-1 ml-2 rounded-full text-[#70757a] hover:text-[#d93025] hover:bg-[#e1e3e1] transition-colors shrink-0"
                            >
                              <X className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};