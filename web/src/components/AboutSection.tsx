import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { AboutLayout } from './AboutLayout.js';
import type { LegalSectionItem } from './legal/LegalLayout.js';
import { requestJson } from '../services/http.js';

interface GuideProps {
  onNavigateTab: (tab: 'about' | 'how-it-works') => void;
  onBackToApp: () => void;
}

const CmsAboutRenderer: React.FC<{ page: 'about' | 'how-it-works' } & GuideProps> = ({
  page,
  onNavigateTab,
  onBackToApp,
}) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPage = (targetPage: 'about' | 'how-it-works') => {
    setLoading(true);
    setError(null);
    requestJson<any>(`/api/control/cms/${targetPage}`, {
      errorMessage: (res) => `Unable to load page (${res.status})`,
    })
      .then((payload) => {
        setData({
          ...payload,
          sections: Array.isArray(payload?.sections) ? payload.sections : [],
        });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load content.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPage(page);
  }, [page]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafd] flex items-center justify-center">
        <div className="animate-pulse text-[#5e5e5e] text-sm">Retrieving information...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <AboutLayout
        currentTab={page}
        title={page === 'about' ? 'About Earth Talk' : 'How Earth Talk Works'}
        subtitle="Unable to retrieve this guide right now."
        lastUpdated="Unavailable"
        sections={[]}
        onNavigateTab={onNavigateTab}
        onBackToApp={onBackToApp}
      >
        <div className="rounded-xl border border-[#dadce0] bg-[#f8fafd] p-6 text-center space-y-3">
          <p className="text-sm text-[#5e5e5e]">{error || 'Guide content is currently unavailable.'}</p>
          <button
            type="button"
            onClick={() => loadPage(page)}
            className="g-btn g-btn-filled"
          >
            Try again
          </button>
        </div>
      </AboutLayout>
    );
  }

  const rawSections = Array.isArray(data.sections) ? data.sections : [];
  const sections: LegalSectionItem[] = rawSections.map((s: any) => ({
    id: s.id,
    title: s.title,
    number: s.number || '',
  }));

  return (
    <AboutLayout
      currentTab={page}
      title={data.title}
      subtitle={data.subtitle}
      lastUpdated={data.lastUpdated}
      sections={sections}
      onNavigateTab={onNavigateTab}
      onBackToApp={onBackToApp}
    >
      {/* Dynamic Sections */}
      {rawSections.map((sec: any) => (
        <section key={sec.id} id={sec.id} className="scroll-mt-28 space-y-3">
          <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
            <span className="font-mono text-sm text-[#0b57d0] bg-[#f0f4f9] px-2.5 py-1 rounded-md border border-[#e3e3e3]">
              {sec.number}
            </span>{' '}
            {sec.title}
          </h2>
          <div className="prose prose-stone max-w-none text-[#3c4043] text-[14px] sm:text-[15px] leading-relaxed">
            <ReactMarkdown>{sec.content}</ReactMarkdown>
          </div>
        </section>
      ))}
    </AboutLayout>
  );
};

export const HowItWorksSection: React.FC<GuideProps> = (props) => (
  <CmsAboutRenderer page="how-it-works" {...props} />
);

export const AboutSection: React.FC<GuideProps> = (props) => (
  <CmsAboutRenderer page="about" {...props} />
);

