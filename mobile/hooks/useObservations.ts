import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  fetchCategories,
  fetchCommunityQuestions,
  fetchDistricts,
  fetchInvestigations,
  fetchNearbyObservations,
  fetchObservation,
  fetchObservationComments,
  fetchObservationMapData,
  fetchObservations,
  fetchPostDetail,
  fetchPublicStats,
  fetchResearchOpportunities,
  fetchSimilarObservations,
  fetchSiteDetail,
  fetchSiteExplorer,
  fetchSites,
  fetchSitesGeoJson,
  fetchSiteVisits,
  fetchUnlocatedObservations,
} from '../services/api.ts';
import { getStoredContributorToken } from '../services/contributorToken.ts';
import {
  cacheCategories,
  cacheDistricts,
  cacheObservationDetail,
  cacheObservationsGeoJson,
  cacheObservationSummaries,
  cachePostDetail,
  cacheSitesGeoJson,
  getCachedCategories,
  getCachedDistricts,
  getCachedObservationDetail,
  getCachedObservationsGeoJson,
  getCachedObservationSummaries,
  getCachedPostDetail,
  getCachedSitesGeoJson,
  withOfflineFallback,
} from '../services/offlineCache.ts';
import type { ObservationFilters } from '../types/api.ts';
import { nextObservationPage } from '../utils/observationNavigation.ts';

function hasActiveFilters(filters: ObservationFilters): boolean {
  return Boolean(
    filters.search ||
      filters.category ||
      filters.classification ||
      filters.evidence_state ||
      filters.confidence ||
      filters.verification ||
      filters.district ||
      filters.bbox
  );
}

