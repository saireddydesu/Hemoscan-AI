import React, { useState, useMemo } from 'react';
import {
  LayoutDashboard,
  ScanLine,
  History,
  UserCircle,
  Settings,
  LogOut,
  Menu,
  X,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import { FingerprintWorkspace } from './FingerprintWorkspace';
import { HistoryView } from './HistoryView';
import { ProfileView } from './ProfileView';
import { SettingsView } from './SettingsView';
import { ConfirmDialog } from './ConfirmDialog';
import { isSupabaseConfigured } from '../services/supabaseClient';
import type { FlaskIntegrationConfig } from '../services/predictionService';
import type {
  AnalysisRecord,
  BackendConnectionState,
  NavSection,
  UserProfile,
} from '../types';

interface DashboardShellProps {
  user: UserProfile;
  records: AnalysisRecord[];
  historyLoading: boolean;
  flaskConfig: FlaskIntegrationConfig;
  backendStatus: BackendConnectionState;
  reducedMotion: boolean;
  onAnalysisSuccess: (record: AnalysisRecord) => void;
  onToggleSaveReport: (recordId: string) => void;
  onDeleteRecord: (recordId: string) => void;
  onUserUpdated: (updated: UserProfile) => void;
  onUpdateFlaskConfig: (next: FlaskIntegrationConfig) => void;
  onTestConnection: (override?: FlaskIntegrationConfig) => Promise<void>;
  onToggleReducedMotion: (val: boolean) => void;
  onLogout: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

const NAV_ITEMS: { id: NavSection; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'new-analysis', label: 'New Analysis', icon: ScanLine },
  { id: 'history', label: 'Analysis History', icon: History },
  { id: 'profile', label: 'My Profile', icon: UserCircle },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const DashboardShell: React.FC<DashboardShellProps> = ({
  user,
  records,
  historyLoading,
  flaskConfig,
  backendStatus,
  reducedMotion,
  onAnalysisSuccess,
  onToggleSaveReport,
  onDeleteRecord,
  onUserUpdated,
  onUpdateFlaskConfig,
  onTestConnection,
  onToggleReducedMotion,
  onLogout,
  onNotify,
}) => {
  const [activeNav, setActiveNav] = useState<NavSection>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const savedReportsCount = useMemo(
    () => records.filter((r) => r.savedReport).length,
    [records]
  );

  const latestRecord = records[0] || null;

  const firstName = user.fullName.split(' ')[0] || 'Researcher';
  const avatarInitials = user.fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  const navigateTo = (section: NavSection) => {
    setActiveNav(section);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="relative z-10 min-h-screen flex">
      {/* DESKTOP SIDEBAR (Fixed 260px Glass Navigation) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[260px] lg:fixed lg:inset-y-0 hemo-sidebar-glass z-30">
        <div className="h-16 px-6 flex items-center border-b border-white/[0.07]">
          <button
            type="button"
            onClick={() => navigateTo('overview')}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 rounded-lg"
          >
            <BrandMark size="md" />
          </button>
        </div>

        <nav
          aria-label="Primary Workspace Navigation"
          className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 whitespace-nowrap ${
                  isActive
                    ? 'bg-gradient-to-r from-red-600/22 to-red-900/10 text-white border border-red-500/30 shadow-[0_4px_20px_rgba(220,38,38,0.12)]'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-red-400' : 'text-slate-400'
                  }`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/[0.07]">
          <button
            type="button"
            onClick={() => setLogoutModalOpen(true)}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-rose-300 hover:bg-red-950/30 transition-colors whitespace-nowrap"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* MOBILE NAVIGATION DRAWER */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[82vw] h-full hemo-sidebar-glass z-50 flex flex-col">
            <div className="h-16 px-5 flex items-center justify-between border-b border-white/10">
              <BrandMark size="sm" />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-2 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-4 py-5 space-y-1.5">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateTo(item.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-red-600/20 text-white border border-red-500/30'
                        : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-red-400' : 'text-slate-400'
                      }`}
                    />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setLogoutModalOpen(true);
                }}
                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium text-rose-300 hover:bg-red-950/40 transition-colors"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>Logout</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* MAIN CONTENT VIEWPORT */}
      <div className="flex-1 lg:pl-[260px] flex flex-col min-w-0">
        {/* TOP NAVIGATION BAR (Strict <= 64px height for mobile sticky discipline) */}
        <header className="sticky top-0 z-20 h-16 px-4 sm:px-8 flex items-center justify-between gap-4 bg-[#070910]/80 backdrop-blur-xl border-b border-white/[0.07]">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-1 text-slate-300 hover:text-white rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="lg:hidden">
              <BrandMark size="sm" />
            </div>

            <p className="hidden sm:block text-sm text-slate-300 truncate">
              Welcome back, <span className="font-semibold text-white">{firstName}</span>
            </p>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {/* Genuine Live Backend Connection Status Indicator */}
            <button
              type="button"
              onClick={() => navigateTo('settings')}
              title="Configure or test Flask ML backend connection"
              className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-90 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 rounded-lg px-2 py-1"
            >
              {backendStatus.checking ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                  <span className="text-slate-300">Checking ML API…</span>
                </>
              ) : backendStatus.connected && backendStatus.modelLoaded !== false ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">ML Model Ready</span>
                </>
              ) : backendStatus.connected && backendStatus.modelLoaded === false ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-300">Model Not Loaded</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-300">ML API Offline</span>
                </>
              )}
            </button>

            {/* User Profile Avatar */}
            <button
              type="button"
              onClick={() => navigateTo('profile')}
              aria-label="Open researcher profile"
              className="flex items-center gap-2.5 pl-2 pr-1 py-1 rounded-xl hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-600/80 to-rose-950 border border-white/20 flex items-center justify-center text-xs font-display font-semibold text-white">
                {avatarInitials || 'RS'}
              </div>
            </button>
          </div>
        </header>

        {/* WORKSPACE BODY */}
        <main className="flex-1 w-full max-w-[1220px] mx-auto px-4 sm:px-8 py-8 sm:py-10 space-y-8">
          {/* OVERVIEW SECTION */}
          {activeNav === 'overview' && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-display font-semibold text-white tracking-tight">
                    Your Analysis Workspace
                  </h1>
                  <p className="text-sm text-slate-300/80 mt-1.5">
                    Upload fingerprint captures, trigger real-time neural classification, and
                    review verified research reports.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => navigateTo('new-analysis')}
                  className="px-4 py-2.5 text-xs font-medium text-white hemo-crimson-btn rounded-xl inline-flex items-center gap-2 self-start sm:self-auto whitespace-nowrap shrink-0"
                >
                  <ScanLine className="w-3.5 h-3.5" />
                  <span>Open Dedicated Scanner</span>
                </button>
              </div>

              {/* Honest Backend Connection Notice when Disconnected or Model Unloaded */}
              {backendStatus.checked &&
                (!backendStatus.connected || backendStatus.modelLoaded === false) && (
                  <div className="hemo-glass rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1 text-xs sm:text-sm">
                        <p className="font-medium text-white">Model Endpoint Status Notice</p>
                        <p className="text-slate-300/85 leading-relaxed">
                          {!backendStatus.connected
                            ? backendStatus.message
                            : backendStatus.modelError ||
                              'Trained model file (hemoscan_cnn.keras) was not found.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0 pl-8 md:pl-0">
                      <button
                        type="button"
                        disabled={backendStatus.checking}
                        onClick={() => onTestConnection()}
                        className="px-3.5 py-2 text-xs font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${backendStatus.checking ? 'animate-spin' : ''}`}
                        />
                        <span>Retry Check</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => navigateTo('settings')}
                        className="px-3.5 py-2 text-xs font-medium text-white bg-white/10 hover:bg-white/15 border border-white/12 rounded-xl transition-colors whitespace-nowrap"
                      >
                        Integration Setup
                      </button>
                    </div>
                  </div>
                )}

              {/* Summary Metric Cards (Single-Elevation Glass Grid, Tabular Numerals) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div className="hemo-glass hemo-glass-interactive rounded-2xl p-6">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Total Analyses</span>
                  </div>
                  <p className="mt-3 text-3xl font-mono font-semibold tabular-nums text-white">
                    {records.length}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    {isSupabaseConfigured
                      ? 'Synced with Supabase database'
                      : 'Recorded in current workspace session'}
                  </p>
                </div>

                <div className="hemo-glass hemo-glass-interactive rounded-2xl p-6">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Recent Activity</span>
                  </div>
                  <p className="mt-3 text-xl font-display font-semibold text-white truncate">
                    {latestRecord ? latestRecord.predictedClass : 'No Scans Yet'}
                  </p>
                  <p className="mt-2 text-xs font-mono tabular-nums text-slate-400">
                    {latestRecord
                      ? new Date(latestRecord.timestamp).toLocaleDateString(undefined, {
                          month: 'short',
                          day: '2-digit',
                          year: 'numeric',
                        })
                      : 'Upload a fingerprint below to begin'}
                  </p>
                </div>

                <div className="hemo-glass hemo-glass-interactive rounded-2xl p-6">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Saved Reports</span>
                  </div>
                  <p className="mt-3 text-3xl font-mono font-semibold tabular-nums text-white">
                    {savedReportsCount}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    Bookmarked classification summaries
                  </p>
                </div>
              </div>

              {/* Start New Analysis Card */}
              <FingerprintWorkspace
                userId={user.id}
                flaskConfig={flaskConfig}
                backendConnected={backendStatus.connected && backendStatus.modelLoaded !== false}
                standaloneMode={false}
                onAnalysisSuccess={onAnalysisSuccess}
                onToggleSaveReport={onToggleSaveReport}
                onNavigateDashboard={() => navigateTo('overview')}
                onNavigateSettings={() => navigateTo('settings')}
                onNotify={onNotify}
              />

              {/* Recent Analysis Table */}
              <HistoryView
                records={records}
                loading={historyLoading}
                compact
                onStartNewAnalysis={() => {
                  window.scrollTo({ top: 260, behavior: 'smooth' });
                }}
                onToggleSaveReport={onToggleSaveReport}
                onViewAllHistory={() => navigateTo('history')}
              />
            </>
          )}

          {/* NEW ANALYSIS DEDICATED SECTION */}
          {activeNav === 'new-analysis' && (
            <>
              <div>
                <h1 className="text-2xl sm:text-3xl font-display font-semibold text-white tracking-tight">
                  Biometric Fingerprint Scanner
                </h1>
                <p className="text-sm text-slate-300/80 mt-1.5">
                  Submit high-resolution dermal ridge imagery to your machine-learning model for
                  blood group prediction.
                </p>
              </div>

              <FingerprintWorkspace
                userId={user.id}
                flaskConfig={flaskConfig}
                backendConnected={backendStatus.connected && backendStatus.modelLoaded !== false}
                standaloneMode
                onAnalysisSuccess={onAnalysisSuccess}
                onToggleSaveReport={onToggleSaveReport}
                onNavigateDashboard={() => navigateTo('overview')}
                onNavigateSettings={() => navigateTo('settings')}
                onNotify={onNotify}
              />
            </>
          )}

          {/* ANALYSIS HISTORY SECTION */}
          {activeNav === 'history' && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-display font-semibold text-white tracking-tight">
                    Analysis History
                  </h1>
                  <p className="text-sm text-slate-300/80 mt-1.5">
                    Review real CNN fingerprint classifications, filter saved reports, or export
                    datasets as CSV.
                  </p>
                </div>
              </div>

              <HistoryView
                records={records}
                loading={historyLoading}
                onStartNewAnalysis={() => navigateTo('new-analysis')}
                onToggleSaveReport={onToggleSaveReport}
                onDeleteRecord={(id) => setPendingDeleteId(id)}
              />
            </>
          )}

          {/* MY PROFILE SECTION */}
          {activeNav === 'profile' && (
            <>
              <div>
                <h1 className="text-2xl sm:text-3xl font-display font-semibold text-white tracking-tight">
                  Researcher Profile
                </h1>
                <p className="text-sm text-slate-300/80 mt-1.5">
                  Manage your academic identity, laboratory affiliation, and workspace security.
                </p>
              </div>

              <ProfileView
                user={user}
                onUserUpdated={onUserUpdated}
                onRequestLogout={() => setLogoutModalOpen(true)}
                onNotify={onNotify}
              />
            </>
          )}

          {/* SETTINGS SECTION */}
          {activeNav === 'settings' && (
            <>
              <div>
                <h1 className="text-2xl sm:text-3xl font-display font-semibold text-white tracking-tight">
                  Workspace &amp; API Settings
                </h1>
                <p className="text-sm text-slate-300/80 mt-1.5">
                  Configure your Flask machine-learning endpoint, review Supabase setup schemas,
                  and customize visual preferences.
                </p>
              </div>

              <SettingsView
                flaskConfig={flaskConfig}
                backendStatus={backendStatus}
                reducedMotion={reducedMotion}
                onUpdateFlaskConfig={onUpdateFlaskConfig}
                onTestConnection={onTestConnection}
                onToggleReducedMotion={onToggleReducedMotion}
                onNotify={onNotify}
              />
            </>
          )}
        </main>
      </div>

      {/* Logout Confirmation Dialog */}
      <ConfirmDialog
        open={logoutModalOpen}
        title="Sign Out of HemoScan AI?"
        description="Your current research session will close. Unsaved in-memory records not backed by Supabase will clear upon signing out."
        confirmLabel="Sign Out"
        destructive
        onConfirm={() => {
          setLogoutModalOpen(false);
          onLogout();
        }}
        onCancel={() => setLogoutModalOpen(false)}
      />

      {/* Delete Record Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        title="Delete Analysis Record?"
        description="This classification entry will be permanently removed from your analysis history."
        confirmLabel="Delete Record"
        destructive
        onConfirm={() => {
          if (pendingDeleteId) {
            onDeleteRecord(pendingDeleteId);
          }
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
};
