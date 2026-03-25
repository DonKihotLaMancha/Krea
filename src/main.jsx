import './styles.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import RootRoutes from './RootRoutes';
import ErrorBoundary from './ErrorBoundary';
import { initSupabaseClient } from './lib/supabaseClient';

const rootEl = document.getElementById('root');
if (!rootEl) {
  document.body.textContent = 'Missing #root — check index.html.';
} else {
  void initSupabaseClient().finally(() => {
    createRoot(rootEl).render(
      <React.StrictMode>
        <ErrorBoundary>
          <BrowserRouter>
            <RootRoutes />
          </BrowserRouter>
        </ErrorBoundary>
      </React.StrictMode>,
    );
  });
}

// Register PWA only in production. A dev/proxy service worker can otherwise serve stale JS bundles,
// so UI changes (e.g. Flashcards) appear "stuck" until the cache updates.
queueMicrotask(() => {
  const isLocalHost =
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

  // On localhost/preview we always prefer fresh bundles over SW cache.
  if (!import.meta.env.PROD || isLocalHost) {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const r of regs) void r.unregister();
      });
    }
    return;
  }
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      try {
        registerSW({ immediate: true });
      } catch (e) {
        console.warn('[Krea] Service worker registration:', e);
      }
    })
    .catch((e) => console.warn('[Krea] PWA module skipped:', e));
});
