import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SiteExplorerModal } from './components/SiteExplorerModal.js';
import { AboutSection, HowItWorksSection } from './components/AboutSection.js';
import { TermsPage } from './components/legal/TermsPage.js';
import { PrivacyPage } from './components/legal/PrivacyPage.js';
import { WhatsAppCtaModal } from './components/WhatsAppCtaModal.js';
import { WebFieldSubmissionModal } from './components/WebFieldSubmissionModal.js';
import { GeneralLoginModal, type InitialGoogleChallenge } from './components/GeneralLoginModal.js';
import { CommunityDiscoveryView } from './components/CommunityDiscoveryView.js';
import { Sidebar } from './components/Sidebar.js';
import { MapSearchOverlay } from './components/MapSearchOverlay.js';
import { MapFilterControl } from './components/MapFilterControl.js';
import { MapView, type MapNavTarget, type OwnerMapPost } from './components/MapView.js';
import { GeoscienceSitesView } from './components/GeoscienceSitesView.js';
import { ObservationSideCard } from './components/ObservationSideCard.js';
import { MyEarthTalkView } from './components/MyEarthTalkView.js';
import { MyMapView } from './components/MyMapView.js';
import { HistoryView } from './components/HistoryView.js';
import { NotificationsView } from './components/NotificationsView.js';
import { recordHistory, type HistoryEntry } from './services/history.js';
import { addRecentSearch } from './services/recentSearches.js';
import { ViewInfoPanel } from './components/ViewInfoPanel.js';
import { openWhatsApp, WHATSAPP_MY_EARTH_TALK_MESSAGE } from './services/whatsapp.js';
import { appDistributionApi, type AppDistributionData } from './services/appDistributionApi.js';
import { fetchMaintenanceMode, type MaintenanceModeSettings } from './services/maintenanceApi.js';
import { ControlCenter } from './control/ControlCenter.js';

import { fetchSitesGeoJson } from './services/communityApi.js';
import { fetchPost, fetchMyPosts } from './services/postsApi.js';
import {
  completeGoogleOAuthCallback,
  refreshSession,
  signOut as signOutCommunity,
  useCommunityUser,
} from './services/communityAuth.js';
import { signOutLocalAccount } from './services/localAccount.js';
import type { CommunityPostDetail } from './types/communityPosts.js';
import {
  getNavEntry,
  NAV_ENTRIES,
  type AppView,
  type CommunityPanel,
} from './navigation.js';
import type { PublicSiteGeoJson } from './types/community.js';
import {
  fetchPublicGeoJson,
  fetchPublicDistricts,
  fetchPublicCategories,
  fetchUnlocatedObservations,
} from './services/publicApi.js';
import type {
  PublicObservationGeoJson,
  PublicObservationSummary,
  PublicDistrictCount,
  PublicCategoryCount,
  ObservationFilters,
} from './types/public.js';
import { AlertCircle, RefreshCw, Menu, X } from 'lucide-react';
import {
  categoryLabel,
  EVIDENCE_STATE_HEX,
  EVIDENCE_STATE_LABELS,
  NO_EVIDENCE_HEX,
  type EvidenceState,
} from './types/community.js';

const ErrorToast: React.FC<{
  message: string;
  onRetry?: () => void;
  onDismiss: () => void;
}> = ({ message, onRetry, onDismiss }) => (
  <div
    role="alert"
    className="fixed bottom-4 right-4 z-[80] w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-[#f2b8b5] bg-white p-4 shadow-[var(--g-elev-3)]"
  >
    <div className="flex items-start gap-3">
      <div className="mt-0.5 rounded-full bg-[#fce8e6] p-1.5 text-[#b3261e]">
        <AlertCircle className="w-4 h-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-[#1f1f1f]">Something went wrong</p>
        <p className="mt-1 text-xs leading-snug text-[#5e5e5e] break-words">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-[#0b57d0] hover:bg-[#e8f0fe] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Retry</span>
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error notification"
        className="rounded-full p-1 text-[#5e5e5e] hover:bg-[#f0f4f9] hover:text-[#1f1f1f] transition-colors cursor-pointer"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  </div>
);

/**
 * Desktop shell.
 *
 * There is no inline navigation and no bar above the map. Every feature of
 * every stage is a destination in the left sidebar, and each destination also
 * owns the contextual panel that sits beneath it in the same column. The map
 * view is full bleed with a single Google-style search field on the canvas.
 */
const PUBLIC_URL_VIEWS = new Set<AppView>([
  'explore',
  'sites',
  'community',
  'about',
  'how-it-works',
  'terms',
  'privacy',
]);

function isPublicUrlLocation(view: AppView, panel: CommunityPanel): boolean {
  if (!PUBLIC_URL_VIEWS.has(view)) return false;
  if (view === 'community' && panel !== 'investigations') return false;
  return true;
}

function navSignature(
  view: AppView,
  panel: CommunityPanel,
  passport: string | null,
  fullscreen: boolean,
  site: string | null,
  investigation: string | null
): string {
  return [
    view,
    panel,
    passport ?? '',
    fullscreen ? '1' : '',
    site ?? '',
    investigation ?? '',
  ].join('|');
}

interface ParsedUrlState {
  view: AppView;
  panel: CommunityPanel;
  passport: string | null;
  fullscreen: boolean;
  site: string | null;
  investigation: string | null;
  lat: number | null;
  lng: number | null;
  zoom: number | null;
}

function parseUrlState(): ParsedUrlState {
  if (typeof window === 'undefined') {
    return {
      view: 'explore',
      panel: 'investigations',
      passport: null,
      fullscreen: false,
      site: null,
      investigation: null,
      lat: null,
      lng: null,
      zoom: null,
    };
  }
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);

  let view: AppView = 'explore';
  if (path === '/terms' || path.startsWith('/terms/')) view = 'terms';
  else if (path === '/privacy' || path.startsWith('/privacy/')) view = 'privacy';
  else if (path === '/control' || path.startsWith('/control/') || path === '/control/login') view = 'control';
  else {
    const rawView = params.get('view') as AppView | null;
    if (rawView && PUBLIC_URL_VIEWS.has(rawView)) {
      view = rawView;
    }
  }

  const rawPanel = params.get('panel');
  const panel: CommunityPanel =
    view === 'community' && (rawPanel === 'investigations' || rawPanel === 'reputation')
      ? rawPanel
      : 'investigations';

  const parseFinite = (key: string, min: number, max: number): number | null => {
    const raw = params.get(key);
    if (raw === null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  };

  return {
    view,
    panel,
    passport: params.get('passport'),
    fullscreen: params.get('fullscreen') === '1' || params.get('fullscreen') === 'true',
    site: params.get('site'),
    investigation: params.get('investigation'),
    lat: parseFinite('lat', -85, 85),
    lng: parseFinite('lng', -180, 180),
    zoom: parseFinite('zoom', 0, 22),
  };
}

export const App: React.FC = () => {
  const initialUrlRef = useRef<ParsedUrlState | null>(null);
  if (initialUrlRef.current === null) {
    initialUrlRef.current = parseUrlState();
  }
  const initialUrl = initialUrlRef.current;

  // The shell opens on the map or requested public page. Private routes are never
  // exposed or restored from shareable query parameters.
  const [view, setView] = useState<AppView>(initialUrl.view);
  // On desktop the column narrows to an icon rail, which gives the map its
  // room and keeps every icon reachable. On a phone the same flag means the
  // drawer is shut, so a phone never starts with the column covering the map.
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
  );
  // Desktop only: the column closed entirely with its X. The map then shows a
  // "show sidebar" button, the way Google Maps hides and restores its drawer.
  const [isSidebarHidden, setIsSidebarHidden] = useState(false);
  // Below this width the column cannot sit inline beside the map, so it
  // becomes an animated overlay drawer instead.
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
  );
  // The geological site layer is always drawn; the map has its own control too.
  const showSites = true;
  const [communityPanel, setCommunityPanel] = useState<CommunityPanel>(initialUrl.panel);

  // Contributor session (Stage 12). The session store is reactive, so
  // the side card and the MY EARTH TALK dashboard update the moment a token is
  // the side card and the MY EARTH TALK dashboard update the moment a token is
  // established or signed out, without prop drilling or a context provider.
  const communityUser = useCommunityUser();

  // Contributors sign in with their Google account (email code verification).
  const viewer = communityUser;
  const isSignedIn = Boolean(viewer);

  // The public shell signs in contributors with Google/email. Staff administration
  // happens in the separate Control Center, never in this navigation.
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [initialAuthChallenge, setInitialAuthChallenge] = useState<InitialGoogleChallenge | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceModeSettings | null>(null);

  // Filter & Search State.
  const [filters, setFilters] = useState<ObservationFilters>({});

