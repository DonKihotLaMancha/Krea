import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const p = process.env;
  // Merge file env + process.env (Vercel/CI injects SUPABASE_* at build time; loadEnv may not include them).
  const supabaseUrl =
    env.VITE_SUPABASE_URL ||
    p.VITE_SUPABASE_URL ||
    env.NEXT_PUBLIC_SUPABASE_URL ||
    p.NEXT_PUBLIC_SUPABASE_URL ||
    env.SUPABASE_URL ||
    p.SUPABASE_URL ||
    '';
  const supabaseAnonKey =
    env.VITE_SUPABASE_ANON_KEY ||
    p.VITE_SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    p.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    p.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    p.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    p.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY ||
    p.SUPABASE_ANON_KEY ||
    '';

  return {
  plugins: [
    {
      name: 'inject-sa-env',
      transformIndexHtml(html) {
        const payload = JSON.stringify({ supabaseUrl, supabaseAnonKey });
        const script = `<script>window.__SA_ENV__=${payload};</script>`;
        // Static hosts (e.g. Vercel): inject at build time when env is present — there is no Node server to replace the placeholder.
        if (supabaseUrl && supabaseAnonKey) {
          return html.replace('<!--SA_ENV_INJECT-->', script);
        }
        // Dev: always inject (may be empty) so behavior is visible.
        if (mode !== 'production') {
          return html.replace('<!--SA_ENV_INJECT-->', script);
        }
        // Production without build-time keys: keep placeholder for Render (server.js injects at runtime).
        return html;
      },
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'Student Assistant',
        short_name: 'StudentAssistant',
        theme_color: '#4f46e5',
        background_color: '#f8faff',
        display: 'standalone',
        start_url: '/',
        icons: [],
      },
      workbox: {
        // Never cache API — long Ollama calls must not hit SW timeout/cache.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  // Same as dev: without this, `vite preview` serves the SPA but /api/* returns 404 (no Express).
  preview: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
};
});
