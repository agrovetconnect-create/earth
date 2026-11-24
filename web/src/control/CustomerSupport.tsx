import React, { useState } from 'react';
import { controlApi } from '../services/controlApi.js';
import { Search, UserCheck, MessageSquare, Globe, AlertCircle } from 'lucide-react';

export const CustomerSupport: React.FC = () => {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const result = await controlApi.searchUsers(query);
      setUsers(result.users || []);
      setHasSearched(true);
    } catch (err: any) {
      setError(err.message || 'Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-[#1f1f1f]">Customer Support & Lookup</h2>
        <p className="text-sm text-[#5e5e5e]">
          Search contributor accounts by email address, public passport ID, or masked phone hash to assist participants.
        </p>
      </div>

      {/* Search Input Box */}
      <div className="bg-white border border-[#dadce0] rounded-2xl p-6 shadow-xs">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8f8f8f]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by participant email, public ID (e.g. usr_...), or phone hash..."
              className="g-input w-full pl-11 pr-4 h-12 text-sm rounded-xl"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="g-btn g-btn-filled bg-[#0b57d0] hover:bg-[#0842a0] text-white rounded-full px-6 h-12 text-sm font-medium flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-60 shrink-0"
          >
            {loading ? (
              <span>Searching...</span>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Search Records</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results Table */}
      <div className="bg-white border border-[#dadce0] rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 bg-[#f8fafd] border-b border-[#dadce0] flex items-center justify-between">
          <span className="text-xs font-semibold text-[#5e5e5e] uppercase tracking-wider">
            {hasSearched ? `Search Results (${users.length})` : 'Participant Records'}
          </span>
          <span className="text-xs text-[#8f8f8f]">Verified Contributor Registry</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#f8fafd] border-b border-[#dadce0]">
                <th className="px-6 py-3.5 text-xs font-semibold text-[#5e5e5e] uppercase tracking-wider">
                  Public ID
                </th>
                <th className="px-6 py-3.5 text-xs font-semibold text-[#5e5e5e] uppercase tracking-wider">
                  Email Address
                </th>
                <th className="px-6 py-3.5 text-xs font-semibold text-[#5e5e5e] uppercase tracking-wider">
                  Display Name
                </th>
                <th className="px-6 py-3.5 text-xs font-semibold text-[#5e5e5e] uppercase tracking-wider">
                  Channel
                </th>
                <th className="px-6 py-3.5 text-xs font-semibold text-[#5e5e5e] uppercase tracking-wider">
                  Registered
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f4f9]">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-[#8e8e8e] text-sm">
                    {loading
                      ? 'Querying contributor directory...'
                      : hasSearched
                      ? 'No participant accounts found matching this query.'
                      : 'Enter an email, public user ID, or phone hash above to look up account details.'}
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-[#f8fafd] transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-[#0b57d0] font-semibold">
                      {user.public_user_id || user.id?.slice(0, 12)}
                    </td>
                    <td className="px-6 py-4 text-[#1f1f1f]">
                      {user.email || <span className="text-[#8f8f8f]">—</span>}
                    </td>
                    <td className="px-6 py-4 font-medium text-[#1f1f1f]">
                      {user.display_name || <span className="text-[#8f8f8f]">—</span>}
                    </td>
                    <td className="px-6 py-4">
                      {user.created_via === 'whatsapp' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#e6f4ea] text-[#137333]">
                          <MessageSquare className="w-3 h-3" />
                          <span>WhatsApp</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#e8f0fe] text-[#0b57d0]">
                          <Globe className="w-3 h-3" />
                          <span>Web App</span>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-[#5e5e5e] font-mono tabular-nums">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
