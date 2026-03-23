export default function StatsCards({ cardsCount, tasksDone, tasksTotal, avg }) {
  const items = [
    { label: 'Flashcards', value: cardsCount },
    { label: 'Tasks Done', value: `${tasksDone}/${tasksTotal}` },
    { label: 'Academic Avg', value: avg.toFixed(1) },
  ];
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className="panel">
          <p className="text-xs text-muted">{it.label}</p>
          <p className="mt-1 text-2xl font-semibold">{it.value}</p>
        </div>
      ))}
    </div>
  );
}
