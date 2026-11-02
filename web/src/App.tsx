<<<<<<< HEAD
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
=======
import React, { useState, useEffect, useCallback, useRef } from 'react';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
import { SiteExplorerModal } from './components/SiteExplorerModal.js';
import { AboutSection, HowItWorksSection } from './components/AboutSection.js';
import { TermsPage } from './components/legal/TermsPage.js';
import { PrivacyPage } from './components/legal/PrivacyPage.js';
import { WhatsAppCtaModal } from './components/WhatsAppCtaModal.js';
<<<<<<< HEAD
import { WebFieldSubmissionModal } from './components/WebFieldSubmissionModal.js';
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
import { GeneralLoginModal } from './components/GeneralLoginModal.js';
import { ExpertDashboardView } from './components/ExpertDashboardView.js';
import { AdminModerationDashboard } from './components/AdminModerationDashboard.js';
import { ResearchAnalyticsDashboard } from './components/ResearchAnalyticsDashboard.js';
import { CommunityDiscoveryView } from './components/CommunityDiscoveryView.js';
import { ValidationEvaluationDashboard } from './components/ValidationEvaluationDashboard.js';
import { Sidebar } from './components/Sidebar.js';
import { MapSearchOverlay } from './components/MapSearchOverlay.js';
import { MapFilterControl } from './components/MapFilterControl.js';
import { MapView, type MapNavTarget, type OwnerMapPost } from './components/MapView.js';
import { MapLocationCard } from './components/MapLocationCard.js';
import { ObservationSideCard } from './components/ObservationSideCard.js';
import { MyEarthTalkView } from './components/MyEarthTalkView.js';
import { MyMapView } from './components/MyMapView.js';
import { HistoryView } from './components/HistoryView.js';
import { recordHistory, type HistoryEntry } from './services/history.js';
<<<<<<< HEAD
import { addRecentSearch } from './services/recentSearches.js';
import { ViewInfoPanel } from './components/ViewInfoPanel.js';
import { openWhatsApp, WHATSAPP_MY_EARTH_TALK_MESSAGE } from './services/whatsapp.js';
import { appDistributionApi } from './services/appDistributionApi.js';
import { ControlCenter } from './control/ControlCenter.js';
=======
import { openWhatsApp, WHATSAPP_MY_EARTH_TALK_MESSAGE } from './services/whatsapp.js';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

import { fetchSitesGeoJson } from './services/communityApi.js';
import { fetchPost, fetchMyPosts } from './services/postsApi.js';
import { refreshSession, signOut as signOutCommunity, useCommunityUser } from './services/communityAuth.js';
import { signOutLocalAccount } from './services/localAccount.js';
import type { CommunityPostDetail } from './types/communityPosts.js';
import {
  getNavEntry,
  NAV_ENTRIES,
  type AppView,
  type CommunityPanel,
} from './navigation.js';
import type { PublicSiteGeoJson } from './types/community.js';
<<<<<<< HEAD
import {
  getStoredExpertUser,
  clearExpertSession,
  fetchExpertMe,
  logoutExpert,
} from './services/expertApi.js';
=======
import { getStoredExpertUser, clearExpertSession } from './services/expertApi.js';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
import type { ExpertUser } from './types/expert.js';
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
import {
  AlertCircle,
  RefreshCw,
  Layers,
  MapPin,
<<<<<<< HEAD
  MapPinned,
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  Menu,
  Search,
} from 'lucide-react';
import {
  EVIDENCE_STATE_HEX,
  EVIDENCE_STATE_LABELS,
  NO_EVIDENCE_HEX,
  type EvidenceState,
} from './types/community.js';

/**
 * Desktop shell.
 *
 * There is no inline navigation and no bar above the map. Every feature of
 * every stage is a destination in the left sidebar, and each destination also
 * owns the contextual panel that sits beneath it in the same column. The map
 * view is full bleed with a single Google-style search field on the canvas.
 */
