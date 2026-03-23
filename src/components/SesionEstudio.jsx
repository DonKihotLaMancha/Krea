import { useState } from 'react';

function calcularProximaRevision(tarjeta, bien) {
  const hoy = new Date();
  let intervalo = Number(tarjeta.intervalo_dias || 1);
  if (bien) intervalo = Math.min(60, Math.max(1, Math.round(intervalo * 2.5)));
  else intervalo = 1;
  const proxima = new Date(hoy);
  proxima.setDate(proxima.getDate() + intervalo);
  return {
    intervalo_dias: intervalo,
    proxima_revision: proxima.toISOString().split('T')[0],
    dificultad: bien ? (intervalo > 10 ? 'facil' : 'media') : 'dificil',
    veces_bien: Number(tarjeta.veces_bien || 0) + (bien ? 1 : 0),
    veces_mal: Number(tarjeta.veces_mal || 0) + (bien ? 0 : 1),
  };
}

export default function SesionEstudio({ tarjetas, soloRepaso = false, onGuardar, onVolver }) {
  const today = new Date().toISOString().split('T')[0];
  const cola = soloRepaso
    ? tarjetas.filter((t) => t.dificultad === 'dificil' || Number(t.veces_mal || 0) > 0)
    : [...tarjetas].sort((a, b) => ((b.proxima_revision || today) <= today) - ((a.proxima_revision || today) <= today));
  const [indice, setIndice] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [done, setDone] = useState(false);
  const [cambios, setCambios] = useState({});

  if (!cola.length) {
    return (
      <div className="rounded-lg border border-border bg-slate-50 p-3 text-sm text-muted">
        No cards available for this session.
      </div>
    );
  }
  const tarjeta = cola[indice];
  const progress = Math.round((indice / cola.length) * 100);

  const responder = (bien) => {
    const update = calcularProximaRevision(tarjeta, bien);
    const next = { ...cambios, [tarjeta.id]: update };
    setCambios(next);
    if (indice + 1 >= cola.length) {
      onGuardar(next);
      setDone(true);
    } else {
      setShowBack(false);
      setIndice((v) => v + 1);
    }
  };

  if (done) {
    return (
      <div className="rounded-lg border border-border bg-slate-50 p-3">
        <p className="font-semibold">Session completed</p>
        <p className="text-sm text-muted">{cola.length} cards reviewed.</p>
        <button className="btn-ghost mt-2" onClick={onVolver}>Back to deck</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted">
        <button className="btn-ghost" onClick={onVolver}>Exit</button>
        <span>{indice + 1} / {cola.length}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(6, progress)}%` }} />
      </div>
      <div className="rounded-xl border border-border bg-white p-4">
        <p className="font-medium">{tarjeta.question}</p>
        {showBack ? <p className="mt-2 text-sm text-muted">{tarjeta.answer}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {!showBack ? <button className="btn-ghost" onClick={() => setShowBack(true)}>Reveal answer</button> : null}
          <button className="btn-ghost" onClick={() => responder(false)}>Wrong</button>
          <button className="btn-primary" onClick={() => responder(true)}>Right</button>
        </div>
      </div>
    </div>
  );
}
