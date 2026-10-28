import { isSupabaseConfigured, supabase } from './supabaseClient';
import type { AnalysisRecord, BackendConnectionState } from '../types';

export const DEFAULT_RENDER_BACKEND_URL = 'https://hemoscan-backend.onrender.com';
const SETTINGS_STORAGE_KEY = 'hemoscan_render_config_v1';

export interface FlaskIntegrationConfig {
  customEndpoint: string;
  formFieldName: 'file' | 'image';
  useDirectClientFetch: boolean;
}

const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const ENV_FLASK_URL = (
  metaEnv?.VITE_FLASK_API_URL ||
  metaEnv?.VITE_API_BASE_URL ||
  DEFAULT_RENDER_BACKEND_URL
).trim();

export function normalizeFlaskBaseUrl(rawUrl: string): string {
  return rawUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(api\/)?(predict|health)$/i, '');
}

/**
 * Uses only CORS-safelisted request headers for cross-origin Render requests
 * so browser GET /health and multipart/form-data POST /predict remain CORS
 * simple requests without triggering unnecessary preflight failures.
 */
function buildCorsSafeHeaders(targetUrl: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (targetUrl.toLowerCase().includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }
  return headers;
}

const DEFAULT_CONFIG: FlaskIntegrationConfig = {
  customEndpoint: normalizeFlaskBaseUrl(ENV_FLASK_URL),
  formFieldName: 'image',
  useDirectClientFetch: true,
};

export function loadFlaskConfig(): FlaskIntegrationConfig {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<FlaskIntegrationConfig>;
    const savedEndpoint =
      typeof parsed.customEndpoint === 'string' && parsed.customEndpoint.trim()
        ? normalizeFlaskBaseUrl(parsed.customEndpoint)
        : DEFAULT_CONFIG.customEndpoint;

    return {
      customEndpoint: savedEndpoint,
      formFieldName: parsed.formFieldName === 'file' ? 'file' : 'image',
      useDirectClientFetch:
        typeof parsed.useDirectClientFetch === 'boolean'
          ? parsed.useDirectClientFetch
          : DEFAULT_CONFIG.useDirectClientFetch,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveFlaskConfig(config: FlaskIntegrationConfig): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(config));
}

export function resolveActiveBackendBaseUrl(config: FlaskIntegrationConfig): string {
  const candidate = (config.customEndpoint || ENV_FLASK_URL || DEFAULT_RENDER_BACKEND_URL).trim();
  return normalizeFlaskBaseUrl(candidate || DEFAULT_RENDER_BACKEND_URL);
}

export function getDisplayPredictEndpoint(config: FlaskIntegrationConfig): string {
  return `${resolveActiveBackendBaseUrl(config)}/predict`;
}

