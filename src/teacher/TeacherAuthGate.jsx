import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { supabase as supabaseBrowser } from '../lib/supabaseClient';
import TeacherLoginPage from './TeacherLoginPage';

export default function TeacherAuthGate() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(!!supabaseBrowser);

  useEffect(() => {
    if (!supabaseBrowser) {
      setLoading(false);
      return undefined;
    }
    let mounted = true;
    supabaseBrowser.auth.getSession().then(({ data: { session: s } }) => {
      if (mounted) {
        setSession(s);
        setLoading(false);
      }
    });
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_event, s) => {
      if (mounted) setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-600">
        Checking session…
      </div>
    );
  }

  if (!session) {
    return <TeacherLoginPage />;
  }

  return <Outlet context={{ session }} />;
}