export const App: React.FC = () => {
  // Helper to determine initial view based on browser path
  const getInitialView = (): AppView => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      if (path === '/terms' || path.startsWith('/terms/')) return 'terms';
      if (path === '/privacy' || path.startsWith('/privacy/')) return 'privacy';
<<<<<<< HEAD
      if (path === '/control' || path.startsWith('/control/') || path === '/control/login') return 'control';
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    }
    return 'explore';
  };

  // The shell opens on the map or requested legal page. Every destination, including the footer's
  // Language control, is a real view or an in-place popover - there is no
  // separate feature screen to track.
  const [view, setView] = useState<AppView>(getInitialView);
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
  const [communityPanel, setCommunityPanel] = useState<CommunityPanel>('investigations');

  // Expert Authentication & Portal State (Stage 5)
  const [currentExpert, setCurrentExpert] = useState<ExpertUser | null>(() => getStoredExpertUser());

  // WhatsApp contributor session (Stage 12). The session store is reactive, so
  // the side card and the MY EARTH TALK dashboard update the moment a token is
  // established or signed out, without prop drilling or a context provider.
  // WhatsApp contributor session (Stage 12). The session store is reactive, so
  // the side card and the MY EARTH TALK dashboard update the moment a token is
  // established or signed out, without prop drilling or a context provider.
  const communityUser = useCommunityUser();

  // The ONLY way user can log in is strictly via WhatsApp.
  const viewer = communityUser;
  const isSignedIn = Boolean(viewer);

  // One general sign-in surface serves both audiences: a contributor with a
  // WhatsApp number and the administrator with an email. Whichever the backend
  // returns decides where the session lands.
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  // Filter & Search State.
  const [filters, setFilters] = useState<ObservationFilters>({});

// Data State
  const [districts, setDistricts] = useState<PublicDistrictCount[]>([]);
  const [categories, setCategories] = useState<PublicCategoryCount[]>([]);
  const [geojson, setGeojson] = useState<PublicObservationGeoJson | null>(null);
  const [sitesGeoJson, setSitesGeoJson] = useState<PublicSiteGeoJson | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
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

// In-map navigation requested from the observation side card: the map draws
  // the trip from the user to this place, all inside the platform.
  const [navTarget, setNavTarget] = useState<MapNavTarget | null>(null);

<<<<<<< HEAD
  // WhatsApp & Web Field Observation Submission Dialogs
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [isWebUploadOpen, setIsWebUploadOpen] = useState(false);
  const [pendingWebUploadAfterLogin, setPendingWebUploadAfterLogin] = useState(false);
  const [configuredWhatsAppNumber, setConfiguredWhatsAppNumber] = useState<string>('');
=======
  // WhatsApp CTA Dialog
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

  // Loading & Error States
const [loadingMap, setLoadingMap] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

// Request abort controller for cancellation of older map requests (Section 53)
  const mapAbortRef = useRef<AbortController | null>(null);

  // Monotonic request id for the side card. Picking observations quickly fires
  // overlapping fetches; only the newest is allowed to write, so a slow earlier
  // response cannot overwrite the card the reader is actually looking at.
  const selectSeqRef = useRef(0);

  const isMapView = view === 'explore';
  const isPageView =
    view === 'terms' ||
    view === 'privacy' ||
    view === 'history' ||
    view === 'about' ||
    view === 'how-it-works';
  // The private map fills the viewport like Explore does; every other view
  // scrolls inside the main column.
  const isFullHeightView = isMapView || view === 'my-map';

