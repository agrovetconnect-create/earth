import React, { useEffect, useState } from 'react';
import { Gem, MapPin, MapPinOff, Mountain } from 'lucide-react';
import { fetchPublicObservation } from '../services/publicApi.js';
import type { PublicObservationSummary } from '../types/public.js';

interface GeologicalSiteCardProps {
  post: PublicObservationSummary;
  onClick: () => void;
}

const CONFIDENCE_LABEL: Record<PublicObservationSummary['confidence'], string> = {
  high: 'High confidence',
  moderate: 'Moderate confidence',
  low: 'Low confidence',
  insufficient: 'Insufficient confidence',
};

function classificationLabel(value: PublicObservationSummary['classification']): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export const GeologicalSiteCard: React.FC<GeologicalSiteCardProps> = ({ post, onClick }) => {
  const [imageUrl, setImageUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    setImageUrl(undefined);
    void fetchPublicObservation(post.passport_id, controller.signal)
      .then((detail) => setImageUrl(detail?.primary_media_url || '/1.jpg'))
      .catch(() => setImageUrl('/1.jpg'));
    return () => controller.abort();
  }, [post.passport_id]);

  const title = post.post_title || post.possible_name || 'Untitled observation';
  const description = post.primary_interpretation ?? '';
  const serif = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, "Times New Roman", serif';

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-[#E7DCD1] bg-[#FFFDFC] text-left shadow-[0_2px_10px_rgba(41,34,29,0.05)] transition-shadow hover:shadow-[0_8px_24px_rgba(41,34,29,0.09)]"
      >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#F3E8D6] p-1.5 sm:aspect-[16/9]">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
            loading="lazy"
            onError={() => setImageUrl(null)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[#C45C32]/40">
            <Mountain className="h-14 w-14" strokeWidth={1.2} aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
        <h3
          className="line-clamp-2 text-[18px] leading-tight font-bold text-[#29221D]"
          style={{ fontFamily: serif }}
        >
          {title}
        </h3>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#E8EFDF] px-2.5 py-1 text-[11px] font-medium text-[#244C32]">
            <Gem className="h-3 w-3" aria-hidden="true" />
            {classificationLabel(post.classification)}
          </span>
          <span className="inline-flex items-center rounded-full bg-[#F3E8D6] px-2.5 py-1 text-[11px] font-medium text-[#29221D]">
            {CONFIDENCE_LABEL[post.confidence]}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-[13px] text-[#746D66]">
          <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{post.district ? `${post.district} District` : 'No district'}</span>
        </div>

        {description && (
          <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-[#746D66]">{description}</p>
        )}

        <div className="mt-auto pt-4">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#F8E7DE] px-2.5 py-1 text-[11px] font-medium text-[#8C3B24]">
            <MapPinOff className="h-3 w-3" aria-hidden="true" />
            No published location
          </span>
        </div>
      </div>
    </button>
  );
};
