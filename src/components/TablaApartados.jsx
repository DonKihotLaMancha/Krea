import { useState } from 'react';

export default function TablaApartados({ apartados, onUpdate }) {
  const [expandido, setExpandido] = useState(null);
  const estadoColor = (v) => {
    if (v === 'completado') return 'bg-emerald-100 text-emerald-700';
    if (v === 'en_progreso') return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-700';
  };

  const syncEstado = (porcentaje) => {
    const p = Number(porcentaje) || 0;
    if (p >= 100) return 'completado';
    if (p > 0) return 'en_progreso';
    return 'pendiente';
  };

  const updateApartado = (id, patch) => {
    onUpdate((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const toggleFechaTrabajo = (apartado, isoDate) => {
    const fechas = new Set((apartado.fechas_trabajo || []).map(String));
    if (fechas.has(isoDate)) fechas.delete(isoDate);
    else fechas.add(isoDate);
    updateApartado(apartado.id, { fechas_trabajo: [...fechas].sort() });
  };

  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const monthStart = new Date(y, m, 1);
  const monthEnd = new Date(y, m + 1, 0);
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const totalDays = monthEnd.getDate();
  const monthName = monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <section className="panel mt-3">
      <h3 className="mb-0.5 text-base font-semibold">Section Tracker</h3>
      <p className="mb-2 text-xs text-muted">Progress and study days per section.</p>
      {!apartados.length ? (
        <p className="text-sm text-muted">Analyze a document first to manage section progress and study dates.</p>
      ) : (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-lg border border-border bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Section</th>
                  <th className="px-3 py-2 text-left">Progress</th>
                  <th className="px-3 py-2 text-left">State</th>
                  <th className="px-3 py-2 text-left">Study days</th>
                  <th className="px-3 py-2 text-left">Calendar</th>
                </tr>
              </thead>
              <tbody>
                {apartados.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-3 py-2 align-top">
                      <p className="font-medium">{a.nombre}</p>
                      {a.descripcion ? <p className="text-xs text-muted">{a.descripcion}</p> : null}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        className="input w-24"
                        type="number"
                        min="0"
                        max="100"
                        value={Number(a.porcentaje || 0)}
                        onChange={(e) => {
                          const value = Math.max(0, Math.min(100, Number(e.target.value || 0)));
                          updateApartado(a.id, { porcentaje: value, estado: syncEstado(value) });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className={`rounded-full px-2 py-1 text-xs ${estadoColor(a.estado)}`}>
                        {a.estado || 'pendiente'}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-xs">{(a.fechas_trabajo || []).length}</td>
                    <td className="px-3 py-2 align-top">
                      <button className="btn-ghost" onClick={() => setExpandido((prev) => (prev === a.id ? null : a.id))}>
                        {expandido === a.id ? 'Hide' : 'Open'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {apartados.map((a) => (
            expandido === a.id ? (
              <div key={`${a.id}-calendar`} className="rounded-lg border border-border bg-slate-50 p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">{a.nombre}</p>
                  <p className="text-xs text-muted">{monthName}</p>
                </div>
                <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
                  <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: firstWeekday }).map((_, i) => (
                    <div key={`empty-${a.id}-${i}`} className="h-8 rounded-md bg-transparent" />
                  ))}
                  {Array.from({ length: totalDays }).map((_, i) => {
                    const d = i + 1;
                    const dt = new Date(y, m, d);
                    const iso = dt.toISOString().split('T')[0];
                    const selected = (a.fechas_trabajo || []).includes(iso);
                    return (
                      <button
                        key={`${a.id}-${iso}`}
                        className={`h-8 rounded-md border text-xs ${
                          selected
                            ? 'border-blue-400 bg-blue-100 text-blue-800'
                            : 'border-border bg-white text-slate-700'
                        }`}
                        onClick={() => toggleFechaTrabajo(a, iso)}
                        title={iso}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null
          ))}
        </div>
      )}
    </section>
  );
}
