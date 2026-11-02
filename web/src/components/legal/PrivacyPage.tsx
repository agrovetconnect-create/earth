import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { LegalLayout, type LegalSectionItem } from './LegalLayout.js';
import { ShieldCheck } from 'lucide-react';
import { requestJson } from '../../services/http.js';

interface PrivacyPageProps {
  onNavigateTab: (tab: 'terms' | 'privacy') => void;
  onBackToApp: () => void;
}

export const PrivacyPage: React.FC<PrivacyPageProps> = ({ onNavigateTab, onBackToApp }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPrivacy = () => {
    setLoading(true);
    setError(null);
    requestJson<any>('/api/control/cms/privacy', {
      errorMessage: (res) => `Unable to load Privacy Policy (${res.status})`,
    })
      .then((payload) => {
        setData({
          ...payload,
          sections: Array.isArray(payload?.sections) ? payload.sections : [],
        });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load Privacy Policy.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPrivacy();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafd] flex items-center justify-center">
        <div className="animate-pulse text-[#5e5e5e] text-sm">Retrieving Privacy Policy...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <LegalLayout
        currentTab="privacy"
        title="Privacy Policy"
        subtitle="Unable to retrieve the latest Privacy Policy right now."
        lastUpdated="Unavailable"
        sections={[]}
        onNavigateTab={onNavigateTab}
        onBackToApp={onBackToApp}
      >
        <div className="rounded-xl border border-[#dadce0] bg-[#f8fafd] p-6 text-center space-y-3">
          <p className="text-sm text-[#5e5e5e]">{error || 'Privacy Policy content is currently unavailable.'}</p>
          <button
            type="button"
            onClick={loadPrivacy}
            className="g-btn g-btn-filled bg-[#0b57d0] text-white px-4 py-2 rounded-lg text-xs font-medium"
          >
            Try again
          </button>
        </div>
      </LegalLayout>
    );
  }

  const rawSections = Array.isArray(data.sections) ? data.sections : [];
  const sections: LegalSectionItem[] = rawSections.map((s: any) => ({
    id: s.id,
    title: s.title,
    number: s.number || ''
  }));

  return (
    <LegalLayout
      currentTab="privacy"
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
            <span className="font-mono text-[#0b57d0]">{sec.number}.</span> {sec.title}
          </h2>
          <div className="prose prose-stone max-w-none text-[#3c4043] text-[14px] sm:text-[15px] leading-relaxed">
            <ReactMarkdown>{sec.content}</ReactMarkdown>
          </div>
        </section>
      ))}
    </LegalLayout>
  );
};
