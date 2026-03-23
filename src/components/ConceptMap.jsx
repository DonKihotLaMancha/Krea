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

  const downloadBlob = (filename, blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSvg = () => {
    const svg = document.getElementById('concept-map-svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    downloadBlob('concept-map.svg', new Blob([xml], { type: 'image/svg+xml' }));
  };

  const exportPng = () => {
    const svg = document.getElementById('concept-map-svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 560;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) downloadBlob('concept-map.png', blob);
      }, 'image/png');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const exportHtml = () => {
    const payload = JSON.stringify({ title: conceptMapData?.title || 'Concept Map', nodes, links: conceptMapData?.links || [] });
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Concept Map</title></head><body><h2>Concept Map Export</h2><pre id="data"></pre><script>const data=${payload};document.getElementById('data').textContent=JSON.stringify(data,null,2);</script></body></html>`;
    downloadBlob('concept-map.html', new Blob([html], { type: 'text/html' }));
  };

  return (
    <section className="panel">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{conceptMapData?.title || 'Concept Map'}</h3>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border bg-white px-3 py-1 text-xs text-muted">{nodes.length} nodes</span>
          {nodes.length ? (
            <>
              <button className="btn-ghost !px-2 !py-1 text-xs" onClick={exportSvg}>Export SVG</button>
              <button className="btn-ghost !px-2 !py-1 text-xs" onClick={exportPng}>Export PNG</button>
              <button className="btn-ghost !px-2 !py-1 text-xs" onClick={exportHtml}>Export HTML</button>
            </>
          ) : null}
        </div>
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
        <svg id="concept-map-svg" viewBox="0 0 1000 560" className="h-[420px] w-full min-w-[760px]">
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
