import React, { useState } from 'react';
import { User, Building2, ShieldCheck, Save, Loader2, LogOut } from 'lucide-react';
import { updateUserProfile } from '../services/authService';
import type { UserProfile } from '../types';

interface ProfileViewProps {
  user: UserProfile;
  onUserUpdated: (updated: UserProfile) => void;
  onRequestLogout: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  onUserUpdated,
  onRequestLogout,
  onNotify,
}) => {
  const [fullName, setFullName] = useState(user.fullName);
  const [institution, setInstitution] = useState(user.institution);
  const [department, setDepartment] = useState(user.department);
  const [role, setRole] = useState(user.role);
  const [saving, setSaving] = useState(false);

  const initials = user.fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fullName.trim().length < 2) {
      onNotify('error', 'Validation Error', 'Full name must contain at least 2 characters.');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateUserProfile(user, {
        fullName: fullName.trim(),
        institution: institution.trim() || 'Biomedical Engineering Department',
        department: department.trim() || 'Hematology & Pattern Recognition Lab',
        role: role.trim() || 'Research Investigator',
      });
      onUserUpdated(updated);
      onNotify('success', 'Profile Updated', 'Your researcher profile details have been saved.');
    } catch (err) {
      onNotify(
        'error',
        'Update Failed',
        err instanceof Error ? err.message : 'Unable to update profile.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="hemo-glass rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-white/10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-600/35 to-slate-900 border border-red-500/30 flex items-center justify-center text-xl font-display font-bold text-white shrink-0">
              {initials || 'RS'}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">{user.fullName}</h2>
              <p className="text-sm text-slate-300">{user.email}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
                <span>{user.role}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  Joined {new Date(user.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onRequestLogout}
            className="px-4 py-2.5 text-xs font-medium text-rose-200 bg-red-950/40 hover:bg-red-950/70 border border-red-500/30 rounded-xl inline-flex items-center gap-2 transition-colors self-start sm:self-auto whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label
                htmlFor="profile-name"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="profile-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full hemo-input rounded-xl pl-10 pr-4 py-2.5 text-sm text-white"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="profile-role"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Research Role
              </label>
              <input
                id="profile-role"
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full hemo-input rounded-xl px-4 py-2.5 text-sm text-white"
              />
            </div>

            <div>
              <label
                htmlFor="profile-institution"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                University / Institution
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="profile-institution"
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  className="w-full hemo-input rounded-xl pl-10 pr-4 py-2.5 text-sm text-white"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="profile-dept"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Laboratory / Department
              </label>
              <input
                id="profile-dept"
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full hemo-input rounded-xl px-4 py-2.5 text-sm text-white"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 text-sm font-medium text-white hemo-crimson-btn rounded-xl inline-flex items-center gap-2 disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Changes…</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Profile</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Security & Authentication Provider Card */}
      <div className="hemo-glass rounded-2xl p-6 sm:p-8 space-y-3">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <h3 className="text-base font-semibold text-white">
            Authentication &amp; Credential Protection
          </h3>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">
          {user.authProvider === 'supabase'
            ? 'Your workspace is authenticated via Supabase Auth with JWT session tokens and Row-Level Security (RLS) database isolation.'
            : 'Your workspace is running in Encrypted Local Session mode using Web Crypto SHA-256 salted password digests. Plaintext passwords are never stored. Connect VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Settings to enable cloud persistence.'}
        </p>
      </div>
    </div>
  );
};
