import React, { useEffect, useState } from 'react';
import { controlApi } from '../services/controlApi.js';
import { Bell, Search, Send, Users, Wrench, AlertTriangle } from 'lucide-react';

interface SelectableUser {
  id: string;
  public_user_id?: string;
  display_name?: string;
  email?: string;
}

interface MaintenanceForm {
  enabled: boolean;
  template: string;
  message: string;
}

const TEMPLATES: Record<string, string> = {
  scheduled: 'Earth Talk is undergoing scheduled maintenance. Please try again shortly.',
  upgrade: 'We are upgrading Earth Talk with new tools. Service will return soon.',
  incident: 'Earth Talk is temporarily unavailable while we resolve a service issue.',
  custom: '',
};

export const UserMessaging: React.FC<{ canManageMaintenance: boolean }> = ({ canManageMaintenance }) => {
  const [mode, setMode] = useState<'selected' | 'all'>('selected');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SelectableUser[]>([]);
  const [selected, setSelected] = useState<SelectableUser[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const [maintenance, setMaintenance] = useState<MaintenanceForm>({
    enabled: false,
    template: 'custom',
    message: '',
  });
  const [maintenanceStatus, setMaintenanceStatus] = useState('');
  const [maintenanceError, setMaintenanceError] = useState('');
  const [savingMaintenance, setSavingMaintenance] = useState(false);

  useEffect(() => {
    let cancelled = false;
    controlApi
      .getMaintenance()
      .then((data: any) => {
        if (cancelled || !data) return;
        setMaintenance({
          enabled: Boolean(data.enabled),
          template: String(data.template || 'custom'),
          message: String(data.message || ''),
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      controlApi
        .searchUsers(term)
        .then((data: any) => {
          if (!cancelled) setResults(Array.isArray(data?.users) ? data.users : []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const toggleUser = (user: SelectableUser) => {
    setSelected((current) => {
      const exists = current.some((item) => item.id === user.id);
      return exists ? current.filter((item) => item.id !== user.id) : [...current, user];
    });
  };

  const sendAnnouncement = async () => {
    setError('');
    setStatus('');
    if (!title.trim() || !message.trim()) {
      setError('Add a title and a message before sending.');
      return;
    }
    if (mode === 'selected' && selected.length === 0) {
      setError('Choose at least one user, or switch to sending to everyone.');
      return;
    }

    setSending(true);
    try {
      const result = await controlApi.sendNotification({
        title: title.trim(),
        message: message.trim(),
        broadcast: mode === 'all',
        recipientUserIds: selected.map((user) => user.id),
      });
      setStatus(`Sent to ${result?.sent ?? 0} of ${result?.recipients ?? 0} recipients.`);
      setTitle('');
      setMessage('');
      if (mode === 'selected') setSelected([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the announcement.');
    } finally {
      setSending(false);
    }
  };

  const saveMaintenance = async () => {
    setMaintenanceError('');
    setMaintenanceStatus('');
    if (maintenance.enabled && !maintenance.message.trim()) {
      setMaintenanceError('A maintenance message is required.');
      return;
    }
    setSavingMaintenance(true);
    try {
      const result = await controlApi.updateMaintenance({
        enabled: maintenance.enabled,
        template: maintenance.template,
        message: maintenance.message,
      });
      const settings = result?.settings;
      if (settings) {
        setMaintenance({
          enabled: Boolean(settings.enabled),
          template: String(settings.template || 'custom'),
          message: String(settings.message || ''),
        });
      }
      setMaintenanceStatus(
        maintenance.enabled ? 'Maintenance mode is active.' : 'Maintenance mode is off.'
      );
    } catch (err) {
      setMaintenanceError(err instanceof Error ? err.message : 'Could not save maintenance settings.');
    } finally {
      setSavingMaintenance(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl border border-[#dadce0] p-6 shadow-2xs">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[#e8f0fe] text-[#0b57d0] flex items-center justify-center">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#1f1f1f]">Send user notification</h2>
            <p className="text-sm text-[#5e5e5e]">Messages appear in each recipient's notification inbox.</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          {(['selected', 'all'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`px-4 py-2 rounded-full text-sm font-medium border cursor-pointer ${
                mode === value
                  ? 'bg-[#0b57d0] text-white border-[#0b57d0]'
                  : 'bg-white text-[#3c4043] border-[#dadce0] hover:bg-[#f0f4f9]'
              }`}
            >
              {value === 'selected' ? 'Selected users' : 'All users'}
            </button>
          ))}
        </div>

        {mode === 'selected' && (
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5e5e5e]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by public ID, email address, or phone hash"
                className="w-full pl-9 pr-3 py-2.5 border border-[#dadce0] rounded-lg text-sm outline-none focus:border-[#0b57d0]"
              />
            </div>

            {selected.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {selected.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => toggleUser(user)}
                    className="px-2.5 py-1 rounded-full bg-[#e8f0fe] text-[#0b57d0] text-xs font-medium cursor-pointer"
                  >
                    {user.display_name || user.public_user_id || user.email || user.id} ×
                  </button>
                ))}
              </div>
            )}

            {results.length > 0 && (
              <div className="mt-3 border border-[#e3e3e3] rounded-lg max-h-52 overflow-y-auto g-scroll">
                {results.map((user) => {
                  const checked = selected.some((item) => item.id === user.id);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => toggleUser(user)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm border-b border-[#f0f4f9] cursor-pointer ${
                        checked ? 'bg-[#e8f0fe]' : 'hover:bg-[#f8fafd]'
                      }`}
                    >
                      <Users className="w-4 h-4 text-[#5e5e5e] shrink-0" />
                      <span className="min-w-0">
                        <span className="block font-medium truncate">
                          {user.display_name || user.public_user_id || user.email || user.id}
                        </span>
                        <span className="block text-xs text-[#5e5e5e] truncate">
                          {user.email || user.public_user_id || user.id}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <label className="block text-xs font-semibold uppercase tracking-wider text-[#5e5e5e] mb-2">
          Title
        </label>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={160}
          placeholder="Announcement title"
          className="w-full px-3 py-2.5 border border-[#dadce0] rounded-lg text-sm outline-none focus:border-[#0b57d0] mb-4"
        />

        <label className="block text-xs font-semibold uppercase tracking-wider text-[#5e5e5e] mb-2">
          Message
        </label>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={500}
          rows={4}
          placeholder="Write the message recipients will see in their inbox"
          className="w-full px-3 py-2.5 border border-[#dadce0] rounded-lg text-sm outline-none focus:border-[#0b57d0] resize-y"
        />

        {error && (
          <p className="mt-3 text-sm text-[#d32f2f] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
          </p>
        )}
        {status && <p className="mt-3 text-sm text-[#137333]">{status}</p>}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => void sendAnnouncement()}
            disabled={sending}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#0b57d0] text-white text-sm font-semibold hover:bg-[#0847ad] disabled:opacity-60 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Sending…' : mode === 'all' ? 'Send to everyone' : 'Send notification'}
          </button>
        </div>
      </section>

      {canManageMaintenance && (
      <section className="bg-white rounded-2xl border border-[#dadce0] p-6 shadow-2xs">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[#fef7e0] text-[#b06000] flex items-center justify-center">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#1f1f1f]">Maintenance mode</h2>
            <p className="text-sm text-[#5e5e5e]">Show a message to everyone using Earth Talk.</p>
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-[#3c4043] cursor-pointer">
          <input
            type="checkbox"
            checked={maintenance.enabled}
            onChange={(event) => setMaintenance({ ...maintenance, enabled: event.target.checked })}
            className="accent-[#0b57d0]"
          />
          Enable maintenance banner
        </label>

        <label className="block text-xs font-semibold uppercase tracking-wider text-[#5e5e5e] mt-4 mb-2">
          Message template
        </label>
        <select
          value={maintenance.template}
          onChange={(event) => {
            const template = event.target.value;
            setMaintenance({
              ...maintenance,
              template,
              message: TEMPLATES[template] ?? '',
            });
          }}
          className="w-full px-3 py-2.5 border border-[#dadce0] rounded-lg text-sm outline-none focus:border-[#0b57d0]"
        >
          <option value="scheduled">Scheduled maintenance</option>
          <option value="upgrade">Upgrade in progress</option>
          <option value="incident">Service incident</option>
          <option value="custom">Custom message</option>
        </select>

        <label className="block text-xs font-semibold uppercase tracking-wider text-[#5e5e5e] mt-4 mb-2">
          Banner message
        </label>
        <textarea
          value={maintenance.message}
          onChange={(event) => setMaintenance({ ...maintenance, message: event.target.value })}
          maxLength={400}
          rows={3}
          placeholder="Write the maintenance message users will see"
          className="w-full px-3 py-2.5 border border-[#dadce0] rounded-lg text-sm outline-none focus:border-[#0b57d0] resize-y"
        />

        {maintenanceError && (
          <p className="mt-3 text-sm text-[#d32f2f] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {maintenanceError}
          </p>
        )}
        {maintenanceStatus && <p className="mt-3 text-sm text-[#137333]">{maintenanceStatus}</p>}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => void saveMaintenance()}
            disabled={savingMaintenance}
            className="px-5 py-2.5 rounded-full bg-[#1f1f1f] text-white text-sm font-semibold hover:bg-[#3c4043] disabled:opacity-60 cursor-pointer"
          >
            {savingMaintenance ? 'Saving…' : 'Save maintenance settings'}
          </button>
        </div>
      </section>
      )}
    </div>
  );
};
