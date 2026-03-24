import { useState } from 'react';
import { Link, Outlet, useOutletContext } from 'react-router-dom';
import NoticeBanner from '../components/NoticeBanner';
import AuthPanel from '../components/AuthPanel';
import TeacherSidebar from './TeacherSidebar';
import { supabase as supabaseBrowser } from '../lib/supabaseClient';

export default function TeacherPortalLayout() {
  const { session } = useOutletContext();
  const [notice, setNotice] = useState('');
  const [activePane, setActivePane] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen flex-col md:flex-row">
        <TeacherSidebar
          active={activePane}
          onChange={setActivePane}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
            <Link
              to="/"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              ← Krea
            </Link>
            <AuthPanel
              supabase={supabaseBrowser}
              session={session}
              loading={false}
              onAuthChange={() => {}}
            />
          </header>
          {notice ? (
            <div className="border-b border-indigo-100 bg-white px-4 py-2">
              <NoticeBanner text={notice} />
            </div>
          ) : null}
          <div className="flex-1 overflow-auto p-4 md:p-6">
            <Outlet context={{ session, setNotice, activePane, setActivePane }} />
          </div>
        </div>
      </div>
    </div>
  );
}
