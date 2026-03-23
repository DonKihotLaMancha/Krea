/** Backend origin for API calls. Empty = same origin (works with Vite dev/preview proxy to server.js). */
const raw = import.meta.env.VITE_API_BASE_URL || '';
const API_BASE = String(raw).replace(/\/$/, '');

/**
 * @param {string} path Absolute path starting with /api/...
 * @returns {string}
 */
export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

/**
 * Turns low-level fetch failures into a clear message (backend down, wrong host, offline).
 * @param {unknown} err
 * @returns {Error}
 */
export function enhanceFetchError(err) {
  if (!err || typeof err !== 'object') {
    return new Error(
      'Connection error: cannot reach the API. Start the backend (npm run server on port 3001) and run the app with npm run dev or npm run dev:full.',
    );
  }
  const name = err.name;
  const msg = String(err.message || err);
  if (name === 'AbortError') return /** @type {Error} */ (err);
  const looksNetwork =
    name === 'TypeError' ||
    /failed to fetch|networkerror|load failed|network request failed|econnrefused|connection refused/i.test(msg);
  if (looksNetwork) {
    return new Error(
      'Connection error: cannot reach the API. Start the backend with npm run server (port 3001), then use npm run dev or npm run dev:full. If the API runs elsewhere, set VITE_API_BASE_URL.',
    );
  }
  return /** @type {Error} */ (err);
}