function isSameAsFrontendOrigin(candidateUrl: string): boolean {
  if (typeof window === 'undefined' || !candidateUrl) return false;
  try {
    const parsed = new URL(candidateUrl, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Calls GET {baseUrl}/health on the deployed Render Flask backend to verify
 * server availability, loaded Keras model status, and supported blood-group classes.
 */
async function probeRenderHealthEndpoint(
  baseUrl: string
): Promise<Omit<BackendConnectionState, 'formFieldName' | 'useDirectClientFetch'>> {
  const cleanBase = normalizeFlaskBaseUrl(baseUrl);
  const healthUrl = `${cleanBase}/health`;
  const predictEndpoint = `${cleanBase}/predict`;
  const start = performance.now();

  const controller = new AbortController();
  // Allow up to 55 seconds in case Render free-tier service is waking from cold start
  const timer = setTimeout(() => controller.abort(), 55000);

  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      mode: 'cors',
      headers: buildCorsSafeHeaders(cleanBase),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const latencyMs = Math.max(1, Math.round(performance.now() - start));
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const rawText = await res.text();
    const trimmed = rawText.trim();

    if (res.status === 502 || res.status === 503 || res.status === 504) {
      let jsonError: string | undefined;
      try {
        const errObj = JSON.parse(trimmed) as Record<string, unknown>;
        if (typeof errObj.error === 'string') jsonError = errObj.error;
      } catch {
        // Non-JSON gateway body
      }
      return {
        checked: true,
        checking: false,
        connected: false,
        endpoint: predictEndpoint,
        latencyMs,
        message:
          jsonError ||
          `Render backend (${healthUrl}) returned HTTP ${res.status}. The service may still be waking up or restarting — click Retry Check in a few seconds.`,
      };
    }

    if (contentType.includes('text/html') || trimmed.startsWith('<')) {
      return {
        checked: true,
        checking: false,
        connected: false,
        endpoint: predictEndpoint,
        latencyMs,
        message: `Health check at ${healthUrl} returned HTML (HTTP ${res.status}) instead of JSON. Verify your Render backend URL.`,
      };
    }

    let parsed: Record<string, unknown> | null = null;
    try {
      const candidate = JSON.parse(trimmed);
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        parsed = candidate as Record<string, unknown>;
      }
    } catch {
      parsed = null;
    }

    if (!parsed) {
      return {
        checked: true,
        checking: false,
        connected: false,
        endpoint: predictEndpoint,
        latencyMs,
        message: `Invalid JSON returned from ${healthUrl} (HTTP ${res.status}).`,
      };
    }

    const statusOk = res.ok && (parsed.status === undefined || parsed.status === 'ok');
    const modelLoaded =
      typeof parsed.model_loaded === 'boolean' ? parsed.model_loaded : statusOk;
    const modelVersion =
      typeof parsed.model_version === 'string' ? parsed.model_version : undefined;
    const classesCount = Array.isArray(parsed.classes) ? parsed.classes.length : undefined;
    const modelError =
      typeof parsed.model_error === 'string' && parsed.model_error
        ? parsed.model_error
        : typeof parsed.error === 'string' && parsed.error
          ? parsed.error
          : undefined;

    return {
      checked: true,
      checking: false,
      connected: statusOk,
      modelLoaded,
      modelVersion,
      modelError,
      endpoint: predictEndpoint,
      latencyMs,
      message: !statusOk
        ? modelError || `Health check at ${healthUrl} returned HTTP ${res.status}.`
        : modelLoaded
          ? `Connected to Render Flask API (${modelVersion || 'model loaded'}${
              classesCount ? `, ${classesCount} classes` : ''
            }).`
          : modelError || 'Render Flask server is online, but the trained model failed to load.',
    };
  } catch (err) {
    clearTimeout(timer);

    // If direct browser fetch failed due to CORS or gateway error without CORS headers,
    // verify via same-origin /api/backend-status proxy to get the exact HTTP status from Render.
    try {
      const proxyRes = await fetch(
        `/api/backend-status?endpoint=${encodeURIComponent(cleanBase)}`,
        { headers: { Accept: 'application/json' } }
      );
      const proxyJson = (await proxyRes.json()) as {
        connected?: boolean;
        modelLoaded?: boolean;
        modelVersion?: string;
        modelError?: string;
        endpoint?: string;
        latencyMs?: number;
        message?: string;
      };
      if (typeof proxyJson.connected === 'boolean') {
        return {
          checked: true,
          checking: false,
          connected: proxyJson.connected,
          modelLoaded: proxyJson.modelLoaded,
          modelVersion: proxyJson.modelVersion,
          modelError: proxyJson.modelError,
          endpoint: proxyJson.endpoint || predictEndpoint,
          latencyMs: proxyJson.latencyMs,
          message:
            proxyJson.message ||
            `Could not connect to Render backend at ${healthUrl}.`,
        };
      }
    } catch {
      // Proxy unavailable (e.g. static hosting)
    }

    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    return {
      checked: true,
      checking: false,
      connected: false,
      endpoint: predictEndpoint,
      message: isAbort
        ? `Timed out waiting for ${healthUrl} (Render cold start exceeded 55s). Click Retry Check.`
        : `Unable to reach ${healthUrl} (CORS or network error). Ensure your Render Flask service is running and has flask_cors enabled.`,
    };
  }
}

export async function checkBackendConnection(
  config: FlaskIntegrationConfig
): Promise<Omit<BackendConnectionState, 'formFieldName' | 'useDirectClientFetch'>> {
  const activeBase = resolveActiveBackendBaseUrl(config);

  if (isSameAsFrontendOrigin(activeBase)) {
    return {
      checked: true,
      checking: false,
      connected: false,
      endpoint: `${activeBase}/predict`,
      message:
        'Backend URL points to this frontend website instead of your deployed Render Flask backend (https://hemoscan-backend.onrender.com).',
    };
  }

  if (!config.useDirectClientFetch) {
    try {
      const res = await fetch(
        `/api/backend-status?endpoint=${encodeURIComponent(activeBase)}`,
        { headers: { Accept: 'application/json' } }
      );
      const data = (await res.json()) as {
        connected?: boolean;
        modelLoaded?: boolean;
        modelVersion?: string;
        modelError?: string;
        endpoint?: string;
        latencyMs?: number;
        message?: string;
      };
      return {
        checked: true,
        checking: false,
        connected: Boolean(data.connected),
        modelLoaded: data.modelLoaded,
        modelVersion: data.modelVersion,
        modelError: data.modelError,
        endpoint: data.endpoint || `${activeBase}/predict`,
        latencyMs: data.latencyMs,
        message: data.message || `Checked ${activeBase}/health.`,
      };
    } catch {
      // Fall back to direct browser health check
    }
  }

  return probeRenderHealthEndpoint(activeBase);
}

export interface PredictionResultPayload {
  predictedClass: string;
  confidence: number | null;
  classProbabilities: Record<string, number> | null;
  modelVersion?: string;
  experimental?: boolean;
  notice?: string;
  rawResponse: Record<string, unknown>;
}

/**
 * Parses and validates the JSON response returned by Flask POST /predict:
 * {
 *   "success": true,
 *   "blood_group": "AB-",
 *   "predicted_class": "AB-",
 *   "confidence": 0.61227,
 *   "probabilities": { "A+": ..., "O-": ... },
 *   "model_version": "hemoscan_cnn.keras",
 *   "experimental": true,
 *   "notice": "..."
 * }
 * Never fabricates predictions or confidence values on error.
 */
export function parsePredictionHttpResponse(
  status: number,
  ok: boolean,
  redirected: boolean,
  contentType: string,
  rawText: string,
  requestedUrl: string
): PredictionResultPayload {
  const trimmed = rawText.trim();
  const lowerContentType = contentType.toLowerCase();

  // Handle Render / Gunicorn reverse-proxy gateway errors (502, 503, 504) clearly
  if (status === 502 || status === 503 || status === 504) {
    if (trimmed.startsWith('{')) {
      try {
        const errPayload = JSON.parse(trimmed) as Record<string, unknown>;
        const specificMsg =
          (typeof errPayload.error === 'string' && errPayload.error) ||
          (typeof errPayload.message === 'string' && errPayload.message);
        if (specificMsg) {
          throw new Error(specificMsg);
        }
      } catch (e) {
        if (e instanceof Error && !e.message.includes('JSON')) {
          throw e;
        }
      }
    }

    if (status === 502) {
      throw new Error(
        `Render backend (${requestedUrl}) returned HTTP 502 Bad Gateway. The Gunicorn/TensorFlow worker timed out or exceeded Render's memory limit while running inference.`
      );
    }
    if (status === 503) {
      throw new Error(
        `Render backend (${requestedUrl}) is temporarily unavailable (HTTP 503) — the service may still be waking up. Wait a moment and click Retry Analysis.`
      );
    }
    throw new Error(
      `Render backend (${requestedUrl}) timed out (HTTP 504 Gateway Timeout) while processing the fingerprint image.`
    );
  }

  if (redirected && (lowerContentType.includes('text/html') || trimmed.startsWith('<'))) {
    throw new Error(
      `Prediction request to ${requestedUrl} was redirected to an HTML page (HTTP ${status}) instead of returning JSON.`
    );
  }

  const looksLikeHtml =
    lowerContentType.includes('text/html') ||
    trimmed.toLowerCase().startsWith('<!doctype html') ||
    trimmed.toLowerCase().startsWith('<html');

  if (looksLikeHtml) {
    throw new Error(
      `Backend endpoint ${requestedUrl} returned an HTML page (HTTP ${status}) instead of JSON.`
    );
  }

  if (!trimmed) {
    throw new Error(
      `Backend at ${requestedUrl} returned an empty response body (HTTP ${status}).`
    );
  }

  let payload: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    const preview = trimmed.replace(/\s+/g, ' ').slice(0, 120);
    throw new Error(
      `Backend at ${requestedUrl} returned non-JSON text (HTTP ${status}): "${preview}".`
    );
  }

  if (!payload) {
    throw new Error(
      `Unexpected JSON response structure from ${requestedUrl} (HTTP ${status}).`
    );
  }

  if (!ok || payload.success === false) {
    const serverError =
      (typeof payload.error === 'string' && payload.error) ||
      (typeof payload.message === 'string' && payload.message) ||
      (typeof payload.detail === 'string' && payload.detail) ||
      `Backend prediction request failed with HTTP ${status}.`;
    throw new Error(serverError);
  }

  const dataSource =
    payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
      ? (payload.data as Record<string, unknown>)
      : payload;

  const rawClass =
    dataSource.blood_group ??
    dataSource.predicted_class ??
    dataSource.prediction ??
    dataSource.bloodGroup ??
    dataSource.predictedClass ??
    dataSource.class ??
    dataSource.label ??
    dataSource.result;

  if (typeof rawClass !== 'string' || !rawClass.trim()) {
    throw new Error(
      'Backend JSON response did not contain a valid "blood_group" or "predicted_class" field.'
    );
  }

  let confidence: number | null = null;
  const rawConf =
    dataSource.confidence ??
    dataSource.probability ??
    dataSource.score ??
    dataSource.accuracy;

  if (typeof rawConf === 'number' && Number.isFinite(rawConf)) {
    confidence = rawConf >= 0 && rawConf <= 1 ? rawConf * 100 : rawConf;
  } else if (typeof rawConf === 'string' && rawConf.trim()) {
    const hasPercent = rawConf.includes('%');
    const parsedNum = parseFloat(rawConf.replace('%', '').trim());
    if (Number.isFinite(parsedNum)) {
      confidence = !hasPercent && parsedNum >= 0 && parsedNum <= 1 ? parsedNum * 100 : parsedNum;
    }
  }

  let classProbabilities: Record<string, number> | null = null;
  const rawProbs = dataSource.probabilities ?? dataSource.class_probabilities;
  if (rawProbs && typeof rawProbs === 'object' && !Array.isArray(rawProbs)) {
    const probsObj = rawProbs as Record<string, unknown>;
    const numericEntries: [string, number][] = [];
    for (const [k, v] of Object.entries(probsObj)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        numericEntries.push([k, v]);
      }
    }
    if (numericEntries.length > 0) {
      const sum = numericEntries.reduce((acc, [, val]) => acc + val, 0);
      const isNormalizedUnitScale =
        sum > 0 && sum <= 1.05 && numericEntries.every(([, v]) => v <= 1);
      const probs: Record<string, number> = {};
      for (const [k, v] of numericEntries) {
        probs[k] = isNormalizedUnitScale ? v * 100 : v;
      }
      classProbabilities = probs;
    }
  }

  const modelVersion =
    typeof dataSource.model_version === 'string' ? dataSource.model_version : undefined;
  const experimental =
    typeof dataSource.experimental === 'boolean' ? dataSource.experimental : true;
  const notice = typeof dataSource.notice === 'string' ? dataSource.notice : undefined;

  return {
    predictedClass: rawClass.trim(),
    confidence,
    classProbabilities,
    modelVersion,
    experimental,
    notice,
    rawResponse: payload,
  };
}

