import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  const flaskTarget = (
    env.FLASK_BACKEND_URL ||
    env.VITE_FLASK_API_URL ||
    'https://hemoscan-backend.onrender.com'
  )
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/predict$/, '');

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Fallback proxy when running standalone Vite (`npx vite`) without Express server.ts
      proxy: {
        '/api/predict': {
          target: flaskTarget,
          changeOrigin: true,
          rewrite: () => '/predict',
        },
        '/api/backend-status': {
          target: flaskTarget,
          changeOrigin: true,
          rewrite: () => '/health',
        },
        '/predict': {
          target: flaskTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
