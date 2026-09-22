import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  ActivityIndicator,
  useWindowDimensions,
  ScrollView,
  Image,
  Platform,
  Alert,
  Share,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getWordNumbers, preferredNumber } from '../services/wordToIntService';

const METHODS = [
  { id: 'ordinal', label: 'Ordinal', color: '#93c5fd' },
  { id: 'pythagorean', label: 'Pythagorean', color: '#c4b5fd' },
  { id: 'reverse', label: 'Reverse', color: '#f9a8d4' },
  { id: 'reduced', label: 'Reduced', color: '#86efac' },
];

const OVERLAP_COLOR = '#fbbf24';

const PALETTE = ['#93c5fd', '#c4b5fd', '#f9a8d4', '#86efac', '#fcd34d', '#67e8f9', '#fda4af', '#a5b4fc'];

function numberFor(entry, method) {
  if (!entry) return null;
  if (method === 'pythagorean') return entry.pythagorean;
  if (method === 'reverse') return entry.reverse;
  if (method === 'reduced') return entry.reduced;
  return entry.ordinal;
}

function buildGraph(list, methods) {
  const chosen = (methods && methods.length ? methods : ['ordinal']).filter((id) =>
    METHODS.some((m) => m.id === id)
  );
  const words = (list || []).filter((w) => w?.phrase && w?.id).slice(0, 200);
  const nodes = words.map((w) => ({
    id: w.id,
    kind: 'word',
    label: w.phrase,
    n: Number(numberFor(w, chosen[0])),
    entry: w,
  }));
  const edges = [];
  const pairMethods = new Map();
  chosen.forEach((method) => {
    const color = METHODS.find((m) => m.id === method)?.color || '#94a3b8';
    const groups = new Map();
    words.forEach((w) => {
      const n = Number(numberFor(w, method));
      if (!Number.isFinite(n)) return;
      if (!groups.has(n)) groups.set(n, []);
      groups.get(n).push(w);
    });
    groups.forEach((members, n) => {
      if (members.length < 2) return;
      const hid = `hub:${method}:${n}`;
      nodes.push({
        id: hid,
        kind: 'number',
        label: String(n),
        n,
        count: members.length,
        method,
        color,
      });
      members.forEach((w) => {
        edges.push({
          id: `${w.id}->${hid}`,
          a: w.id,
          b: hid,
          method,
          color,
          overlap: false,
        });
      });
      for (let i = 0; i < members.length; i += 1) {
        for (let j = i + 1; j < members.length; j += 1) {
          const left = members[i].id < members[j].id ? members[i].id : members[j].id;
          const right = members[i].id < members[j].id ? members[j].id : members[i].id;
          const key = `${left}|${right}`;
          if (!pairMethods.has(key)) pairMethods.set(key, new Set());
          pairMethods.get(key).add(method);
        }
      }
    });
  });
  const overlaps = [];
  pairMethods.forEach((set, key) => {
    if (set.size < 2) return;
    const [a, b] = key.split('|');
    const via = [...set];
    overlaps.push({ a, b, via });
    edges.push({
      id: `overlap:${key}`,
      a,
      b,
      method: 'overlap',
      color: OVERLAP_COLOR,
      overlap: true,
      via,
    });
  });
  const overlapIds = new Set();
  overlaps.forEach((row) => {
    overlapIds.add(row.a);
    overlapIds.add(row.b);
  });
  nodes.forEach((node) => {
    if (node.kind === 'word') node.overlap = overlapIds.has(node.id);
  });
  return {
    nodes,
    edges,
    overlaps,
    methods: chosen,
    truncated: (list || []).length > words.length,
  };
}

function colorFor(n) {
  const i = Math.abs(Number(n) || 0) % PALETTE.length;
  return PALETTE[i];
}

function seedPositions(nodes, width, height) {
  const pos = {};
  const cx = width / 2;
  const cy = height / 2;
  nodes.forEach((node, i) => {
    const ring = node.kind === 'number' ? 0.28 : 0.78;
    const ang = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
    pos[node.id] = {
      x: cx + Math.cos(ang) * Math.min(width, height) * ring * 0.45,
      y: cy + Math.sin(ang) * Math.min(width, height) * ring * 0.42,
      vx: 0,
      vy: 0,
      pin: false,
    };
  });
  return pos;
}

