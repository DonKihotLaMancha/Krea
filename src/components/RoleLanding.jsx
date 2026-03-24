import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, LogIn, Presentation, UserPlus } from 'lucide-react';
import { supabase as supabaseBrowser } from '../lib/supabaseClient';
import { messageForAuthError } from '../lib/authMessages';

export default function RoleLanding({ onSignIn }) {
  const [step, setStep] = useState('choose');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  if (!supabaseBrowser) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 px-4 text-white">
        <p className="max-w-md rounded-lg border border-amber-400/40 bg-amber-950/40 px-4 py-3 text-center text-sm leading-relaxed">
          <span className="font-medium">Supabase is not configured.</span> Add{' '}
          <code className="rounded bg-black/30 px-1">VITE_SUPABASE_URL</code> and{' '}
          <code className="rounded bg-black/30 px-1">VITE_SUPABASE_ANON_KEY</code> to <code className="rounded bg-black/30 px-1">.env</code> and restart the dev server.
        </p>
      </div>
    );
  }

  if (step === 'choose') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 px-4">
        <div className="w-full max-w-lg text-center">
          <h1 className="text-2xl font-semibold text-white sm:text-3xl">Krea</h1>
          <p className="mt-2 text-sm text-white/75">Sign in to continue</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setStep('student')}
              className="group flex flex-col items-center gap-3 rounded-2xl border border-white/15 bg-white/95 p-8 text-slate-900 shadow-xl transition hover:border-indigo-300 hover:shadow-2xl"
            >
              <GraduationCap className="h-10 w-10 text-indigo-600" aria-hidden />
              <span className="text-lg font-semibold">Student</span>
              <span className="text-center text-xs text-slate-600">Materials, flashcards, AI tutor</span>
            </button>
            <Link
              to="/teacher"
              className="group flex flex-col items-center gap-3 rounded-2xl border border-white/15 bg-white/95 p-8 text-slate-900 shadow-xl transition hover:border-indigo-300 hover:shadow-2xl"
            >
              <Presentation className="h-10 w-10 text-indigo-600" aria-hidden />
              <span className="text-lg font-semibold">Teacher</span>
              <span className="text-center text-xs text-slate-600">Faculty portal</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/95 p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Student</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">
          Same account works in the teacher portal. New here? Use <span className="font-medium text-slate-800">Create account</span> first if needed.
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
        {localError ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800">{localError}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-1"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setLocalError('');
              try {
                const { data, error } = await supabaseBrowser.auth.signInWithPassword({
                  email: email.trim(),
                  password,
                });
                if (error) throw error;
                onSignIn?.(data.session);
              } catch (e) {
                setLocalError(messageForAuthError(e));
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
                if (data.session) {
                  onSignIn?.(data.session);
                } else {
                  setLocalError('Check your email to confirm your account.');
                }
              } catch (e) {
                setLocalError(messageForAuthError(e));
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
      <button
        type="button"
        onClick={() => {
          setStep('choose');
          setLocalError('');
        }}
        className="mt-8 text-sm text-white/80 hover:text-white"
      >
        ← Back to Student / Teacher
      </button>
    </div>
  );
}