<<<<<<< HEAD
  // Every destination the search box can reach, filtered to the same audience
  // the sidebar shows so search cannot offer a screen the reader cannot open.
  const searchPages = useMemo(
    () => [
      ...NAV_ENTRIES.filter(
        (entry) =>
          (!entry.requiresSignIn || isSignedIn) &&
          (!entry.requiresAdmin || Boolean(currentExpert))
      ).map((entry) => ({
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
    [isSignedIn, currentExpert]
  );

=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
// Track the viewport so the column can be inline on a desktop and an overlay
  // on a phone, without a media query and a JS breakpoint disagreeing.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const sync = (event: MediaQueryListEvent | MediaQueryList) => setIsNarrow(event.matches);
    sync(mq);
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Reconcile a stored WhatsApp session with the server once, so a revoked or
  // expired token is dropped on load rather than trusted from local storage.
  useEffect(() => {
    refreshSession().catch(() => {
<<<<<<< HEAD
      // A network hiccup leaves the session unhydrated for retry on next load.
    });
    fetchExpertMe()
      .then((expert) => {
        setCurrentExpert(expert);
      })
      .catch(() => {
        // Non-fatal on public views.
      });
    appDistributionApi
      .getPublicConfig()
      .then((cfg) => {
        setConfiguredWhatsAppNumber(cfg.whatsapp_number || '');
      })
      .catch(() => {
        // Ignore non-fatal config fetch error
      });
=======
      // A network hiccup leaves the stored session in place for the next load.
    });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }, []);



<<<<<<< HEAD
  // Load the reader's own located posts for the map's private overlay (both
  // signed-in WhatsApp sessions and pseudonymous contributor-token submissions).
  useEffect(() => {
    let cancelled = false;
=======
  // Load the reader's own located posts for the map's private overlay. Only
  // posts that actually carry a coordinate can be placed, so the unlocated ones
  // are left to the Geoscience sites list rather than pinned at a guess.
  useEffect(() => {
    let cancelled = false;
    if (!viewer) {
      setOwnerPosts([]);
      return;
    }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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
    if (mapAbortRef.current) {
      mapAbortRef.current.abort();
    }
    const controller = new AbortController();
    mapAbortRef.current = controller;

    setLoadingMap(true);
    setApiError(null);

    try {
      const data = await fetchPublicGeoJson(currentFilters, undefined, controller.signal);
      setGeojson(data);
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      if (name !== 'AbortError') {
        setApiError('Unable to refresh map observations. Please check your connection.');
      }
    } finally {
      setLoadingMap(false);
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

  const handleSelectObservation = async (passportId: string) => {
    // Claim this request. Any response whose id is no longer current is stale.
    const seq = ++selectSeqRef.current;
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
            owner: { public_user_id: 'ET-CONTRIBUTOR', display_name: 'Field Contributor', is_demo: true },
            location: {
              address: null,
              district: unlocated.district,
              sector: null,
              cell: null,
              village: null,
              country: 'Rwanda',
              latitude: null,
              longitude: null,
              precision: 'private',
              approximate: true,
              privacy_note: 'No published location.',
            },
            user_report: 'Observation discovered without confirmed coordinates. Community members can contribute and verify its location.',
            ai: {
              primary_interpretation: unlocated.primary_interpretation || 'Geological specimen recorded in Rwanda.',
              observed_features: ['Recorded field specimen awaiting community coordinate verification.'],
              diagnostic_features: ['Visual field observation.'],
              reasoning: 'Observation published to gather community coordinate verification.',
              alternative_possibilities: [],
              uncertainties: ['Exact coordinates withheld by contributor.'],
              limitations: ['A photograph alone cannot determine exact coordinates.'],
              recommended_next_steps: ['Enter known location, district, and coordinates to verify.'],
              safety_note: 'Field safety: Do not enter steep or private terrain without landowner permission.',
              confidence: unlocated.confidence,
              confidence_score: unlocated.confidence_score,
              evidence_state: unlocated.evidence_state || 'ai_assisted',
              disclaimer: 'Preliminary citizen science record.',
            },
            media: [{
              media_id: `${unlocated.passport_id}-m1`,
              kind: 'image',
              role: 'main',
              caption: unlocated.post_title || 'Observation',
              mime_type: 'image/jpeg',
              sort_order: 0,
              url: '/media/pool/rock-08.jpg',
              poster_url: null,
              available: true,
              is_demo: true,
              demo_note: null,
              created_at: unlocated.created_at,
            }],
            questions: [],
            open_questions: [],
            comment_count: 0,
            can_comment: true,
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
        subtitle: 'Observation',
      });
    } catch {
      if (seq !== selectSeqRef.current) return;
      setSelectedPost(null);
      recordHistory({ view: 'explore', passportId, label: 'Observation', subtitle: 'Observation' });
    } finally {
      if (seq === selectSeqRef.current) setLoadingPost(false);
    }
  };

  const handlePostChanged = (updatedPost: CommunityPostDetail) => {
    setSelectedPost(updatedPost);
<<<<<<< HEAD
    const shouldShowOnPublicMap =
      updatedPost.is_public &&
=======
    if (
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      updatedPost.location.latitude !== null &&
      updatedPost.location.longitude !== null &&
      Number.isFinite(updatedPost.location.latitude) &&
      Number.isFinite(updatedPost.location.longitude) &&
<<<<<<< HEAD
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
=======
      updatedPost.location.precision !== 'private'
    ) {
      setGeojson((prev) => {
        if (!prev) return prev;
        const exists = prev.features.some(
          (f) => f.properties.passport_id === updatedPost.passport_id
        );
        if (exists) return prev;
        const newFeature: any = {
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
            confidence: 'high',
            confidence_score: 95,
            evidence_state: 'community_investigated',
            verification_status: 'unverified',
            district: updatedPost.location.district,
            location_precision: updatedPost.location.precision,
            created_at: updatedPost.created_at,
            post_title: updatedPost.title,
            is_demo: updatedPost.is_demo,
          },
        };
        return {
          ...prev,
          features: [newFeature, ...prev.features],
        };
      });
    }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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
    handleSelectObservation(passportId);
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
  };

  const handleResetFilters = () => {
    setFilters({});
  };

  const handleOpenLogin = () => {
    setIsLoginOpen(true);
  };

  /**
<<<<<<< HEAD
   * The sidebar's "Start on WhatsApp" action (only visible when enabled by Owner/Ops/Security).
   */
  const handleOpenWhatsApp = () => {
    if (isSignedIn) {
      if (!openWhatsApp(WHATSAPP_MY_EARTH_TALK_MESSAGE, configuredWhatsAppNumber)) {
        setIsWhatsAppModalOpen(true);
      }
=======
   * The sidebar's "Start on WhatsApp" action. A signed-in contributor skips the
   * guide card and lands in My Earth Talk on WhatsApp; a visitor is shown the
   * card first, because there is no account to carry over yet.
   */
  const handleOpenWhatsApp = () => {
    if (isSignedIn) {
      if (!openWhatsApp(WHATSAPP_MY_EARTH_TALK_MESSAGE)) setIsWhatsAppModalOpen(true);
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      return;
    }
    setIsWhatsAppModalOpen(true);
  };

<<<<<<< HEAD
  const handleOpenWebUpload = () => {
    if (!viewer) {
      setPendingWebUploadAfterLogin(true);
      setIsLoginOpen(true);
      return;
    }
    setIsWebUploadOpen(true);
  };

=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  // Community Discovery sign-in: exclusively via WhatsApp.
  const handleOpenWriteLogin = () => {
    setIsLoginOpen(true);
  };

  const handleSignOut = () => {
    clearExpertSession();
<<<<<<< HEAD
    void logoutExpert();
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    setCurrentExpert(null);
    signOutLocalAccount();
    void signOutCommunity();
    setView('explore');
  };

<<<<<<< HEAD
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const targetPath = 
      view === 'terms' ? '/terms' : 
      view === 'privacy' ? '/privacy' : 
      view === 'control' ? '/control' : '/';
=======
  // Keep browser URL bar synchronized for /terms, /privacy, and root
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const targetPath = view === 'terms' ? '/terms' : view === 'privacy' ? '/privacy' : '/';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ view }, '', targetPath);
    }
  }, [view]);

  // Handle browser back/forward buttons
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase();
      if (path === '/terms' || path.startsWith('/terms/')) {
        setView('terms');
      } else if (path === '/privacy' || path.startsWith('/privacy/')) {
        setView('privacy');
<<<<<<< HEAD
      } else if (path === '/control' || path.startsWith('/control/') || path === '/control/login') {
        setView('control');
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      } else {
        setView('explore');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (['terms', 'privacy', 'about', 'history', 'how-it-works'].includes(view)) {
      setIsSidebarHidden(true);
    }
  }, [view]);

  const handleNavigate = (next: AppView, panel?: CommunityPanel) => {
    setView(next);
    // A section entry opens its own section; a plain view entry restores that
    // view's default section, so the active item in the sidebar always agrees
    // with what is on screen.
    if (next === 'community') setCommunityPanel(panel ?? 'investigations');
    
    if (['terms', 'privacy', 'about', 'history', 'how-it-works'].includes(next)) {
      setIsSidebarHidden(true);
    } else {
      setIsSidebarHidden(false);
    }
    // On a narrow viewport the column is a drawer, so choosing a destination
    // shuts it and reveals the content behind it.
    if (isNarrow) setIsSidebarCollapsed(true);
    // Remember the visit in the local History list. A section entry is matched
    // by its panel so the row reads "My questions", not the group's first entry.
    const entry =
      NAV_ENTRIES.find((e) => e.id === next && (panel ? e.panel === panel : true)) ??
      getNavEntry(next);
    recordHistory({ view: next, panel, label: entry.label, subtitle: entry.subtitle });
  };

