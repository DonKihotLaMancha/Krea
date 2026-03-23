export default function StatsCards({ cardsCount, tasksDone, tasksTotal, avg }) {
  const items = [
    { label: 'Flashcards', value: cardsCount, tone: 'from-indigo-500/20 to-violet-500/20 border-indigo-200' },
    { label: 'Tasks Done', value: `${tasksDone}/${tasksTotal}`, tone: 'from-cyan-500/20 to-sky-500/20 border-cyan-200' },
    { label: 'Academic Avg', value: avg.toFixed(1), tone: 'from-emerald-500/20 to-teal-500/20 border-emerald-200' },
  ];
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className={`panel border ${it.tone} bg-gradient-to-br`}>
          <p className="text-xs text-muted">{it.label}</p>
          <p className="mt-1 text-2xl font-semibold">{it.value}</p>
        </div>
      ))}
    </div>
  );
}
