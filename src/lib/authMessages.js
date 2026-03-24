/** Supabase returns terse messages; map them to actionable copy. */
export function messageForAuthError(err) {
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
