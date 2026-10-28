import React, { useState } from 'react';
import {
  Server,
  Database,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Eye,
} from 'lucide-react';
import { isSupabaseConfigured } from '../services/supabaseClient';
import type { FlaskIntegrationConfig } from '../services/predictionService';
import type { BackendConnectionState } from '../types';

interface SettingsViewProps {
  flaskConfig: FlaskIntegrationConfig;
  backendStatus: BackendConnectionState;
  reducedMotion: boolean;
  onUpdateFlaskConfig: (next: FlaskIntegrationConfig) => void;
  onTestConnection: (overrideConfig?: FlaskIntegrationConfig) => Promise<void>;
  onToggleReducedMotion: (value: boolean) => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

const FLASK_SAMPLE_SNIPPET = `# Deployed Render Flask API contract (GET /health & POST /predict)
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model_loaded": True}), 200

@app.route("/predict", methods=["POST"])
def predict():
    uploaded = request.files.get("image")
    if not uploaded:
        return jsonify({"success": False, "error": "Upload an image using the 'image' field."}), 400
    predicted_group, confidence, probs = run_your_model(uploaded)
    return jsonify({
        "success": True,
        "blood_group": predicted_group,
        "predicted_class": predicted_group,
        "confidence": confidence,
        "probabilities": probs,
    }), 200`;

const SUPABASE_SQL_SNIPPET = `-- Run in Supabase SQL Editor to enable persistent user analysis history
create table if not exists public.analysis_history (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  file_name text not null,
  file_size_bytes integer default 0,
  predicted_class text not null,
  confidence double precision,
  status text default 'Completed',
  saved_report boolean default true,
  created_at timestamptz default now()
);

alter table public.analysis_history enable row level security;

create policy "Users manage own analysis history"
  on public.analysis_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);`;

export const SettingsView: React.FC<SettingsViewProps> = ({
  flaskConfig,
  backendStatus,
  reducedMotion,
  onUpdateFlaskConfig,
  onTestConnection,
  onToggleReducedMotion,
  onNotify,
}) => {
  const [endpointInput, setEndpointInput] = useState(flaskConfig.customEndpoint);
  const [formField, setFormField] = useState<'file' | 'image'>(flaskConfig.formFieldName);
  const [directFetch, setDirectFetch] = useState(flaskConfig.useDirectClientFetch);
  const [copiedBlock, setCopiedBlock] = useState<'flask' | 'supabase' | null>(null);

  const handleSaveAndTest = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated: FlaskIntegrationConfig = {
      ...flaskConfig,
      customEndpoint: endpointInput.trim(),
      formFieldName: formField,
      useDirectClientFetch: directFetch,
    };
    onUpdateFlaskConfig(updated);
    await onTestConnection(updated);
    onNotify('info', 'Integration Settings Saved', 'Updated Flask API parameters and probed endpoint.');
  };

  const copyCode = async (kind: 'flask' | 'supabase', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedBlock(kind);
      setTimeout(() => setCopiedBlock(null), 2000);
    } catch {
      onNotify('error', 'Clipboard Blocked', 'Unable to copy automatically in this browser frame.');
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Flask ML Backend Integration Configuration */}
      <section className="hemo-glass rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/10">
          <div className="flex items-start gap-3">
            <Server className="w-5 h-5 text-red-400 shrink-0 mt-1" />
            <div>
              <h2 className="text-lg font-semibold text-white">
                Render Flask ML API Integration
              </h2>
              <p className="text-xs sm:text-sm text-slate-300/80 mt-0.5">
                Connected to your deployed Render Flask backend via{' '}
                <span className="font-mono">GET /health</span> and{' '}
                <span className="font-mono">POST /predict</span> (<span className="font-mono">image</span> field).
              </p>
            </div>
          </div>

          <div className="shrink-0">
            {backendStatus.connected && backendStatus.modelLoaded !== false ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  Connected
                  {backendStatus.latencyMs !== undefined ? ` (${backendStatus.latencyMs}ms)` : ''}
                </span>
              </span>
            ) : backendStatus.connected && backendStatus.modelLoaded === false ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300">
                <AlertCircle className="w-4 h-4" />
                <span>Flask Online · Model Not Loaded</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300">
                <AlertCircle className="w-4 h-4" />
                <span>Backend Offline</span>
              </span>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-300/90 bg-black/30 border border-white/8 rounded-xl px-4 py-3 font-mono break-words">
          Active Endpoint: {backendStatus.endpoint} — {backendStatus.message}
        </p>