function stepForces(pos, nodes, edges, width, height, mode) {
  const cx = width / 2;
  const cy = height / 2;
  const yifan = mode === 'yifan';
  const frucht = mode === 'frucht';
  const gravity = yifan ? 0.004 : frucht ? 0.002 : 0.01;
  const repulse = yifan ? 480 : frucht ? 1600 : 780;
  const rest = yifan ? 100 : frucht ? 130 : 78;
  const damp = yifan ? 0.78 : frucht ? 0.86 : 0.8;
  const ids = nodes.map((n) => n.id);
  ids.forEach((id) => {
    const p = pos[id];
    if (!p || p.pin) return;
    p.vx += (cx - p.x) * gravity;
    p.vy += (cy - p.y) * gravity;
  });
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = pos[ids[i]];
      const b = pos[ids[j]];
      if (!a || !b) continue;
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 16) {
        dx = (i - j) * 0.4 || 1;
        dy = 1;
        d2 = dx * dx + dy * dy;
      }
      const dist = Math.sqrt(d2);
      const force = yifan ? repulse / dist : repulse / d2;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a.pin) {
        a.vx += fx;
        a.vy += fy;
      }
      if (!b.pin) {
        b.vx -= fx;
        b.vy -= fy;
      }
    }
  }
  edges.forEach((e) => {
    const a = pos[e.a];
    const b = pos[e.b];
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = (dist - rest) * 0.02;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    if (!a.pin) {
      a.vx += fx;
      a.vy += fy;
    }
    if (!b.pin) {
      b.vx -= fx;
      b.vy -= fy;
    }
  });
  const pad = 28;
  ids.forEach((id) => {
    const p = pos[id];
    if (!p || p.pin) return;
    p.vx *= damp;
    p.vy *= damp;
    p.x = Math.max(pad, Math.min(width - pad, p.x + p.vx));
    p.y = Math.max(pad, Math.min(height - pad, p.y + p.vy));
  });
}

const LAYOUTS = [
  { id: 'force', label: 'ForceAtlas' },
  { id: 'frucht', label: 'Fruchterman' },
  { id: 'yifan', label: 'Yifan Hu' },
  { id: 'kamada', label: 'Kamada-Kawai' },
  { id: 'circle', label: 'Circle' },
  { id: 'radial', label: 'Radial' },
  { id: 'arc', label: 'Arc' },
  { id: 'layers', label: 'By number' },
  { id: 'grid', label: 'Grid' },
  { id: 'random', label: 'Random' },
];

function blankPos(x, y) {
  return { x, y, vx: 0, vy: 0, pin: false };
}