<<<<<<< HEAD
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
        handleNavigate('explore');
      } else if (key === 'h') {
        e.preventDefault();
        handleNavigate('history');
      } else if (key === 's') {
        e.preventDefault();
        handleNavigate('sites');
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  /** Contextual panel rendered inside the sidebar, beneath the navigation. */
  const sidebarPanel = (
    <>
      <ViewInfoPanel
        view={view}
        isAuthenticated={Boolean(currentExpert) || isSignedIn}
        onOpenExpertPortal={handleOpenLogin}
      />
=======
  /** Contextual panel rendered inside the sidebar, beneath the navigation. */
  const sidebarPanel = (
    <>
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      {/* Data status. Reported in the sidebar so nothing is stacked above the map. */}
      {apiError && (
        <div className="g-panel !border-t-0 !mt-0 !pt-3">
          <div className="rounded-lg bg-[#fef7e0] border border-[#ffdf99] p-3 flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 text-[11px] text-[#9f6108] leading-snug">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
              <span>{apiError}</span>
            </div>
            <button
              type="button"
              className="g-btn g-btn-text h-7 px-2 text-[11px] shrink-0"
              onClick={() => {
                loadMapData(filters);
              }}
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Retry</span>
            </button>
          </div>
        </div>
      )}
    </>
  );

  const sidebar = (
    <Sidebar
      view={view}
      onNavigate={handleNavigate}
      onOpenWhatsApp={handleOpenWhatsApp}
<<<<<<< HEAD
      onOpenWebUpload={handleOpenWebUpload}
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      onOpenLogin={handleOpenLogin}
      onSignOut={handleSignOut}
      currentExpert={currentExpert}
      currentUser={viewer}
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

  // The district choices for the sites filter, assembled from both lists so a
  // district that only holds an unlocated post is still offered.
  const sitesDistricts = (() => {
    const counts = new Map<string, number>();
    const add = (name: string | null | undefined) => {
      if (!name) return;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    };
    for (const feature of sitesGeoJson?.features ?? []) add(feature.properties.district);
    for (const post of unlocatedPosts) add(post.district);
    return Array.from(counts, ([name, observation_count]) => ({ name, observation_count })).sort(
      (a, b) => a.name.localeCompare(b.name)
    );
  })();

<<<<<<< HEAD
  if (view === 'control') {
    return <ControlCenter />;
  }

=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  return (
    <div className="flex h-dvh overflow-hidden bg-[#f8fafd] text-[#1f1f1f]">
{/* The navigation column. On desktop it sits inline and the three lines in
          its header narrow it to an icon rail. On a narrow viewport it becomes
          a drawer: it stays mounted so opening and closing both animate, and
          while shut it is translated off-screen and inert. The map's "show
          sidebar" button and a floating Menu button bring it back. */}
      {!isSidebarHidden && !isPageView &&
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
          <div className="flex">{sidebar}</div>
        ))}

<div className="flex-1 min-w-0 flex flex-col relative">
<<<<<<< HEAD
        {isNarrow && isSidebarCollapsed && !isMapView && view !== 'sites' && !['terms', 'privacy', 'about', 'how-it-works', 'history'].includes(view) && (
          <header className="h-12 border-b border-[#e3e3e3] bg-white px-4 flex items-center gap-3 shrink-0 z-30">
            <button
              type="button"
              onClick={() => {
                setIsSidebarHidden(false);
                setIsSidebarCollapsed(false);
              }}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-[#dadce0] text-[#444746] hover:bg-[#f0f4f9] active:bg-[#e8f0fe] transition-colors cursor-pointer"
              aria-label="Open navigation sidebar"
              title="Open sidebar"
            >
              <Menu className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-[#1f1f1f] truncate">
              {view === 'community' && 'Community Discovery'}
              {view === 'mine' && 'My Earth Talk'}
              {view === 'my-map' && 'My Map'}
              {view === 'history' && 'History'}
              {view === 'research' && 'Research Analytics'}
              {view === 'reviews' && 'Expert Reviews'}
              {view === 'moderation' && 'Moderation'}
            </span>
          </header>
        )}
=======
        {/* There is no bar above the map and nothing floating over it. The
            sidebar owns the navigation, the filters and every other control. */}
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

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
              />

              {/* The one search box in the app, on the map canvas, with the
                  filter button inside its right edge. The sidebar has none. */}
<<<<<<< HEAD
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
=======
<MapSearchOverlay
                value={filters.search ?? ''}
                onSearch={(text) => setFilters((prev) => ({ ...prev, search: text || undefined }))}
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
                trailing={
                  <MapFilterControl
                    filters={filters}
                    onChange={setFilters}
<<<<<<< HEAD
                    onReset={handleResetFilters}
                    districts={districts}
                    categories={categories}
                  />
=======
onReset={handleResetFilters}
         districts={districts}
         categories={categories}
       />
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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
                />
              </div>
            </div>
          )}

          {view === 'sites' && (
            <div className="p-6 space-y-6">

<<<<<<< HEAD
              {/* Section title, subtitle and the search field share one row. */}
              <section className="space-y-5">
                <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex items-baseline gap-3">
                      <h3 className="text-[14px] font-medium text-[#1f1f1f]">
                        Posts without a published location
                      </h3>
                      <span className="text-[12px] text-[#5e5e5e] font-mono">
                        {filteredUnlocatedPosts.length} listed
                      </span>
                    </div>
                    <p className="text-[12px] text-[#5e5e5e]">
                      Published field posts that have no public map coordinate.
                    </p>
                  </div>
                  <div className="flex w-full items-center gap-3 lg:w-auto lg:shrink-0">
                    {isNarrow && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsSidebarHidden(false);
                          setIsSidebarCollapsed(false);
                        }}
                        className="h-10 w-10 flex items-center justify-center rounded-full border border-[#dadce0] bg-white shadow-xs text-[#444746] hover:bg-[#f0f4f9] active:bg-[#e8f0fe] transition-colors shrink-0 cursor-pointer"
                        title="Open sidebar"
                        aria-label="Open sidebar"
                      >
                        <Menu className="w-5 h-5 text-[#444746]" />
                      </button>
                    )}
                    <div className="relative w-full lg:w-[360px]">
                      <Search
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8f8f8f]"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        value={sitesFilters.search ?? ''}
                        onChange={(e) =>
                          setSitesFilters((prev) => ({ ...prev, search: e.target.value || undefined }))
                        }
                        placeholder="Search sites, districts or posts"
                        className="g-input w-full pl-9 pr-12 h-10 text-sm"
                        aria-label="Search geoscience sites and posts"
                      />
                      <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
                        <MapFilterControl
                          filters={sitesFilters}
                          onChange={setSitesFilters}
                          onReset={() => setSitesFilters({})}
                          districts={sitesDistricts}
                          categories={categories}
                        />
                      </div>
                    </div>
                  </div>
                </div>
=======
              {/* Search plus the same filter menu Explore attaches to its
                  search field, so the two surfaces narrow by one vocabulary. */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[220px]">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8f8f8f]"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={sitesFilters.search ?? ''}
                    onChange={(e) =>
                      setSitesFilters((prev) => ({ ...prev, search: e.target.value || undefined }))
                    }
                    placeholder="Search sites, districts or posts"
                    className="g-input w-full pl-9 pr-12 h-10 text-sm"
                    aria-label="Search geoscience sites and posts"
                  />
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
                    <MapFilterControl
                      filters={sitesFilters}
                      onChange={setSitesFilters}
                      onReset={() => setSitesFilters({})}
                      districts={sitesDistricts}
                      categories={categories}
                    />
                  </div>
                </div>
              </div>


              {/* Posts published without a public coordinate. The map cannot
                  place them, so they are grouped and listed here, each opening
                  its own card. A reader who knows the area can still find them. */}
              <section className="space-y-3">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-[14px] font-medium text-[#1f1f1f]">
                    Posts without a published location
                  </h3>
                  <span className="text-[12px] text-[#5e5e5e] font-mono">
                    {filteredUnlocatedPosts.length} listed
                  </span>
                </div>
                <p className="text-[12px] text-[#5e5e5e] max-w-3xl leading-relaxed">
                  These observations were published without a coordinate, so no pin can be drawn for them.
                  They are listed rather than placed at a guessed point. Open one to read it, or add what
                  you know about where it was found.
                </p>
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

                {loadingUnlocated ? (
                  <div className="py-10 text-center text-[#5e5e5e] text-sm">Loading published posts…</div>
                ) : filteredUnlocatedPosts.length === 0 ? (
<<<<<<< HEAD
                  <div className="mx-auto flex max-w-sm flex-col items-center rounded-2xl border border-dashed border-[#c7c7c7] bg-white px-6 py-9 text-center">
                    <div className="relative mb-5 flex h-24 w-24 items-center justify-center">
                      <span className="absolute inset-0 rounded-full bg-[#e8f0fe]" />
                      <span className="absolute -right-2 top-2 h-5 w-5 rounded-full bg-[#fef7e0]" />
                      <span className="absolute -left-2 bottom-3 h-4 w-4 rounded-full bg-[#e6f4ea]" />
                      <span className="absolute right-4 bottom-0 h-2.5 w-2.5 rounded-full bg-[#c4eed0]" />
                      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-[#0b57d0]/20 bg-white shadow-sm">
                        <MapPinned className="h-7 w-7 text-[#0b57d0]" strokeWidth={1.6} aria-hidden="true" />
                      </div>
                    </div>
                    <div className="text-sm font-medium text-[#1f1f1f]">
                      No published post is missing a location
                    </div>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-[#5e5e5e]">
                      Every published post has a coordinate, so nothing is waiting to be placed on the map.
                    </p>
                  </div>
                ) : (
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
=======
                  <div className="py-10 text-center text-[#5e5e5e] text-sm bg-white rounded-xl border border-dashed border-[#c7c7c7]">
                    No published post is missing a location.
                  </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
                      {filteredUnlocatedPosts.map((post) => (
                        <MapLocationCard
                          key={post.passport_id}
                          title={post.post_title || post.possible_name || 'Untitled observation'}
                          category={(post.observation_category || 'unknown').replace(/_/g, ' ')}
                          rating={post.confidence ? `Confidence: ${post.confidence}` : null}
                          secondary={post.district ? `${post.district} District` : 'No district'}
                          description={post.primary_interpretation}
                          status={{
                            label: 'No published location',
                            tone: 'neutral',
                          }}
                          imageUrl={post.passport_id === 'ET-DEMO-0007' ? '/media/pool/rock-08.jpg' : null}
                          accentColor="#0b57d0"
<<<<<<< HEAD
                          size="comfortable"
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
                          className="w-full hover:-translate-y-1 hover:shadow-xl transition-all duration-200"
                          onClick={() => handleSelectObservation(post.passport_id)}
                        />
                      ))}
                    </div>
                )}
              </section>
            </div>
          )}

{view === 'community' && (
            <div className="p-6">
              <CommunityDiscoveryView
                activePanel={communityPanel}
                onPanelChange={setCommunityPanel}
                viewer={viewer}
                onRequestLogin={handleOpenWriteLogin}
                onOpenPost={handleOpenMyPost}
              />
            </div>
          )}

          {view === 'mine' && (
            <MyEarthTalkView
              viewer={viewer}
              onRequestLogin={handleOpenLogin}
              onOpenPost={handleOpenMyPost}
<<<<<<< HEAD
              onOpenWebUpload={handleOpenWebUpload}
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
            />
          )}

          {view === 'my-map' && (
            <MyMapView
              viewer={viewer}
              onRequestLogin={handleOpenLogin}
              onOpenPost={handleOpenMyPost}
            />
          )}

          {view === 'history' && (            <HistoryView              onOpen={handleOpenHistoryEntry}              onBackToApp={() => handleNavigate('explore')}            />          )}

          {view === 'research' && (
            <div className="p-6">
              <ResearchAnalyticsDashboard onBackToQueue={() => setView('explore')} />
            </div>
          )}

          {view === 'reviews' &&
            (currentExpert ? (
              <ExpertDashboardView
                currentUser={currentExpert}
                onLogout={handleSignOut}
                onSwitchToPublicMap={() => setView('explore')}
              />
            ) : (
              <div className="p-6">
                <div className="g-card p-8 text-center max-w-lg mx-auto">
                  <h2 className="text-[16px] font-medium text-[#1f1f1f]">Expert verification portal</h2>
                  <p className="mt-2 text-[13px] text-[#5e5e5e] leading-relaxed">
                    This portal is restricted to the Super Admin. There is no expert account system and no
                    passwordless path: a review can only be attributed to a named, authenticated reviewer.
                  </p>
                  <button
                    type="button"
                    className="g-btn g-btn-filled mt-4"
                    onClick={handleOpenLogin}
                  >
                    Sign in to continue
                  </button>
                </div>
              </div>
            ))}

          {view === 'moderation' &&
            (currentExpert ? (
              <AdminModerationDashboard currentUser={currentExpert} onLogout={handleSignOut} />
            ) : (
              <div className="p-6">
                <div className="g-card p-8 text-center max-w-lg mx-auto">
                  <h2 className="text-[16px] font-medium text-[#1f1f1f]">Moderation</h2>
                  <p className="mt-2 text-[13px] text-[#5e5e5e] leading-relaxed">
                    The abuse-report queue is restricted to the Super Admin, because every decision is
                    attributed to the reviewer who made it.
                  </p>
                  <button type="button" className="g-btn g-btn-filled mt-4" onClick={handleOpenLogin}>
                    Sign in to continue
                  </button>
                </div>
              </div>
            ))}

          {view === 'validation' &&
            (currentExpert ? (
              <div className="p-6">
                <ValidationEvaluationDashboard />
              </div>
            ) : (
              <div className="p-6">
                <div className="g-card p-8 text-center max-w-lg mx-auto">
                  <h2 className="text-[16px] font-medium text-[#1f1f1f]">Field validation and model evaluation</h2>
                  <p className="mt-2 text-[13px] text-[#5e5e5e] leading-relaxed">
                    Every validation route requires an authenticated Super Admin session. Nothing on this screen is
                    simulated, so there is nothing to show without a session.
                  </p>
                  <button
                    type="button"
                    className="g-btn g-btn-filled mt-4"
                    onClick={handleOpenLogin}
                  >
                    Sign in to continue
                  </button>
                </div>
              </div>
            ))}

          {view === 'how-it-works' && (
            <HowItWorksSection
<<<<<<< HEAD
              onNavigateTab={(tab) => handleNavigate(tab)}
=======
              onOpenWhatsApp={() => setIsWhatsAppModalOpen(true)}
              onNavigate={(v) => handleNavigate(v)}
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
              onBackToApp={() => handleNavigate('explore')}
            />
          )}

          {view === 'about' && (
            <AboutSection
<<<<<<< HEAD
              onNavigateTab={(tab) => handleNavigate(tab)}
=======
              onOpenWhatsApp={() => setIsWhatsAppModalOpen(true)}
              onNavigate={(v) => handleNavigate(v)}
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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

<<<<<<< HEAD
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
=======
      {/* WhatsApp Guide Modal */}
      <WhatsAppCtaModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      />

      {/* One sign-in surface for both audiences. What the backend returns
          decides the destination: a contributor lands on My Earth Talk, the
          administrator on Expert reviews. */}
      <GeneralLoginModal
        isOpen={isLoginOpen}
<<<<<<< HEAD
        onClose={() => {
          setIsLoginOpen(false);
          setPendingWebUploadAfterLogin(false);
        }}
        onUserLogin={() => {
          setIsLoginOpen(false);
          if (pendingWebUploadAfterLogin) {
            setPendingWebUploadAfterLogin(false);
            setIsWebUploadOpen(true);
            return;
          }
          setView('mine');
        }}
=======
        onClose={() => setIsLoginOpen(false)}
        onUserLogin={() => {
          setIsLoginOpen(false);
          setView('mine');
        }}
        onAdminLogin={(expert) => {
          setIsLoginOpen(false);
          setCurrentExpert(expert);
          setView('reviews');
        }}
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      />
    </div>
  );
};
