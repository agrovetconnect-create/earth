import React, { useEffect, useState } from 'react';
import { controlApi } from '../services/controlApi.js';
import {
  UserPlus,
  Shield,
  Mail,
  Check,
  X,
  Copy,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

export const StaffManagement: React.FC = () => {
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newStaff, setNewStaff] = useState({ email: '', full_name: '', role: 'science' });
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadStaff = async () => {
    try {
      setError(null);
      const data = await controlApi.listStaff();
      setStaff(data.staff);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve staff roster');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const result = await controlApi.createStaff(newStaff);
      setTempPassword(result.temporaryPassword);
      setNewStaff({ email: '', full_name: '', role: 'science' });
      setActionSuccess('Staff member created successfully.');
      loadStaff();
    } catch (err: any) {
      setError(err.message || 'Failed to create staff account');
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    setError(null);
    try {
      await controlApi.updateStaff(id, { is_active: !current });
      setActionSuccess(`Staff member ${current ? 'deactivated' : 'activated'} successfully.`);
      loadStaff();
    } catch (err: any) {
      setError(err.message || 'Failed to update staff status');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-[#5e5e5e] text-sm animate-pulse">
        Loading staff directory...
      </div>
    );
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-[#e8f0fe] text-[#0b57d0]';
      case 'ops':
        return 'bg-[#e6f4ea] text-[#137333]';
      case 'security':
        return 'bg-[#fef7e0] text-[#b06000]';
      case 'science':
        return 'bg-[#f3e8fd] text-[#7627bb]';
      case 'support':
      default:
        return 'bg-[#f0f4f9] text-[#444746]';
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Add Staff Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#1f1f1f]">Staff Management</h2>
          <p className="text-sm text-[#5e5e5e]">
            Manage authorized controllers, assigned operational roles, and platform permissions.
          </p>
        </div>
        <button
          onClick={() => {
            setShowAddForm(true);
            setTempPassword(null);
            setError(null);
            setActionSuccess(null);
          }}
          className="g-btn g-btn-filled bg-[#0b57d0] hover:bg-[#0842a0] text-white rounded-full px-5 py-2.5 text-sm font-medium flex items-center gap-2 cursor-pointer shadow-xs self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Staff Member</span>
        </button>
      </div>

      {/* Alert Notices */}
      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-700 hover:text-red-900 text-xs cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Add Staff Modal/Card */}
      {showAddForm && (
        <div className="bg-white border border-[#dadce0] rounded-2xl p-6 shadow-sm relative space-y-4">
          <div className="flex items-center justify-between border-b border-[#f0f4f9] pb-3">
            <h3 className="text-base font-bold text-[#1f1f1f]">Create New Staff Credential</h3>
            <button
              onClick={() => setShowAddForm(false)}
              className="p-1 rounded-full text-[#5e5e5e] hover:bg-[#f0f4f9] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {tempPassword ? (
            <div className="space-y-4 py-2">
              <div className="p-4 bg-[#e8f0fe] border border-[#d3e3fd] text-[#041e49] text-sm rounded-xl">
                Staff account created successfully. Please securely copy and share this temporary password with the user. For security, it cannot be displayed again.
              </div>
              <div className="flex items-center justify-between gap-4 p-4 bg-[#f8fafd] border border-[#dadce0] rounded-xl font-mono text-base font-bold text-[#1f1f1f]">
                <span className="select-all">{tempPassword}</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(tempPassword)}
                  className="g-btn g-btn-outlined text-xs h-8 px-3 rounded-full flex items-center gap-1.5 text-[#0b57d0] border-[#c7c7c7] hover:bg-white cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="g-btn g-btn-filled bg-[#0b57d0] text-white rounded-full px-6"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#444746] mb-1.5">Full Name</label>
                  <input
                    required
                    type="text"
                    className="g-input w-full rounded-lg h-10 px-3 text-sm"
                    placeholder="e.g. Jane Mwangi"
                    value={newStaff.full_name}
                    onChange={(e) => setNewStaff({ ...newStaff, full_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#444746] mb-1.5">Email Address</label>
                  <input
                    required
                    type="email"
                    className="g-input w-full rounded-lg h-10 px-3 text-sm"
                    placeholder="name@earthtalk.org"
                    value={newStaff.email}
                    onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#444746] mb-1.5">Access Role</label>
                  <select
                    className="g-input w-full rounded-lg h-10 px-3 text-sm"
                    value={newStaff.role}
                    onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}
                  >
                    <option value="science">Science Reviewer</option>
                    <option value="support">Customer Support</option>
                    <option value="ops">Operations</option>
                    <option value="security">Security Officer</option>
                    <option value="owner">Owner (Full Admin)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="g-btn g-btn-text text-xs rounded-full px-4 text-[#5e5e5e] hover:bg-[#f0f4f9] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="g-btn g-btn-filled bg-[#0b57d0] hover:bg-[#0842a0] text-white rounded-full px-6 text-xs font-medium cursor-pointer"
                >
                  Create Account
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Staff Table */}
      <div className="bg-white border border-[#dadce0] rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#f8fafd] border-b border-[#dadce0]">
                <th className="px-6 py-3.5 text-xs font-semibold text-[#5e5e5e] uppercase tracking-wider">
                  Staff Member
                </th>
                <th className="px-6 py-3.5 text-xs font-semibold text-[#5e5e5e] uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3.5 text-xs font-semibold text-[#5e5e5e] uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3.5 text-xs font-semibold text-[#5e5e5e] uppercase tracking-wider">
                  Joined
                </th>
                <th className="px-6 py-3.5 text-xs font-semibold text-[#5e5e5e] uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f4f9]">
              {staff.map((member) => (
                <tr key={member.id} className="hover:bg-[#f8fafd] transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-[#1f1f1f]">{member.full_name || 'Staff Member'}</div>
                    <div className="text-xs text-[#5e5e5e] flex items-center gap-1.5 mt-0.5">
                      <Mail className="w-3 h-3 text-[#8f8f8f]" />
                      <span>{member.email}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getRoleBadge(
                        member.role
                      )}`}
                    >
                      <Shield className="w-3 h-3" />
                      <span>{member.role}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {member.is_active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#e6f4ea] text-[#137333]">
                        <Check className="w-3 h-3" />
                        <span>Active</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#fce8e6] text-[#c5221f]">
                        <X className="w-3 h-3" />
                        <span>Inactive</span>
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs text-[#5e5e5e] tabular-nums font-mono">
                    {new Date(member.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => toggleActive(member.id, member.is_active)}
                      className={`text-xs font-medium hover:underline cursor-pointer ${
                        member.is_active ? 'text-[#c5221f]' : 'text-[#137333]'
                      }`}
                    >
                      {member.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
