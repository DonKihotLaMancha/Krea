import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogIn, UserPlus } from 'lucide-react';
import { supabase as supabaseBrowser } from '../lib/supabaseClient';

export default function TeacherLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  if (!supabaseBrowser) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 px-4 text-white">
        <p className="rounded-lg border border-amber-400/40 bg-amber-950/40 px-4 py-3 text-center text-sm">
          Supabase is not configured. Set your VITE Supabase environment variables.
        </p>
        <Link to="/" className="mt-6 text-sm text-white/80 underline hover:text-white">
          Back to student app
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/95 p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Faculty</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Teacher portal</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in with the same account as the student app to manage classes, assignments, and grades.
        </p>
        <div className="mt-6 grid gap-2">
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
        {localError ? <p className="mt-3 text-xs text-red-700">{localError}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-1"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setLocalError('');
              try {
                const { error } = await supabaseBrowser.auth.signInWithPassword({
                  email: email.trim(),
                  password,
                });
                if (error) throw error;
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
                const { data, error } = await supabaseBrowser.auth.signUp({
                  email: email.trim(),
                  password,
                });
                if (error) throw error;
                if (!data.session) {
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
      </div>
      <Link to="/" className="mt-8 text-sm text-white/80 hover:text-white">
        ← Back to student app
      </Link>
    </div>
  );
}