function placeCircle(nodes, width, height) {
  const pos = {};
  const cx = width / 2;
  const cy = height / 2;
  const ordered = [...nodes].sort((a, b) => String(a.label).localeCompare(String(b.label)));
  const r = Math.min(width, height) * 0.38;
  ordered.forEach((node, i) => {
    const ang = (i / Math.max(ordered.length, 1)) * Math.PI * 2 - Math.PI / 2;
    pos[node.id] = blankPos(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
  });
  return pos;
}

function placeRadial(nodes, edges, width, height) {
  const hubs = nodes.filter((n) => n.kind === 'number');
  if (!hubs.length) return placeCircle(nodes, width, height);
  const cx = width / 2;
  const cy = height / 2;
  const pos = {};
  const inner = Math.min(width, height) * 0.2;
  const outer = Math.min(width, height) * 0.4;
  const membersOf = {};
  hubs.forEach((h) => {
    membersOf[h.id] = [];
  });
  edges.forEach((e) => {
    if (membersOf[e.b]) membersOf[e.b].push(e.a);
    else if (membersOf[e.a]) membersOf[e.a].push(e.b);
  });
  const linked = new Set();
  hubs.forEach((hub, i) => {
    const ang = (i / hubs.length) * Math.PI * 2 - Math.PI / 2;
    pos[hub.id] = blankPos(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
    const members = membersOf[hub.id] || [];
    const spread = Math.min(Math.PI * 0.7, 0.35 + members.length * 0.12);
    members.forEach((id, k) => {
      const t = members.length === 1 ? 0 : (k / (members.length - 1)) * 2 - 1;
      const a = ang + t * spread;
      pos[id] = blankPos(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
      linked.add(id);
    });
    linked.add(hub.id);
  });
  const isolates = nodes.filter((n) => !linked.has(n.id));
  isolates.forEach((node, i) => {
    const ang = (i / Math.max(isolates.length, 1)) * Math.PI * 2;
    pos[node.id] = blankPos(cx + Math.cos(ang) * outer * 0.72, cy + Math.sin(ang) * outer * 0.72);
  });
  return pos;
}

function placeGrid(nodes, width, height) {
  const ordered = [...nodes].sort(
    (a, b) => (Number(a.n) || 0) - (Number(b.n) || 0) || String(a.label).localeCompare(String(b.label))
  );
  const cols = Math.max(1, Math.ceil(Math.sqrt(ordered.length)));
  const rows = Math.max(1, Math.ceil(ordered.length / cols));
  const padX = 40;
  const padY = 46;
  const cellW = (width - padX * 2) / cols;
  const cellH = (height - padY * 2) / rows;
  const pos = {};
  ordered.forEach((node, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    pos[node.id] = blankPos(padX + cellW * (c + 0.5), padY + cellH * (r + 0.5));
  });
  return pos;
}

function placeRandom(nodes, width, height) {
  const pos = {};
  nodes.forEach((node) => {
    pos[node.id] = blankPos(36 + Math.random() * (width - 72), 40 + Math.random() * (height - 80));
  });
  return pos;
}

function placeArc(nodes, width, height) {
  const pos = {};
  const words = nodes
    .filter((n) => n.kind === 'word')
    .sort((a, b) => String(a.label).localeCompare(String(b.label)));
  const hubs = nodes
    .filter((n) => n.kind === 'number')
    .sort((a, b) => (Number(a.n) || 0) - (Number(b.n) || 0));
  const pad = 28;
  const span = (count, i) =>
    count <= 1 ? width / 2 : pad + ((width - pad * 2) * i) / (count - 1);
  words.forEach((node, i) => {
    pos[node.id] = blankPos(span(words.length, i), height - 42);
  });
  hubs.forEach((node, i) => {
    pos[node.id] = blankPos(span(hubs.length, i), 48);
  });
  nodes.forEach((node) => {
    if (!pos[node.id]) pos[node.id] = blankPos(width / 2, height / 2);
  });
  return pos;
}

function placeLayers(nodes, edges, width, height) {
  const pos = {};
  const hubs = nodes
    .filter((n) => n.kind === 'number')
    .sort((a, b) => (Number(a.n) || 0) - (Number(b.n) || 0) || String(a.label).localeCompare(String(b.label)));
  const byHub = {};
  hubs.forEach((hub) => {
    byHub[hub.id] = [];
  });
  edges.forEach((e) => {
    if (byHub[e.b]) byHub[e.b].push(e.a);
    else if (byHub[e.a]) byHub[e.a].push(e.b);
  });
  const bands = Math.max(hubs.length, 1);
  const rowH = (height - 36) / bands;
  const placed = new Set();
  hubs.forEach((hub, i) => {
    const y = 24 + rowH * (i + 0.5);
    pos[hub.id] = blankPos(36, y);
    placed.add(hub.id);
    const members = byHub[hub.id] || [];
    const slot = Math.max(48, (width - 90) / Math.max(members.length, 1));
    members.forEach((id, k) => {
      if (placed.has(id)) return;
      pos[id] = blankPos(Math.min(width - 28, 78 + k * slot), y);
      placed.add(id);
    });
  });
  const left = nodes.filter((n) => !placed.has(n.id));
  left.forEach((node, i) => {
    pos[node.id] = blankPos(40 + (i % 6) * 48, height - 28);
  });
  return pos;
}

function placeKamada(nodes, edges, width, height) {
  const pos = placeCircle(nodes, width, height);
  if (nodes.length < 2) return pos;
  const adj = {};
  nodes.forEach((n) => {
    adj[n.id] = [];
  });
  edges.forEach((e) => {
    if (!adj[e.a] || !adj[e.b]) return;
    adj[e.a].push(e.b);
    adj[e.b].push(e.a);
  });
  const hopsOf = {};
  nodes.forEach((src) => {
    const d = { [src.id]: 0 };
    const queue = [src.id];
    while (queue.length) {
      const id = queue.shift();
      if (d[id] >= 4) continue;
      (adj[id] || []).forEach((next) => {
        if (d[next] != null) return;
        d[next] = d[id] + 1;
        queue.push(next);
      });
    }
    hopsOf[src.id] = d;
  });
  const idealUnit = Math.min(width, height) / Math.max(7, Math.sqrt(nodes.length));
  const ids = nodes.map((n) => n.id);
  for (let step = 0; step < 40; step += 1) {
    const gain = 0.06 * (1 - step / 50);
    ids.forEach((id, i) => {
      const a = pos[id];
      if (!a) return;
      let fx = 0;
      let fy = 0;
      for (let j = 0; j < ids.length; j += 1) {
        if (i === j) continue;
        const b = pos[ids[j]];
        if (!b) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let mag = Math.sqrt(dx * dx + dy * dy);
        if (mag < 1) {
          dx = 1;
          dy = 0.25;
          mag = 1;
        }
        const hops = hopsOf[id]?.[ids[j]];
        const ideal = (hops == null ? 4 : Math.max(1, hops)) * idealUnit;
        const pull = mag - ideal;
        fx += (dx / mag) * pull;
        fy += (dy / mag) * pull;
      }
      a.x = Math.max(28, Math.min(width - 28, a.x + fx * gain));
      a.y = Math.max(28, Math.min(height - 28, a.y + fy * gain));
    });
  }
  return pos;
}

function scaleFromCenter(pos, width, height, factor) {
  const cx = width / 2;
  const cy = height / 2;
  const next = {};
  Object.keys(pos || {}).forEach((id) => {
    const p = pos[id];
    if (!p) return;
    next[id] = blankPos(
      Math.max(28, Math.min(width - 28, cx + (p.x - cx) * factor)),
      Math.max(28, Math.min(height - 28, cy + (p.y - cy) * factor))
    );
  });
  return next;
}

function nudgeApart(pos, nodes, width, height) {
  const next = {};
  nodes.forEach((node) => {
    const p = pos[node.id];
    if (p) next[node.id] = { ...p, vx: 0, vy: 0, pin: false };
  });
  const ids = nodes.map((n) => n.id);
  const minDist = 48;
  for (let step = 0; step < 40; step += 1) {
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = next[ids[i]];
        const b = next[ids[j]];
        if (!a || !b) continue;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= minDist) continue;
        if (dist < 0.1) {
          dx = 1;
          dy = 0.3;
          dist = 1;
        }
        const push = (minDist - dist) / 2;
        a.x += (dx / dist) * push;
        a.y += (dy / dist) * push;
        b.x -= (dx / dist) * push;
        b.y -= (dy / dist) * push;
      }
    }
    ids.forEach((id) => {
      const p = next[id];
      if (!p) return;
      p.x = Math.max(28, Math.min(width - 28, p.x));
      p.y = Math.max(28, Math.min(height - 28, p.y));
    });
  }
  return next;
}

