import './styles.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import RootRoutes from './RootRoutes';
import ErrorBoundary from './ErrorBoundary';

const rootEl = document.getElementById('root');
if (!rootEl) {
  document.body.textContent = 'Missing #root — check index.html.';
} else {
  createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <RootRoutes />
        </BrowserRouter>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}

// Register PWA after first paint so a SW failure can never block React.
queueMicrotask(() => {
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      try {
        registerSW({ immediate: true });
      } catch (e) {
        console.warn('[Student Assistant] Service worker registration:', e);
      }
    })
    .catch((e) => console.warn('[Student Assistant] PWA module skipped:', e));
});
