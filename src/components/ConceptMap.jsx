import { useMemo, useState } from 'react';

/** Pastel branch palette — children inherit their parent branch color (reference-style). */
const ROOT_FILL = '#fdba74';
const BRANCH_PALETTES = ['#fde68a', '#bae6fd', '#bbf7d0', '#fecaca', '#e9d5ff', '#fed7aa', '#a5f3fc', '#ddd6fe'];

const COL_GAP = 200;
const ROW_GAP = 56;
const BOX_PAD_X = 14;
const BOX_PAD_Y = 10;
const LINE_HEIGHT = 13;
const MIN_BOX_W = 96;
const MAX_BOX_W = 200;
const CHAR_PX = 7;
const CORNER_RX = 8;

function nodeDisplayLabel(n) {
  const raw = String(n?.nombre ?? n?.label ?? '').trim();
  if (raw) return raw.length > 48 ? `${raw.slice(0, 46)}…` : raw;
  return 'Topic';
}

function splitLabelToLines(text, maxLines, maxCharsPerLine) {
  const t = String(text || 'Topic').trim() || 'Topic';
  const words = t.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxCharsPerLine && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    } else {
      cur = next;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (!lines.length) lines.push(t.slice(0, maxCharsPerLine));
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    const last = lines[maxLines - 1];
    if (last.length > 2) lines[maxLines - 1] = `${last.slice(0, Math.max(1, maxCharsPerLine - 1))}…`;
  }
  return lines.slice(0, maxLines);
}

function measureBox(label, level) {
  const maxChars = level === 0 ? 18 : 16;
  const maxLines = level === 0 ? 4 : 3;
  const lines = splitLabelToLines(label, maxLines, maxChars);
  const textW = Math.max(...lines.map((l) => l.length), 4) * CHAR_PX;
  const w = Math.min(MAX_BOX_W, Math.max(MIN_BOX_W, textW + BOX_PAD_X * 2));
  const h = Math.max(40, lines.length * LINE_HEIGHT + BOX_PAD_Y * 2);
  return { lines, w, h, lineHeight: LINE_HEIGHT, maxChars };
}

function buildDirectedChildren(nodes, links) {
  const lev = new Map(nodes.map((n) => [n.id, Number(n.level) || 0]));
  const children = new Map();
  const parent = new Map();
  for (const n of nodes) {
    children.set(n.id, []);
  }
  for (const l of links) {
    const a = l.source;
    const b = l.target;
    const la = lev.get(a);
    const lb = lev.get(b);
    let p;
    let c;
    if (lb === la + 1) {
      p = a;
      c = b;
    } else if (la === lb + 1) {
      p = b;
      c = a;
    } else {
      continue;
    }
    if (!parent.has(c)) {
      parent.set(c, p);
      children.get(p).push(c);
    }
  }
  const root =
    nodes.find((n) => Number(n.level) === 0)?.id ||
    nodes.find((n) => /main|central|topic|root/i.test(String(n.label || '')))?.id ||
    nodes[0]?.id;
  if (!root) return { root: null, children, parent };
  for (const n of nodes) {
    if (n.id === root) continue;
    if (!parent.has(n.id)) {
      parent.set(n.id, root);
      children.get(root).push(n.id);
    }
  }
  for (const [, arr] of children) {
    arr.sort((a, b) => String(a).localeCompare(String(b)));
  }
  return { root, children, parent };
}

/** Horizontal tree: root left, subtrees grow right; y from recursive layout. */
function layoutTreePositions(root, children, measureById) {
  let cursorY = 0;
  const pos = new Map();

  function walk(id, depth) {
    const ch = children.get(id) || [];
    const m = measureById.get(id) || { w: MIN_BOX_W, h: 40 };
    if (!ch.length) {
      const y = cursorY;
      cursorY += ROW_GAP + m.h;
      pos.set(id, { x: depth * COL_GAP, y, depth, w: m.w, h: m.h });
      return { minY: y, maxY: y + m.h };
    }
    const bands = ch.map((cid) => walk(cid, depth + 1));
    const minY = Math.min(...bands.map((b) => b.minY));
    const maxY = Math.max(...bands.map((b) => b.maxY));
    const y = (minY + maxY) / 2 - m.h / 2;
    pos.set(id, { x: depth * COL_GAP, y, depth, w: m.w, h: m.h });
    return { minY: Math.min(minY, y), maxY: Math.max(maxY, y + m.h) };
  }

  if (root) walk(root, 0);

  let minX = Infinity;
  let minY = Infinity;
  for (const p of pos.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
  }
  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(minY)) minY = 0;
  const pad = 32;
  const shifted = new Map();
  for (const [id, p] of pos) {
    shifted.set(id, { ...p, x: p.x - minX + pad, y: p.y - minY + pad });
  }
  return shifted;
}

