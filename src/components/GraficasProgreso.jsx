import { Bar } from 'react-chartjs-2';

export default function GraficasProgreso({ apartados }) {
  const totalProgreso = apartados.length
    ? Math.round(apartados.reduce((sum, a) => sum + Number(a.porcentaje || 0), 0) / apartados.length)
    : 0;
  const data = {
    labels: apartados.map((a) => (a.nombre.length > 18 ? `${a.nombre.slice(0, 18)}...` : a.nombre)),
    datasets: [
      {
        label: 'Progress',
        data: apartados.map((a) => Number(a.porcentaje || 0)),
        backgroundColor: 'rgba(124,58,237,0.45)',
        borderColor: '#7c3aed',
        borderWidth: 1,
      },
      {
        label: 'Study Days',
        data: apartados.map((a) => (a.fechas_trabajo || []).length),
        backgroundColor: 'rgba(8,145,178,0.45)',
        borderColor: '#0891b2',
        borderWidth: 1,
      },
    ],
  };

  return (
    <section className="panel mt-3">
      <h3 className="mb-2 text-base font-semibold">Progress by sections</h3>
      {!apartados.length ? (
        <p className="text-sm text-muted">Analyze a document in Ingest to see charts.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-white p-2.5 md:grid-cols-[minmax(0,11rem)_1fr] md:items-stretch">
          <div className="flex flex-col justify-center rounded-md border border-border bg-slate-50 px-3 py-2 md:border-0 md:bg-transparent md:px-2 md:py-0">
            <p className="text-xs text-muted">Total</p>
            <p className="text-2xl font-semibold leading-tight">{totalProgreso}%</p>
          </div>
          <div className="min-w-0 md:border-l md:border-border md:pl-3">
            <Bar
              data={data}
              options={{
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true } },
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