// Data State
  const [districts, setDistricts] = useState<PublicDistrictCount[]>([]);
  const [categories, setCategories] = useState<PublicCategoryCount[]>([]);
  const [geojson, setGeojson] = useState<PublicObservationGeoJson | null>(null);
  const [sitesGeoJson, setSitesGeoJson] = useState<PublicSiteGeoJson | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(initialUrl.site);
  const [selectedInvestigationId, setSelectedInvestigationId] = useState<string | null>(
    initialUrl.investigation
  );
  const [mapCamera, setMapCamera] = useState<{ lat: number; lng: number; zoom: number } | null>(() =>
    initialUrl.lat !== null && initialUrl.lng !== null
      ? { lat: initialUrl.lat, lng: initialUrl.lng, zoom: initialUrl.zoom ?? 8 }
      : null
  );
  // The reader's own located posts, for the private overlay on the map. Only
  // ever fetched for their own session, and only drawn when they ask for it.
  const [ownerPosts, setOwnerPosts] = useState<OwnerMapPost[]>([]);
  // Published posts with no public coordinate, shown on the Geoscience sites
  // page because the map cannot place them. Search and category narrow the list
  // the same way Explore's controls narrow the map.
  const [unlocatedPosts, setUnlocatedPosts] = useState<PublicObservationSummary[]>([]);
  const [loadingUnlocated, setLoadingUnlocated] = useState(false);
  // The same filter set Explore uses, applied to the Geoscience sites page so
  // the two surfaces narrow by an identical vocabulary.
  const [sitesFilters, setSitesFilters] = useState<ObservationFilters>({});

  // The passport whose side card is open on the map.
  const [selectedPassportId, setSelectedPassportId] = useState<string | null>(null);

  // Community post side card (Stage 12), keyed to the same selected passport.
  const [selectedPost, setSelectedPost] = useState<CommunityPostDetail | null>(null);
  const [loadingPost, setLoadingPost] = useState(false);
  // "Open full Geoscience Passport" shows the same side card content full
  // screen; no second record is fetched, so nothing is changed or added.
  const [passportFullscreen, setPassportFullscreen] = useState(false);
  const [targetCommentId, setTargetCommentId] = useState<string | null>(null);
  const [focusDiscussion, setFocusDiscussion] = useState(false);
  const handleTargetCommentHandled = useCallback(() => {
    setTargetCommentId(null);
    setFocusDiscussion(false);
  }, []);

// In-map navigation requested from the observation side card: the map draws
  // the trip from the user to this place, all inside the platform.
  const [navTarget, setNavTarget] = useState<MapNavTarget | null>(null);

  // WhatsApp & Web Field Observation Submission Dialogs
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [isWebUploadOpen, setIsWebUploadOpen] = useState(false);
  const [pendingWebUploadAfterLogin, setPendingWebUploadAfterLogin] = useState(false);
  const [appDistribution, setAppDistribution] = useState<AppDistributionData | null>(null);
  const configuredWhatsAppNumber = appDistribution?.whatsapp_number ?? '';
  const isWhatsAppSidebarVisible = Boolean(appDistribution?.is_whatsapp_sidebar_visible);

  // Loading & Error States
const [loadingMap, setLoadingMap] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

