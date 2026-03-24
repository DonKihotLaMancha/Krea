import { createClient } from '@supabase/supabase-js';

function fromBuildEnv() {
  const url = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  return { url, anonKey };
}

/** Set in initSupabaseClient(); importers share this binding. */
export let supabase = null;

let initPromise = null;

/**
 * Call once before render (see main.jsx). Uses Vite env if present; otherwise GET /api/client-env
 * (so production hosts like Render can set SUPABASE_* / VITE_* at runtime without rebuilding).
 */
export async function initSupabaseClient() {
  if (supabase) return supabase;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    let { url, anonKey } = fromBuildEnv();
    if (url && anonKey) {
      supabase = createClient(url, anonKey);
      return supabase;
    }
    try {
      const r = await fetch('/api/client-env');
      if (r.ok) {
        const j = await r.json();
        url = j.supabaseUrl || url;
        anonKey = j.supabaseAnonKey || anonKey;
      }
    } catch (e) {
      console.warn('[Supabase] /api/client-env failed', e);
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
