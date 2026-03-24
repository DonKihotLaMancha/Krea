import { createClient } from '@supabase/supabase-js';
import { apiUrl } from './apiBase';

function fromBuildEnv() {
  const url = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  return { url, anonKey };
}

/** Set by server /api/env.js before React (see index.html). */
function fromWindowEnv() {
  if (typeof window === 'undefined') return { url: '', anonKey: '' };
  const e = window.__SA_ENV__;
  if (!e || typeof e !== 'object') return { url: '', anonKey: '' };
  return {
    url: String(e.supabaseUrl || '').trim(),
    anonKey: String(e.supabaseAnonKey || '').trim(),
  };
}

/** Set in initSupabaseClient(); importers share this binding. */
export let supabase = null;

let initPromise = null;

/**
 * Call once before render (see main.jsx). Order: Vite build env → window.__SA_ENV__ → GET /api/client-env
 */
export async function initSupabaseClient() {
  if (supabase) return supabase;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Prefer window.__SA_ENV__ first: Vite injects it in index.html before the bundle runs (reliable on Vercel static).
    const w = fromWindowEnv();
    const b = fromBuildEnv();
    let url = w.url || b.url;
    let anonKey = w.anonKey || b.anonKey;
    if (!url || !anonKey) {
      try {
        const r = await fetch(apiUrl('/api/client-env'));
        if (r.ok) {
          const j = await r.json();
          url = j.supabaseUrl || url;
          anonKey = j.supabaseAnonKey || anonKey;
        }
      } catch (e) {
        console.warn('[Supabase] /api/client-env failed', e);
      }
    }
    if (url && anonKey) {
      supabase = createClient(url, anonKey);
    }
    return supabase;
  })();

  return initPromise;
}

export function isSupabaseConfigured() {
  return !!supabase;
}
