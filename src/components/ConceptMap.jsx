import { useEffect, useMemo, useRef, useState } from 'react';

/** Pastel branch palette — fallback when categoryTag is missing. */
const ROOT_FILL = '#fdba74';
const BRANCH_PALETTES = ['#fde68a', '#bae6fd', '#bbf7d0', '#fecaca', '#e9d5ff', '#fed7aa', '#a5f3fc', '#ddd6fe'];

/** Semantic fills by categoryTag (study-tool convention). */
const CATEGORY_FILL = {
  theory: '#bbf7d0',
  process: '#86efac',
  action: '#fde68a',
  definition: '#93c5fd',
  fact: '#bfdbfe',
  exam: '#fecaca',
  risk: '#fca5a5',
  other: '#e5e7eb',
};

const COL_GAP = 200;
const ROW_GAP = 72;
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

function measureBoxForNode(n) {
  const label = nodeDisplayLabel(n);
  const tldr = String(n.tldr || '').trim();
  const maxChars = n.level === 0 ? 18 : 16;
  const labelLines = splitLabelToLines(label, n.level === 0 ? 3 : 2, maxChars);
  const tldrLines = tldr ? splitLabelToLines(tldr, 2, 26) : [];
  const lineHeight = LINE_HEIGHT;
  const tldrLineHeight = LINE_HEIGHT - 1;
  const allLens = [...labelLines.map((l) => l.length), ...tldrLines.map((l) => l.length), 4];
  const textW = Math.max(...allLens) * CHAR_PX;
  const w = Math.min(MAX_BOX_W + 8, Math.max(MIN_BOX_W, textW + BOX_PAD_X * 2));
  const labelH = labelLines.length * lineHeight;
  const tldrH = tldrLines.length ? 4 + tldrLines.length * tldrLineHeight : 0;
  const h = Math.max(44, labelH + tldrH + BOX_PAD_Y * 2);
  return { labelLines, tldrLines, w, h, lineHeight, tldrLineHeight, cardStrip: 0 };
}

