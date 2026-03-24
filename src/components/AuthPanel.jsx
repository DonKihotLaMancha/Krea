import { useState, useEffect, useRef } from 'react';
import { ChevronDown, LogOut, UserRound } from 'lucide-react';

export default function AuthPanel({ supabase, session, loading, onAuthChange }) {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (!supabase) {
    return (
      <div className="max-w-[300px] rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs leading-snug text-amber-900">
        <span className="font-medium">Supabase not configured.</span> Local: add{' '}
        <code className="rounded bg-amber-100/80 px-0.5">VITE_SUPABASE_URL</code> +{' '}
        <code className="rounded bg-amber-100/80 px-0.5">VITE_SUPABASE_ANON_KEY</code> to{' '}
        <code className="rounded bg-amber-100/80 px-0.5">.env</code> and restart{' '}
        <code className="rounded bg-amber-100/80 px-0.5">npm run dev</code>. Vercel: Project → Settings →{' '}
        <strong>Environment Variables</strong> — add the same keys (or{' '}
        <code className="rounded bg-amber-100/80 px-0.5">NEXT_PUBLIC_SUPABASE_URL</code> + publishable/anon key), enable for{' '}
        <strong>Production</strong> and <strong>Preview</strong>, then <strong>Redeploy</strong> (build must see them). Render: Web Service →{' '}
        <strong>Environment</strong>: <code className="rounded bg-amber-100/80 px-0.5">SUPABASE_URL</code>,{' '}
        <code className="rounded bg-amber-100/80 px-0.5">VITE_SUPABASE_ANON_KEY</code>,{' '}
        <code className="rounded bg-amber-100/80 px-0.5">SUPABASE_SERVICE_ROLE_KEY</code>, redeploy.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-white/80 px-3 py-2 text-xs text-muted">
        Checking session…
      </div>
    );
  }

  const user = session?.user;
  if (!user) {
    return null;
  }

  const label = user.email || user.user_metadata?.full_name || user.id?.slice(0, 8) || 'Account';

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        data-sa-auth="account-menu-trigger"
        aria-expanded={menuOpen}
        aria-haspopup="true"
        className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900 shadow-sm"
        onClick={() => setMenuOpen((v) => !v)}
      >
        <UserRound className="h-4 w-4 shrink-0" />
        <span className="max-w-[180px] truncate">{label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {menuOpen ? (
        <div
          className="absolute right-0 z-20 mt-2 w-[280px] rounded-xl border border-border bg-white p-3 shadow-soft"
          role="region"
          aria-label="Account menu"
        >
          <div className="space-y-2">
            <p className="text-xs text-muted">Signed in as</p>
            <p className="text-sm font-medium">{label}</p>
            <button
              type="button"
              className="btn-ghost inline-flex w-full items-center justify-center gap-1"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setLocalError('');
                try {
                  await supabase.auth.signOut();
                  onAuthChange?.(null);
                  setMenuOpen(false);
                } catch (e) {
                  setLocalError(e?.message || 'Sign out failed.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
            {localError ? <p className="text-xs text-red-700">{localError}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