/** Fallback: column per level when links are missing or layout failed. */
function layoutLevelColumns(nodes) {
  const byLevel = new Map();
  for (const n of nodes) {
    const lv = Math.max(0, Math.min(3, Number(n.level) || 1));
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv).push(n);
  }
  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);
  const pad = 32;
  const out = new Map();
  let maxW = 0;
  let maxH = 0;
  for (const lv of sortedLevels) {
    const arr = byLevel.get(lv);
    const colX = lv * COL_GAP + pad;
    const totalH = arr.reduce((s, item) => s + measureBox(nodeDisplayLabel(item), lv).h + ROW_GAP, 0);
    let y = pad + Math.max(0, (400 - totalH) / 2);
    for (const item of arr) {
      const m = measureBox(nodeDisplayLabel(item), lv);
      out.set(item.id, { x: colX, y, depth: lv, w: m.w, h: m.h });
      y += m.h + ROW_GAP;
      maxW = Math.max(maxW, colX + m.w);
      maxH = Math.max(maxH, y);
    }
  }
  return { positions: out, contentW: maxW + pad, contentH: maxH + pad };
}

function buildNodesFromMap(conceptMapData) {
  const raw = (conceptMapData?.nodes || []).slice(0, 40);
  if (!raw.length) return [];

  const nodes = raw.map((item, i) => ({
    id: item.id,
    nombre: item.label,
    label: item.label,
    descripcion: item.description,
    level: item.level !== undefined && item.level !== null ? Math.max(0, Math.min(3, Number(item.level))) : 1,
  }));

  const links = conceptMapData?.links || [];
  const measureById = new Map(nodes.map((n) => {
    const m = measureBox(nodeDisplayLabel(n), n.level);
    return [n.id, m];
  }));

  if (!links.length) {
    const { positions } = layoutLevelColumns(nodes);
    return nodes.map((n) => {
      const p = positions.get(n.id);
      return { ...n, x: p.x, y: p.y, w: p.w, h: p.h };
    });
  }

  const { root, children } = buildDirectedChildren(nodes, links);
  if (!root) return [];

  const posMap = layoutTreePositions(root, children, measureById);
  return nodes
    .filter((n) => posMap.has(n.id))
    .map((n) => {
      const p = posMap.get(n.id);
      return { ...n, x: p.x, y: p.y, w: p.w, h: p.h };
    });
}

function assignBranchColorsFromTree(root, children) {
  const fill = new Map();
  if (!root) return fill;
  fill.set(root, ROOT_FILL);
  const ch1 = children.get(root) || [];
  ch1.forEach((cid, i) => {
    const col = BRANCH_PALETTES[i % BRANCH_PALETTES.length];
    const stack = [cid];
    while (stack.length) {
      const id = stack.pop();
      fill.set(id, col);
      for (const c of children.get(id) || []) stack.push(c);
    }
  });
  return fill;
}

function buildApartadosLayout(apartados, hubLabel) {
  const items = (apartados || []).slice(0, 16);
  if (!items.length) return { nodes: [], hub: null, contentW: 400, contentH: 300 };

  const hubM = measureBox(hubLabel, 0);
  const pad = 40;
  const gapX = 48;
  const childBoxes = items.map((item) => ({
    item,
    ...measureBox(nodeDisplayLabel(item), 1),
  }));
  const colX = pad + hubM.w + gapX;
  let y = pad;
  const maxChildW = Math.max(...childBoxes.map((c) => c.w), MIN_BOX_W);
  const nodes = childBoxes.map(({ item, w, h, lines }) => {
    const node = {
      ...item,
      x: colX,
      y,
      w,
      h,
      level: 1,
      _lines: lines,
    };
    y += h + ROW_GAP;
    return node;
  });
  const totalChildH = y - pad - ROW_GAP;
  const hubY = pad + Math.max(0, (totalChildH - hubM.h) / 2);
  const hub = {
    id: '__hub__',
    nombre: hubLabel,
    x: pad,
    y: hubY,
    w: hubM.w,
    h: hubM.h,
    level: 0,
    _lines: hubM.lines,
  };
  const contentW = colX + maxChildW + pad;
  const contentH = Math.max(hubY + hubM.h, y - ROW_GAP) + pad;
  return { nodes, hub, contentW, contentH };
}

