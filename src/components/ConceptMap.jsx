import { useEffect, useMemo, useRef, useState } from 'react';

/** Pastel branch palette — fallback when categoryTag is missing. */
const ROOT_FILL = '#e5e7eb';
const BRANCH_PALETTES = ['#f3f4f6', '#eef2f7', '#f1f5f9', '#f8fafc', '#eef2ff', '#f5f3ff', '#f7fee7', '#f9fafb'];

/** Semantic fills by categoryTag (study-tool convention). */
const CATEGORY_FILL = {
  theory: '#e2e8f0',
  process: '#dcfce7',
  action: '#fef9c3',
  definition: '#dbeafe',
  fact: '#e0f2fe',
  exam: '#fee2e2',
  risk: '#ffe4e6',
  other: '#f3f4f6',
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
  // Treat tree edges as directed links: `source` -> `target` (parent -> child).
  const children = new Map();
  const parent = new Map();

  for (const n of nodes) children.set(n.id, []);

  for (const l of links) {
    const p = l.source;
    const c = l.target;
    if (!children.has(p) || !children.has(c)) continue;
    if (parent.has(c)) continue; // keep the first parent deterministically
    parent.set(c, p);
    children.get(p).push(c);
  }

  const parentless = nodes.filter((n) => !parent.has(n.id)).map((n) => n.id);
  let root =
    nodes.find((n) => Number(n.level) === 0 && parentless.includes(n.id))?.id ||
    nodes.find((n) => /main|central|topic|root/i.test(String(n.label || '')) && parentless.includes(n.id))?.id ||
    parentless[0] ||
    nodes[0]?.id ||
    null;

  if (!root) return { root: null, children, parent };

  // Ensure every node is reachable for layout even if links are sparse.
  for (const n of nodes) {
    if (n.id === root) continue;
    if (!parent.has(n.id)) {
      parent.set(n.id, root);
      children.get(root).push(n.id);
    }
  }

  for (const [, arr] of children) arr.sort((a, b) => String(a).localeCompare(String(b)));
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

/**
 * Layered left-to-right placement (Google-Docs style):
 * depth columns on X, stacked boxes vertically on Y.
 */
function layoutLayeredTreePositions(root, children, nodesById, measureById) {
  const positions = new Map();
  if (!root) return { positions, contentW: 400, contentH: 300 };

  const depthById = new Map([[root, 0]]);
  const q = [root];
  while (q.length) {
    const id = q.shift();
    const d0 = depthById.get(id) ?? 0;
    for (const c of children.get(id) || []) {
      if (depthById.has(c)) continue;
      depthById.set(c, d0 + 1);
      q.push(c);
    }
  }

  // Ensure any remaining nodes still get a column.
  for (const id of measureById.keys()) {
    if (!depthById.has(id)) depthById.set(id, 1);
  }

  const byDepth = new Map();
  for (const [id, d] of depthById.entries()) {
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d).push(id);
  }

  const sortedDepths = [...byDepth.keys()].sort((a, b) => a - b);
  const pad = 72;
  const layeredRowGap = 132;
  const layeredColGap = 240;
  const temp = new Map();
  const colHeights = new Map();
  let maxX = 0;
  let maxH = 0;
  const colMaxWidth = new Map();

  for (const d of sortedDepths) {
    const ids = byDepth.get(d).slice().sort((a, b) => {
      const na = String(nodesById.get(a)?.label || nodesById.get(a)?.nombre || '').toLowerCase();
      const nb = String(nodesById.get(b)?.label || nodesById.get(b)?.nombre || '').toLowerCase();
      return na.localeCompare(nb);
    });

    let maxWForCol = MIN_BOX_W;
    for (const id of ids) {
      const m = measureById.get(id) || { w: MIN_BOX_W };
      maxWForCol = Math.max(maxWForCol, m.w ?? MIN_BOX_W);
    }
    colMaxWidth.set(d, maxWForCol);

    const prevDepths = sortedDepths.filter((x) => x < d);
    const prevWidth = prevDepths.reduce((sum, x) => sum + (colMaxWidth.get(x) ?? MIN_BOX_W), 0);
    const colX = pad + prevWidth + prevDepths.length * layeredColGap;
    let y = pad;
    for (const id of ids) {
      const m = measureById.get(id) || { w: MIN_BOX_W, h: 44 };
      const w = m.w ?? MIN_BOX_W;
      const h = m.h ?? 44;
      temp.set(id, { x: colX, y, depth: d, w, h });
      y += h + layeredRowGap;
      maxX = Math.max(maxX, colX + w);
    }
    colHeights.set(d, y);
    maxH = Math.max(maxH, y);
  }

  for (const [id, p] of temp.entries()) {
    const colH = colHeights.get(p.depth) ?? maxH;
    const delta = (maxH - colH) / 2;
    positions.set(id, { ...p, y: p.y + delta });
  }

  return {
    positions,
    contentW: Math.max(980, maxX + pad),
    contentH: Math.max(760, maxH + pad),
  };
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
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (!Number.isFinite(dist) || dist < 0.01) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  // Perpendicular unit vector controls the curve "side".
  const nx = -dy / dist;
  const ny = dx / dist;
  const curvature = Math.min(160, Math.max(56, dist * 0.25));

  const c1x = x1 + dx * 0.35 + nx * curvature;
  const c1y = y1 + dy * 0.35 + ny * curvature;
  const c2x = x1 + dx * 0.65 + nx * curvature;
  const c2y = y1 + dy * 0.65 + ny * curvature;

  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
}