function getVisibleNodeIds(root, children, collapsedIds) {
  const out = new Set();
  function walk(id) {
    out.add(id);
    if (collapsedIds.has(id)) return;
    for (const c of children.get(id) || []) walk(c);
  }
  if (root) walk(root);
  return out;
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

/** Radial sector layout: root at center, children fan out on a clock / wheel with increasing radius. */
function layoutRadialSectorPositions(root, children, measureById) {
  const pos = new Map();
  if (!root) return pos;
  const CX = 520;
  const CY = 440;
  const R_BASE = 260;
  const R_STEP = 200;

  const rootM = measureById.get(root) || { w: MIN_BOX_W, h: 44 };
  pos.set(root, {
    x: CX - rootM.w / 2,
    y: CY - rootM.h / 2,
    depth: 0,
    w: rootM.w,
    h: rootM.h,
  });

  function recurse(pid, angleStart, angleEnd, radius, depth) {
    const ch = (children.get(pid) || []).slice().sort((a, b) => String(a).localeCompare(String(b)));
    if (!ch.length) return;
    const span = angleEnd - angleStart;
    const n = ch.length;
    for (let i = 0; i < n; i += 1) {
      const a0 = angleStart + (span * i) / n;
      const a1 = angleStart + (span * (i + 1)) / n;
      const mid = (a0 + a1) / 2;
      const cid = ch[i];
      const m = measureById.get(cid) || { w: MIN_BOX_W, h: 44 };
      const x = CX + radius * Math.cos(mid - Math.PI / 2) - m.w / 2;
      const y = CY + radius * Math.sin(mid - Math.PI / 2) - m.h / 2;
      pos.set(cid, { x, y, depth, w: m.w, h: m.h });
      recurse(cid, a0, a1, radius + R_STEP, depth + 1);
    }
  }

  const ch0 = (children.get(root) || []).slice().sort((a, b) => String(a).localeCompare(String(b)));
  const TWO_PI = 2 * Math.PI;
  const n0 = ch0.length;
  if (n0) {
    for (let i = 0; i < n0; i += 1) {
      const a0 = (i / n0) * TWO_PI;
      const a1 = ((i + 1) / n0) * TWO_PI;
      const mid = (a0 + a1) / 2;
      const cid = ch0[i];
      const m = measureById.get(cid) || { w: MIN_BOX_W, h: 44 };
      const x = CX + R_BASE * Math.cos(mid - Math.PI / 2) - m.w / 2;
      const y = CY + R_BASE * Math.sin(mid - Math.PI / 2) - m.h / 2;
      pos.set(cid, { x, y, depth: 1, w: m.w, h: m.h });
      recurse(cid, a0, a1, R_BASE + R_STEP, 2);
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  for (const p of pos.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
  }
  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(minY)) minY = 0;
  const pad = 40;
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
    const totalH = arr.reduce((s, item) => s + measureBoxForNode({ ...item, level: lv }).h + ROW_GAP, 0);
    let y = pad + Math.max(0, (400 - totalH) / 2);
    for (const item of arr) {
      const m = measureBoxForNode({ ...item, level: lv });
      out.set(item.id, { x: colX, y, depth: lv, w: m.w, h: m.h });
      y += m.h + ROW_GAP;
      maxW = Math.max(maxW, colX + m.w);
      maxH = Math.max(maxH, y);
    }
  }
  return { positions: out, contentW: maxW + pad, contentH: maxH + pad };
}

function buildNodesFromMap(conceptMapData, collapsedIds = new Set()) {
  const raw = (conceptMapData?.nodes || []).slice(0, 72);
  if (!raw.length) return [];

  const nodes = raw.map((item) => ({
    id: item.id,
    nombre: item.label,
    label: item.label,
    descripcion: item.description,
    tldr: String(item.tldr || '').trim(),
    categoryTag: String(item.categoryTag || 'other').toLowerCase(),
    parentId: item.parentId != null ? String(item.parentId) : null,
    level: item.level !== undefined && item.level !== null ? Math.max(0, Math.min(3, Number(item.level))) : 1,
  }));

  const allLinks = conceptMapData?.links || [];
  const treeLinks = allLinks.filter((l) => !l.crossLink);
  const measureById = new Map(nodes.map((n) => [n.id, measureBoxForNode(n)]));

  if (!treeLinks.length) {
    const { positions } = layoutLevelColumns(nodes);
    return nodes.map((n) => {
      const p = positions.get(n.id);
      const m = measureById.get(n.id) || measureBoxForNode(n);
      return { ...n, x: p.x, y: p.y, w: m.w, h: m.h, _measure: m };
    });
  }

  const { root, children } = buildDirectedChildren(nodes, treeLinks);
  if (!root) return [];

  const visibleIds = getVisibleNodeIds(root, children, collapsedIds);
  const nodesVisible = nodes.filter((n) => visibleIds.has(n.id));
  const childrenFiltered = new Map(nodesVisible.map((n) => [n.id, []]));
  for (const n of nodesVisible) {
    const ch = (children.get(n.id) || []).filter((c) => visibleIds.has(c));
    childrenFiltered.set(n.id, ch);
  }

  const measureByVisible = new Map(nodesVisible.map((n) => [n.id, measureBoxForNode(n)]));
  const posMap = layoutRadialSectorPositions(root, childrenFiltered, measureByVisible);
  return nodesVisible
    .filter((n) => posMap.has(n.id))
    .map((n) => {
      const p = posMap.get(n.id);
      const m = measureByVisible.get(n.id) || measureBoxForNode(n);
      return { ...n, x: p.x, y: p.y, w: m.w, h: m.h, _measure: m };
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
  onGenerateFlashcardsFromTopic,
  highPriorityNodeIds,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [deepDive, setDeepDive] = useState(false);
  const [collapsedIdsArr, setCollapsedIdsArr] = useState([]);
  const scrollRef = useRef(null);
  const panRef = useRef({ active: false, sx: 0, sy: 0, sl: 0, st: 0 });
  const selectedChunk = chunks.find((c) => c.id === activePdfId) || chunks[0];
  const isFromAiMap = !!(conceptMapData?.nodes?.length);

  const highPrioritySet = useMemo(() => {
    const h = highPriorityNodeIds;
    if (!h) return new Set();
    if (h instanceof Set) return h;
    return new Set(Array.isArray(h) ? h : []);
  }, [highPriorityNodeIds]);

  const hubLabel = useMemo(() => {
    const t = String(conceptMapData?.title || 'Main Topic').trim();
    return t.length > 40 ? `${t.slice(0, 38)}…` : t;
  }, [conceptMapData?.title]);

  const collapsedSet = useMemo(() => new Set(collapsedIdsArr), [collapsedIdsArr]);

  useEffect(() => {
    setCollapsedIdsArr([]);
  }, [conceptMapData?.title, conceptMapData?.nodes?.length]);

  const layout = useMemo(() => {
    if (isFromAiMap) {
      const placed = buildNodesFromMap(conceptMapData, collapsedSet);
      let maxR = 0;
      let maxB = 0;
      for (const n of placed) {
        maxR = Math.max(maxR, n.x + n.w);
        maxB = Math.max(maxB, n.y + n.h);
      }
      const pad = 48;
      const contentW = Math.max(520, maxR + pad);
      const contentH = Math.max(360, maxB + pad);
      const treeLinks = (conceptMapData?.links || []).filter((l) => !l.crossLink);
      const { root, children } = buildDirectedChildren(
        placed.map((n) => ({ id: n.id, label: n.nombre, level: n.level })),
        treeLinks,
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
  }, [apartados, conceptMapData, isFromAiMap, hubLabel, collapsedSet]);

  const { nodes, hub, contentW, contentH, branchFill, children: treeChildrenMap } = layout;

  const allDrawNodes = useMemo(() => (hub ? [hub, ...nodes] : nodes), [hub, nodes]);

  const selected = allDrawNodes.find((n) => n.id === selectedId) || allDrawNodes[0];

  const visibleNodeIds = useMemo(() => new Set(allDrawNodes.map((n) => n.id)), [allDrawNodes]);

  const treeEdges = useMemo(() => {
    if (!isFromAiMap || !conceptMapData?.links?.length) return [];
    return conceptMapData.links.filter(
      (l) => !l.crossLink && visibleNodeIds.has(l.source) && visibleNodeIds.has(l.target),
    );
  }, [isFromAiMap, conceptMapData?.links, visibleNodeIds]);

  const crossEdges = useMemo(() => {
    if (!isFromAiMap || !conceptMapData?.links?.length) return [];
    return conceptMapData.links.filter(
      (l) => l.crossLink && visibleNodeIds.has(l.source) && visibleNodeIds.has(l.target),
    );
  }, [isFromAiMap, conceptMapData?.links, visibleNodeIds]);

  const hubEdges = useMemo(() => {
    if (isFromAiMap || !hub || !nodes.length) return [];
    return nodes.map((n) => ({ source: hub.id, target: n.id, label: '', crossLink: false }));
  }, [isFromAiMap, hub, nodes]);

  const baseView = useMemo(() => {
    const pad = 24;
    return { x: 0, y: 0, w: contentW + pad * 2, h: contentH + pad * 2 };
  }, [contentW, contentH]);

  useEffect(() => {
    setZoomLevel(1);
  }, [contentW, contentH]);

  const displayW = baseView.w * Math.max(0.25, Math.min(4, zoomLevel));
  const displayH = baseView.h * Math.max(0.25, Math.min(4, zoomLevel));

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
    const exportLinks = isFromAiMap ? conceptMapData?.links || [] : hubEdges;
    const payload = JSON.stringify({
      title: conceptMapData?.title || 'Mind Map',
      nodes: allDrawNodes,
      links: exportLinks,
    });
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Mind Map</title></head><body><h2>Mind Map Export</h2><pre id="data"></pre><script>const data=${payload};document.getElementById('data').textContent=JSON.stringify(data,null,2);</script></body></html>`;
    downloadBlob('concept-map.html', new Blob([html], { type: 'text/html' }));
  };

  const nodeById = useMemo(() => new Map(allDrawNodes.map((n) => [n.id, n])), [allDrawNodes]);

  const drawEdges = (list, { dashed = false, stroke = '#c4c4c4' }) =>
    list.map((l, i) => {
      const source = nodeById.get(l.source);
      const target = nodeById.get(l.target);
      if (!source || !target) return null;
      const x1 = source.x + source.w / 2;
      const y1 = source.y + source.h / 2;
      const x2 = target.x + target.w / 2;
      const y2 = target.y + target.h / 2;
      return (
        <path
          key={`${dashed ? 'x' : 't'}-${l.source}-${l.target}-${i}`}
          d={edgePathBezier(x1, y1, x2, y2)}
          fill="none"
          stroke={dashed ? '#64748b' : stroke}
          strokeWidth={dashed ? 1.25 : 1.5}
          strokeDasharray={dashed ? '7 5' : undefined}
          opacity={dashed ? 0.95 : 1}
        >
          <title>{l.label || (dashed ? 'cross-link' : 'related')}</title>
        </path>
      );
    });

  return (
    <section className="panel">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{conceptMapData?.title || 'Mind Map'}</h3>
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
      <div className="mb-3 flex flex-col gap-2">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
          <select
            className="input"
            value={activePdfId || ''}
            onChange={(e) => onSelectPdf?.(e.target.value)}
            disabled={!chunks.length || isGenerating}
          >
            {!chunks.length ? <option value="">Upload a document first</option> : null}
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
            onClick={() => selectedChunk && onGenerate(selectedChunk.id, { deepDive })}
          >
            {isGenerating ? 'Generating map...' : deepDive ? 'Generate deep dive map' : 'Generate map'}
          </button>
        </div>
        <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-border"
            checked={deepDive}
            onChange={(e) => setDeepDive(e.target.checked)}
            disabled={isGenerating}
          />
          <span>
            <strong className="text-slate-800">Deep dive</strong> — pulls a Wikipedia summary when possible, expands the graph
            (24–40 nodes), tighter link labels, and suggested books/papers/standards to read next. Slower and uses more context.
          </span>
        </label>
      </div>
      {!allDrawNodes.length || !isFromAiMap ? (
        <div className="mb-3 rounded-lg border border-border bg-slate-50 p-3 text-sm text-muted">
          No mind map yet. Select an uploaded document and click <b>Generate map</b>.
        </div>
      ) : (
        <p className="mb-3 text-xs text-muted">
          Tap a node for details. Solid lines = hierarchy; dashed = cross-links.
        </p>
      )}
      {null}

      {isFromAiMap && allDrawNodes.length ? (
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
          <p className="absolute left-3 top-11 z-[5] max-w-[min(100%,36rem)] rounded border border-border bg-white/95 px-2 py-1.5 text-[11px] leading-snug text-muted shadow-sm">
            Drag empty canvas to pan · scrollbars · <kbd className="rounded border border-border bg-slate-50 px-1">Ctrl</kbd> + wheel
            to zoom · use +/−
          </p>
          <div
            ref={scrollRef}
            className="max-h-[78vh] touch-pan-y overflow-auto overscroll-contain p-3 pt-12"
            onWheel={(e) => {
              if (!e.ctrlKey) return;
              e.preventDefault();
              setZoomLevel((z) => Math.max(0.25, Math.min(4, z * (e.deltaY > 0 ? 0.92 : 1.08))));
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              if (e.target.closest('.concept-map-node') || e.target.closest('.concept-map-no-pan')) return;
              const el = scrollRef.current;
              if (!el) return;
              panRef.current = {
                active: true,
                sx: e.clientX,
                sy: e.clientY,
                sl: el.scrollLeft,
                st: el.scrollTop,
              };
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                /* ignore */
              }
            }}
            onPointerMove={(e) => {
              if (!panRef.current.active) return;
              const el = scrollRef.current;
              if (!el) return;
              const dx = e.clientX - panRef.current.sx;
              const dy = e.clientY - panRef.current.sy;
              el.scrollLeft = panRef.current.sl - dx;
              el.scrollTop = panRef.current.st - dy;
            }}
            onPointerUp={(e) => {
              panRef.current.active = false;
              try {
                e.currentTarget.releasePointerCapture(e.pointerId);
              } catch {
                /* ignore */
              }
            }}
            onPointerCancel={(e) => {
              panRef.current.active = false;
              try {
                e.currentTarget.releasePointerCapture(e.pointerId);
              } catch {
                /* ignore */
              }
            }}
            role="presentation"
          >
            <svg
              id="concept-map-svg"
              width={displayW}
              height={displayH}
              viewBox={`0 0 ${baseView.w} ${baseView.h}`}
              preserveAspectRatio="xMinYMin meet"
              className="block min-w-0"
            >
              <rect x="0" y="0" width={baseView.w} height={baseView.h} fill="#f4f4f5" />
              <g transform={`translate(24, 24)`}>
                {drawEdges(isFromAiMap ? treeEdges : hubEdges, { dashed: false })}
                {drawEdges(crossEdges, { dashed: true })}

                {allDrawNodes.map((n) => {
                  const isActive = selected?.id === n.id;
                  const m = n._measure || measureBoxForNode(n);
                  const labelLineTexts = n._lines
                    ? splitLabelToLines(nodeDisplayLabel(n), n.level === 0 ? 3 : 2, n.level === 0 ? 18 : 16)
                    : m.labelLines;
                  const tldrLineTexts = n._lines ? [] : m.tldrLines || [];
                  const lineHeight = m.lineHeight || LINE_HEIGHT;
                  const tldrLineHeight = m.tldrLineHeight || LINE_HEIGHT - 1;
                  const tag = String(n.categoryTag || 'other').toLowerCase();
                  const fill = isFromAiMap
                    ? CATEGORY_FILL[tag] || branchFill.get(n.id) || ROOT_FILL
                    : branchFill.get(n.id) ||
                      (n.level === 0 ? ROOT_FILL : BRANCH_PALETTES[Math.abs(String(n.id).length) % BRANCH_PALETTES.length]);
                  const isHighP = isFromAiMap && highPrioritySet.has(n.id);
                  const strokeW = isActive ? 2.25 : isHighP ? 2.5 : 1;
                  const fs = n.level === 0 ? 12.5 : 11;
                  const fsTldr = 9.5;
                  const labelBlockH = labelLineTexts.length * lineHeight;
                  const tldrBlockH = tldrLineTexts.length ? 4 + tldrLineTexts.length * tldrLineHeight : 0;
                  const contentH = labelBlockH + tldrBlockH;
                  const startY = n.y + (n.h - contentH) / 2;
                  const desc = String(n.descripcion || '').trim();
                  const hasCh = isFromAiMap && (treeChildrenMap?.get(n.id) || []).length > 0;
                  const isCollapsed = collapsedIdsArr.includes(n.id);
                  return (
                    <g key={n.id} className="concept-map-node cursor-pointer" onClick={() => setSelectedId(n.id)}>
                      <title>{desc || String(n.tldr || n.nombre || '')}</title>
                      <rect
                        x={n.x}
                        y={n.y}
                        width={n.w}
                        height={n.h}
                        rx={CORNER_RX}
                        ry={CORNER_RX}
                        fill={fill}
                        stroke={isHighP ? '#b91c1c' : '#171717'}
                        strokeWidth={strokeW}
                      />
                      {hasCh ? (
                        <g
                          className="concept-map-no-pan"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCollapsedIdsArr((prev) =>
                              prev.includes(n.id) ? prev.filter((x) => x !== n.id) : [...prev, n.id],
                            );
                          }}
                        >
                          <rect
                            x={n.x + 4}
                            y={n.y + 4}
                            width={16}
                            height={16}
                            rx={4}
                            fill="rgba(255,255,255,0.85)"
                            stroke="#525252"
                            strokeWidth={1}
                          />
                          <text
                            x={n.x + 12}
                            y={n.y + 15}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill="#171717"
                            fontSize="12"
                            fontWeight="700"
                            style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
                          >
                            {isCollapsed ? '+' : '−'}
                          </text>
                          <title>{isCollapsed ? 'Expand branch' : 'Collapse branch'}</title>
                        </g>
                      ) : null}
                      {labelLineTexts.map((line, idx) => (
                        <text
                          key={`l-${idx}`}
                          x={n.x + n.w / 2}
                          y={startY + idx * lineHeight + lineHeight / 2}
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
                      {tldrLineTexts.map((line, idx) => (
                        <text
                          key={`t-${idx}`}
                          x={n.x + n.w / 2}
                          y={startY + labelBlockH + 4 + idx * tldrLineHeight + tldrLineHeight / 2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#334155"
                          fontSize={fsTldr}
                          fontWeight="500"
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
              onClick={() => setZoomLevel((z) => Math.min(4, z * 1.2))}
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              className="rounded px-2 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
              onClick={() => setZoomLevel((z) => Math.max(0.25, z / 1.2))}
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

      {conceptMapData?.externalResources?.length ? (
        <div className="mt-4 rounded-xl border border-border bg-white p-3">
          <p className="text-sm font-semibold text-slate-800">Suggested further reading</p>
          <p className="mb-2 text-[11px] text-muted">
            From deep dive mode — verify links before relying on them for coursework.
          </p>
          <ul className="space-y-2 text-xs text-slate-700">
            {conceptMapData.externalResources.map((r, i) => (
              <li key={`ext-${i}`} className="rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5">
                <span className="font-semibold text-slate-800">
                  [{String(r.kind || 'ref').slice(0, 24)}] {r.title}
                </span>
                {r.note ? <span className="text-muted"> — {r.note}</span> : null}
                {r.url ? (
                  <a
                    href={r.url}
                    className="ml-1 text-canvas-primary underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {selected && allDrawNodes.length ? (
        <div className="mt-3 rounded-xl border border-border bg-slate-50 p-3">
          <p className="text-sm font-semibold text-text">{selected.nombre}</p>
          {selected.level !== undefined ? (
            <p className="text-xs text-muted">
              Tier {selected.level} {selected.level === 0 ? '(theme)' : ''}
              {isFromAiMap && selected.categoryTag ? ` · ${selected.categoryTag}` : ''}
            </p>
          ) : null}
          {isFromAiMap && selected.tldr ? (
            <p className="mt-1 text-sm text-slate-800">{selected.tldr}</p>
          ) : null}
          <p className="mt-1 text-sm text-muted">{selected.descripcion || 'No description available.'}</p>
          {null}
        </div>
      ) : null}
    </section>
  );
}