// Request abort controller for cancellation of older map requests (Section 53)
  const mapAbortRef = useRef<AbortController | null>(null);
  const mapRequestSeqRef = useRef(0);

  // Monotonic request id for the side card. Picking observations quickly fires
  // overlapping fetches; only the newest is allowed to write, so a slow earlier
  // response cannot overwrite the card the reader is actually looking at.
  const selectSeqRef = useRef(0);
  const handleSelectObservationRef = useRef<(passportId: string) => void>(() => undefined);
  const handleNavigateRef = useRef<(next: AppView, panel?: CommunityPanel) => void>(
    () => undefined
  );
  const isNarrowRef = useRef(isNarrow);
  isNarrowRef.current = isNarrow;
  const lastNavSignatureRef = useRef<string | null>(null);
  const skipNavPushRef = useRef(false);
  const authCallbackPendingRef = useRef(
    typeof window !== 'undefined' && window.location.pathname === '/auth/callback'
  );

  const isMapView = view === 'explore';
  const isPageView =
    view === 'terms' || view === 'privacy' || view === 'about' || view === 'how-it-works';
  // The private map fills the viewport; its own cards scroll, so the surrounding
  // main column does not.
  const isFullHeightView = isMapView || view === 'my-map';

  // Every destination the search box can reach, filtered to the same audience
  // the sidebar shows so search cannot offer a screen the reader cannot open.
  const searchPages = useMemo(
    () => [
      ...NAV_ENTRIES.filter((entry) => !entry.requiresSignIn || isSignedIn).map((entry) => ({
        id: entry.id,
        label: entry.label,
        subtitle: entry.subtitle,
        panel: entry.panel,
      })),
      {
        id: 'how-it-works' as AppView,
        label: 'How it works',
        subtitle: 'How a photo becomes a Geoscience Passport',
      },
      {
        id: 'privacy' as AppView,
        label: 'Privacy Policy',
        subtitle: 'Data protection and contributor privacy commitments',
      },
    ],
    [isSignedIn]
  );

  useEffect(() => {
    let cancelled = false;
    let failures = 0;
    let timer: number | undefined;
    const schedule = () => {
      if (cancelled) return;
      const delay = Math.min(30000 * 2 ** failures, 300000);
      timer = window.setTimeout(sync, delay);
    };
    const sync = () => {
      fetchMaintenanceMode()
        .then((settings) => {
          if (!cancelled) {
            failures = 0;
            setMaintenance(settings);
          }
        })
        .catch(() => {
          failures = Math.min(failures + 1, 4);
        })
        .finally(schedule);
    };
    sync();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  // Track the viewport so the column can be inline on a desktop and an overlay
  // on a phone, without a media query and a JS breakpoint disagreeing.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const sync = (event: MediaQueryListEvent | MediaQueryList) => setIsNarrow(event.matches);
    sync(mq);
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Reconcile a stored contributor session with the server once, so a revoked or
  // expired token is dropped on load rather than trusted from local storage.
  useEffect(() => {
    const hashParams = new URLSearchParams(
      typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '')
    );
    const searchParams = new URLSearchParams(
      typeof window === 'undefined' ? '' : window.location.search
    );
    const accessToken = hashParams.get('access_token') || searchParams.get('access_token') || undefined;
    const code = searchParams.get('code') || hashParams.get('code') || undefined;
    const oauthError =
      searchParams.get('error_description') ||
      hashParams.get('error_description') ||
      searchParams.get('error') ||
      hashParams.get('error');
    const isOAuthCallback =
      typeof window !== 'undefined' &&
      (window.location.pathname === '/auth/callback' || Boolean(accessToken || code || oauthError));

    if (!isOAuthCallback) {
      refreshSession().catch(() => {
        // A network hiccup leaves the session unhydrated for retry on next load.
      });
    }
    appDistributionApi
      .getPublicConfig()
      .then((cfg) => {
        setAppDistribution(cfg);
      })
      .catch(() => {
        // Ignore non-fatal config fetch error
      });

    if (typeof window !== 'undefined') {
      if (isOAuthCallback) {
        // Strip sensitive OAuth query/hash tokens from the browser bar immediately.
        window.history.replaceState({}, '', '/');

        if (oauthError) {
          authCallbackPendingRef.current = false;
          void refreshSession().catch(() => {});
          setApiError(`Google sign-in failed: ${oauthError}`);
          return;
        }

        if (accessToken || code) {
          completeGoogleOAuthCallback({ accessToken, code })
            .then((res) => {
              if (typeof BroadcastChannel !== 'undefined') {
                const ch = new BroadcastChannel('earth-talk-auth');
                ch.postMessage({ type: 'et_auth_updated' });
                ch.close();
              }
              if (window.opener && window.opener !== window) {
                try {
                  window.opener.postMessage({ type: 'ET_OAUTH_AUTH_SUCCESS' }, window.location.origin);
                } catch {
                  // Cross-origin opener ignored
                }
              }
              void refreshSession().catch(() => {});
              if (res.verification_required && res.challenge_id) {
                setInitialAuthChallenge({
                  challengeId: res.challenge_id,
                  maskedEmail: res.masked_email || res.email || 'your Google account',
                  message: res.message,
                });
                setIsLoginOpen(true);
              } else if (res.user) {
                setView('mine');
                if (window.opener && window.opener !== window) {
                  window.close();
                }
              }
            })
            .catch((err: unknown) => {
              setApiError(err instanceof Error ? err.message : 'Unable to complete Google sign-in.');
            })
            .finally(() => {
              authCallbackPendingRef.current = false;
            });
        } else {
          authCallbackPendingRef.current = false;
        }
      }
    }

    const syncOnFocus = () => {
      if (document.visibilityState === 'hidden') return;
      refreshSession().catch(() => {});
    };
    window.addEventListener('focus', syncOnFocus);
    document.addEventListener('visibilitychange', syncOnFocus);
    let authChannel: BroadcastChannel | null = null;
    const onChannelMessage = (event: MessageEvent) => {
      if (event.data?.type === 'et_auth_updated') {
        refreshSession().catch(() => {});
      }
    };
    if (typeof BroadcastChannel !== 'undefined') {
      authChannel = new BroadcastChannel('earth-talk-auth');
      authChannel.addEventListener('message', onChannelMessage);
    }
    return () => {
      window.removeEventListener('focus', syncOnFocus);
      document.removeEventListener('visibilitychange', syncOnFocus);
      if (authChannel) {
        authChannel.removeEventListener('message', onChannelMessage);
        authChannel.close();
      }
    };
  }, []);



  // Load the reader's own located posts for the map's private overlay (both
  // signed-in WhatsApp sessions and pseudonymous contributor-token submissions).
  useEffect(() => {
    let cancelled = false;
    fetchMyPosts()
      .then((posts) => {
        if (cancelled) return;
        setOwnerPosts(
          posts
            .filter(
              (post): post is typeof post & { latitude: number; longitude: number } =>
                typeof post.latitude === 'number' && typeof post.longitude === 'number'
            )
            .map((post) => ({
              passport_id: post.passport_id,
              title: post.title,
              observation_category: post.observation_category,
              latitude: post.latitude,
              longitude: post.longitude,
            }))
        );
      })
      .catch(() => {
        if (!cancelled) setOwnerPosts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [viewer]);

// Load the district and category lists that drive the filters. Categories come
  // from the API rather than a bundled constant, so a filter option is never
  // hidden just because nobody has submitted one yet - and a category this build
  // has never heard of still appears.
  const loadDistrictsAndCategories = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([
        fetchPublicDistricts(),
        fetchPublicCategories(),
      ]);
      setDistricts(d);
      setCategories(c);
    } catch {
      // Ignore initial load failure gracefully
    }
  }, []);

  useEffect(() => {
    loadDistrictsAndCategories();
  }, [loadDistrictsAndCategories]);

  // Geological sites are loaded independently of the observation filters.
  // A failure here must not blank the map: the observation layer still works.
  useEffect(() => {
    let cancelled = false;

    fetchSitesGeoJson({ limit: 500 })
      .then((fc) => {
        if (!cancelled) setSitesGeoJson(fc);
      })
      .catch(() => {
        if (!cancelled) setSitesGeoJson({ type: 'FeatureCollection', features: [] });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Load the published posts that have no public coordinate, for the Geoscience
  // sites page. Fetched only when that page is open, so an Explore session
  // never pays for a list it will not show.
  useEffect(() => {
    if (view !== 'sites') return;
    let cancelled = false;
    setLoadingUnlocated(true);
    const controller = new AbortController();

    fetchUnlocatedObservations(sitesFilters, 1, 200, controller.signal)
      .then((result) => {
        if (!cancelled) setUnlocatedPosts(result.data);
      })
      .catch(() => {
        if (!cancelled) setUnlocatedPosts([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingUnlocated(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [view, sitesFilters]);

  // Load Map GeoJSON with active filters
  const loadMapData = useCallback(async (currentFilters: ObservationFilters) => {
    const seq = ++mapRequestSeqRef.current;
    if (mapAbortRef.current) {
      mapAbortRef.current.abort();
    }
    const controller = new AbortController();
    mapAbortRef.current = controller;

    setLoadingMap(true);
    setApiError(null);

    try {
      const data = await fetchPublicGeoJson(currentFilters, undefined, controller.signal);
      if (seq !== mapRequestSeqRef.current) return;
      setGeojson(data);
    } catch (err: unknown) {
      if (seq !== mapRequestSeqRef.current) return;
      const name = err instanceof Error ? err.name : '';
      if (name !== 'AbortError') {
        setApiError('Unable to refresh map observations. Please check your connection.');
      }
    } finally {
      if (seq === mapRequestSeqRef.current) setLoadingMap(false);
    }
  }, []);

  // Load Recent Observations List with active filters
  // Debounced load triggered when filters change
  useEffect(() => {
    const timer = setTimeout(() => {
      loadMapData(filters);
    }, 200);

    return () => clearTimeout(timer);
  }, [filters, loadMapData]);

  const handleSelectObservation = async (
    passportId: string,
    options?: { commentId?: string | null; focusDiscussion?: boolean }
  ) => {
    // Claim this request. Any response whose id is no longer current is stale.
    const seq = ++selectSeqRef.current;
    setTargetCommentId(options?.commentId ?? null);
    setFocusDiscussion(Boolean(options?.focusDiscussion));
    setSelectedPassportId(passportId);
    setLoadingPost(true);
    try {
      let post = await fetchPost(passportId);
      if (seq !== selectSeqRef.current) return;
      if (!post) {
        const unlocated = unlocatedPosts.find((p) => p.passport_id === passportId);
        if (unlocated) {
          post = {
            passport_id: unlocated.passport_id,
            title: unlocated.post_title || unlocated.possible_name || 'Unlocated observation',
            observation_category: unlocated.observation_category,
            observation_subcategory: unlocated.observation_subcategory,
            is_public: true,
            is_demo: unlocated.is_demo ?? false,
            created_at: unlocated.created_at,
            updated_at: unlocated.created_at,
            owner: null,
            location: {
              address: null,
              district: unlocated.district,
              sector: null,
              cell: null,
              village: null,
              country: null,
              latitude: null,
              longitude: null,
              precision: 'private',
              approximate: true,
              privacy_note: 'No published location.',
            },
            user_report: null,
            ai: {
              primary_interpretation: null,
              observed_features: [],
              diagnostic_features: [],
              reasoning: '',
              alternative_possibilities: [],
              uncertainties: [],
              limitations: [],
              recommended_next_steps: [],
              safety_note: '',
              confidence: '',
              confidence_score: 0,
              evidence_state: null,
              disclaimer: 'No analysis is available for this record.',
            },
            media: [],
            questions: [],
            open_questions: [],
            comment_count: 0,
            can_comment: false,
            viewer_is_owner: false,
            attachments: [],
            same_place: { available: false, count: 0, note: 'No coordinates', items: [] },
          };
        }
      }
      setSelectedPost(post);
      recordHistory({
        view: 'explore',
        passportId,
        label: post?.title ?? 'Observation',
        subtitle: categoryLabel(post?.observation_category),
      });
    } catch {
      if (seq !== selectSeqRef.current) return;
      setSelectedPost(null);
      recordHistory({ view: 'explore', passportId, label: 'Observation' });
    } finally {
      if (seq === selectSeqRef.current) setLoadingPost(false);
    }
  };
  handleSelectObservationRef.current = handleSelectObservation;

  const handlePostChanged = (updatedPost: CommunityPostDetail) => {
    setSelectedPost(updatedPost);
    const shouldShowOnPublicMap =
      updatedPost.is_public &&
      updatedPost.location.latitude !== null &&
      updatedPost.location.longitude !== null &&
      Number.isFinite(updatedPost.location.latitude) &&
      Number.isFinite(updatedPost.location.longitude) &&
      updatedPost.location.precision !== 'private';

    setGeojson((prev) => {
      if (!prev) return prev;
      if (!shouldShowOnPublicMap) {
        return {
          ...prev,
          features: prev.features.filter(
            (f) => f.properties.passport_id !== updatedPost.passport_id
          ),
        };
      }

      const nextFeature: any = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [updatedPost.location.longitude!, updatedPost.location.latitude!],
        },
        properties: {
          passport_id: updatedPost.passport_id,
          observation_category: updatedPost.observation_category,
          observation_subcategory: updatedPost.observation_subcategory,
          primary_classification: updatedPost.ai.primary_interpretation,
          possible_name: updatedPost.title,
          confidence: updatedPost.ai.confidence || 'medium',
          confidence_score: Math.round((updatedPost.ai.confidence_score ?? 0.7) * 100),
          evidence_state: updatedPost.ai.evidence_state || 'ai_preliminary',
          verification_status: 'unverified',
          district: updatedPost.location.district,
          location_precision: updatedPost.location.precision,
          created_at: updatedPost.created_at,
          post_title: updatedPost.title,
          is_demo: updatedPost.is_demo,
        },
      };

      const existingIdx = prev.features.findIndex(
        (f) => f.properties.passport_id === updatedPost.passport_id
      );
      if (existingIdx >= 0) {
        const nextFeatures = [...prev.features];
        nextFeatures[existingIdx] = nextFeature;
        return { ...prev, features: nextFeatures };
      }

      return {
        ...prev,
        features: [nextFeature, ...prev.features],
      };
    });

    // Refresh authoritative map GeoJSON (approximate coordinate fuzzing / district centroids)
    void loadMapData(filters);
  };

  /** Reopens a screen recorded in the sidebar's History list. */
  const handleOpenHistoryEntry = (entry: HistoryEntry) => {
    if (entry.passportId) {
      setView('explore');
      setIsSidebarHidden(false);
      if (isNarrow) setIsSidebarCollapsed(true);
      void handleSelectObservation(entry.passportId);
      return;
    }
    if (entry.siteId) {
      handleSelectSite(entry.siteId);
      return;
    }
    handleNavigate(entry.view, entry.panel);
  };


  /**
   * "Open full Geoscience Passport" from the map card: expands the card that is
   * already on screen to the full-screen passport, using the very same post and
   * layout - nothing is fetched again, changed, or added.
   */
  const handleOpenFullPassport = () => {
    if (!selectedPost) return;
    setPassportFullscreen(true);
  };

  /** MY EARTH TALK: open one of the contributor's posts on the map. */
  const handleOpenMyPost = (passportId: string) => {
    setView('explore');
    void handleSelectObservation(passportId);
  };

  /** Notifications: open an observation Passport straight at a specific message & reply. */
  const handleOpenNotificationObservation = (passportId: string, commentId?: string | null) => {
    setView('explore');
    setIsSidebarHidden(false);
    if (isNarrow) setIsSidebarCollapsed(true);
    void handleSelectObservation(passportId, {
      commentId: commentId ?? null,
      focusDiscussion: true,
    });
  };

  /** Opens a geoscience site's explorer. */
  const handleSelectSite = (siteId: string) => {
    setSelectedSiteId(siteId);
    recordHistory({ view: 'sites', siteId, label: 'Site explorer', subtitle: siteId });
  };

  const closeSideCard = () => {
    setSelectedPassportId(null);
    setSelectedPost(null);
    setPassportFullscreen(false);
    setTargetCommentId(null);
    setFocusDiscussion(false);
  };

  const handleResetFilters = () => {
    setFilters({});
  };

  const handleOpenLogin = () => {
    setIsLoginOpen(true);
  };

  /**
   * The sidebar's "Start on WhatsApp" action (guarded by Owner/Ops/Security config).
   */
  const handleOpenWhatsApp = () => {
    if (!isWhatsAppSidebarVisible) return;
    if (isSignedIn) {
      if (!openWhatsApp(WHATSAPP_MY_EARTH_TALK_MESSAGE, configuredWhatsAppNumber)) {
        setIsWhatsAppModalOpen(true);
      }
      return;
    }
    setIsWhatsAppModalOpen(true);
  };

  const handleOpenWebUpload = () => {
    if (!viewer) {
      setPendingWebUploadAfterLogin(true);
      setIsLoginOpen(true);
      return;
    }
    setIsWebUploadOpen(true);
  };

  // Community Discovery uses the same Google/email sign-in surface.
  const handleOpenWriteLogin = () => {
    setIsLoginOpen(true);
  };

  const handleSignOut = () => {
    signOutLocalAccount();
    void signOutCommunity();
    setIsSidebarHidden(false);
    if (!isSidebarCollapsed) setIsSidebarCollapsed(false);
    setView('explore');
  };

  // 7-day inactivity re-verification check & URL parameter synchronization
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const lastActive = Number(localStorage.getItem('et_last_active') || '0');
    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    if (lastActive && now - lastActive > SEVEN_DAYS) {
      void signOutCommunity();
      localStorage.removeItem('et_last_active');
    } else {
      localStorage.setItem('et_last_active', String(now));
    }
  }, [communityUser?.public_user_id]);

  // Load any observation / fullscreen state specified in the initial public URL.
  useEffect(() => {
    if (initialUrl.passport) {
      if (initialUrl.fullscreen) {
        setPassportFullscreen(true);
      }
      void handleSelectObservation(initialUrl.passport);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Synchronize browser URL strictly for public shareable locations/views.
  // Private views (My Earth Talk, My Map, History, Notifications, Control) and
  // private/non-public observations never expose URL params.
  useEffect(() => {
    if (typeof window === 'undefined' || authCallbackPendingRef.current) return;

    const signature = navSignature(
      view,
      communityPanel,
      selectedPassportId,
      passportFullscreen,
      selectedSiteId,
      selectedInvestigationId
    );
    const isNavigation =
      lastNavSignatureRef.current !== null &&
      signature !== lastNavSignatureRef.current &&
      !skipNavPushRef.current;
    const shouldPush = isNavigation && isPublicUrlLocation(view, communityPanel);
    lastNavSignatureRef.current = signature;
    skipNavPushRef.current = false;

    const writeUrl = (url: string, state: Record<string, unknown>) => {
      const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (url === currentUrl) return;
      if (shouldPush) window.history.pushState(state, '', url);
      else window.history.replaceState(state, '', url);
    };

    if (!isPublicUrlLocation(view, communityPanel)) {
      const cleanPath = view === 'control' || view === 'control-login' ? '/control' : '/';
      writeUrl(cleanPath, { view });
      return;
    }

    if (view === 'terms') {
      writeUrl('/terms', { view });
      return;
    }
    if (view === 'privacy') {
      writeUrl('/privacy', { view });
      return;
    }

    const params = new URLSearchParams();
    params.set('view', view);

    if (view === 'explore') {
      if (mapCamera && Number.isFinite(mapCamera.lat) && Number.isFinite(mapCamera.lng)) {
        params.set('lat', mapCamera.lat.toFixed(5));
        params.set('lng', mapCamera.lng.toFixed(5));
        params.set('zoom', mapCamera.zoom.toFixed(2));
      }
      const canSharePassport = Boolean(selectedPassportId) && (!selectedPost || selectedPost.is_public);
      if (canSharePassport && selectedPassportId) {
        params.set('passport', selectedPassportId);
        if (passportFullscreen) params.set('fullscreen', '1');
      }
      if (selectedSiteId) {
        params.set('site', selectedSiteId);
      }
    } else if (view === 'sites') {
      if (selectedSiteId) params.set('site', selectedSiteId);
      const canSharePassport = Boolean(selectedPassportId) && (!selectedPost || selectedPost.is_public);
      if (canSharePassport && selectedPassportId) {
        params.set('passport', selectedPassportId);
        if (passportFullscreen) params.set('fullscreen', '1');
      }
    } else if (view === 'community') {
      params.set('panel', 'investigations');
      if (selectedInvestigationId) {
        params.set('investigation', selectedInvestigationId);
      }
    }

    const searchStr = params.toString();
    writeUrl(searchStr ? `/?${searchStr}` : '/', {
      view,
      selectedPassportId,
      selectedSiteId,
      selectedInvestigationId,
    });
  }, [
    view,
    communityPanel,
    selectedPassportId,
    selectedPost,
    passportFullscreen,
    selectedSiteId,
    selectedInvestigationId,
    mapCamera,
  ]);

  // Handle browser back/forward buttons for public URLs
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const next = parseUrlState();
      const nextSignature = navSignature(
        next.view,
        next.panel,
        next.passport,
        next.fullscreen,
        next.site,
        next.investigation
      );
      if (nextSignature !== lastNavSignatureRef.current) skipNavPushRef.current = true;
      setView(next.view);
      setCommunityPanel(next.panel);
      setSelectedSiteId(next.site);
      setSelectedInvestigationId(next.investigation);
      if (next.lat !== null && next.lng !== null) {
        setMapCamera({ lat: next.lat, lng: next.lng, zoom: next.zoom ?? 8 });
      }
      if (next.passport) {
        setPassportFullscreen(next.fullscreen);
        void handleSelectObservationRef.current(next.passport);
      } else {
        setSelectedPassportId(null);
        setSelectedPost(null);
        setPassportFullscreen(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (['terms', 'privacy', 'about', 'how-it-works'].includes(view)) {
      setIsSidebarHidden(true);
    }
  }, [view]);

  const handleNavigate = (next: AppView, panel?: CommunityPanel) => {
    setView(next);
    // A section entry opens its own section; a plain view entry restores that
    // view's default section, so the active item in the sidebar always agrees
    // with what is on screen.
    if (next === 'community') setCommunityPanel(panel ?? 'investigations');
    
    if (['terms', 'privacy', 'about', 'how-it-works'].includes(next)) {
      setIsSidebarHidden(true);
    } else {
      setIsSidebarHidden(false);
    }
    // On a narrow viewport the column is a drawer, so choosing a destination
    // shuts it and reveals the content behind it.
    if (isNarrowRef.current) setIsSidebarCollapsed(true);
    // Remember the visit in the local History list. A section entry is matched
    // by its panel when specified.
    const entry =
      NAV_ENTRIES.find((e) => e.id === next && (panel ? e.panel === panel : true)) ??
      getNavEntry(next);
    recordHistory({ view: next, panel, label: entry.label, subtitle: entry.subtitle });
  };
  handleNavigateRef.current = handleNavigate;

  // Global keyboard shortcuts: 'm' -> map/explore, 'h' -> history, 's' -> geoscience sites
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'm') {
        e.preventDefault();
        handleNavigateRef.current('explore');
      } else if (key === 'h') {
        e.preventDefault();
        handleNavigateRef.current('history');
      } else if (key === 's') {
        e.preventDefault();
        handleNavigateRef.current('sites');
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  /** Contextual panel rendered inside the sidebar, beneath the navigation. */
  const sidebarPanel = <ViewInfoPanel view={view} />;

  const sidebar = (
    <Sidebar
      view={view}
      onNavigate={handleNavigate}
      onOpenWhatsApp={handleOpenWhatsApp}
      onOpenWebUpload={handleOpenWebUpload}
      onOpenLogin={handleOpenLogin}
      onSignOut={handleSignOut}
      currentUser={viewer}
      distributionConfig={appDistribution}
      onToggleCollapsed={() => setIsSidebarCollapsed((prev) => !prev)}
      collapsed={isSidebarCollapsed}
      overlay={isNarrow}
        onClose={() => {
          // The X narrows the column to its icon rail - on a phone that is the
          // drawer sliding shut, on desktop the full list folding to icons.
          // The three lines at the rail's top-left bring it back.
          setIsSidebarCollapsed(true);
        }}
activePanel={view === 'community' ? communityPanel : null}
    >
      {sidebarPanel}
    </Sidebar>
  );

  // Geoscience sites narrowing. The full Explore filter set drives this page:
  // the unlocated posts are filtered on the server, and the site cards are
  // narrowed locally on the fields a site feature actually carries (district,
  // category, evidence state, and whether it holds an investigation/evidence).
  const sitesQuery = (sitesFilters.search ?? '').trim().toLowerCase();
  const filteredSiteFeatures = (sitesGeoJson?.features ?? []).filter((feature) => {
    const p = feature.properties;
    if (sitesFilters.district && p.district !== sitesFilters.district) return false;
    if (sitesFilters.category && !(p.observed_classifications ?? []).includes(sitesFilters.category)) {
      return false;
    }
    if (sitesFilters.evidence_state && p.highest_evidence_state !== sitesFilters.evidence_state) {
      return false;
    }
    if (sitesFilters.has_investigation && p.investigation_count <= 0) return false;
    if (sitesFilters.has_evidence && (p.evidence_count ?? 0) <= 0) return false;
    if (!sitesQuery) return true;
    return [
      p.title,
      p.site_code,
      p.district ?? '',
      ...(p.observed_classifications ?? []),
    ].some((value) => String(value ?? '').toLowerCase().includes(sitesQuery));
  });

  // The unlocated posts are already filtered end to end by the server through
  // `sitesFilters` (including the search term), so nothing is applied again here.
  const filteredUnlocatedPosts = unlocatedPosts;

  if (view === 'control') {
    return <ControlCenter />;
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-[#f8fafd] text-[#1f1f1f]">
{/* The navigation column. On desktop it sits inline and the three lines in
          its header narrow it to an icon rail. On a narrow viewport it becomes
          a drawer: it stays mounted so opening and closing both animate, and
          while shut it is translated off-screen and inert. The map's "show
          sidebar" button and a floating Menu button bring it back. */}
      {!isPageView &&
        (isNarrow ? (
          <div
            className={`fixed inset-x-0 top-0 z-50 h-dvh ${
              isSidebarCollapsed ? 'pointer-events-none' : ''
            }`}
          >
            <div
              className={`absolute inset-0 bg-[#1f1f1f]/40 transition-opacity duration-200 ${
                isSidebarCollapsed ? 'opacity-0' : 'opacity-100'
              }`}
              onClick={() => setIsSidebarCollapsed(true)}
            />
            <div
              inert={isSidebarCollapsed}
              className={`relative h-full shadow-2xl transition-transform duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                isSidebarCollapsed ? '-translate-x-full' : 'translate-x-0'
              }`}
            >
              {sidebar}
            </div>
          </div>
        ) : (
          !isSidebarHidden && <div className="flex">{sidebar}</div>
        ))}

<div className="flex-1 min-w-0 flex flex-col relative">
        {maintenance?.enabled && maintenance.message && (
          <div
            role="status"
            className="shrink-0 z-40 border-b border-[#f2c94c] bg-[#fff8e1] px-4 py-2.5 text-center text-sm text-[#6b4e00] shadow-2xs"
          >
            <span className="font-semibold">Maintenance:</span> {maintenance.message}
          </div>
        )}


        <main className={`flex-1 min-h-0 g-scroll ${isFullHeightView ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {isMapView && (
            <div className="relative h-full w-full">
              <MapView
                geojson={geojson}
                loading={loadingMap}
                selectedPassportId={selectedPassportId}
                onSelectObservation={handleSelectObservation}
                sitesGeoJson={sitesGeoJson}
                onSelectSite={(siteId) => handleSelectSite(siteId)}
                showSites={showSites}
                sidebarHidden={isSidebarHidden || (isNarrow && isSidebarCollapsed)}
                onOpenSidebar={() => {
                  setIsSidebarHidden(false);
                  setIsSidebarCollapsed(false);
                }}
                navTarget={navTarget}
                ownerPosts={ownerPosts}
                initialCenter={
                  mapCamera && Number.isFinite(mapCamera.lng) && Number.isFinite(mapCamera.lat)
                    ? [mapCamera.lng, mapCamera.lat]
                    : undefined
                }
                initialZoom={mapCamera?.zoom}
                onCameraChange={(cam) => setMapCamera(cam)}
                onOpenInfoPage={(page) => handleNavigate(page)}
              />

              {/* The one search box in the app, on the map canvas, with the
                  filter button inside its right edge. The sidebar has none. */}
              <MapSearchOverlay
                value={filters.search ?? ''}
                onSearch={(text) => setFilters((prev) => ({ ...prev, search: text || undefined }))}
                onOpenSidebar={() => {
                  setIsSidebarHidden(false);
                  setIsSidebarCollapsed(false);
                }}
                showSidebarButton={isSidebarHidden || isNarrow}
                districts={districts}
                categories={categories}
                sites={sitesGeoJson}
                observations={geojson}
                pages={searchPages}
                onSelectObservation={handleSelectObservation}
                onSelectSite={handleSelectSite}
                onSelectPage={(pageId, panel) =>
                  handleNavigate(pageId as AppView, panel as CommunityPanel | undefined)
                }
                loading={loadingMap}
                trailing={
                  <MapFilterControl
                    filters={filters}
                    onChange={setFilters}
                    onReset={handleResetFilters}
                    districts={districts}
                    categories={categories}
                  />
                }
              />

              {/* The observation side card slides over the map, Google-Maps
                  style, when a pin is opened. It describes the same observation
                  the halo lights up, and it is the conversation surface: media,
                  report, AI interpretation, questions and discussion. */}
            </div>
          )}

          {/* Observation side card slides in when any observation is selected on map or geoscience sites */}
          {selectedPassportId && (selectedPost !== null || loadingPost) && (
            <div className="fixed inset-0 z-50 flex justify-end">
              <div
                className="absolute inset-0 bg-black/20 backdrop-blur-2xs transition-opacity"
                onClick={closeSideCard}
                aria-hidden="true"
              />
              <div className="relative z-10 h-full shadow-2xl">
                <ObservationSideCard
                  post={selectedPost}
                  loading={loadingPost}
                  viewer={viewer}
                  onClose={closeSideCard}
                  onRequestLogin={handleOpenLogin}
                  onOpenPassport={handleOpenFullPassport}
                  onPostChanged={handlePostChanged}
                  onNavigate={(latitude, longitude, label) => {
                    setView('explore');
                    setNavTarget({ latitude, longitude, label });
                  }}
                  fullscreen={passportFullscreen}
                  onExitFullscreen={() => setPassportFullscreen(false)}
                  targetCommentId={targetCommentId}
                  focusDiscussion={focusDiscussion}
                  onTargetCommentHandled={handleTargetCommentHandled}
                />
              </div>
            </div>
          )}

          {view === 'sites' && (
            <GeoscienceSitesView
              posts={filteredUnlocatedPosts}
              filters={sitesFilters}
              onFiltersChange={setSitesFilters}
              loading={loadingUnlocated}
              isNarrow={isNarrow}
              sidebarOpen={!isSidebarCollapsed && !isSidebarHidden && !isNarrow}
              onOpenSidebar={() => {
                setIsSidebarHidden(false);
                setIsSidebarCollapsed(false);
              }}
              onSelectPost={(passportId) => void handleSelectObservation(passportId)}
            />
          )}

          {view === 'community' && (
            <CommunityDiscoveryView
              activePanel={communityPanel}
              onPanelChange={setCommunityPanel}
              viewer={viewer}
              onRequestLogin={handleOpenWriteLogin}
              sidebarOpen={!isSidebarCollapsed && !isSidebarHidden && !isNarrow}
              selectedInvestigationId={selectedInvestigationId}
              onSelectInvestigation={setSelectedInvestigationId}
              onOpenSidebar={() => {
                setIsSidebarHidden(false);
                setIsSidebarCollapsed(false);
              }}
              isNarrow={isNarrow}
            />
          )}

          {view === 'mine' && (
            <MyEarthTalkView
              viewer={viewer}
              onRequestLogin={handleOpenLogin}
              onOpenPost={handleOpenMyPost}
              onOpenWebUpload={handleOpenWebUpload}
              isNarrow={isNarrow}
              onOpenSidebar={() => {
                setIsSidebarHidden(false);
                setIsSidebarCollapsed(false);
              }}
            />
          )}

          {view === 'my-map' && (
            <MyMapView
              viewer={viewer}
              onRequestLogin={handleOpenLogin}
              onOpenPost={handleOpenMyPost}
              isNarrow={isNarrow}
              onOpenSidebar={() => {
                setIsSidebarHidden(false);
                setIsSidebarCollapsed(false);
              }}
            />
          )}

          {view === 'history' && (
            <HistoryView
              onOpen={handleOpenHistoryEntry}
              onBackToApp={() => handleNavigate('explore')}
              isNarrow={isNarrow}
              onOpenSidebar={() => {
                setIsSidebarHidden(false);
                setIsSidebarCollapsed(false);
              }}
            />
          )}

          {view === 'notifications' && (
            <NotificationsView
              viewer={viewer}
              onRequestLogin={handleOpenLogin}
              onOpenObservation={handleOpenNotificationObservation}
              onOpenSite={handleSelectSite}
              onBackToApp={() => handleNavigate('explore')}
              isNarrow={isNarrow}
              onOpenSidebar={() => {
                setIsSidebarHidden(false);
                setIsSidebarCollapsed(false);
              }}
            />
          )}

          {view === 'how-it-works' && (
            <HowItWorksSection
              onNavigateTab={(tab) => handleNavigate(tab)}
              onBackToApp={() => handleNavigate('explore')}
            />
          )}

          {view === 'about' && (
            <AboutSection
              onNavigateTab={(tab) => handleNavigate(tab)}
              onBackToApp={() => handleNavigate('explore')}
            />
          )}

          {view === 'terms' && (
            <TermsPage
              onNavigateTab={(tab) => handleNavigate(tab)}
              onBackToApp={() => handleNavigate('explore')}
            />
          )}

          {view === 'privacy' && (
            <PrivacyPage
              onNavigateTab={(tab) => handleNavigate(tab)}
              onBackToApp={() => handleNavigate('explore')}
            />
          )}
        </main>
      </div>

      {/* Site Explorer, opened from a site row or a geological site marker on the map */}
      <SiteExplorerModal siteId={selectedSiteId} onClose={() => setSelectedSiteId(null)} />

      {/* Dedicated WhatsApp Channel Modal (separate from Web Photo Upload) */}
      <WhatsAppCtaModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
        whatsappNumber={configuredWhatsAppNumber}
      />

      <WebFieldSubmissionModal
        isOpen={isWebUploadOpen}
        onClose={() => setIsWebUploadOpen(false)}
        onObservationPinned={(passportId: string) => {
          setIsWebUploadOpen(false);
          void loadMapData(filters);
          setView('explore');
          void handleSelectObservation(passportId);
        }}
      />

      {/* One Google/email sign-in surface. Signing in lands on My Earth Talk,
          except when a field upload was pending, which then opens instead. */}
      <GeneralLoginModal
        isOpen={isLoginOpen}
        onClose={() => {
          setIsLoginOpen(false);
          setPendingWebUploadAfterLogin(false);
          setInitialAuthChallenge(null);
        }}
        initialChallenge={initialAuthChallenge}
        onUserLogin={() => {
          setIsLoginOpen(false);
          setInitialAuthChallenge(null);
          if (pendingWebUploadAfterLogin) {
            setPendingWebUploadAfterLogin(false);
            setIsWebUploadOpen(true);
            return;
          }
          setView('mine');
        }}
      />

      {apiError && (
        <ErrorToast
          message={apiError}
          onRetry={apiError.includes('map observations') ? () => void loadMapData(filters) : undefined}
          onDismiss={() => setApiError(null)}
        />
      )}
    </div>
  );
};
