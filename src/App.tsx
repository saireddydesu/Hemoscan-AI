/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { BloodCellCanvas } from './components/BloodCellCanvas';
import { AuthPage } from './components/AuthPage';
import { DashboardShell } from './components/DashboardShell';
import { ToastContainer } from './components/ToastContainer';
import { getCurrentSessionUser, signOutUser } from './services/authService';
import {
  checkBackendConnection,
  deleteAnalysisFromSupabase,
  fetchUserAnalysisHistory,
  getDisplayPredictEndpoint,
  loadFlaskConfig,
  saveAnalysisToSupabase,
  saveFlaskConfig,
  type FlaskIntegrationConfig,
} from './services/predictionService';
import { isSupabaseConfigured, supabase } from './services/supabaseClient';
import type {
  AnalysisRecord,
  BackendConnectionState,
  ToastMessage,
  UserProfile,
} from './types';

const REDUCED_MOTION_PREF_KEY = 'hemoscan_reduced_motion_v1';

export default function App() {
  const [authInitializing, setAuthInitializing] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);

  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [flaskConfig, setFlaskConfig] = useState<FlaskIntegrationConfig>(() => loadFlaskConfig());
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    return localStorage.getItem(REDUCED_MOTION_PREF_KEY) === 'true';
  });

  const [backendStatus, setBackendStatus] = useState<BackendConnectionState>({
    checked: false,
    checking: true,
    connected: false,
    endpoint: getDisplayPredictEndpoint(flaskConfig),
    message: 'Checking /api/health model status…',
    formFieldName: flaskConfig.formFieldName,
    useDirectClientFetch: flaskConfig.useDirectClientFetch,
  });

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback(
    (type: 'success' | 'error' | 'info', title: string, description?: string) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, type, title, description }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4800);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const probeBackend = useCallback(
    async (overrideConfig?: FlaskIntegrationConfig) => {
      const cfg = overrideConfig || flaskConfig;
      setBackendStatus((prev) => ({ ...prev, checking: true }));
      const res = await checkBackendConnection(cfg);
      setBackendStatus({
        ...res,
        formFieldName: cfg.formFieldName,
        useDirectClientFetch: cfg.useDirectClientFetch,
      });
    },
    [flaskConfig]
  );

  // Restore session on initial mount
  useEffect(() => {
    let mounted = true;

    async function initSession() {
      try {
        const activeUser = await getCurrentSessionUser();
        if (mounted && activeUser) {
          setUser(activeUser);
        }
      } finally {
        if (mounted) {
          setAuthInitializing(false);
        }
      }
    }

    initSession();

    if (isSupabaseConfigured && supabase) {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setRecords([]);
        }
      });
      return () => {
        mounted = false;
        subscription.unsubscribe();
      };
    }

    return () => {
      mounted = false;
    };
  }, []);

  // Probe ML backend /api/health status on login
  useEffect(() => {
    if (!user) return;
    probeBackend();
  }, [user, probeBackend]);

  // Load real Supabase history when authenticated and Supabase is configured
  useEffect(() => {
    let active = true;
    if (!user) {
      setRecords([]);
      return;
    }

    if (isSupabaseConfigured) {
      setHistoryLoading(true);
      fetchUserAnalysisHistory(user.id)
        .then((loaded) => {
          if (active) setRecords(loaded);
        })
        .finally(() => {
          if (active) setHistoryLoading(false);
        });
    }

    return () => {
      active = false;
    };
  }, [user]);

  const handleAuthenticated = (authenticatedUser: UserProfile, isNewRegistration?: boolean) => {
    setUser(authenticatedUser);
    pushToast(
      'success',
      isNewRegistration ? 'Research Account Created' : 'Authenticated Successfully',
      `Welcome to HemoScan AI, ${authenticatedUser.fullName}.`
    );
  };

  const handleLogout = async () => {
    await signOutUser();
    setUser(null);
    setRecords([]);
    pushToast('info', 'Signed Out', 'Your research workspace session has ended.');
  };

  const handleAnalysisSuccess = async (newRecord: AnalysisRecord) => {
    setRecords((prev) => [newRecord, ...prev]);
    if (isSupabaseConfigured) {
      await saveAnalysisToSupabase(newRecord);
    }
  };

  const handleToggleSaveReport = async (recordId: string) => {
    setRecords((prev) =>
      prev.map((rec) =>
        rec.id === recordId ? { ...rec, savedReport: !rec.savedReport } : rec
      )
    );
    if (isSupabaseConfigured && supabase && user) {
      const target = records.find((r) => r.id === recordId);
      if (target) {
        await supabase
          .from('analysis_history')
          .update({ saved_report: !target.savedReport })
          .eq('id', recordId)
          .eq('user_id', user.id);
      }
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    setRecords((prev) => prev.filter((rec) => rec.id !== recordId));
    if (user && isSupabaseConfigured) {
      await deleteAnalysisFromSupabase(recordId, user.id);
    }
    pushToast('info', 'Record Deleted', `Removed ${recordId} from your workspace log.`);
  };

  const handleUpdateFlaskConfig = (next: FlaskIntegrationConfig) => {
    setFlaskConfig(next);
    saveFlaskConfig(next);
  };

  const handleToggleReducedMotion = (val: boolean) => {
    setReducedMotion(val);
    localStorage.setItem(REDUCED_MOTION_PREF_KEY, String(val));
    pushToast(
      'info',
      val ? 'Reduced Motion Enabled' : 'Background Motion Restored',
      val
        ? 'Microscopic red blood cell animations are now paused.'
        : 'Subtle microscopic cell drift resumed.'
    );
  };

  return (
    <div className="relative min-h-screen bg-[#06070B] text-[#F4F6FB]">
      {/* Immersive Microscopic 3D Red Blood Cell Background */}
      <BloodCellCanvas reducedMotionOverride={reducedMotion} />

      {authInitializing ? (
        <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
          <div className="hemo-glass rounded-2xl px-8 py-6 flex items-center gap-3.5">
            <div className="w-5 h-5 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
            <span className="text-sm font-medium text-slate-200">
              Initializing HemoScan AI Workspace…
            </span>
          </div>
        </div>
      ) : !user ? (
        <AuthPage onAuthenticated={handleAuthenticated} />
      ) : (
        <DashboardShell
          user={user}
          records={records}
          historyLoading={historyLoading}
          flaskConfig={flaskConfig}
          backendStatus={backendStatus}
          reducedMotion={reducedMotion}
          onAnalysisSuccess={handleAnalysisSuccess}
          onToggleSaveReport={handleToggleSaveReport}
          onDeleteRecord={handleDeleteRecord}
          onUserUpdated={setUser}
          onUpdateFlaskConfig={handleUpdateFlaskConfig}
          onTestConnection={probeBackend}
          onToggleReducedMotion={handleToggleReducedMotion}
          onLogout={handleLogout}
          onNotify={pushToast}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