/**
 * Sends the selected fingerprint image to POST {baseUrl}/predict using multipart/form-data
 * with field name "image" (default). Handles CORS, Render cold-start timeouts, and HTTP
 * gateway errors cleanly without ever generating fake predictions.
 */
export async function runFingerprintPrediction(
  file: File,
  config: FlaskIntegrationConfig
): Promise<PredictionResultPayload> {
  if (!file || file.size === 0) {
    throw new Error('Cannot analyze an empty or missing image file.');
  }

  const activeBase = resolveActiveBackendBaseUrl(config);
  const directPredictUrl = `${activeBase}/predict`;
  const fieldKey: 'image' | 'file' = config.formFieldName || 'image';

  if (isSameAsFrontendOrigin(activeBase)) {
    throw new Error(
      `Configured backend URL (${activeBase}) points to the frontend website instead of your Render Flask backend (${DEFAULT_RENDER_BACKEND_URL}).`
    );
  }

  // Build multipart/form-data payload with field name "image"
  const buildFormData = (key: 'image' | 'file') => {
    const fd = new FormData();
    fd.append(key, file, file.name);
    return fd;
  };

  if (config.useDirectClientFetch) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 65000);

    try {
      const res = await fetch(directPredictUrl, {
        method: 'POST',
        mode: 'cors',
        headers: buildCorsSafeHeaders(directPredictUrl),
        body: buildFormData(fieldKey),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const text = await res.text();
      return parsePredictionHttpResponse(
        res.status,
        res.ok,
        res.redirected,
        res.headers.get('content-type') || '',
        text,
        directPredictUrl
      );
    } catch (err) {
      clearTimeout(timer);

      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(
          `Request to ${directPredictUrl} timed out after 65 seconds. The Render service may be experiencing a cold start or heavy CPU load — please click Retry Analysis.`
        );
      }

      // If browser fetch threw a TypeError (which occurs when a reverse-proxy gateway like Render
      // returns HTTP 502/503/504 without Access-Control-Allow-Origin headers, or if CORS is blocked),
      // forward the request to Render through the same-origin /api/predict relay to obtain the true
      // Render response or exact HTTP status code.
      if (err instanceof TypeError) {
        try {
          const relayRes = await fetch('/api/predict', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'x-flask-endpoint': activeBase,
            },
            body: buildFormData(fieldKey),
          });
          const relayText = await relayRes.text();
          return parsePredictionHttpResponse(
            relayRes.status,
            relayRes.ok,
            relayRes.redirected,
            relayRes.headers.get('content-type') || '',
            relayText,
            directPredictUrl
          );
        } catch (relayErr) {
          if (!(relayErr instanceof TypeError)) {
            throw relayErr;
          }
        }

        throw new Error(
          `Network or CORS error while calling ${directPredictUrl}. Verify that ${activeBase} is online and that CORS allows requests from ${window.location.origin}.`
        );
      }

      throw err;
    }
  }

  // Explicit Server Relay Mode (when "Send requests directly from browser" is unchecked in Settings)
  const relayRes = await fetch('/api/predict', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'x-flask-endpoint': activeBase,
    },
    body: buildFormData(fieldKey),
  });
  const relayText = await relayRes.text();
  return parsePredictionHttpResponse(
    relayRes.status,
    relayRes.ok,
    relayRes.redirected,
    relayRes.headers.get('content-type') || '',
    relayText,
    directPredictUrl
  );
}

