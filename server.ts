import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DEFAULT_RENDER_BACKEND_URL = 'https://hemoscan-backend.onrender.com';

const CONFIGURED_FLASK_URL = (
  process.env.FLASK_BACKEND_URL ||
  process.env.VITE_FLASK_API_URL ||
  DEFAULT_RENDER_BACKEND_URL
).trim();

function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(api\/)?(predict|health)$/i, '');
}

function resolveRenderBaseUrl(customOverride?: string): string {
  if (customOverride && customOverride.trim()) {
    return normalizeBaseUrl(customOverride);
  }
  return normalizeBaseUrl(CONFIGURED_FLASK_URL || DEFAULT_RENDER_BACKEND_URL);
}

async function startServer() {
  const app = express();

  const handleHealthProxy = async (req: Request, res: Response) => {
    const customTarget = typeof req.query.endpoint === 'string' ? req.query.endpoint.trim() : '';
    const baseUrl = resolveRenderBaseUrl(customTarget);
    const healthUrl = `${baseUrl}/health`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 55000);
      const upstream = await fetch(healthUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        redirect: 'manual',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const rawText = await upstream.text();
      try {
        const parsed = JSON.parse(rawText) as Record<string, unknown>;
        res.status(upstream.status).json(parsed);
        return;
      } catch {
        res.status(upstream.ok ? 502 : upstream.status).json({
          status: 'error',
          model_loaded: false,
          error: `Render /health at ${healthUrl} returned non-JSON response (HTTP ${upstream.status}).`,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      res.status(503).json({
        status: 'offline',
        model_loaded: false,
        error: `Unable to reach Render Flask backend at ${healthUrl} (${msg}).`,
      });
    }
  };

  app.get('/api/health', handleHealthProxy);
  app.get('/health', handleHealthProxy);

  // Health & model availability probe for the deployed Render Flask backend
  app.get('/api/backend-status', async (req: Request, res: Response) => {
    const customTarget = typeof req.query.endpoint === 'string' ? req.query.endpoint.trim() : '';
    const baseUrl = resolveRenderBaseUrl(customTarget);
    const healthUrl = `${baseUrl}/health`;
    const predictEndpoint = `${baseUrl}/predict`;
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 55000);
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        redirect: 'manual',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const latencyMs = Math.max(1, Date.now() - startTime);
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      const rawBody = await response.text();
      const trimmed = rawBody.trim();

      if (response.status === 502 || response.status === 503 || response.status === 504) {
        res.status(200).json({
          connected: false,
          endpoint: predictEndpoint,
          statusCode: response.status,
          latencyMs,
          message: `Render backend (${healthUrl}) returned HTTP ${response.status}. The service may still be waking up — click Retry Check shortly.`,
        });
        return;
      }

      if (contentType.includes('text/html') || trimmed.startsWith('<')) {
        res.status(200).json({
          connected: false,
          endpoint: predictEndpoint,
          statusCode: response.status,
          latencyMs,
          message: `Health endpoint ${healthUrl} returned HTML instead of JSON (HTTP ${response.status}).`,
        });
        return;
      }

      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const statusOk = response.ok && (parsed.status === undefined || parsed.status === 'ok');
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

      res.status(200).json({
        connected: statusOk,
        modelLoaded,
        modelVersion,
        modelError,
        endpoint: predictEndpoint,
        statusCode: response.status,
        latencyMs,
        message: !statusOk
          ? modelError || `Health check at ${healthUrl} failed with HTTP ${response.status}.`
          : modelLoaded
            ? `Connected to Render Flask API (${modelVersion || 'model loaded'}${
                classesCount ? `, ${classesCount} classes` : ''
              }).`
            : modelError || 'Render Flask server is online, but the trained model failed to load.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      res.status(200).json({
        connected: false,
        endpoint: predictEndpoint,
        message: `Unable to reach Render Flask backend at ${healthUrl} (${msg}).`,
      });
    }
  });

  // Multipart/form-data relay to Render Flask POST /predict (never fabricates predictions)
  const handlePredictRelay = async (req: Request, res: Response) => {
    const headerOverride =
      typeof req.headers['x-flask-endpoint'] === 'string'
        ? req.headers['x-flask-endpoint'].trim()
        : '';
    const baseUrl = resolveRenderBaseUrl(headerOverride);
    const predictUrl = `${baseUrl}/predict`;

    const contentTypeHeader = req.headers['content-type'] || '';
    if (!contentTypeHeader.toLowerCase().includes('multipart/form-data')) {
      res.status(400).json({
        success: false,
        error: "Expected multipart/form-data request containing fingerprint image field 'image'.",
        code: 'INVALID_CONTENT_TYPE',
        endpoint: predictUrl,
      });
      return;
    }

    let bodyBuffer: Buffer;
    try {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buf.length;
        if (totalBytes > MAX_UPLOAD_BYTES + 256 * 1024) {
          res.status(413).json({
            success: false,
            error: 'Image must be smaller than 10 MB.',
            code: 'FILE_TOO_LARGE',
            endpoint: predictUrl,
          });
          return;
        }
        chunks.push(buf);
      }
      bodyBuffer = Buffer.concat(chunks);
    } catch {
      res.status(400).json({
        success: false,
        error: 'Failed to read uploaded multipart image stream.',
        code: 'STREAM_READ_ERROR',
        endpoint: predictUrl,
      });
      return;
    }

    if (bodyBuffer.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Uploaded image body is empty.',
        code: 'EMPTY_BODY',
        endpoint: predictUrl,
      });
      return;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 65000);

      const flaskRes = await fetch(predictUrl, {
        method: 'POST',
        headers: {
          'content-type': contentTypeHeader,
          accept: 'application/json',
        },
        body: new Uint8Array(bodyBuffer),
        redirect: 'manual',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (flaskRes.status >= 300 && flaskRes.status < 400) {
        const location = flaskRes.headers.get('location') || 'unknown';
        res.status(502).json({
          success: false,
          error: `Render backend at ${predictUrl} responded with an HTTP ${flaskRes.status} redirect to '${location}' instead of JSON.`,
          code: 'FLASK_REDIRECT_DETECTED',
          endpoint: predictUrl,
        });
        return;
      }

      const textBody = await flaskRes.text();
      const trimmed = textBody.trim();

      let parsed: Record<string, unknown> | null = null;
      if (trimmed) {
        try {
          const candidate = JSON.parse(trimmed);
          if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
            parsed = candidate as Record<string, unknown>;
          }
        } catch {
          parsed = null;
        }
      }

      if (flaskRes.status === 502 || flaskRes.status === 503 || flaskRes.status === 504) {
        const gatewayError =
          (parsed && typeof parsed.error === 'string' && parsed.error) ||
          (flaskRes.status === 502
            ? `Render backend (${predictUrl}) returned HTTP 502 Bad Gateway. The Flask/Gunicorn worker timed out or ran out of memory during TensorFlow inference.`
            : flaskRes.status === 503
              ? `Render backend (${predictUrl}) returned HTTP 503 Service Unavailable — the service may still be waking up.`
              : `Render backend (${predictUrl}) timed out (HTTP 504 Gateway Timeout) during inference.`);

        res.status(flaskRes.status).json({
          ...(parsed || {}),
          success: false,
          error: gatewayError,
          code: `RENDER_HTTP_${flaskRes.status}`,
          endpoint: predictUrl,
        });
        return;
      }

      if (!parsed) {
        const respContentType = (flaskRes.headers.get('content-type') || '').toLowerCase();
        const snippet = trimmed.replace(/\s+/g, ' ').slice(0, 140);
        const isHtml = respContentType.includes('text/html') || snippet.startsWith('<');
        res.status(502).json({
          success: false,
          error: isHtml
            ? `Render backend at ${predictUrl} returned HTML (HTTP ${flaskRes.status}) instead of JSON.`
            : `Render backend at ${predictUrl} returned non-JSON response (HTTP ${flaskRes.status}): "${snippet || 'empty body'}".`,
          code: 'INVALID_FLASK_PAYLOAD',
          endpoint: predictUrl,
        });
        return;
      }

      if (!flaskRes.ok || parsed.success === false) {
        const errMsg =
          (typeof parsed.error === 'string' && parsed.error) ||
          (typeof parsed.message === 'string' && parsed.message) ||
          `Render Flask backend returned HTTP ${flaskRes.status}.`;
        res.status(flaskRes.ok ? 400 : flaskRes.status).json({
          ...parsed,
          success: false,
          error: errMsg,
          endpoint: predictUrl,
        });
        return;
      }

      res.status(200).json(parsed);
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const errorMessage = err instanceof Error ? err.message : 'Connection failed';
      res.status(504).json({
        success: false,
        error: isAbort
          ? `Timed out waiting for Render backend at ${predictUrl} (exceeded 65s).`
          : `Unable to reach Render Flask backend at ${predictUrl} (${errorMessage}).`,
        code: 'BACKEND_OFFLINE',
        endpoint: predictUrl,
      });
    }
  };

  app.post('/api/predict', handlePredictRelay);
  app.post('/predict', handlePredictRelay);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: !hmrDisabled,
        watch: hmrDisabled ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({
          success: false,
          error: `Unknown API endpoint: ${req.path}`,
          code: 'API_NOT_FOUND',
        });
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`HemoScan AI server listening on http://0.0.0.0:${PORT}`);
  });

  const gracefulShutdown = () => {
    httpServer.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

startServer().catch((err) => {
  console.error('Failed to start HemoScan AI server:', err);
  process.exit(1);
});