function xml(text) {
  return String(text ?? '')
    .replace(/&/g, '&' + 'amp;')
    .replace(/</g, '&' + 'lt;')
    .replace(/>/g, '&' + 'gt;')
    .replace(/"/g, '&' + 'quot;');
}

function buildGraphSvg(nodes, edges, pos, width, height, method) {
  const w = Math.round(width);
  const h = Math.round(height);
  const lines = edges
    .map((e) => {
      const a = pos[e.a];
      const b = pos[e.b];
      if (!a || !b) return '';
      return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${e.color || '#94a3b8'}" stroke-opacity="${e.overlap ? '1' : '0.75'}" stroke-width="${e.overlap ? '2.5' : '1'}" />`;
    })
    .join('');
  const dots = nodes
    .map((node) => {
      const p = pos[node.id];
      if (!p) return '';
      if (node.kind === 'number') {
        return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="18" fill="#0f172a" stroke="${colorFor(node.n)}" stroke-width="2" />
<text x="${p.x.toFixed(1)}" y="${(p.y + 4).toFixed(1)}" text-anchor="middle" fill="#e2e8f0" font-size="11" font-family="sans-serif">${xml(node.label)}</text>
<text x="${p.x.toFixed(1)}" y="${(p.y + 28).toFixed(1)}" text-anchor="middle" fill="#64748b" font-size="10" font-family="sans-serif">${node.count} words</text>`;
      }
      const label = xml(node.label);
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7" fill="${colorFor(node.n)}" />
<text x="${p.x.toFixed(1)}" y="${(p.y + 20).toFixed(1)}" text-anchor="middle" fill="#e2e8f0" font-size="11" font-family="sans-serif">${label}</text>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="100%" height="100%" fill="#0a0a0b"/>
<text x="16" y="28" fill="#93c5fd" font-size="14" font-family="sans-serif">Word graph · ${xml(method)}</text>
${lines}
${dots}
</svg>`;
}

function pngFromLayout(nodes, edges, pos, width, height, method) {
  if (typeof document === 'undefined') return '';
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.scale(scale, scale);
  ctx.fillStyle = '#0a0a0b';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#93c5fd';
  ctx.font = '14px sans-serif';
  ctx.fillText(`Word graph · ${method}`, 16, 28);
  edges.forEach((e) => {
    const a = pos[e.a];
    const b = pos[e.b];
    if (!a || !b) return;
    ctx.beginPath();
    ctx.strokeStyle = e.color || 'rgba(148,163,184,0.7)';
    ctx.lineWidth = e.overlap ? 2.5 : 1;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  });
  nodes.forEach((node) => {
    const p = pos[node.id];
    if (!p) return;
    if (node.kind === 'number') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = colorFor(node.n);
      ctx.stroke();
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(node.label), p.x, p.y + 4);
      ctx.fillStyle = '#64748b';
      ctx.font = '10px sans-serif';
      ctx.fillText(`${node.count} words`, p.x, p.y + 28);
      return;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = colorFor(node.n);
    ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(node.label || ''), p.x, p.y + 20);
  });
  return canvas.toDataURL('image/png');
}

export default function WordGraphScreen({ onClose }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const width = Math.max(280, winW - 16);
  const height = Math.max(320, Math.min(winH - 210, 640));
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [methods, setMethods] = useState(['ordinal']);
  const [layoutId, setLayoutId] = useState('force');
  const [selected, setSelected] = useState(null);
  const [tick, setTick] = useState(0);
  const [layoutKey, setLayoutKey] = useState(0);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [savingImage, setSavingImage] = useState(false);
  const [previewUri, setPreviewUri] = useState('');
  const scrollRef = useRef(null);
  const tableY = useRef(0);
  const scrollSetter = useRef(setScrollEnabled);
  scrollSetter.current = setScrollEnabled;
  const graph = useMemo(() => buildGraph(list, methods), [list, methods]);
  const posRef = useRef({});
  const dragRef = useRef(null);
  const pinnedRef = useRef({});
  const holdRef = useRef(null);
  const togglePinRef = useRef(() => {});
  togglePinRef.current = (id) => {
    const p = posRef.current[id];
    if (!p) return;
    if (p.userPin) {
      p.userPin = false;
      p.pin = false;
      delete pinnedRef.current[id];
    } else {
      p.userPin = true;
      p.pin = true;
      p.vx = 0;
      p.vy = 0;
      pinnedRef.current[id] = { x: p.x, y: p.y };
    }
    setSelected(id);
    setTick((n) => n + 1);
  };
  const graphRef = useRef(graph);
  graphRef.current = graph;

  useFocusEffect(
    useCallback(() => {
      let on = true;
      setLoading(true);
      getWordNumbers()
        .then((rows) => {
          if (on) setList(rows || []);
        })
        .finally(() => {
          if (on) setLoading(false);
        });
      return () => {
        on = false;
      };
    }, [])
  );

  useEffect(() => {
    const nodes = graph.nodes;
    const edges = graph.edges;
    const keepPins = (pos) => {
      Object.keys(pinnedRef.current).forEach((id) => {
        const saved = pinnedRef.current[id];
        if (!saved || !pos[id]) return;
        pos[id].x = saved.x;
        pos[id].y = saved.y;
        pos[id].vx = 0;
        pos[id].vy = 0;
        pos[id].pin = true;
        pos[id].userPin = true;
      });
      return pos;
    };
    if (layoutId === 'circle') {
      posRef.current = keepPins(placeCircle(nodes, width, height));
      setSelected(null);
      setTick((n) => n + 1);
      return undefined;
    }
    if (layoutId === 'radial') {
      posRef.current = keepPins(placeRadial(nodes, edges, width, height));
      setSelected(null);
      setTick((n) => n + 1);
      return undefined;
    }
    if (layoutId === 'grid') {
      posRef.current = keepPins(placeGrid(nodes, width, height));
      setSelected(null);
      setTick((n) => n + 1);
      return undefined;
    }
    if (layoutId === 'arc') {
      posRef.current = keepPins(placeArc(nodes, width, height));
      setSelected(null);
      setTick((n) => n + 1);
      return undefined;
    }
    if (layoutId === 'layers') {
      posRef.current = keepPins(placeLayers(nodes, edges, width, height));
      setSelected(null);
      setTick((n) => n + 1);
      return undefined;
    }
    if (layoutId === 'kamada') {
      posRef.current = keepPins(placeKamada(nodes, edges, width, height));
      setSelected(null);
      setTick((n) => n + 1);
      return undefined;
    }
    if (layoutId === 'random') {
      posRef.current = keepPins(placeRandom(nodes, width, height));
      setSelected(null);
      setTick((n) => n + 1);
      return undefined;
    }
    posRef.current = keepPins(seedPositions(nodes, width, height));
    setSelected(null);
    let frame = 0;
    let raf = 0;
    const limit = layoutId === 'frucht' ? 300 : layoutId === 'yifan' ? 260 : 220;
    const run = () => {
      stepForces(posRef.current, nodes, edges, width, height, layoutId);
      frame += 1;
      if (frame % 2 === 0) setTick((n) => n + 1);
      if (frame < limit) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [graph, width, height, layoutKey, layoutId]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        scrollSetter.current(false);
        const { locationX, locationY } = e.nativeEvent;
        const nodes = graphRef.current.nodes || [];
        let best = null;
        let bestD = 36;
        nodes.forEach((node) => {
          const p = posRef.current[node.id];
          if (!p) return;
          const dx = p.x - locationX;
          const dy = p.y - locationY;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < bestD) {
            best = node;
            bestD = d;
          }
        });
        if (holdRef.current?.timer) clearTimeout(holdRef.current.timer);
        const id = best?.id || null;
        holdRef.current = {
          id,
          x: locationX,
          y: locationY,
          moved: false,
          fired: false,
          timer: setTimeout(() => {
            const hold = holdRef.current;
            if (!hold || hold.moved || !hold.id) return;
            hold.fired = true;
            togglePinRef.current(hold.id);
          }, 480),
        };
        dragRef.current = id;
        if (best && posRef.current[best.id]) {
          posRef.current[best.id].pin = true;
          setSelected(best.id);
        } else {
          setSelected(null);
        }
      },
      onPanResponderMove: (e) => {
        const hold = holdRef.current;
        const x = e.nativeEvent.locationX;
        const y = e.nativeEvent.locationY;
        if (hold && !hold.moved) {
          const dx = x - hold.x;
          const dy = y - hold.y;
          if (dx * dx + dy * dy > 36) {
            hold.moved = true;
            clearTimeout(hold.timer);
          }
        }
        if (hold && !hold.moved) return;
        const id = dragRef.current;
        if (!id || !posRef.current[id]) return;
        posRef.current[id].x = x;
        posRef.current[id].y = y;
        posRef.current[id].vx = 0;
        posRef.current[id].vy = 0;
        if (posRef.current[id].userPin) pinnedRef.current[id] = { x, y };
        setTick((n) => n + 1);
      },
      onPanResponderRelease: () => {
        if (holdRef.current?.timer) clearTimeout(holdRef.current.timer);
        const id = dragRef.current;
        if (id && posRef.current[id]) {
          const p = posRef.current[id];
          p.pin = !!p.userPin;
          if (p.userPin) pinnedRef.current[id] = { x: p.x, y: p.y };
        }
        dragRef.current = null;
        holdRef.current = null;
        scrollSetter.current(true);
      },
      onPanResponderTerminate: () => {
        if (holdRef.current?.timer) clearTimeout(holdRef.current.timer);
        const id = dragRef.current;
        if (id && posRef.current[id]) posRef.current[id].pin = !!posRef.current[id].userPin;
        dragRef.current = null;
        holdRef.current = null;
        scrollSetter.current(true);
      },
    })
  ).current;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const onMenu = (event) => {
      const root = document.getElementById('word-graph-canvas');
      if (!root || !root.contains(event.target)) return;
      event.preventDefault();
      const rect = root.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const nodes = graphRef.current?.nodes || [];
      let best = null;
      let bestD = 36;
      nodes.forEach((node) => {
        const p = posRef.current[node.id];
        if (!p) return;
        const dx = p.x - x;
        const dy = p.y - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestD) {
          best = node;
          bestD = d;
        }
      });
      if (best) togglePinRef.current(best.id);
    };
    document.addEventListener('contextmenu', onMenu);
    return () => document.removeEventListener('contextmenu', onMenu);
  }, []);

  const byId = useMemo(() => {
    const map = {};
    graph.nodes.forEach((n) => {
      map[n.id] = n;
    });
    return map;
  }, [graph]);

  const selectedNode = selected ? byId[selected] : null;
  const neighbours = useMemo(() => {
    if (!selected) return [];
    const ids = new Set();
    graph.edges.forEach((e) => {
      if (e.a === selected) ids.add(e.b);
      if (e.b === selected) ids.add(e.a);
    });
    return [...ids].map((id) => byId[id]).filter(Boolean);
  }, [graph, selected, byId]);

  const linkedIds = useMemo(() => {
    const set = new Set();
    if (!selected) return set;
    set.add(selected);
    neighbours.forEach((n) => set.add(n.id));
    return set;
  }, [selected, neighbours]);

  void tick;

  const saveImage = async () => {
    if (savingImage) return;
    if (!graph.nodes.length) {
      Alert.alert('Nothing to save', 'Add some words first.');
      return;
    }
    setSavingImage(true);
    try {
      const positions = {};
      graph.nodes.forEach((node) => {
        const p = posRef.current[node.id];
        if (p) positions[node.id] = { x: p.x, y: p.y };
      });
      const methodLabel = (graph.methods || methods).join('-');
      const png = pngFromLayout(graph.nodes, graph.edges, positions, width, height, methodLabel);
      const svg = buildGraphSvg(graph.nodes, graph.edges, positions, width, height, methodLabel);
      if (png && Platform.OS === 'web' && typeof document !== 'undefined') {
        const a = document.createElement('a');
        a.href = png;
        a.download = `word-graph-${methodLabel}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setPreviewUri(png);
        return;
      }
      const FileSystem = require('expo-file-system/legacy');
      const name = `word-graph-${methodLabel}-${Date.now()}.svg`;
      const dest = FileSystem.cacheDirectory + name;
      await FileSystem.writeAsStringAsync(dest, svg);
      setPreviewUri('');
      try {
        const Sharing = require('expo-sharing');
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(dest, {
            mimeType: 'image/svg+xml',
            dialogTitle: 'Save word graph',
            UTI: 'public.svg-image',
          });
          return;
        }
      } catch {
        /* expo-sharing is optional */
      }
      await Share.share({ title: 'Word graph', url: dest, message: 'Word graph layout' });
    } catch (e) {
      Alert.alert('Could not save image', e?.message || 'Try again from the browser (press w) to download a PNG.');
    } finally {
      setSavingImage(false);
    }
  };

  const pickLayout = (id) => {
    if (id === layoutId) setLayoutKey((n) => n + 1);
    else setLayoutId(id);
  };

  const adjustLayout = (id) => {
    if (id === 'expand') posRef.current = scaleFromCenter(posRef.current, width, height, 1.28);
    else if (id === 'contract') posRef.current = scaleFromCenter(posRef.current, width, height, 0.78);
    else posRef.current = nudgeApart(posRef.current, graph.nodes, width, height);
    setTick((n) => n + 1);
  };

  const toggleMethod = (id) => {
    setMethods((cur) => {
      if (cur.includes(id)) return cur.length === 1 ? cur : cur.filter((m) => m !== id);
      return [...cur, id];
    });
  };

  const labelOf = (id) => graph.nodes.find((n) => n.id === id)?.label || id;

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.wrap}
      contentContainerStyle={styles.content}
      scrollEnabled={scrollEnabled}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.kicker}>Word to int</Text>
      <View style={styles.row}>
        {onClose ? (
          <TouchableOpacity style={styles.chip} onPress={onClose}>
            <Text style={styles.chipText}>Back to list</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={styles.heading}>Graph</Text>
      <Text style={styles.intro}>
        Turn on more than one number set to compare edges. A gold line means the same two words are
        linked in both sets. Drag a node, then save an image of where you left it.
      </Text>
      <Text style={styles.layoutLabel}>Number sets — tap to combine</Text>
      <View style={styles.row}>
        {METHODS.map((m) => {
          const on = methods.includes(m.id);
          return (
            <TouchableOpacity
              key={m.id}
              style={[styles.chip, on && { backgroundColor: m.color, borderColor: m.color }]}
              onPress={() => toggleMethod(m.id)}
            >
              <Text style={[styles.chipText, on && { color: '#0a0a0b' }]}>{m.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.meta}>
        Gold edges are the overlap. Each other colour is one number set. At least one set stays on.
      </Text>
      <Text style={styles.layoutLabel}>Layout</Text>
      <View style={styles.row}>
        {LAYOUTS.map((opt) => (
          <TouchableOpacity
            key={opt.id}
            style={[styles.chip, layoutId === opt.id && styles.chipOn]}
            onPress={() => pickLayout(opt.id)}
          >
            <Text style={[styles.chipText, layoutId === opt.id && styles.chipTextOn]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.chip} onPress={() => setLayoutKey((n) => n + 1)}>
          <Text style={styles.chipText}>Run again</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.layoutLabel}>On this arrangement</Text>
      <View style={styles.row}>
        <TouchableOpacity style={styles.chip} onPress={() => adjustLayout('expand')}>
          <Text style={styles.chipText}>Expand</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.chip} onPress={() => adjustLayout('contract')}>
          <Text style={styles.chipText}>Contract</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.chip} onPress={() => adjustLayout('noverlap')}>
          <Text style={styles.chipText}>No overlap</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.chip} onPress={saveImage} disabled={savingImage}>
          <Text style={styles.chipText}>{savingImage ? 'Saving…' : 'Save image'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.chip}
          onPress={() => {
            pinnedRef.current = {};
            Object.keys(posRef.current).forEach((id) => {
              const p = posRef.current[id];
              if (!p) return;
              p.userPin = false;
              p.pin = false;
            });
            setTick((n) => n + 1);
          }}
        >
          <Text style={styles.chipText}>Unpin all</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.chip}
          onPress={() => scrollRef.current?.scrollTo({ y: Math.max(0, tableY.current - 8), animated: true })}
        >
          <Text style={styles.chipText}>Data table</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator color="#93c5fd" style={{ marginTop: 24 }} />
      ) : graph.nodes.length === 0 ? (
        <Text style={styles.intro}>No saved words yet.</Text>
      ) : (
        <View nativeID="word-graph-canvas" style={[styles.canvas, { width, height }]} {...pan.panHandlers}>
          {graph.edges.map((e) => {
            const a = posRef.current[e.a];
            const b = posRef.current[e.b];
            if (!a || !b) return null;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const angle = Math.atan2(dy, dx);
            const dim = selected && !linkedIds.has(e.a) && !linkedIds.has(e.b);
            return (
              <View
                key={e.id}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: (a.x + b.x) / 2 - dist / 2,
                  top: (a.y + b.y) / 2,
                  width: dist,
                  height: e.overlap ? 3 : 1,
                  backgroundColor: dim ? 'rgba(100,116,139,0.15)' : e.color || 'rgba(148,163,184,0.55)',
                  transform: [{ rotate: `${angle}rad` }],
                }}
              />
            );
          })}
          {graph.nodes.map((node) => {
            const p = posRef.current[node.id];
            if (!p) return null;
            const on = selected === node.id;
            const dim = selected && !linkedIds.has(node.id);
            const size = node.kind === 'number' ? 36 : 14;
            const pinned = !!p.userPin;
            return (
              <View
                key={node.id}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: p.x - size / 2,
                  top: p.y - (node.kind === 'number' ? size / 2 : 7),
                  alignItems: 'center',
                  opacity: dim ? 0.28 : 1,
                }}
              >
                <View
                  style={{
                    width: size,
                    height: node.kind === 'number' ? size : 14,
                    borderRadius: size,
                    backgroundColor: node.kind === 'number' ? '#0f172a' : colorFor(node.n),
                    borderWidth: pinned || node.overlap || node.kind === 'number' || on ? 2 : 0,
                    borderColor: pinned ? '#fbbf24' : node.overlap ? OVERLAP_COLOR : on ? '#fff' : node.color || colorFor(node.n),
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {node.kind === 'number' ? (
                    <Text style={styles.hubText}>{node.label}</Text>
                  ) : null}
                </View>
                {node.kind === 'word' ? (
                  <Text style={[styles.nodeLabel, on && styles.nodeLabelOn]} numberOfLines={1}>
                    {pinned ? 'Pinned · ' : ''}
                    {node.label}
                  </Text>
                ) : (
                  <Text style={styles.hubMeta}>
                    {pinned ? 'Pinned · ' : ''}
                    {METHODS.find((m) => m.id === node.method)?.label || 'Number'} · {node.count}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}
      {graph.truncated ? (
        <Text style={styles.meta}>Showing the first 200 words.</Text>
      ) : null}
      {selectedNode?.kind === 'word' ? (
        <View style={styles.detail}>
          <Text style={styles.detailTitle}>{selectedNode.label}</Text>
          <Text style={styles.meta}>
            Ordinal {selectedNode.entry.ordinal} · Pythagorean {selectedNode.entry.pythagorean} · Reverse{' '}
            {selectedNode.entry.reverse} · Reduced {selectedNode.entry.reduced} · preferred{' '}
            {preferredNumber(selectedNode.entry)}
          </Text>
          <Text style={styles.meta}>
            {neighbours.length
              ? `Same numbers: ${neighbours
                  .filter((n) => n.kind === 'word')
                  .map((n) => n.label)
                  .join(', ') || 'only this word on the hub'}`
              : 'No other saved word shares this number.'}
          </Text>
          <TouchableOpacity style={styles.chip} onPress={() => togglePinRef.current(selectedNode.id)}>
            <Text style={styles.chipText}>
              {posRef.current[selectedNode.id]?.userPin ? 'Unpin' : 'Pin in place'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.meta}>Long-press the node on a phone. Right-click it in the browser.</Text>
        </View>
      ) : selectedNode?.kind === 'number' ? (
        <View style={styles.detail}>
          <Text style={styles.detailTitle}>Number {selectedNode.label}</Text>
          <Text style={styles.meta}>
            {neighbours.map((n) => n.label).join(' · ')}
          </Text>
          <TouchableOpacity style={styles.chip} onPress={() => togglePinRef.current(selectedNode.id)}>
            <Text style={styles.chipText}>
              {posRef.current[selectedNode.id]?.userPin ? 'Unpin' : 'Pin in place'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.meta}>Long-press the node on a phone. Right-click it in the browser.</Text>
        </View>
      ) : null}

      <View
        onLayout={(e) => {
          tableY.current = e.nativeEvent.layout.y;
        }}
      >
        <Text style={styles.layoutLabel}>Data table</Text>
        <Text style={styles.meta}>
          Every saved word. Gold means that word shares a link in more than one selected number set.
          Scroll sideways for every column.
        </Text>
        {graph.nodes.filter((n) => n.kind === 'word').length === 0 ? (
          <Text style={styles.meta}>No saved words yet.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View style={styles.tableRow}>
                {['Word', 'Ordinal', 'Pythagorean', 'Reverse', 'Reduced', 'Preferred', 'Overlap with', 'Note'].map(
                  (h) => (
                    <Text key={h} style={[styles.tableCell, styles.tableHead, h === 'Word' && styles.tableWord, (h === 'Overlap with' || h === 'Note') && styles.tableWide]}>
                      {h}
                    </Text>
                  )
                )}
              </View>
              {graph.nodes
                .filter((n) => n.kind === 'word')
                .sort((a, b) => String(a.label).localeCompare(String(b.label)))
                .map((node) => {
                  const entry = node.entry || {};
                  const pairs = (graph.overlaps || []).filter((row) => row.a === node.id || row.b === node.id);
                  const withWords = pairs
                    .map((row) => {
                      const other = row.a === node.id ? row.b : row.a;
                      const via = (row.via || [])
                        .map((id) => METHODS.find((m) => m.id === id)?.label || id)
                        .join(' + ');
                      return `${labelOf(other)} (${via})`;
                    })
                    .join(', ');
                  const cells = [
                    node.label,
                    entry.ordinal ?? '—',
                    entry.pythagorean ?? '—',
                    entry.reverse ?? '—',
                    entry.reduced ?? '—',
                    preferredNumber(entry) ?? '—',
                    withWords || '—',
                    entry.notes || '—',
                  ];
                  return (
                    <View key={node.id} style={styles.tableRow}>
                      {cells.map((value, i) => (
                        <Text
                          key={`${node.id}-${i}`}
                          style={[
                            styles.tableCell,
                            i === 0 && styles.tableWord,
                            (i === 6 || i === 7) && styles.tableWide,
                            i === 0 && node.overlap && { color: OVERLAP_COLOR },
                          ]}
                        >
                          {String(value)}
                        </Text>
                      ))}
                    </View>
                  );
                })}
            </View>
          </ScrollView>
        )}
        {(graph.overlaps || []).length ? (
          <Text style={styles.meta}>
            {graph.overlaps.length} overlap edge{graph.overlaps.length === 1 ? '' : 's'} between the selected sets.
          </Text>
        ) : (
          <Text style={styles.meta}>No overlap yet. Turn on a second number set, such as Ordinal and Reduced.</Text>
        )}
      </View>

      {previewUri ? (
        <View style={styles.detail}>
          <Text style={styles.meta}>Saved image of this layout. On a laptop it also downloaded as a PNG.</Text>
          <Image source={{ uri: previewUri }} style={{ width, height: Math.round(height * 0.45), marginTop: 8 }} resizeMode="contain" />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0a0a0b' },
  content: { padding: 12, paddingBottom: 48 },
  kicker: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  heading: { color: '#f8fafc', fontSize: 26, fontWeight: '800' },
  intro: { color: '#94a3b8', fontSize: 13, lineHeight: 18, marginTop: 4, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  layoutLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipOn: { backgroundColor: '#1e3a5f', borderColor: '#93c5fd' },
  chipText: { color: '#94a3b8', fontWeight: '700', fontSize: 12 },
  chipTextOn: { color: '#fff' },
  canvas: {
    alignSelf: 'center',
    backgroundColor: '#0a0a0b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
  },
  nodeLabel: { color: '#e2e8f0', fontSize: 11, marginTop: 2, maxWidth: 88 },
  nodeLabelOn: { color: '#fff', fontWeight: '800' },
  hubText: { color: '#e2e8f0', fontSize: 11, fontWeight: '800' },
  hubMeta: { color: '#64748b', fontSize: 10, marginTop: 2 },
  detail: {
    marginTop: 10,
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  detailTitle: { color: '#f8fafc', fontWeight: '800', fontSize: 16 },
  meta: { color: '#94a3b8', fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 8 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  tableCell: { color: '#e2e8f0', fontSize: 12, width: 96, paddingVertical: 8, paddingHorizontal: 6 },
  tableHead: { color: '#93c5fd', fontWeight: '800', fontSize: 11 },
  tableWord: { width: 120, fontWeight: '700' },
  tableWide: { width: 200 },
});
