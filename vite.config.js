import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const supabaseUrl = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey =
    env.VITE_SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';

  return {
  plugins: [
    {
      name: 'inject-sa-env-dev',
      transformIndexHtml(html) {
        // Production build must keep <!--SA_ENV_INJECT--> so server.js can inject runtime env on Render.
        if (mode === 'production') return html;
        const payload = JSON.stringify({ supabaseUrl, supabaseAnonKey });
        return html.replace(
          '<!--SA_ENV_INJECT-->',
          `<script>window.__SA_ENV__=${payload};</script>`,
        );
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
