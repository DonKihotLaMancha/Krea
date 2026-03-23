import { useState } from 'react';
import { LogIn, LogOut, UserPlus } from 'lucide-react';

export default function AuthPanel({ supabase, session, loading, onAuthChange }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  if (!supabase) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
        Add <code className="rounded bg-white/80 px-1">VITE_SUPABASE_URL</code> and{' '}
        <code className="rounded bg-white/80 px-1">VITE_SUPABASE_ANON_KEY</code> (or{' '}
        <code className="rounded bg-white/80 px-1">NEXT_PUBLIC_…</code>) in <code className="rounded bg-white/80 px-1">.env</code> to
        enable sign-in and cloud library sync.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-white/80 px-4 py-3 text-sm text-muted">
        Checking session…
      </div>
    );
  }

  const user = session?.user;
  if (user) {
    const label = user.email || user.user_metadata?.full_name || user.id.slice(0, 8);
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/95 to-cyan-50/90 px-4 py-3 text-sm text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-800">Signed in</span>
          <span className="truncate font-medium">{label}</span>
        </div>
        <button
          type="button"
          className="btn-ghost inline-flex items-center justify-center gap-1 self-start sm:self-auto"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setLocalError('');
            try {
              await supabase.auth.signOut();
              onAuthChange?.(null);
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
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-indigo-200/80 bg-gradient-to-r from-indigo-50/95 to-violet-50/90 p-4 shadow-sm">
      <p className="mb-3 text-sm font-medium text-indigo-950">
        Sign in to save PDFs, concept maps, and notebook outputs to your Supabase account.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Email
          <input
            className="input text-sm"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@university.edu"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Password
          <input
            className="input text-sm"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>
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
              if (data.session) onAuthChange?.(data.session);
              else setLocalError('Check your email to confirm your account (if confirmation is enabled).');
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
    </div>
  );
}
