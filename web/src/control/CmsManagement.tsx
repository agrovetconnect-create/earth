import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { controlApi } from '../services/controlApi.js';
import { 
  FileText, 
  Plus, 
  Trash2, 
  Save, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  History, 
  Eye, 
  Edit3, 
  HelpCircle,
  Undo2
} from 'lucide-react';

interface CmsSection {
  id: string;
  number?: string;
  title: string;
  content: string;
}

interface CmsPageData {
  page: string;
  title: string;
  subtitle: string;
  lastUpdated: string;
  sections: CmsSection[];
}

interface HistoryItem {
  filename: string;
  timestamp: string;
  label: string;
}

export const CmsManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy' | 'about' | 'how-it-works' | 'faqs'>('terms');
  const [pageData, setPageData] = useState<CmsPageData | null>(null);
  const [faqs, setFaqs] = useState<any[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = async (pageKey: string) => {
    if (pageKey === 'faqs') {
      fetchFaqs();
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await controlApi.getCmsPage(pageKey);
      setPageData(data);
      // Also fetch history
      const historyData = await controlApi.getCmsHistory(pageKey);
      setHistory(historyData.history || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch CMS content');
    } finally {
      setLoading(false);
    }
  };

  const fetchFaqs = async () => {
    setLoading(true);
    try {
      const data = await controlApi.getFaqs();
      setFaqs(data.faqs || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch FAQs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(activeTab);
  }, [activeTab]);

  const handleSave = async () => {
    if (!pageData) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await controlApi.updateCmsPage(activeTab, pageData);
      setPageData(updated);
      setMessage(`Successfully published updates to ${tabLabel(activeTab)}.`);
      // Refresh history
      const historyData = await controlApi.getCmsHistory(activeTab);
      setHistory(historyData.history || []);
      setTimeout(() => setMessage(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (filename: string) => {
    if (!window.confirm('Are you sure you want to restore this version? Current changes will be archived.')) return;
    setSaving(true);
    try {
      const restored = await controlApi.restoreCmsRevision(activeTab, filename);
      setPageData(restored);
      setShowHistory(false);
      setMessage(`Successfully restored revision from history.`);
      // Refresh history
      const historyData = await controlApi.getCmsHistory(activeTab);
      setHistory(historyData.history || []);
    } catch (err: any) {
      setError(err.message || 'Failed to restore revision');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSection = () => {
    if (!pageData) return;
    const newId = `sec-${Date.now()}`;
    const newSection: CmsSection = {
      id: newId,
      number: String(pageData.sections.length + 1),
      title: 'New Section Title',
      content: 'Enter detailed guidance and explanations here... (Markdown supported)'
    };
    setPageData({
      ...pageData,
      sections: [...pageData.sections, newSection]
    });
  };

  const handleDeleteSection = (id: string) => {
    if (!pageData) return;
    setPageData({
      ...pageData,
      sections: pageData.sections.filter((s) => s.id !== id)
    });
  };

  const handleUpdateSection = (id: string, field: keyof CmsSection, value: string) => {
    if (!pageData) return;
    setPageData({
      ...pageData,
      sections: pageData.sections.map((s) => s.id === id ? { ...s, [field]: value } : s)
    });
  };

  const togglePreview = (id: string) => {
    setPreviewMode(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const tabLabel = (key: string) => {
    switch (key) {
      case 'terms': return 'Terms of Service';
      case 'privacy': return 'Privacy Policy';
      case 'about': return 'About Earth Talk';
      case 'how-it-works': return 'How It Works';
      case 'faqs': return 'FAQ & Support';
      default: return key;
    }
  };

  const tabs: Array<{ key: 'terms' | 'privacy' | 'about' | 'how-it-works' | 'faqs'; label: string; group: string }> = [
    { key: 'terms', label: 'Terms of Service', group: 'Legal & Transparency' },
    { key: 'privacy', label: 'Privacy Policy', group: 'Legal & Transparency' },
    { key: 'about', label: 'About Earth Talk', group: 'About & Guide' },
    { key: 'how-it-works', label: 'How It Works', group: 'About & Guide' },
    { key: 'faqs', label: 'Common FAQs', group: 'About & Guide' },
  ];

  return (
    <div className="space-y-6 relative">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#1f1f1f]">CMS Content Management</h2>
          <p className="text-sm text-[#5e5e5e]">
            Edit, add, or delete live public copy. Markdown is supported for rich text formatting.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          {activeTab !== 'faqs' && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`g-btn g-btn-outlined text-xs h-10 px-3.5 rounded-full flex items-center gap-1.5 border-[#dadce0] cursor-pointer transition-colors ${
                showHistory ? 'bg-[#e8f0fe] text-[#0b57d0] border-[#0b57d0]' : 'text-[#5e5e5e] hover:bg-[#f0f4f9]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>History</span>
            </button>
          )}
          <button
            onClick={() => fetchPage(activeTab)}
            disabled={loading || saving}
            className="g-btn g-btn-outlined text-xs h-10 px-3.5 rounded-full flex items-center gap-1.5 text-[#5e5e5e] border-[#dadce0] hover:bg-[#f0f4f9] cursor-pointer"
            title="Reload content from server"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Reload</span>
          </button>
          {activeTab !== 'faqs' && (
            <button
              onClick={handleSave}
              disabled={saving || !pageData}
              className="g-btn g-btn-filled bg-[#0b57d0] hover:bg-[#0842a0] text-white rounded-full px-6 h-10 text-sm font-medium flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Publishing...' : 'Publish Changes'}</span>
            </button>
          )}
        </div>
      </div>

      {/* History Sidebar/Overlay */}
      {showHistory && (
        <div className="absolute top-20 right-0 z-40 w-80 bg-white border border-[#dadce0] rounded-2xl shadow-xl p-4 animate-in slide-in-from-right-4 duration-200">
          <div className="flex items-center justify-between mb-4 border-b border-[#f0f4f9] pb-2">
            <h3 className="text-sm font-bold text-[#1f1f1f]">Revision History</h3>
            <button onClick={() => setShowHistory(false)} className="text-[#5e5e5e] hover:text-[#1f1f1f]">
              <Undo2 className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto g-scroll pr-1">
            {history.length === 0 ? (
              <p className="text-xs text-[#8f8f8f] text-center py-8 italic">No previous versions found.</p>
            ) : (
              history.map((item) => (
                <div key={item.filename} className="p-3 border border-[#f0f4f9] rounded-xl hover:bg-[#f8fafd] group">
                  <div className="text-xs font-semibold text-[#1f1f1f]">{item.label}</div>
                  <div className="text-[10px] text-[#8f8f8f] mt-1 font-mono">{item.timestamp}</div>
                  <button 
                    onClick={() => handleRestore(item.filename)}
                    className="mt-2 w-full py-1.5 bg-[#f0f4f9] group-hover:bg-[#e8f0fe] text-[#0b57d0] text-[11px] font-bold rounded-lg transition-colors"
                  >
                    Restore this version
                  </button>
                </div>
              ))
            )}
          </div>
          <p className="mt-4 text-[10px] text-[#8f8f8f] leading-tight border-t border-[#f0f4f9] pt-2 italic">
            Note: Restoring a version will create a new history entry for your current content.
          </p>
        </div>
      )}

      {/* Notifications */}
      {message && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl flex items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{message}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-emerald-700 hover:text-emerald-900 text-xs cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-700 hover:text-red-900 text-xs cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Page Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-[#f0f4f9] rounded-xl">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-2 ${
                isActive
                  ? 'bg-white text-[#0b57d0] shadow-2xs'
                  : 'text-[#5e5e5e] hover:text-[#1f1f1f] hover:bg-white/60'
              }`}
            >
              {tab.key === 'faqs' ? <HelpCircle className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-20 text-center text-[#5e5e5e] text-sm animate-pulse">
          Loading {tabLabel(activeTab)}...
        </div>
      ) : activeTab === 'faqs' ? (
        <div className="space-y-4">
          <div className="bg-white border border-[#dadce0] rounded-2xl p-6 shadow-xs">
            <h3 className="text-sm font-semibold text-[#1f1f1f] uppercase tracking-wider mb-4 border-b pb-2">
              Common Frequently Asked Questions (Read-Only)
            </h3>
            <div className="space-y-6">
              {faqs.map((faq, i) => (
                <div key={i} className="space-y-2">
                  <div className="text-sm font-bold text-[#1f1f1f] flex items-start gap-2">
                    <span className="text-[#0b57d0]">Q:</span>
                    <span>{faq.question}</span>
                  </div>
                  <div className="text-sm text-[#5e5e5e] pl-6 italic">
                    <span className="text-[#137333] font-bold not-italic">A: </span>
                    {faq.answer}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-8 text-xs text-[#8f8f8f] bg-[#f8fafd] p-3 rounded-lg border border-dashed border-[#dadce0]">
              Note: FAQs are currently pulled from the system common query engine and are managed by the support automation service.
            </p>
          </div>
        </div>
      ) : pageData ? (
        <div className="space-y-6">
          {/* Metadata Card */}
          <div className="bg-white border border-[#dadce0] rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#f0f4f9] pb-3">
              <h3 className="text-sm font-semibold text-[#1f1f1f] uppercase tracking-wider">
                Header & Introduction Metadata
              </h3>
              <span className="text-xs text-[#8f8f8f]">Public Banner Area</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#444746] mb-1.5">Page Title (Heading 1)</label>
                <input
                  type="text"
                  value={pageData.title}
                  onChange={(e) => setPageData({ ...pageData, title: e.target.value })}
                  className="g-input w-full rounded-lg h-10 px-3 text-sm font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#444746] mb-1.5">Last Updated Date or Notice</label>
                <input
                  type="text"
                  value={pageData.lastUpdated}
                  onChange={(e) => setPageData({ ...pageData, lastUpdated: e.target.value })}
                  className="g-input w-full rounded-lg h-10 px-3 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#444746] mb-1.5">Page Subtitle & Executive Summary</label>
              <textarea
                value={pageData.subtitle}
                onChange={(e) => setPageData({ ...pageData, subtitle: e.target.value })}
                rows={3}
                className="g-input w-full rounded-lg text-sm p-3 leading-relaxed"
              />
            </div>
          </div>

          {/* Sections List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#1f1f1f] uppercase tracking-wider">
                  Page Sections ({pageData.sections.length})
                </h3>
                <p className="text-xs text-[#5e5e5e]">Markdown supported for content formatting.</p>
              </div>
              <button
                onClick={handleAddSection}
                className="g-btn g-btn-outlined rounded-full text-xs h-9 px-4 flex items-center gap-1.5 text-[#0b57d0] border-[#c7c7c7] hover:border-[#0b57d0] hover:bg-[#e8f0fe] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Section</span>
              </button>
            </div>

            {pageData.sections.map((sec, idx) => {
              const isPreview = previewMode[sec.id];
              return (
                <div
                  key={sec.id}
                  className="bg-white border border-[#dadce0] rounded-2xl p-5 sm:p-6 shadow-xs space-y-3.5 relative transition-shadow hover:border-[#c7c7c7]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="w-7 h-7 rounded-full bg-[#e8f0fe] text-[#0b57d0] font-mono text-xs font-bold flex items-center justify-center shrink-0">
                        {sec.number || idx + 1}
                      </span>
                      <input
                        type="text"
                        value={sec.title}
                        onChange={(e) => handleUpdateSection(sec.id, 'title', e.target.value)}
                        className="g-input font-semibold text-sm flex-1 h-10 px-3.5 rounded-lg"
                        placeholder="Section Title"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => togglePreview(sec.id)}
                        className={`p-2 rounded-lg transition-colors cursor-pointer shrink-0 ${
                          isPreview ? 'bg-[#e8f0fe] text-[#0b57d0]' : 'text-[#5e5e5e] hover:bg-[#f0f4f9]'
                        }`}
                        title={isPreview ? "Edit mode" : "Preview mode"}
                      >
                        {isPreview ? <Edit3 className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleDeleteSection(sec.id)}
                        className="p-2 text-[#5e5e5e] hover:text-[#d32f28] hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
                        title="Delete section"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    {isPreview ? (
                      <div className="prose prose-sm max-w-none p-4 bg-[#f8fafd] border border-[#e3e3e3] rounded-xl min-h-[120px]">
                        <ReactMarkdown>{sec.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <textarea
                        value={sec.content}
                        onChange={(e) => handleUpdateSection(sec.id, 'content', e.target.value)}
                        rows={4}
                        className="g-input w-full text-sm font-mono p-3.5 leading-relaxed rounded-lg"
                        placeholder="Enter section body copy... (Markdown supported)"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};