        <form onSubmit={handleSaveAndTest} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="sm:col-span-2">
              <label
                htmlFor="flask-endpoint"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Render Backend Base URL
              </label>
              <input
                id="flask-endpoint"
                type="url"
                value={endpointInput}
                onChange={(e) => setEndpointInput(e.target.value)}
                placeholder="https://hemoscan-backend.onrender.com"
                className="w-full hemo-input rounded-xl px-4 py-2.5 text-sm font-mono text-white placeholder:text-slate-500"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Defaults to{' '}
                <span className="font-mono text-slate-300">
                  https://hemoscan-backend.onrender.com
                </span>{' '}
                (checks <span className="font-mono text-slate-300">/health</span> and posts to{' '}
                <span className="font-mono text-slate-300">/predict</span>).
              </p>
            </div>

            <div>
              <label
                htmlFor="flask-field-name"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Multipart Form Key
              </label>
              <select
                id="flask-field-name"
                value={formField}
                onChange={(e) => setFormField(e.target.value === 'file' ? 'file' : 'image')}
                className="w-full hemo-input rounded-xl px-3.5 py-2.5 text-sm font-mono text-white"
              >
                <option value="image" className="bg-[#0B0F1A]">
                  image (request.files[&apos;image&apos;])
                </option>
                <option value="file" className="bg-[#0B0F1A]">
                  file (request.files[&apos;file&apos;])
                </option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
            <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={directFetch}
                onChange={(e) => setDirectFetch(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-slate-900 accent-[#DC2626]"
              />
              <span className="text-xs text-slate-300">
                Send requests directly from browser to Render CORS API
              </span>
            </label>

            <button
              type="submit"
              disabled={backendStatus.checking}
              className="px-4 py-2.5 text-xs font-medium text-white hemo-crimson-btn rounded-xl inline-flex items-center gap-2 whitespace-nowrap shrink-0 self-start sm:self-auto"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${backendStatus.checking ? 'animate-spin' : ''}`}
              />
              <span>{backendStatus.checking ? 'Testing Endpoint…' : 'Save & Test Connection'}</span>
            </button>
          </div>
        </form>

        {/* Flask Integration Reference */}
        <div className="pt-4 border-t border-white/10 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-300">
              Expected Flask Endpoint Contract (<span className="font-mono">POST /predict</span>)
            </p>
            <button
              type="button"
              onClick={() => copyCode('flask', FLASK_SAMPLE_SNIPPET)}
              className="text-xs text-slate-300 hover:text-white inline-flex items-center gap-1.5"
            >
              {copiedBlock === 'flask' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Snippet</span>
                </>
              )}
            </button>
          </div>
          <pre className="p-4 rounded-xl bg-[#05070D] border border-white/8 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed">
            <code>{FLASK_SAMPLE_SNIPPET}</code>
          </pre>
        </div>
      </section>

      {/* Supabase Auth & Database Setup Instructions */}
      <section className="hemo-glass rounded-2xl p-6 sm:p-8 space-y-5">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/10">
          <div className="flex items-start gap-3">
            <Database className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold text-white">
                Supabase Authentication &amp; History Database
              </h2>
              <p className="text-xs sm:text-sm text-slate-300/80 mt-0.5">
                {isSupabaseConfigured
                  ? 'Supabase is configured and active for user authentication and cloud history storage.'
                  : 'Optional cloud persistence: add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment to persist user-specific history across devices.'}
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-slate-400 shrink-0">
            {isSupabaseConfigured ? 'Configured' : 'Local Fallback Active'}
          </span>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-300">
              Supabase PostgreSQL Table &amp; RLS Schema
            </p>
            <button
              type="button"
              onClick={() => copyCode('supabase', SUPABASE_SQL_SNIPPET)}
              className="text-xs text-slate-300 hover:text-white inline-flex items-center gap-1.5"
            >
              {copiedBlock === 'supabase' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy SQL</span>
                </>
              )}
            </button>
          </div>
          <pre className="p-4 rounded-xl bg-[#05070D] border border-white/8 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed">
            <code>{SUPABASE_SQL_SNIPPET}</code>
          </pre>
        </div>
      </section>

      {/* Workspace Display & Accessibility Controls */}
      <section className="hemo-glass rounded-2xl p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-2.5 pb-4 border-b border-white/10">
          <Eye className="w-5 h-5 text-red-400" />
          <h2 className="text-lg font-semibold text-white">
            Display &amp; Accessibility Controls
          </h2>
        </div>

        <div className="space-y-4">
          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <div>
              <p className="text-sm font-medium text-white">Reduce Microscopic Background Motion</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Freezes floating red blood cell and particle animations for a static workspace.
              </p>
            </div>
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => onToggleReducedMotion(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-white/20 bg-slate-900 accent-[#DC2626]"
            />
          </label>
        </div>
      </section>
    </div>
  );
};