export function useObservations(filters: ObservationFilters = {}) {
  const normalized = {
    search: filters.search?.trim() || '',
    category: filters.category || '',
    classification: filters.classification || '',
    evidence_state: filters.evidence_state || '',
    confidence: filters.confidence || '',
    verification: filters.verification || '',
    district: filters.district || '',
    bbox: filters.bbox || '',
  };
  return useInfiniteQuery({
    queryKey: ['observations', normalized],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      withOfflineFallback(
        () => fetchObservations(pageParam, 20, signal, normalized),
        (res) => cacheObservationSummaries(res.data),
        () => getCachedObservationSummaries(normalized, pageParam, 20)
      ),
    getNextPageParam: (last) => nextObservationPage(last.pagination.page, last.pagination.totalPages),
  });
}
export function useRecentObservations() {
  return useQuery({
    queryKey: ['observations', 'recent'],
    queryFn: ({ signal }) =>
      withOfflineFallback(
        () => fetchObservations(1, 5, signal),
        (res) => cacheObservationSummaries(res.data),
        () => getCachedObservationSummaries({}, 1, 5)
      ),
  });
}
export function useObservation(id: string) {
  return useQuery({
    queryKey: ['observation', id],
    queryFn: ({ signal }) =>
      withOfflineFallback(
        () => fetchObservation(id, signal),
        (res) => cacheObservationDetail(res),
        () => getCachedObservationDetail(id)
      ),
    enabled: Boolean(id),
  });
}
export function usePostDetail(id: string, token?: string | null, contributorToken?: string | null) {
  return useQuery({
    queryKey: ['post-detail', id, token ?? 'guest', contributorToken ?? 'auto'],
    queryFn: async ({ signal }) => {
      const resolvedContrib =
        contributorToken !== undefined
          ? contributorToken
          : await getStoredContributorToken().catch(() => null);
      return withOfflineFallback(
        () => fetchPostDetail(id, token, signal, resolvedContrib),
        (res) => cachePostDetail(res),
        () => getCachedPostDetail(id)
      );
    },
    enabled: Boolean(id),
  });
}
export function useNearbyObservations(passportId: string, enabled = true) {
  return useQuery({
    queryKey: ['observations', 'nearby', passportId],
    queryFn: ({ signal }) => fetchNearbyObservations(passportId, signal),
    enabled: Boolean(passportId) && enabled,
  });
}
export function useSimilarObservations(passportId: string, enabled = true) {
  return useQuery({
    queryKey: ['observations', 'similar', passportId],
    queryFn: ({ signal }) => fetchSimilarObservations(passportId, signal),
    enabled: Boolean(passportId) && enabled,
  });
}
export function useSites(district?: string) {
  return useQuery({
    queryKey: ['community', 'sites', district ?? ''],
    queryFn: ({ signal }) => fetchSites(signal, district),
  });
}
export function useSitesGeoJson(district?: string, enabled = true) {
  return useQuery({
    queryKey: ['community', 'sites-geojson', district ?? ''],
    queryFn: ({ signal }) =>
      withOfflineFallback(
        () => fetchSitesGeoJson(signal, district),
        (res) => cacheSitesGeoJson(res, district),
        () => getCachedSitesGeoJson(district)
      ),
    enabled,
  });
}
export function useSiteDetail(siteId: string) {
  return useQuery({ queryKey: ['community', 'site', siteId], queryFn: ({ signal }) => fetchSiteDetail(siteId, signal), enabled: Boolean(siteId) });
}
export function useSiteExplorer(siteId: string) {
  return useQuery({
    queryKey: ['community', 'site-explorer', siteId],
    queryFn: ({ signal }) => fetchSiteExplorer(siteId, signal),
    enabled: Boolean(siteId),
  });
}
export function useInvestigations(contributorToken?: string | null) {
  return useQuery({
    queryKey: ['community', 'investigations', contributorToken ? 'identified' : 'guest'],
    queryFn: ({ signal }) => fetchInvestigations(signal, contributorToken),
  });
}
export function useCommunityQuestions(siteId?: string) {
  return useQuery({
    queryKey: ['community', 'questions', siteId ?? 'all'],
    queryFn: ({ signal }) => fetchCommunityQuestions({ siteId }, signal),
  });
}
export function useSiteVisits(siteId: string) {
  return useQuery({ queryKey: ['community', 'visits', siteId], queryFn: ({ signal }) => fetchSiteVisits(siteId, signal), enabled: Boolean(siteId) });
}
export function useObservationComments(passportId: string) {
  return useQuery({ queryKey: ['observation-comments', passportId], queryFn: ({ signal }) => fetchObservationComments(passportId, signal), enabled: Boolean(passportId) });
}
export function useCategories() {
  return useQuery({
    queryKey: ['observations', 'categories'],
    queryFn: ({ signal }) =>
      withOfflineFallback(
        () => fetchCategories(signal),
        (res) => cacheCategories(res),
        () => getCachedCategories()
      ),
    staleTime: 5 * 60 * 1000,
  });
}
export function useDistricts() {
  return useQuery({
    queryKey: ['observations', 'districts'],
    queryFn: ({ signal }) =>
      withOfflineFallback(
        () => fetchDistricts(signal),
        (res) => cacheDistricts(res),
        () => getCachedDistricts()
      ),
    staleTime: 5 * 60 * 1000,
  });
}
export function usePublicStats() {
  return useQuery({ queryKey: ['observations', 'stats'], queryFn: ({ signal }) => fetchPublicStats(signal) });
}
export function useUnlocatedObservations(filters: ObservationFilters = {}, enabled = true) {
  const normalized = {
    search: filters.search?.trim() || '',
    category: filters.category || '',
    classification: filters.classification || '',
    evidence_state: filters.evidence_state || '',
    confidence: filters.confidence || '',
    verification: filters.verification || '',
    district: filters.district || '',
  };
  return useInfiniteQuery({
    queryKey: ['observations', 'unlocated', normalized],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => fetchUnlocatedObservations(pageParam, 20, signal, normalized),
    getNextPageParam: (last) => nextObservationPage(last.pagination.page, last.pagination.totalPages),
    enabled,
  });
}
export function useResearchOpportunities(siteCode?: string) {
  return useQuery({
    queryKey: ['observations', 'research-opportunities', siteCode ?? 'all'],
    queryFn: ({ signal }) => fetchResearchOpportunities(signal, siteCode),
  });
}
export function useMapData(filters: ObservationFilters = {}, enabled = true) {
  const normalized = {
    search: filters.search?.trim() || '',
    category: filters.category || '',
    classification: filters.classification || '',
    evidence_state: filters.evidence_state || '',
    confidence: filters.confidence || '',
    verification: filters.verification || '',
    district: filters.district || '',
    bbox: filters.bbox || '',
  };
  const isUnfiltered = !hasActiveFilters(normalized);
  return useQuery({
    queryKey: ['map', 'observations', normalized],
    queryFn: ({ signal }) =>
      withOfflineFallback(
        () => fetchObservationMapData(signal, normalized),
        (res) => cacheObservationsGeoJson(res, isUnfiltered),
        () => getCachedObservationsGeoJson(normalized)
      ),
    enabled,
  });
}

