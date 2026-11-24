import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Map as MapIcon, Menu, Telescope } from 'lucide-react';
import type { CommunityUser, MyPostSummary } from '../types/communityPosts.js';
import { fetchMyPosts } from '../services/postsApi.js';
import { useTranslator } from '../i18n.js';
import { MapView, type OwnerMapPost } from './MapView.js';

interface MyMapViewProps {
  viewer: CommunityUser | null;
  onRequestLogin: () => void;
  onOpenPost: (passportId: string) => void;
  isNarrow?: boolean;
  onOpenSidebar?: () => void;
}

/**
 * MY MAP - the contributor's own observations on the map.
 *
 * This is the one place a private observation is drawn at its true point. The
 * map is built from the owner-only endpoint, the public layers are supplied
 * empty, and nothing here is ever shown to another reader. A private post is
 * labelled as private rather than hidden, so the map tells the truth about what
 * only its owner can see.
 */
export const MyMapView: React.FC<MyMapViewProps> = ({
  viewer,
  onRequestLogin,
  onOpenPost,
  isNarrow,
  onOpenSidebar,
}) => {
  const t = useTranslator();
  const [posts, setPosts] = useState<MyPostSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!viewer) return;
    setLoading(true);
    setFailed(false);
    try {
      setPosts(await fetchMyPosts());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [viewer]);

  useEffect(() => {
    setPosts([]);
    if (viewer) load();
  }, [viewer, load]);

  if (!viewer) {
    return (
      <div className="min-h-dvh bg-[#f0f4f9] text-[#1f1f1f] flex flex-col p-4 sm:p-6">
        {isNarrow && onOpenSidebar && (
          <div className="mb-4">
            <button
              type="button"
              onClick={onOpenSidebar}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dadce0] bg-white text-[#5e5e5e] shadow-2xs hover:bg-[#f8faff] hover:text-[#0b57d0] transition-colors cursor-pointer"
              title="Open sidebar"
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="g-card p-8 text-center max-w-lg mx-auto my-auto">
          <MapIcon className="w-8 h-8 text-[#0b57d0] mx-auto" aria-hidden="true" />
          <h2 className="mt-3 text-[16px] font-medium text-[#1f1f1f]">{t('My Map')}</h2>
          <p className="mt-2 text-[13px] text-[#5e5e5e]">
            Sign in to see your own observations on the map, including the ones you
            have kept private.
          </p>
          <button
            type="button"
            onClick={onRequestLogin}
            className="group mt-4 inline-flex items-center justify-center gap-2.5 rounded-xl border border-[#dadce0] bg-white px-5 py-2.5 text-[13px] font-medium text-[#1f1f1f] shadow-sm transition-all duration-150 hover:border-[#0b57d0]/40 hover:bg-[#f8faff] hover:shadow active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b57d0]"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.19v3.15C3.17 21.31 7.23 24 12 24z" />
              <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.19C.43 8.12 0 9.87 0 11.7s.43 3.58 1.19 5.12l4.09-3.15z" />
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.23 0 3.17 2.69 1.19 6.58l4.09 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
            </svg>
            <span>Sign in to Earth Talk</span>
            <ArrowRight className="h-4 w-4 text-[#5e5e5e] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[#0b57d0]" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  const located = posts.filter(
    (post): post is MyPostSummary & { latitude: number; longitude: number } =>
      typeof post.latitude === 'number' && typeof post.longitude === 'number'
  );
  const ownerPosts: OwnerMapPost[] = located.map((post) => ({
    passport_id: post.passport_id,
    title: post.title,
    observation_category: post.observation_category,
    latitude: post.latitude,
    longitude: post.longitude,
  }));
  const privateCount = posts.filter((post) => !post.is_public).length;
  const unlocatedCount = posts.length - located.length;

  return (
    <div className="flex h-full flex-col relative">
      {isNarrow && onOpenSidebar && (
        <button
          type="button"
          onClick={onOpenSidebar}
          className="absolute left-4 top-4 z-20 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dadce0] bg-white text-[#5e5e5e] shadow-md hover:bg-[#f8faff] hover:text-[#0b57d0] transition-colors cursor-pointer"
          title="Open sidebar"
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      {failed ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <div className="max-w-sm">
            <p className="text-[13px] text-[#5e5e5e]">Your observations could not be loaded.</p>
            <button type="button" className="g-btn g-btn-text mt-2" onClick={load}>
              Try again
            </button>
          </div>
        </div>
      ) : posts.length === 0 && !loading ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <div className="max-w-sm">
            <Telescope className="w-7 h-7 text-[#8f8f8f] mx-auto" aria-hidden="true" />
            <p className="mt-3 text-[13px] text-[#5e5e5e]">
              You have not recorded any observations yet. Send a photo to the Earth Talk
              WhatsApp number, and it will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="relative min-h-[360px] flex-1">
          <MapView
            geojson={null}
            loading={loading}
            onSelectObservation={onOpenPost}
            showSites={false}
            ownerPosts={ownerPosts}
            ownOnly
          />
          {(privateCount > 0 || unlocatedCount > 0 || (located.length === 0 && !loading)) && (
            <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex flex-wrap justify-center gap-2 px-4">
              {privateCount > 0 && (
                <span className="rounded-full border border-[#e3e3e3] bg-white/95 px-3 py-1.5 text-[12px] text-[#6d28d9] shadow-[var(--g-elev-1)]">
                  {privateCount} Private
                </span>
              )}
              {unlocatedCount > 0 && (
                <span className="rounded-full border border-[#e3e3e3] bg-white/95 px-3 py-1.5 text-[12px] text-[#9f6108] shadow-[var(--g-elev-1)]">
                  {unlocatedCount} without a coordinate
                </span>
              )}
              {located.length === 0 && !loading && (
                <span className="rounded-full border border-[#e3e3e3] bg-white/95 px-3 py-1.5 text-[12px] text-[#5e5e5e] shadow-[var(--g-elev-1)]">
                  None of your observations has a coordinate to place on the map yet.
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
