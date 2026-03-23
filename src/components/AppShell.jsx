import SidebarNav from './SidebarNav';
import TopbarStatus from './TopbarStatus';
import NoticeBanner from './NoticeBanner';
import StatsCards from './StatsCards';

export default function AppShell({
  tabs,
  tab,
  setTab,
  modelStatus,
  latestBatchAt,
  notice,
  stats,
  children,
}) {
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[256px_1fr]">
      <SidebarNav tabs={tabs} tab={tab} onChange={setTab} />
      <main className="p-4 md:p-6">
        <div className="mx-auto w-full max-w-[1320px]">
        <TopbarStatus title={tab} modelStatus={modelStatus} latestBatchAt={latestBatchAt} />
        <NoticeBanner text={notice} />
        {tab !== 'Ingest' ? (
          <StatsCards cardsCount={stats.cardsCount} tasksDone={stats.tasksDone} tasksTotal={stats.tasksTotal} avg={stats.avg} />
        ) : null}
        <div className="space-y-4">{children}</div>
        </div>
      </main>
    </div>
  );
}
