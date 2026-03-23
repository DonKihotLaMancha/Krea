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
    <section className="panel mt-4">
      <h3 className="mb-3 text-lg font-semibold">Progress by Sections</h3>
      {!apartados.length ? (
        <p className="text-sm text-muted">Analyze a document in Ingest to see section progress charts.</p>
      ) : (
        <>
          <div className="mb-3 rounded-xl border border-border bg-slate-50 p-3">
            <p className="text-xs text-muted">Total Progress</p>
            <p className="text-2xl font-semibold">{totalProgreso}%</p>
          </div>
          <div className="rounded-xl border border-border bg-white p-3">
            <Bar
              data={data}
              options={{
                responsive: true,
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true } },
              }}
            />
          </div>
        </>
      )}
    </section>
  );
}
