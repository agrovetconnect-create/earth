import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  FileCode,
  RefreshCw,
  Sparkles,
  Layers,
  Eye,
  EyeOff,
  MessageCircle,
  Hash,
  Play,
  Save,
} from 'lucide-react';
import { appDistributionApi, type AppDistributionData, type DistributionMode } from '../services/appDistributionApi.js';

export const AppDistributionManagement: React.FC = () => {
  const [data, setData] = useState<AppDistributionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Form states
  const [mode, setMode] = useState<DistributionMode>('apk');
  const [isPlayStoreActive, setIsPlayStoreActive] = useState(false);
  const [isGetAppSidebarVisible, setIsGetAppSidebarVisible] = useState(false);
  const [isWhatsAppSidebarVisible, setIsWhatsAppSidebarVisible] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [playStoreUrl, setPlayStoreUrl] = useState('');
  const [versionName, setVersionName] = useState('');
  const [versionCode, setVersionCode] = useState(1);
  const [releaseNotes, setReleaseNotes] = useState('');
  const [minAndroid, setMinAndroid] = useState('Android 8.0 (API 26)+');
  const [packageName, setPackageName] = useState('org.earthtalk.mobile');

  // Selected APK file for upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Status message
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const config = await appDistributionApi.getPublicConfig();
      setData(config);
      setMode(config.mode || 'apk');
      setIsPlayStoreActive(Boolean(config.is_play_store_active));
      setIsGetAppSidebarVisible(Boolean(config.is_get_app_sidebar_visible));
      setIsWhatsAppSidebarVisible(Boolean(config.is_whatsapp_sidebar_visible));
      setWhatsappNumber(config.whatsapp_number || '');
      setPlayStoreUrl(config.play_store_url || '');
      setVersionName(config.version_name || 'v1.0.0');
      setVersionCode(config.version_code || 1);
      setReleaseNotes(config.release_notes || '');
      setMinAndroid(config.min_android || 'Android 8.0 (API 26)+');
      setPackageName(config.package_name || 'org.earthtalk.mobile');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load app distribution settings';
      showToast('error', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.apk')) {
      setFileError('Invalid file: only Android .apk files can be uploaded');
      setSelectedFile(null);
      return;
    }

    setFileError(null);
    setSelectedFile(file);
  };

  const handleUploadApk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setFileError('Please select a compiled .apk file to upload');
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(`Processing ${selectedFile.name} (${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)...`);

      const formData = new FormData();
      formData.append('apk', selectedFile);
      formData.append('version_name', versionName);
      formData.append('version_code', String(versionCode));
      formData.append('release_notes', releaseNotes);

      const res = await appDistributionApi.uploadApk(formData);
      setData(res.config);
      setSelectedFile(null);
      setFileError(null);
      showToast('success', `Successfully published ${res.config.apk_filename} (${res.config.version_name})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to upload APK file';
      showToast('error', msg);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const updates: Partial<AppDistributionData> = {
        mode,
        is_play_store_active: isPlayStoreActive,
        is_get_app_sidebar_visible: isGetAppSidebarVisible,
        is_whatsapp_sidebar_visible: isWhatsAppSidebarVisible,
        whatsapp_number: whatsappNumber.trim(),
        play_store_url: playStoreUrl.trim(),
        version_name: versionName.trim(),
        version_code: Number(versionCode),
        release_notes: releaseNotes.trim(),
        min_android: minAndroid.trim(),
        package_name: packageName.trim(),
      };

      const res = await appDistributionApi.updateConfig(updates);
      setData(res.config);
      showToast('success', 'Sidebar channels and mobile distribution configuration updated successfully');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update distribution configuration';
      showToast('error', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleTestDownload = () => {
    appDistributionApi.triggerDirectDownload(data?.apk_filename || 'earthtalk.apk');
    showToast('success', 'Direct APK download test initiated in browser');
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-[#5e5e5e] text-sm flex items-center justify-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-[#0b57d0]" />
        <span>Loading mobile app distribution configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 border shadow-sm transition-all ${
            toast.type === 'success'
              ? 'bg-[#e6f4ea] border-[#ceead6] text-[#137333]'
              : 'bg-[#fce8e6] border-[#fad2cf] text-[#c5221f]'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-[#188038]" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 text-[#d93025]" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Header & Overview Ribbon */}
      <div className="bg-white rounded-2xl border border-[#dadce0] p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#e8f0fe] text-[#0b57d0] flex items-center justify-center shrink-0 border border-[#d3e3fd]">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-[#1f1f1f]">
                  App &amp; Web Sidebar Channels
                </h1>
              </div>
              <p className="text-xs text-[#5e5e5e] mt-0.5">
                Control Web Sidebar visibility for &ldquo;Start on WhatsApp&rdquo; and &ldquo;Get app&rdquo;, plus Android APK &amp; Play Store distribution
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestDownload}
              className="g-btn g-btn-outlined text-xs h-9 px-3.5 rounded-xl flex items-center gap-1.5 text-[#0b57d0] border-[#dadce0] hover:bg-[#e8f0fe]"
            >
              <Download className="w-4 h-4" />
              <span>Test Download Flow</span>
            </button>
            <button
              type="button"
              onClick={() => void loadData()}
              className="p-2 text-[#5e5e5e] hover:text-[#1f1f1f] hover:bg-[#f0f4f9] rounded-lg transition-colors"
              title="Refresh settings"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-[#f0f4f9]">
          <div className="p-3 rounded-xl bg-[#f8fafd] border border-[#e3e3e3]">
            <div className="text-[11px] text-[#5e5e5e] font-medium">Sidebar &ldquo;Start on WhatsApp&rdquo;</div>
            <div className="text-sm font-bold text-[#1f1f1f] mt-1 flex items-center gap-1.5">
              {isWhatsAppSidebarVisible ? (
                <>
                  <Eye className="w-4 h-4 text-[#188038]" />
                  <span className="text-[#188038]">Visible on Web</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-4 h-4 text-[#5e5e5e]" />
                  <span className="text-[#5e5e5e]">Off (Hidden)</span>
                </>
              )}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#f8fafd] border border-[#e3e3e3]">
            <div className="text-[11px] text-[#5e5e5e] font-medium">Sidebar &ldquo;Get app&rdquo;</div>
            <div className="text-sm font-bold text-[#1f1f1f] mt-1 flex items-center gap-1.5">
              {isGetAppSidebarVisible && ((isPlayStoreActive && Boolean(playStoreUrl)) || Boolean(data?.apk_available)) ? (
                <>
                  <Eye className="w-4 h-4 text-[#188038]" />
                  <span className="text-[#188038]">Visible on Web</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-4 h-4 text-[#5e5e5e]" />
                  <span className="text-[#5e5e5e]">Off (Hidden)</span>
                </>
              )}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#f8fafd] border border-[#e3e3e3]">
            <div className="text-[11px] text-[#5e5e5e] font-medium">Published Version</div>
            <div className="text-sm font-bold text-[#1f1f1f] mt-1 tabular-nums">
              {data?.version_name || 'v1.0.0'} <span className="text-xs font-normal text-[#5e5e5e]">(Code: {data?.version_code || 1})</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#f8fafd] border border-[#e3e3e3]">
            <div className="text-[11px] text-[#5e5e5e] font-medium">Total Downloads Initiated</div>
            <div className="text-sm font-bold text-[#0b57d0] mt-1 tabular-nums">
              {data?.download_count || 0} installs
            </div>
          </div>
        </div>
      </div>

      {/* Web Sidebar Channel Visibility Controls */}
      <div className="bg-white rounded-2xl border border-[#dadce0] p-6 shadow-2xs space-y-5">
        <div className="flex items-center justify-between gap-4 pb-3 border-b border-[#f0f4f9]">
          <div className="flex items-center gap-2.5">
            <Eye className="w-5 h-5 text-[#0b57d0]" />
            <div>
              <h2 className="text-sm font-bold text-[#1f1f1f]">
                Web Sidebar Button Visibility
              </h2>
              <p className="text-xs text-[#5e5e5e]">
                When turned off, the button will not appear in the Earth Talk web sidebar
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveConfig} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Start on WhatsApp Sidebar Toggle */}
            <div className="p-4 rounded-xl border border-[#dadce0] bg-[#f8fafd] space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <MessageCircle className="w-4 h-4 text-[#16a34a] mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-[#1f1f1f]">
                      &ldquo;Start on WhatsApp&rdquo; in Web Sidebar
                    </div>
                    <p className="text-[11px] text-[#5e5e5e] mt-0.5 leading-relaxed">
                      Controls whether the WhatsApp action button appears in the web sidebar. Turn off to hide completely.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isWhatsAppSidebarVisible}
                  onClick={() => setIsWhatsAppSidebarVisible((prev) => !prev)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 ${
                    isWhatsAppSidebarVisible ? 'bg-[#188038]' : 'bg-[#c7c7c7]'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform duration-150 ${
                      isWhatsAppSidebarVisible ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-1 pt-1">
                <label className="block text-[11px] font-semibold text-[#1f1f1f]">
                  WhatsApp Business Number (Optional E.164 digits)
                </label>
                <input
                  type="tel"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="250780000000"
                  className="g-input w-full text-xs font-mono h-9"
                />
              </div>
            </div>

            {/* Get App Sidebar Toggle */}
            <div className="p-4 rounded-xl border border-[#dadce0] bg-[#f8fafd] space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Smartphone className="w-4 h-4 text-[#0b57d0] mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-[#1f1f1f]">
                      &ldquo;Get app&rdquo; in Web Sidebar
                    </div>
                    <p className="text-[11px] text-[#5e5e5e] mt-0.5 leading-relaxed">
                      Controls whether the mobile app download button appears in the web sidebar when an APK or Play Store link is active.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isGetAppSidebarVisible}
                  onClick={() => setIsGetAppSidebarVisible((prev) => !prev)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 ${
                    isGetAppSidebarVisible ? 'bg-[#0b57d0]' : 'bg-[#c7c7c7]'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform duration-150 ${
                      isGetAppSidebarVisible ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <div className="text-[11px] text-[#5e5e5e] pt-1">
                {data?.apk_available || (isPlayStoreActive && Boolean(playStoreUrl))
                  ? 'Active distribution target detected.'
                  : 'Note: Upload a signed .apk or activate a Play Store URL below for the button to appear when enabled.'}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="g-btn g-btn-filled text-xs h-9 px-4 rounded-xl flex items-center gap-2 whitespace-nowrap"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Save Sidebar Visibility</span>
            </button>
          </div>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Google Play Store Transition & Mode Selector */}
        <div className="bg-white rounded-2xl border border-[#dadce0] p-6 shadow-2xs space-y-5">
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#f0f4f9]">
            <Layers className="w-5 h-5 text-[#0b57d0]" />
            <div>
              <h2 className="text-sm font-bold text-[#1f1f1f]">
                Distribution Channel &amp; Google Play Transition
              </h2>
              <p className="text-xs text-[#5e5e5e]">
                Switch from direct APK downloads to Google Play Store once approved
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-4">
            {/* Mode Radio Selection */}
            <div className="space-y-2.5">
              <label className="block text-xs font-semibold text-[#1f1f1f]">
                Sidebar &ldquo;Get app&rdquo; Behavior
              </label>

              {/* Option 1: Direct APK */}
              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                  mode === 'apk' && !isPlayStoreActive
                    ? 'bg-[#e8f0fe] border-[#0b57d0]'
                    : 'bg-[#f8fafd] border-[#dadce0] hover:bg-[#f0f4f9]'
                }`}
              >
                <input
                  type="radio"
                  name="dist_mode"
                  checked={mode === 'apk'}
                  onChange={() => {
                    setMode('apk');
                    setIsPlayStoreActive(false);
                  }}
                  className="mt-0.5 text-[#0b57d0]"
                />
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-[#1f1f1f]">
                    Direct APK Download (Pre-approval Default)
                  </div>
                  <div className="text-[#5e5e5e] leading-relaxed">
                    User clicks "Get app" in sidebar and the APK automatically downloads immediately to their phone/device. Play Store link is kept off.
                  </div>
                </div>
              </label>

              {/* Option 2: Play Store Exclusive */}
              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                  isPlayStoreActive && mode === 'play_store'
                    ? 'bg-[#e6f4ea] border-[#188038]'
                    : 'bg-[#f8fafd] border-[#dadce0] hover:bg-[#f0f4f9]'
                }`}
              >
                <input
                  type="radio"
                  name="dist_mode"
                  checked={isPlayStoreActive && mode === 'play_store'}
                  onChange={() => {
                    setMode('play_store');
                    setIsPlayStoreActive(true);
                  }}
                  className="mt-0.5 text-[#188038]"
                />
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-[#1f1f1f]">
                    Google Play Store Exclusive (Approved on Store)
                  </div>
                  <div className="text-[#5e5e5e] leading-relaxed">
                    Direct APK download turns off. Users clicking "Get app" are redirected directly to your official Google Play Store page.
                  </div>
                </div>
              </label>

              {/* Option 3: Dual Mode */}
              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                  isPlayStoreActive && mode === 'both'
                    ? 'bg-[#e8f0fe] border-[#0b57d0]'
                    : 'bg-[#f8fafd] border-[#dadce0] hover:bg-[#f0f4f9]'
                }`}
              >
                <input
                  type="radio"
                  name="dist_mode"
                  checked={isPlayStoreActive && mode === 'both'}
                  onChange={() => {
                    setMode('both');
                    setIsPlayStoreActive(true);
                  }}
                  className="mt-0.5 text-[#0b57d0]"
                />
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-[#1f1f1f]">
                    Dual Distribution (Play Store + Direct APK Fallback)
                  </div>
                  <div className="text-[#5e5e5e] leading-relaxed">
                    Promotes Google Play Store as primary while retaining direct APK download for field devices without Google services.
                  </div>
                </div>
              </label>
            </div>

            {/* Google Play Store Link Input */}
            <div className="space-y-1.5 pt-2">
              <label className="block text-xs font-semibold text-[#1f1f1f]">
                Google Play Store Listing URL
              </label>
              <div className="relative">
                <input
                  type="url"
                  value={playStoreUrl}
                  onChange={(e) => setPlayStoreUrl(e.target.value)}
                  placeholder="https://play.google.com/store/apps/details?id=org.earthtalk.mobile"
                  className="g-input w-full text-xs font-mono pr-20"
                />
                {playStoreUrl && (
                  <a
                    href={playStoreUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-[#0b57d0] hover:underline flex items-center gap-1"
                  >
                    <span>Test</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <p className="text-[11px] text-[#5e5e5e]">
                The canonical Play Store URL provided in your Google Play Console after approval
              </p>
            </div>

            {/* Application Package Name & Min Android */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#1f1f1f]">
                  Android Package Identifier
                </label>
                <input
                  type="text"
                  value={packageName}
                  onChange={(e) => setPackageName(e.target.value)}
                  className="g-input w-full text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#1f1f1f]">
                  Minimum OS Version
                </label>
                <input
                  type="text"
                  value={minAndroid}
                  onChange={(e) => setMinAndroid(e.target.value)}
                  className="g-input w-full text-xs"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-[#f0f4f9] flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="g-btn g-btn-filled text-xs h-10 px-4 rounded-xl flex items-center gap-2"
              >
                {saving ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Save Channel Configuration</span>
              </button>
            </div>
          </form>
        </div>

        {/* Card 2: Upload APK Binary & Release Metadata */}
        <div className="bg-white rounded-2xl border border-[#dadce0] p-6 shadow-2xs space-y-5">
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#f0f4f9]">
            <Upload className="w-5 h-5 text-[#0b57d0]" />
            <div>
              <h2 className="text-sm font-bold text-[#1f1f1f]">
                Upload New APK Binary
              </h2>
              <p className="text-xs text-[#5e5e5e]">
                Deploy an updated compiled Android application package
              </p>
            </div>
          </div>

          <form onSubmit={handleUploadApk} className="space-y-4">
            {/* Drag & Drop / File Select Box */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#1f1f1f]">
                Select .apk Package File
              </label>

              <div className="border-2 border-dashed border-[#dadce0] hover:border-[#0b57d0] rounded-2xl p-5 text-center transition-colors bg-[#f8fafd] flex flex-col items-center justify-center relative cursor-pointer">
                <input
                  type="file"
                  accept=".apk,application/vnd.android.package-archive"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="w-10 h-10 rounded-full bg-white border border-[#dadce0] flex items-center justify-center text-[#0b57d0] mb-2 shadow-2xs">
                  <Upload className="w-5 h-5" />
                </div>
                {selectedFile ? (
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-[#1f1f1f]">{selectedFile.name}</div>
                    <div className="text-[11px] text-[#0b57d0] font-mono">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to upload
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-[#1f1f1f]">
                      Drag and drop your <strong className="text-[#0b57d0]">.apk</strong> here, or click to browse
                    </div>
                    <div className="text-[11px] text-[#5e5e5e]">
                      Max file size: 150 MB • Target platform: Android ARM64 / Universal
                    </div>
                  </div>
                )}
              </div>

              {fileError && (
                <div className="text-xs text-[#d93025] flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{fileError}</span>
                </div>
              )}
            </div>

            {/* Version Name and Version Code */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#1f1f1f]">
                  Version Name (e.g. v1.1.0)
                </label>
                <input
                  type="text"
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  placeholder="v1.0.0"
                  className="g-input w-full text-xs font-mono"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#1f1f1f]">
                  Version Code (Build #)
                </label>
                <input
                  type="number"
                  min="1"
                  value={versionCode}
                  onChange={(e) => setVersionCode(parseInt(e.target.value, 10) || 1)}
                  className="g-input w-full text-xs font-mono"
                  required
                />
              </div>
            </div>

            {/* Release Notes */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[#1f1f1f]">
                Release Notes & What's New
              </label>
              <textarea
                rows={3}
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
                placeholder="• List improvements, fixes or new geoscience capabilities"
                className="g-textarea w-full text-xs"
              />
            </div>

            {/* Current Installed Binary Hash & Metadata */}
            <div className="p-3 rounded-xl bg-[#f8fafd] border border-[#e3e3e3] text-xs space-y-1.5 font-mono text-[#5e5e5e]">
              <div className="flex items-center justify-between text-[#1f1f1f] font-sans font-semibold text-[11px]">
                <span>Currently Stored Binary:</span>
                <span className="text-[#0b57d0]">{data?.apk_filename || 'earthtalk.apk'}</span>
              </div>
              <div className="truncate text-[10px] flex items-center gap-1">
                <Hash className="w-3 h-3 shrink-0 text-[#747775]" />
                <span className="truncate">SHA256: {data?.apk_sha256 || 'N/A'}</span>
              </div>
              <div className="text-[10px] text-[#747775]">
                Last updated: {data?.updated_at ? new Date(data.updated_at).toLocaleString() : 'N/A'} by {data?.updated_by || 'System'}
              </div>
            </div>

            <div className="pt-3 border-t border-[#f0f4f9] flex justify-end">
              <button
                type="submit"
                disabled={uploading || !selectedFile}
                className="g-btn g-btn-filled text-xs h-10 px-4 rounded-xl flex items-center gap-2 disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{uploadProgress || 'Uploading binary...'}</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload & Publish APK</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
