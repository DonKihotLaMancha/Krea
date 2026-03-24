import { useState } from 'react';
import { LogIn, LogOut, UserRound, UserPlus } from 'lucide-react';

export default function AuthPanel({ supabase, session, loading, onAuthChange }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [open, setOpen] = useState(false);

  if (!supabase) {
    return (
      <div className="max-w-[300px] rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs leading-snug text-amber-900">
        <span className="font-medium">Supabase not configured.</span> Local: add{' '}
        <code className="rounded bg-amber-100/80 px-0.5">VITE_SUPABASE_URL</code> +{' '}
        <code className="rounded bg-amber-100/80 px-0.5">VITE_SUPABASE_ANON_KEY</code> to{' '}
        <code className="rounded bg-amber-100/80 px-0.5">.env</code> and restart{' '}
        <code className="rounded bg-amber-100/80 px-0.5">npm run dev</code>. Render: in the Web Service →{' '}
        <strong>Environment</strong>, set <code className="rounded bg-amber-100/80 px-0.5">SUPABASE_URL</code>,{' '}
        <code className="rounded bg-amber-100/80 px-0.5">VITE_SUPABASE_ANON_KEY</code> (anon key), and{' '}
        <code className="rounded bg-amber-100/80 px-0.5">SUPABASE_SERVICE_ROLE_KEY</code>, then redeploy.
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
  const label = user?.email || user?.user_metadata?.full_name || user?.id?.slice(0, 8) || 'Account';
  return (
    <div className="relative">
      <button
        type="button"
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-sm ${user ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-border bg-white text-text'}`}
        onClick={() => setOpen((v) => !v)}
      >
        <UserRound className="h-4 w-4" />
        <span className="max-w-[180px] truncate">{user ? label : 'Sign in'}</span>
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-[320px] rounded-xl border border-border bg-white p-3 shadow-soft">
          {user ? (
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
                    setOpen(false);
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
          ) : (
            <>
              <p className="mb-2 text-sm font-medium text-slate-900">Sign in to sync your data</p>
              <div className="grid gap-2">
                <input
                  className="input text-sm"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                />
                <input
                  className="input text-sm"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              {localError ? <p className="mt-2 text-xs text-red-700">{localError}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary inline-flex items-center gap-1"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setLocalError('');
                    try {
                      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
                      if (error) throw error;
                      onAuthChange?.(data.session);
                      setOpen(false);
                    } catch (e) {
                      setLocalError(e?.message || 'Sign in failed.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <LogIn className="h-4 w-4" />
                  Sign in
                </button>
                <button
                  type="button"
                  className="btn-ghost inline-flex items-center gap-1"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setLocalError('');
                    try {
                      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
                      if (error) throw error;
                      if (data.session) {
                        onAuthChange?.(data.session);
                        setOpen(false);
                      } else {
                        setLocalError('Check your email to confirm your account.');
                      }
                    } catch (e) {
                      setLocalError(e?.message || 'Sign up failed.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <UserPlus className="h-4 w-4" />
                  Create account
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
