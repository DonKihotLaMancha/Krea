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
  isFocusMode,
  setIsFocusMode,
  onOpenSearch,
  onOpenLocalLog,
  sidebarCollapsed,
  setSidebarCollapsed,
  children,
}) {
  return (
    <div
      className={`grid min-h-screen grid-cols-1 bg-canvas-page ${isFocusMode ? '' : (sidebarCollapsed ? 'md:grid-cols-[80px_1fr]' : 'md:grid-cols-[256px_1fr]')}`}
      style={{ backgroundColor: '#f5f5f5', color: '#0f172a' }}
    >
      <SidebarNav
        tabs={tabs}
        tab={tab}
        onChange={setTab}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed?.((v) => !v)}
        isFocusMode={isFocusMode}
      />
      <main
        className="min-h-screen border-l border-canvas-border bg-white p-4 text-slate-900 md:p-6"
        style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
      >
        <div className="mx-auto w-full max-w-[1320px]">
          <div className="mb-4 grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto]">
            <TopbarStatus
              title={tab}
              modelStatus={modelStatus}
              latestBatchAt={latestBatchAt}
              isFocusMode={isFocusMode}
              setIsFocusMode={setIsFocusMode}
              onOpenSearch={onOpenSearch}
              onOpenLocalLog={onOpenLocalLog}
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
