import SidebarNav from './SidebarNav';
import TopbarStatus from './TopbarStatus';
import NoticeBanner from './NoticeBanner';

export default function AppShell({
  tabs,
  tab,
  setTab,
  modelStatus,
  latestBatchAt,
  notice,
  authPanel,
  theme,
  setTheme,
  isFocusMode,
  setIsFocusMode,
  onOpenSearch,
  sidebarCollapsed,
  setSidebarCollapsed,
  children,
}) {
  return (
    <div className={`grid min-h-screen grid-cols-1 bg-gradient-to-br from-slate-50 via-indigo-50/40 to-cyan-50/40 ${isFocusMode ? '' : (sidebarCollapsed ? 'md:grid-cols-[80px_1fr]' : 'md:grid-cols-[256px_1fr]')}`}>
      <SidebarNav
        tabs={tabs}
        tab={tab}
        onChange={setTab}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed?.((v) => !v)}
        isFocusMode={isFocusMode}
      />
      <main className="p-4 md:p-6">
        <div className="mx-auto w-full max-w-[1320px]">
          <div className="mb-4 grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto]">
            <TopbarStatus
              title={tab}
              modelStatus={modelStatus}
              latestBatchAt={latestBatchAt}
              theme={theme}
              setTheme={setTheme}
              isFocusMode={isFocusMode}
              setIsFocusMode={setIsFocusMode}
              onOpenSearch={onOpenSearch}
            />
            <div className="flex items-start justify-end">{authPanel}</div>
          </div>
          {!isFocusMode ? <NoticeBanner text={notice} /> : null}
          <div className="space-y-4">{children}</div>
        </div>
      </main>
    </div>
  );
}
