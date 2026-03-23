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
    <div className="grid min-h-screen grid-cols-[256px_1fr]">
      <SidebarNav tabs={tabs} tab={tab} onChange={setTab} />
      <main className="p-6">
        <TopbarStatus title={tab} modelStatus={modelStatus} latestBatchAt={latestBatchAt} />
        <NoticeBanner text={notice} />
        <StatsCards cardsCount={stats.cardsCount} tasksDone={stats.tasksDone} tasksTotal={stats.tasksTotal} avg={stats.avg} />
        {children}
      </main>
    </div>
  );
}
