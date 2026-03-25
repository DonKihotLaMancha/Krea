import SidebarNav from './SidebarNav';

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
        accountMenu={authPanel}
      />
      <main
        className="min-h-screen border-l border-canvas-border bg-white p-3 text-slate-900 md:px-4 md:py-3"
        style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
      >
        <div className="mx-auto w-full max-w-[1320px]">
          <div className="space-y-3">{children}</div>
        </div>
      </main>
    </div>
  );
}
