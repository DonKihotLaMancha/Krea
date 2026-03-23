import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogIn, UserPlus } from 'lucide-react';
import { supabase as supabaseBrowser } from '../lib/supabaseClient';

/** Supabase returns terse messages; map them to actionable copy. */
function messageForAuthError(err) {
  const raw = String(err?.message || err || '');
  const lower = raw.toLowerCase();
  if (/rate limit|too many requests|over_request|over_email_send|email rate limit/.test(lower)) {
    return 'Too many attempts (Supabase rate limit). Wait about 5–15 minutes, then try again. If you were creating an account, wait before clicking Create account again.';
  }
  if (/invalid login|invalid credentials|invalid_grant/.test(lower)) {
    return 'Wrong email or password. If this email is not registered yet, use Create account instead of Sign in.';
  }
  if (/already registered|user already exists|email.*already been registered|already been taken/.test(lower)) {
    return 'This email already has an account. Use Sign in, or reset your password in the Supabase dashboard.';
  }
  if (/email not confirmed|signup_not_completed|email_not_confirmed/.test(lower)) {
    return 'Confirm your email (open the link Supabase sent) before signing in.';
  }
  if (/weak password|password.*short|least \d+ char/i.test(lower)) {
    return raw;
  }
  return raw || 'Something went wrong.';
}

export default function TeacherLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

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
          Use the same account as the student app. New email? Choose <span className="font-medium text-slate-800">Create account</span> first, then sign in after you confirm your email (if your project requires it).
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
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800">
            {localError}
          </p>
        ) : null}
        {infoMessage ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900">
            {infoMessage}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-1"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setLocalError('');
              setInfoMessage('');
              try {
                const { error } = await supabaseBrowser.auth.signInWithPassword({
                  email: email.trim(),
                  password,
                });
                if (error) throw error;
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
              setInfoMessage('');
              try {
                const { data, error } = await supabaseBrowser.auth.signUp({
                  email: email.trim(),
                  password,
                });
                if (error) throw error;
                if (!data.session) {
                  setInfoMessage(
                    'Account created. Check your email for a confirmation link if required by your Supabase project, then return here and use Sign in.',
                  );
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
      <Link to="/" className="mt-8 text-sm text-white/80 hover:text-white">
        ← Back to student app
      </Link>
    </div>
  );
}
