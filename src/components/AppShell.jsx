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
        <TopbarStatus title={tab} modelStatus={modelStatus} latestBatchAt={latestBatchAt} />
        <NoticeBanner text={notice} />
        <StatsCards cardsCount={stats.cardsCount} tasksDone={stats.tasksDone} tasksTotal={stats.tasksTotal} avg={stats.avg} />
        <div className="space-y-4">{children}</div>
      </main>
    </div>
  );
}