function edgePathBezier(x1, y1, x2, y2) {
  const dx = Math.max(48, (x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export default function ConceptMap({
  apartados,
  chunks = [],
  activePdfId = '',
  onSelectPdf,
  conceptMapData = null,
  isGenerating = false,
  onGenerate,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const selectedChunk = chunks.find((c) => c.id === activePdfId) || chunks[0];
  const isFromAiMap = !!(conceptMapData?.nodes?.length);

  const hubLabel = useMemo(() => {
    const t = String(conceptMapData?.title || 'Main Topic').trim();
    return t.length > 40 ? `${t.slice(0, 38)}…` : t;
  }, [conceptMapData?.title]);

  const layout = useMemo(() => {
    if (isFromAiMap) {
      const placed = buildNodesFromMap(conceptMapData);
      let maxR = 0;
      let maxB = 0;
      for (const n of placed) {
        maxR = Math.max(maxR, n.x + n.w);
        maxB = Math.max(maxB, n.y + n.h);
      }
      const pad = 48;
      const contentW = Math.max(520, maxR + pad);
      const contentH = Math.max(360, maxB + pad);
      const links = conceptMapData?.links || [];
      const { root, children } = buildDirectedChildren(
        placed.map((n) => ({ id: n.id, label: n.nombre, level: n.level })),
        links,
      );
      const branchFill = assignBranchColorsFromTree(root, children);
      return { nodes: placed, hub: null, contentW, contentH, branchFill, children, rootId: root };
    }
    const { nodes, hub, contentW, contentH } = buildApartadosLayout(apartados, hubLabel);
    const branchFill = new Map();
    if (hub) branchFill.set(hub.id, ROOT_FILL);
    nodes.forEach((n, i) => branchFill.set(n.id, BRANCH_PALETTES[i % BRANCH_PALETTES.length]));
    return {
      nodes,
      hub,
      contentW,
      contentH,
      branchFill,
      children: null,
      rootId: hub?.id,
    };
  }, [apartados, conceptMapData, isFromAiMap, hubLabel]);

  const { nodes, hub, contentW, contentH, branchFill } = layout;

  const allDrawNodes = useMemo(() => (hub ? [hub, ...nodes] : nodes), [hub, nodes]);

  const selected = allDrawNodes.find((n) => n.id === selectedId) || allDrawNodes[0];

  const linksToDraw = useMemo(() => {
    if (isFromAiMap && conceptMapData?.links?.length) return conceptMapData.links;
    if (!isFromAiMap && hub && nodes.length) {
      return nodes.map((n) => ({ source: hub.id, target: n.id }));
    }
    return [];
  }, [isFromAiMap, conceptMapData?.links, hub, nodes]);

  const baseView = useMemo(() => {
    const pad = 24;
    return { x: 0, y: 0, w: contentW + pad * 2, h: contentH + pad * 2 };
  }, [contentW, contentH]);

  const viewBoxStr = useMemo(() => {
    const { x, y, w, h } = baseView;
    const z = Math.max(0.35, Math.min(3, zoomLevel));
    const vw = w / z;
    const vh = h / z;
    const vx = x + (w - vw) / 2;
    const vy = y + (h - vh) / 2;
    return `${vx.toFixed(2)} ${vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}`;
  }, [baseView, zoomLevel]);

  const downloadBlob = (filename, blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const serializeSvgFullCanvas = () => {
    const svg = document.getElementById('concept-map-svg');
    if (!svg) return '';
    const clone = svg.cloneNode(true);
    clone.setAttribute('viewBox', `0 0 ${baseView.w} ${baseView.h}`);
    clone.removeAttribute('style');
    return new XMLSerializer().serializeToString(clone);
  };

  const exportSvg = () => {
    const xml = serializeSvgFullCanvas();
    if (!xml) return;
    downloadBlob('concept-map.svg', new Blob([xml], { type: 'image/svg+xml' }));
  };

  const exportPng = () => {
    const xml = serializeSvgFullCanvas();
    if (!xml) return;
    const img = new Image();
    const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = baseView.w * scale;
      canvas.height = baseView.h * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#f4f4f5';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) downloadBlob('concept-map.png', blob);
      }, 'image/png');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const exportHtml = () => {
    const payload = JSON.stringify({
      title: conceptMapData?.title || 'Concept Map',
      nodes: allDrawNodes,
      links: conceptMapData?.links || linksToDraw,
    });
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Concept Map</title></head><body><h2>Concept Map Export</h2><pre id="data"></pre><script>const data=${payload};document.getElementById('data').textContent=JSON.stringify(data,null,2);</script></body></html>`;
    downloadBlob('concept-map.html', new Blob([html], { type: 'text/html' }));
  };

  const nodeById = useMemo(() => new Map(allDrawNodes.map((n) => [n.id, n])), [allDrawNodes]);

  return (
    <section className="panel">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{conceptMapData?.title || 'Concept Map'}</h3>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border bg-white px-3 py-1 text-xs text-muted">
            {allDrawNodes.length} nodes
          </span>
          {allDrawNodes.length ? (
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
          value={activePdfId || ''}
          onChange={(e) => onSelectPdf?.(e.target.value)}
          disabled={!chunks.length || isGenerating}
        >
          {!chunks.length ? <option value="">Upload a PDF first</option> : null}
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
      {!allDrawNodes.length ? (
        <div className="mb-3 rounded-lg border border-border bg-slate-50 p-3 text-sm text-muted">
          No concept map yet. Select an uploaded PDF and click <b>Generate from PDF</b>.
        </div>
      ) : (
        <p className="mb-3 text-xs text-muted">
          Tap a node for details. Branches use matching colors; lines show how ideas connect.
        </p>
      )}

      {allDrawNodes.length ? (
        <div className="relative overflow-hidden rounded-xl border border-border bg-[#f4f4f5]">
          <button
            type="button"
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50"
            title="Download PNG"
            onClick={exportPng}
            aria-label="Download concept map as PNG"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
          </button>
          <div className="overflow-x-auto p-3 pt-12">
            <svg
              id="concept-map-svg"
              viewBox={viewBoxStr}
              preserveAspectRatio="xMidYMid meet"
              className="h-[480px] max-h-[70vh] w-full min-w-[320px]"
            >
              <rect x="0" y="0" width={baseView.w} height={baseView.h} fill="#f4f4f5" />
              <g transform={`translate(24, 24)`}>
                {linksToDraw.map((l, i) => {
                  const source = nodeById.get(l.source);
                  const target = nodeById.get(l.target);
                  if (!source || !target) return null;
                  const x1 = source.x + source.w;
                  const y1 = source.y + source.h / 2;
                  const x2 = target.x;
                  const y2 = target.y + target.h / 2;
                  return (
                    <path
                      key={`edge-${l.source}-${l.target}-${i}`}
                      d={edgePathBezier(x1, y1, x2, y2)}
                      fill="none"
                      stroke="#c4c4c4"
                      strokeWidth="1.5"
                    >
                      <title>{l.label || 'related'}</title>
                    </path>
                  );
                })}

                {allDrawNodes.map((n) => {
                  const isActive = selected?.id === n.id;
                  const label = nodeDisplayLabel(n);
                  const m = n._lines ? { lines: n._lines, w: n.w, h: n.h, lineHeight: LINE_HEIGHT } : measureBox(label, n.level);
                  const fill =
                    branchFill.get(n.id) ||
                    (n.level === 0 ? ROOT_FILL : BRANCH_PALETTES[Math.abs(String(n.id).length) % BRANCH_PALETTES.length]);
                  const strokeW = isActive ? 2.25 : 1;
                  const lines = m.lines;
                  const fs = n.level === 0 ? 12.5 : 11;
                  const midY = n.y + n.h / 2;
                  const startY = midY - ((lines.length - 1) * m.lineHeight) / 2;
                  return (
                    <g key={n.id} className="cursor-pointer" onClick={() => setSelectedId(n.id)}>
                      <rect
                        x={n.x}
                        y={n.y}
                        width={n.w}
                        height={n.h}
                        rx={CORNER_RX}
                        ry={CORNER_RX}
                        fill={fill}
                        stroke="#171717"
                        strokeWidth={strokeW}
                      />
                      {lines.map((line, idx) => (
                        <text
                          key={idx}
                          x={n.x + n.w / 2}
                          y={startY + idx * m.lineHeight}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#171717"
                          fontSize={fs}
                          fontWeight="600"
                          style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
                        >
                          {line}
                        </text>
                      ))}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
          <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-lg border border-zinc-300 bg-white p-1 shadow-sm">
            <button
              type="button"
              className="rounded px-2 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
              onClick={() => setZoomLevel((z) => Math.min(3, z * 1.2))}
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              className="rounded px-2 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
              onClick={() => setZoomLevel((z) => Math.max(0.35, z / 1.2))}
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 hover:bg-zinc-100"
              onClick={() => setZoomLevel(1)}
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}

      {selected && allDrawNodes.length ? (
        <div className="mt-3 rounded-xl border border-border bg-slate-50 p-3">
          <p className="text-sm font-semibold text-text">{selected.nombre}</p>
          {selected.level !== undefined ? (
            <p className="text-xs text-muted">
              Tier {selected.level} {selected.level === 0 ? '(theme)' : ''}
            </p>
          ) : null}
          <p className="mt-1 text-sm text-muted">{selected.descripcion || 'No description available.'}</p>
        </div>
      ) : null}
    </section>
  );
}
