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

function buildNodesFromMap(mapData) {
  const items = (mapData?.nodes || []).slice(0, 16);
  const centerX = 500;
  const centerY = 280;
  const radius = 220;
  if (!items.length) return [];
  if (items.length === 1) return [{ ...items[0], nombre: items[0].label, descripcion: items[0].description, x: centerX, y: centerY }];
  return items.map((item, i) => {
    const angle = (Math.PI * 2 * i) / items.length - Math.PI / 2;
    return {
      id: item.id,
      nombre: item.label,
      descripcion: item.description,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  });
}

export default function ConceptMap({ apartados, chunks = [], conceptMapData = null, isGenerating = false, onGenerate }) {
  const [selectedChunkId, setSelectedChunkId] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const selectedChunk = selectedChunkId ? chunks.find((c) => c.id === selectedChunkId) : chunks[0];
  const nodes = useMemo(
    () => (conceptMapData?.nodes?.length ? buildNodesFromMap(conceptMapData) : buildNodes(apartados)),
    [apartados, conceptMapData],
  );
  const selected = nodes.find((n) => n.id === selectedId) || nodes[0];

  const centerNode = { id: 'root', nombre: 'Main Topic', x: 500, y: 280 };

  return (
    <section className="panel">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{conceptMapData?.title || 'Concept Map'}</h3>
        <span className="rounded-full border border-border bg-white px-3 py-1 text-xs text-muted">{nodes.length} nodes</span>
      </div>
      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
        <select
          className="input"
          value={selectedChunkId}
          onChange={(e) => setSelectedChunkId(e.target.value)}
          disabled={!chunks.length || isGenerating}
        >
          {!chunks.length ? <option value="">Upload a PDF first</option> : null}
          {chunks.length ? <option value="">Latest upload ({chunks[0].name})</option> : null}
          {chunks.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button
          className="btn-primary"
          disabled={!selectedChunk || isGenerating}
          onClick={() => selectedChunk && onGenerate(selectedChunk.id)}
        >
          {isGenerating ? 'Generating map...' : 'Generate from PDF'}
        </button>
      </div>
      {!nodes.length ? (
        <div className="mb-3 rounded-lg border border-border bg-slate-50 p-3 text-sm text-muted">
          No concept map yet. Select an uploaded PDF and click <b>Generate from PDF</b>.
        </div>
      ) : (
        <p className="mb-3 text-xs text-muted">Tap/click a node to inspect the concept details.</p>
      )}

      {nodes.length ? (
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
          {(conceptMapData?.links?.length ? conceptMapData.links : nodes.slice(1).map((n, idx) => ({ source: nodes[idx].id, target: n.id }))).map((l, i) => {
            const source = nodes.find((n) => n.id === l.source);
            const target = nodes.find((n) => n.id === l.target);
            if (!source || !target) return null;
            return (
            <line
              key={`edge-chain-${i}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke="#c7d2fe"
              strokeWidth="1.5"
              strokeDasharray="5 5"
            />
            );
          })}

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
      ) : null}

      {selected && nodes.length ? (
        <div className="mt-3 rounded-xl border border-border bg-slate-50 p-3">
          <p className="text-sm font-semibold text-text">{selected.nombre}</p>
          <p className="mt-1 text-sm text-muted">{selected.descripcion || 'No description available.'}</p>
        </div>
      ) : null}
    </section>
  );
}
