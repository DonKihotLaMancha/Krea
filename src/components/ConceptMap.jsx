import { useMemo, useState } from 'react';

function buildNodes(apartados) {
  const items = (apartados || []).slice(0, 12);
  const centerX = 500;
  const centerY = 280;
  const radius = 210;

  if (!items.length) return [];
  if (items.length === 1) {
    return [{ ...items[0], x: centerX, y: centerY }];
  }

  return items.map((item, i) => {
    const angle = (Math.PI * 2 * i) / items.length - Math.PI / 2;
    return {
      ...item,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  });
}

export default function ConceptMap({ apartados }) {
  const [selectedId, setSelectedId] = useState(null);
  const nodes = useMemo(() => buildNodes(apartados), [apartados]);
  const selected = nodes.find((n) => n.id === selectedId) || nodes[0];

  if (!nodes.length) {
    return (
      <section className="panel">
        <h3 className="mb-2 text-lg font-semibold">Concept Map</h3>
        <p className="text-sm text-muted">Analyze sections in `Ingest` first, then the concept graph will appear here.</p>
      </section>
    );
  }

  const centerNode = { id: 'root', nombre: 'Main Topic', x: 500, y: 280 };

  return (
    <section className="panel">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Concept Map</h3>
        <span className="rounded-full border border-border bg-white px-3 py-1 text-xs text-muted">{nodes.length} nodes</span>
      </div>
      <p className="mb-3 text-xs text-muted">Tap/click a node to inspect the concept details.</p>

      <div className="overflow-x-auto rounded-xl border border-border bg-white p-2">
        <svg viewBox="0 0 1000 560" className="h-[420px] w-full min-w-[760px]">
          <defs>
            <linearGradient id="lineGrad" x1="0" x2="1">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.55" />
            </linearGradient>
          </defs>

          {nodes.map((n, idx) => (
            <line
              key={`edge-root-${n.id}`}
              x1={centerNode.x}
              y1={centerNode.y}
              x2={n.x}
              y2={n.y}
              stroke="url(#lineGrad)"
              strokeWidth="2"
            />
          ))}
          {nodes.slice(1).map((n, idx) => (
            <line
              key={`edge-chain-${n.id}`}
              x1={nodes[idx].x}
              y1={nodes[idx].y}
              x2={n.x}
              y2={n.y}
              stroke="#c7d2fe"
              strokeWidth="1.5"
              strokeDasharray="5 5"
            />
          ))}

          <g>
            <circle cx={centerNode.x} cy={centerNode.y} r="56" fill="#4f46e5" opacity="0.95" />
            <text x={centerNode.x} y={centerNode.y + 6} textAnchor="middle" fill="#fff" fontSize="16" fontWeight="700">
              Main Topic
            </text>
          </g>

          {nodes.map((n) => {
            const isActive = selected?.id === n.id;
            const label = String(n.nombre || '').slice(0, 26);
            return (
              <g key={n.id} className="cursor-pointer" onClick={() => setSelectedId(n.id)}>
                <circle cx={n.x} cy={n.y} r={isActive ? 46 : 40} fill={isActive ? '#7c3aed' : '#0ea5e9'} opacity="0.92" />
                <text x={n.x} y={n.y + 5} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="600">
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {selected ? (
        <div className="mt-3 rounded-xl border border-border bg-slate-50 p-3">
          <p className="text-sm font-semibold text-text">{selected.nombre}</p>
          <p className="mt-1 text-sm text-muted">{selected.descripcion || 'No description available.'}</p>
        </div>
      ) : null}
    </section>
  );
}