/**
 * Fetches user-specific analysis history from Supabase ONLY when Supabase is configured.
 */
export async function fetchUserAnalysisHistory(userId: string): Promise<AnalysisRecord[]> {
  if (!isSupabaseConfigured || !supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('analysis_history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((row: Record<string, unknown>) => ({
    id: String(row.id || ''),
    userId: String(row.user_id || userId),
    fileName: String(row.file_name || 'fingerprint_scan.png'),
    fileSizeBytes: Number(row.file_size_bytes || 0),
    predictedClass: String(row.predicted_class || ''),
    confidence: typeof row.confidence === 'number' ? row.confidence : null,
    status: row.status === 'Failed' ? 'Failed' : 'Completed',
    timestamp: String(row.created_at || new Date().toISOString()),
    savedReport: Boolean(row.saved_report ?? true),
    experimental: true,
  }));
}

/**
 * Persists a real backend prediction record into Supabase when connected.
 */
export async function saveAnalysisToSupabase(record: AnalysisRecord): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    return;
  }

  await supabase.from('analysis_history').insert({
    id: record.id,
    user_id: record.userId,
    file_name: record.fileName,
    file_size_bytes: record.fileSizeBytes,
    predicted_class: record.predictedClass,
    confidence: record.confidence ?? null,
    status: record.status,
    saved_report: record.savedReport,
    created_at: record.timestamp,
  });
}

export async function deleteAnalysisFromSupabase(recordId: string, userId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    return;
  }
  await supabase.from('analysis_history').delete().eq('id', recordId).eq('user_id', userId);
}