function rectBorderAnchor(fromRect, toRect) {
  const x = fromRect.x;
  const y = fromRect.y;
  const w = fromRect.w;
  const h = fromRect.h;
  const cx = x + w / 2;
  const cy = y + h / 2;

  const tx = toRect.x + toRect.w / 2;
  const ty = toRect.y + toRect.h / 2;

  const dx = tx - cx;
  const dy = ty - cy;
  const dist = Math.hypot(dx, dy);
  if (!Number.isFinite(dist) || dist < 0.01) return { x: cx, y: cy };

  const eps = 1e-6;
  const candidates = [];

  // Vertical sides: x = left/right edge.
  if (Math.abs(dx) > eps) {
    const t = (dx > 0 ? w / 2 : -w / 2) / dx;
    const ix = cx + t * dx; // equals edge
    const iy = cy + t * dy;
    if (iy >= y - eps && iy <= y + h + eps) candidates.push({ t, x: ix, y: iy });
  }

  // Horizontal sides: y = top/bottom edge.
  if (Math.abs(dy) > eps) {
    const t = (dy > 0 ? h / 2 : -h / 2) / dy;
    const ix = cx + t * dx;
    const iy = cy + t * dy; // equals edge
    if (ix >= x - eps && ix <= x + w + eps) candidates.push({ t, x: ix, y: iy });
  }

  if (!candidates.length) return { x: cx, y: cy };
  candidates.sort((a, b) => a.t - b.t);
  return candidates[0];
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
      const treeLinks = (conceptMapData?.links || []).filter((l) => !l.crossLink);
      const { root, children } = buildDirectedChildren(
        placed.map((n) => ({ id: n.id, label: n.nombre, level: n.level })),
        treeLinks,
      );
      const branchFill = assignBranchColorsFromTree(root, children);
      const nodesById = new Map(placed.map((n) => [n.id, n]));
      const measureById = new Map(placed.map((n) => [n.id, n._measure || measureBoxForNode(n)]));
      const { positions, contentW, contentH } = layoutLayeredTreePositions(root, children, nodesById, measureById);

      const nodes = placed
        .filter((n) => positions.has(n.id))
        .map((n) => {
          const p = positions.get(n.id);
          const m = measureById.get(n.id) || n._measure || { w: n.w, h: n.h };
          return { ...n, x: p.x, y: p.y, w: p.w ?? m.w, h: p.h ?? m.h, _measure: m };
        });

      return { nodes, hub: null, contentW, contentH, branchFill, children, rootId: root };
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
  const nodeDepthById = useMemo(() => new Map(allDrawNodes.map((n) => [n.id, Number(n.level) || 0])), [allDrawNodes]);

  const treeEdges = useMemo(() => {
    if (!isFromAiMap || !conceptMapData?.links?.length) return [];
    return conceptMapData.links.filter(
      (l) => !l.crossLink && visibleNodeIds.has(l.source) && visibleNodeIds.has(l.target),
    );
  }, [isFromAiMap, conceptMapData?.links, visibleNodeIds]);

  const crossEdges = useMemo(() => {
    if (!isFromAiMap || !conceptMapData?.links?.length) return [];
    const allCross = conceptMapData.links.filter(
      (l) => l.crossLink && visibleNodeIds.has(l.source) && visibleNodeIds.has(l.target),
    );

    // Reduce cross-links when the graph is dense to keep the map readable.
    const denseCount = allDrawNodes.length;
    const maxCrossLinks = denseCount >= 26 ? 8 : denseCount >= 18 ? 10 : 12;
    if (allCross.length <= maxCrossLinks) return allCross;

    const scored = allCross.map((l) => {
      const da = nodeDepthById.get(l.source) ?? 0;
      const db = nodeDepthById.get(l.target) ?? 0;
      const depthDiff = Math.abs(da - db);
      return { l, depthDiff };
    });

    scored.sort((a, b) => {
      if (a.depthDiff !== b.depthDiff) return a.depthDiff - b.depthDiff;
      const as = String(a.l.source);
      const bs = String(b.l.source);
      if (as !== bs) return as.localeCompare(bs);
      const at = String(a.l.target);
      const bt = String(b.l.target);
      return at.localeCompare(bt);
    });

    return scored.slice(0, maxCrossLinks).map((x) => x.l);
  }, [isFromAiMap, conceptMapData?.links, visibleNodeIds, allDrawNodes.length, nodeDepthById]);

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
      ctx.fillStyle = '#fafafa';
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

  const drawEdges = (list, { dashed = false, stroke = '#d1d5db' }) =>
    list.map((l, i) => {
      const source = nodeById.get(l.source);
      const target = nodeById.get(l.target);
      if (!source || !target) return null;
      const a1 = rectBorderAnchor(source, target);
      const a2 = rectBorderAnchor(target, source);
      return (
        <path
          key={`${dashed ? 'x' : 't'}-${l.source}-${l.target}-${i}`}
          d={edgePathBezier(a1.x, a1.y, a2.x, a2.y)}
          fill="none"
          stroke={dashed ? '#94a3b8' : stroke}
          strokeWidth={dashed ? 1.1 : 1.25}
          strokeDasharray={dashed ? '7 5' : undefined}
          opacity={dashed ? 0.95 : 1}
        >
          <title>{l.label || (dashed ? 'cross-link' : 'related')}</title>
        </path>
      );
    });

  return (
    <section className="panel">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{conceptMapData?.title || 'Mind Map'}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-border bg-white px-2 py-0.5 text-xs text-muted">
            {allDrawNodes.length} nodes
          </span>
          {allDrawNodes.length ? (
            <details className="relative rounded-lg border border-border bg-white">
              <summary className="cursor-pointer list-none px-2 py-1 text-xs font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
                Export
              </summary>
              <div className="absolute right-0 z-20 mt-1 flex min-w-[9rem] flex-col gap-0.5 rounded-lg border border-border bg-white p-1 shadow-sm">
                <button type="button" className="btn-ghost w-full !justify-start !px-2 !py-1 text-left text-xs" onClick={exportSvg}>
                  SVG
                </button>
                <button type="button" className="btn-ghost w-full !justify-start !px-2 !py-1 text-left text-xs" onClick={exportPng}>
                  PNG
                </button>
                <button type="button" className="btn-ghost w-full !justify-start !px-2 !py-1 text-left text-xs" onClick={exportHtml}>
                  HTML
                </button>
              </div>
            </details>
          ) : null}
        </div>
      </div>
      <div className="mb-2 flex flex-col gap-1.5">
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
        <label
          className="flex cursor-pointer items-start gap-2 text-xs text-slate-700"
          title="Uses Wikipedia when possible, 24–40 nodes, reading suggestions, more context and time."
        >
          <input
            type="checkbox"
            className="mt-0.5 rounded border-border"
            checked={deepDive}
            onChange={(e) => setDeepDive(e.target.checked)}
            disabled={isGenerating}
          />
          <span>
            <strong className="text-slate-800">Deep dive</strong> — richer map (slower, more context)
          </span>
        </label>
      </div>
      {!allDrawNodes.length || !isFromAiMap ? (
        <div className="mb-2 rounded-lg border border-border bg-slate-50 p-2.5 text-sm text-muted">
          No map yet — pick a document and <b>Generate map</b>.
        </div>
      ) : (
        <p className="mb-2 text-xs text-muted">Tap nodes · solid = tree · dashed = cross-links</p>
      )}
      {null}

      {isFromAiMap && allDrawNodes.length ? (
        <div className="relative overflow-hidden rounded-lg border border-border bg-[#f4f4f5]">
          <button
            type="button"
            className="absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 bg-white text-xs font-bold text-zinc-600 shadow-sm hover:bg-zinc-50"
            title="Pan: drag empty canvas. Zoom: Ctrl + mouse wheel or +/−. Scrollbars when content is large."
            aria-label="Map navigation help"
          >
            ?
          </button>
          <div
            ref={scrollRef}
            className="max-h-[86vh] min-h-[68vh] touch-pan-y overflow-auto overscroll-contain p-3 pt-3"
            onWheel={(e) => {
              if (!e.ctrlKey) return;
              e.preventDefault();
              // Lower wheel sensitivity for smoother trackpad/mouse zoom.
              const magnitude = Math.min(80, Math.abs(e.deltaY));
              const step = 1 + magnitude * 0.001;
              const factor = e.deltaY > 0 ? 1 / step : step;
              setZoomLevel((z) => Math.max(0.25, Math.min(4, z * factor)));
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
              <rect x="0" y="0" width={baseView.w} height={baseView.h} fill="#fafafa" />
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
                  const strokeW = isActive ? 2 : isHighP ? 2.25 : 1;
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
                        stroke={isHighP ? '#b91c1c' : '#374151'}
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
              {highPrioritySet?.has(selected.id) ? ' · high priority' : ''}
            </p>
          ) : null}

          {isFromAiMap && selected.tldr ? (
            <p className="mt-1 text-sm text-slate-800">{selected.tldr}</p>
          ) : null}

          <p className="mt-1 text-sm text-muted">{selected.descripcion || 'No description available.'}</p>

          {isFromAiMap ? (
            <>
              {(() => {
                const incoming = treeEdges.filter((e) => e.target === selected.id);
                const outgoing = treeEdges.filter((e) => e.source === selected.id);
                const hasCh = (treeChildrenMap?.get(selected.id) || []).length > 0;
                const isCollapsed = collapsedIdsArr.includes(selected.id);
                const cross = crossEdges.filter((e) => e.source === selected.id || e.target === selected.id);
                const parentLines = incoming.slice(0, 3).map((e) => {
                  const src = nodeById.get(e.source);
                  return { label: e.label || 'related', name: src?.nombre || src?.label || e.source };
                });
                const childLines = outgoing.slice(0, 3).map((e) => {
                  const dst = nodeById.get(e.target);
                  return { label: e.label || 'includes', name: dst?.nombre || dst?.label || e.target };
                });
                return (
                  <>
                    {hasCh ? (
                      <button
                        type="button"
                        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                        onClick={() => {
                          setCollapsedIdsArr((prev) =>
                            prev.includes(selected.id) ? prev.filter((x) => x !== selected.id) : [...prev, selected.id],
                          );
                        }}
                      >
                        {isCollapsed ? 'Expand branch' : 'Collapse branch'}
                      </button>
                    ) : null}

                    <details className="mt-2 rounded-lg border border-border bg-white p-2 text-[11px]">
                      <summary className="cursor-pointer font-semibold text-slate-800">Connections</summary>
                      <div className="mt-2 space-y-2">
                        {parentLines.length ? (
                          <div>
                            <p className="font-semibold text-slate-800">Parents</p>
                            <ul className="mt-1 space-y-1">
                              {parentLines.map((p, i) => (
                                <li key={`pl-${i}`} className="text-slate-700">
                                  <span className="font-medium">{p.name}</span>
                                  <span className="text-slate-500"> · {p.label}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {childLines.length ? (
                          <div>
                            <p className="font-semibold text-slate-800">Children</p>
                            <ul className="mt-1 space-y-1">
                              {childLines.map((c, i) => (
                                <li key={`cl-${i}`} className="text-slate-700">
                                  <span className="font-medium">{c.name}</span>
                                  <span className="text-slate-500"> · {c.label}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {cross.length ? (
                          <div>
                            <p className="font-semibold text-slate-800">Cross-links</p>
                            <ul className="mt-1 space-y-1">
                              {cross.slice(0, 4).map((e, i) => {
                                const otherId = e.source === selected.id ? e.target : e.source;
                                const other = nodeById.get(otherId);
                                return (
                                  <li key={`cr-${i}`} className="text-slate-700">
                                    <span className="font-medium">{other?.nombre || other?.label || otherId}</span>
                                    <span className="text-slate-500"> · {e.label || 'related'}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ) : null}

                        {!parentLines.length && !childLines.length && !cross.length ? (
                          <p className="text-slate-500">No connections visible for this node.</p>
                        ) : null}
                      </div>
                    </details>
                  </>
                );
              })()}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
