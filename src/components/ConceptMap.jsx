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

/** Tiered layout by level (0 = theme, 1–3 = deeper). */
function buildNodesFromMap(mapData) {
  const raw = (mapData?.nodes || []).slice(0, 24);
  if (!raw.length) return [];

  const withLevel = raw.map((item, i) => {
    const lv =
      item.level !== undefined && item.level !== null
        ? Math.max(0, Math.min(3, Number(item.level)))
        : Math.min(3, 1 + Math.floor(i / 6));
    return {
      id: item.id,
      label: item.label,
      description: item.description,
      level: Number.isFinite(lv) ? lv : 1,
    };
  });

  const byLevel = new Map();
  for (const item of withLevel) {
    if (!byLevel.has(item.level)) byLevel.set(item.level, []);
    byLevel.get(item.level).push(item);
  }

  const centerX = 500;
  const centerY = 280;
  const rowDy = 108;
  const out = [];

  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);
  for (const lv of sortedLevels) {
    const arr = byLevel.get(lv);
    const y =
      lv === 0
        ? centerY
        : centerY - rowDy * 1.4 + lv * rowDy * 0.95;
    const n = arr.length;
    const spacing = Math.min(200, 780 / Math.max(n, 1));
    const startX = centerX - ((n - 1) * spacing) / 2;
    arr.forEach((item, i) => {
      const x = n === 1 ? centerX : startX + i * spacing;
      out.push({
        id: item.id,
        nombre: item.label,
        descripcion: item.description,
        level: lv,
        x,
        y,
      });
    });
  }

  return out;
}

export default function ConceptMap({ apartados, chunks = [], conceptMapData = null, isGenerating = false, onGenerate }) {
  const [selectedChunkId, setSelectedChunkId] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const selectedChunk = selectedChunkId ? chunks.find((c) => c.id === selectedChunkId) : chunks[0];
  const isFromAiMap = !!(conceptMapData?.nodes?.length);

  const nodes = useMemo(
    () => (isFromAiMap ? buildNodesFromMap(conceptMapData) : buildNodes(apartados)),
    [apartados, conceptMapData, isFromAiMap],
  );

  const selected = nodes.find((n) => n.id === selectedId) || nodes[0];

  const hubLabel = useMemo(() => {
    const n0 = nodes.find((n) => n.level === 0);
    if (n0?.nombre) return String(n0.nombre).slice(0, 22);
    return String(conceptMapData?.title || 'Main Topic').slice(0, 22);
  }, [nodes, conceptMapData?.title]);

  const centerNode = useMemo(() => {
    const n0 = nodes.find((n) => n.level === 0);
    if (n0) return { x: n0.x, y: n0.y, showRing: false };
    return { x: 500, y: 280, showRing: true };
  }, [nodes]);

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

  const linksToDraw = conceptMapData?.links?.length
    ? conceptMapData.links
    : !isFromAiMap && nodes.length > 1
      ? nodes.slice(1).map((n, idx) => ({ source: nodes[idx]?.id, target: n.id }))
      : [];

  return (
    <section className="panel">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{conceptMapData?.title || 'Concept Map'}</h3>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border bg-white px-3 py-1 text-xs text-muted">{nodes.length} nodes</span>
          {nodes.length ? (
            <>
              <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={exportSvg}>
                Export SVG
              </button>
              <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={exportPng}>
                Export PNG
              </button>
              <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={exportHtml}>
                Export HTML
              </button>
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
          {chunks.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
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
        <p className="mb-3 text-xs text-muted">Tap a node for details. Links show how ideas connect (deeper = lower tiers).</p>
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

            {linksToDraw.map((l, i) => {
              const source = nodes.find((n) => n.id === l.source);
              const target = nodes.find((n) => n.id === l.target);
              if (!source || !target) return null;
              return (
                <g key={`edge-${l.source}-${l.target}-${i}`}>
                  <title>{l.label || 'related'}</title>
                  <line
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke="url(#lineGrad)"
                    strokeWidth="2"
                    strokeOpacity="0.85"
                  />
                </g>
              );
            })}

            {!isFromAiMap ? (
              <>
                {nodes.map((n) => (
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
                <g>
                  <circle cx={centerNode.x} cy={centerNode.y} r="56" fill="#4f46e5" opacity="0.95" />
                  <text x={centerNode.x} y={centerNode.y + 6} textAnchor="middle" fill="#fff" fontSize="15" fontWeight="700">
                    {hubLabel}
                  </text>
                </g>
              </>
            ) : nodes.some((n) => n.level === 0) ? null : (
              <g>
                <circle cx={centerNode.x} cy={centerNode.y} r="48" fill="#4f46e5" opacity="0.9" />
                <text x={centerNode.x} y={centerNode.y + 5} textAnchor="middle" fill="#fff" fontSize="14" fontWeight="700">
                  {hubLabel}
                </text>
              </g>
            )}

            {nodes.map((n) => {
              const isActive = selected?.id === n.id;
              const label = String(n.nombre || '').slice(0, 28);
              const r = n.level === 0 ? (isActive ? 52 : 48) : isActive ? 44 : 38;
              const fill = n.level === 0 ? '#4f46e5' : isActive ? '#7c3aed' : '#0ea5e9';
              return (
                <g key={n.id} className="cursor-pointer" onClick={() => setSelectedId(n.id)}>
                  <circle cx={n.x} cy={n.y} r={r} fill={fill} opacity="0.93" />
                  <text x={n.x} y={n.y + 4} textAnchor="middle" fill="#fff" fontSize={n.level === 0 ? 13 : 11} fontWeight="600">
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
          {selected.level !== undefined ? (
            <p className="text-xs text-muted">Tier {selected.level} {selected.level === 0 ? '(theme)' : ''}</p>
          ) : null}
          <p className="mt-1 text-sm text-muted">{selected.descripcion || 'No description available.'}</p>
        </div>
      ) : null}
    </section>
  );
}
