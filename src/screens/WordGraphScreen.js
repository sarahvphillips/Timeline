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
import { useTheme } from '../themeContext';

const METHODS = [
  { id: 'ordinal', label: 'Ordinal', color: '#93c5fd' },
  { id: 'pythagorean', label: 'Pythagorean', color: '#c4b5fd' },
  { id: 'reverse', label: 'Reverse', color: '#f9a8d4' },
  { id: 'reduced', label: 'Reduced', color: '#86efac' },
];

const OVERLAP_COLOR = '#fbbf24';

const PALETTE = ['#93c5fd', '#c4b5fd', '#f9a8d4', '#86efac', '#fcd34d', '#67e8f9', '#fda4af', '#a5b4fc'];

/** Kept until the app process closes. Not written to the phone or Firebase. */
let sessionLayout = null;

function captureLayout(pos, pinned, zoom, methods, layoutId) {
  const positions = {};
  Object.keys(pos || {}).forEach((id) => {
    const p = pos[id];
    if (!p) return;
    const held = pinned?.[id];
    positions[id] = {
      x: held?.x ?? p.x,
      y: held?.y ?? p.y,
      userPin: !!(p.userPin || held),
    };
  });
  return {
    positions,
    zoom: zoom || 1,
    methods: Array.isArray(methods) ? [...methods] : ['ordinal'],
    layoutId: layoutId || 'force',
  };
}

function placeNewNodes(ids, width, height) {
  const pos = {};
  ids.forEach((id, i) => {
    const col = Math.floor(i / 10);
    const row = i % 10;
    pos[id] = blankPos(Math.max(36, width - 46 - col * 72), 42 + row * 36);
  });
  return pos;
}

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
    if (p.userPin) {
      next[id] = { ...p, vx: 0, vy: 0, pin: true, userPin: true };
      return;
    }
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
    if (!p) return;
    next[node.id] = {
      ...p,
      vx: 0,
      vy: 0,
      pin: !!p.userPin,
      userPin: !!p.userPin,
    };
  });
  const ids = nodes.map((n) => n.id);
  const minDist = 48;
  for (let step = 0; step < 40; step += 1) {
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = next[ids[i]];
        const b = next[ids[j]];
        if (!a || !b || (a.userPin && b.userPin)) continue;
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
        if (a.userPin) {
          b.x -= (dx / dist) * push * 2;
          b.y -= (dy / dist) * push * 2;
        } else if (b.userPin) {
          a.x += (dx / dist) * push * 2;
          a.y += (dy / dist) * push * 2;
        } else {
          a.x += (dx / dist) * push;
          a.y += (dy / dist) * push;
          b.x -= (dx / dist) * push;
          b.y -= (dy / dist) * push;
        }
      }
    }
    ids.forEach((id) => {
      const p = next[id];
      if (!p || p.userPin) return;
      p.x = Math.max(28, Math.min(width - 28, p.x));
      p.y = Math.max(28, Math.min(height - 28, p.y));
    });
  }
  return next;
}

function nearestNode(rawX, rawY, nodes, pos, width, height, zoom) {
  const z = zoom || 1;
  const cx = width / 2;
  const cy = height / 2;
  let best = null;
  let bestD = Infinity;
  (nodes || []).forEach((node) => {
    const p = pos[node.id];
    if (!p) return;
    const sx = cx + (p.x - cx) * z;
    const sy = cy + (p.y - cy) * z;
    const d = Math.hypot(sx - rawX, sy - rawY);
    const limit = node.kind === 'number' ? 36 : 24;
    if (d <= limit && d < bestD) {
      best = node;
      bestD = d;
    }
  });
  return best;
}

function graphFrame(rect, width, height, zoom) {
  const a = unscalePoint(rect.x, rect.y, width, height, zoom);
  const b = unscalePoint(rect.x + rect.w, rect.y + rect.h, width, height, zoom);
  const x = Math.max(0, Math.min(a.x, b.x));
  const y = Math.max(0, Math.min(a.y, b.y));
  const x2 = Math.min(width, Math.max(a.x, b.x));
  const y2 = Math.min(height, Math.max(a.y, b.y));
  return { x, y, w: Math.max(1, x2 - x), h: Math.max(1, y2 - y) };
}

function unscalePoint(x, y, width, height, zoom) {
  const z = zoom || 1;
  const cx = width / 2;
  const cy = height / 2;
  return { x: cx + (x - cx) / z, y: cy + (y - cy) / z };
}

function xml(text) {
  return String(text ?? '')
    .replace(/&/g, '&' + 'amp;')
    .replace(/</g, '&' + 'lt;')
    .replace(/>/g, '&' + 'gt;')
    .replace(/"/g, '&' + 'quot;');
}

function buildGraphSvg(nodes, edges, pos, width, height, method, ink = {}, frame) {
  const bg = ink.bg || '#0a0a0b';
  const text = ink.text || '#e2e8f0';
  const faint = ink.faint || '#64748b';
  const accent = ink.blueSoft || '#93c5fd';
  const card = ink.card || '#0f172a';
  const w = Math.round(width);
  const h = Math.round(height);
  const lines = edges
    .map((e) => {
      const a = pos[e.a];
      const b = pos[e.b];
      if (!a || !b) return '';
      return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${e.color || faint}" stroke-opacity="${e.overlap ? '1' : '0.75'}" stroke-width="${e.overlap ? '2.5' : '1'}" />`;
    })
    .join('');
  const dots = nodes
    .map((node) => {
      const p = pos[node.id];
      if (!p) return '';
      if (node.kind === 'number') {
        return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="18" fill="${card}" stroke="${colorFor(node.n)}" stroke-width="2" />
<text x="${p.x.toFixed(1)}" y="${(p.y + 4).toFixed(1)}" text-anchor="middle" fill="${text}" font-size="11" font-family="sans-serif">${xml(node.label)}</text>
<text x="${p.x.toFixed(1)}" y="${(p.y + 28).toFixed(1)}" text-anchor="middle" fill="${faint}" font-size="10" font-family="sans-serif">${node.count} words</text>`;
      }
      const label = xml(node.label);
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7" fill="${colorFor(node.n)}" />
<text x="${p.x.toFixed(1)}" y="${(p.y + 20).toFixed(1)}" text-anchor="middle" fill="${text}" font-size="11" font-family="sans-serif">${label}</text>`;
    })
    .join('');
  const outW = frame ? Math.max(1, Math.round(frame.w)) : w;
  const outH = frame ? Math.max(1, Math.round(frame.h)) : h;
  const viewBox = frame
    ? `${frame.x.toFixed(1)} ${frame.y.toFixed(1)} ${Math.max(frame.w, 1).toFixed(1)} ${Math.max(frame.h, 1).toFixed(1)}`
    : `0 0 ${w} ${h}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="${viewBox}">
<rect x="${frame ? frame.x.toFixed(1) : 0}" y="${frame ? frame.y.toFixed(1) : 0}" width="${frame ? Math.max(frame.w, 1).toFixed(1) : '100%'}" height="${frame ? Math.max(frame.h, 1).toFixed(1) : '100%'}" fill="${bg}"/>
${frame ? '' : `<text x="16" y="28" fill="${accent}" font-size="14" font-family="sans-serif">Word graph · ${xml(method)}</text>`}
${lines}
${dots}
</svg>`;
}

function pngFromLayout(nodes, edges, pos, width, height, method, ink = {}) {
  if (typeof document === 'undefined') return '';
  const bg = ink.bg || '#0a0a0b';
  const text = ink.text || '#e2e8f0';
  const faint = ink.faint || '#64748b';
  const accent = ink.blueSoft || '#93c5fd';
  const card = ink.card || '#0f172a';
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.scale(scale, scale);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = accent;
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
      ctx.fillStyle = card;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = colorFor(node.n);
      ctx.stroke();
      ctx.fillStyle = text;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(node.label), p.x, p.y + 4);
      ctx.fillStyle = faint;
      ctx.font = '10px sans-serif';
      ctx.fillText(`${node.count} words`, p.x, p.y + 28);
      return;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = colorFor(node.n);
    ctx.fill();
    ctx.fillStyle = text;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(node.label || ''), p.x, p.y + 20);
  });
  return canvas.toDataURL('image/png');
}

function boxFromDrag(x0, y0, x1, y1, square) {
  let w = x1 - x0;
  let h = y1 - y0;
  if (square) {
    const side = Math.max(Math.abs(w), Math.abs(h));
    w = (w < 0 ? -1 : 1) * side;
    h = (h < 0 ? -1 : 1) * side;
  }
  return {
    x: w < 0 ? x0 + w : x0,
    y: h < 0 ? y0 + h : y0,
    w: Math.abs(w),
    h: Math.abs(h),
  };
}

function snipPng(dataUrl, width, height, zoom, rect) {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve('');
      return;
    }
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const view = document.createElement('canvas');
      view.width = Math.round(width * scale);
      view.height = Math.round(height * scale);
      const ctx = view.getContext('2d');
      if (!ctx) {
        resolve('');
        return;
      }
      const z = zoom || 1;
      ctx.translate((width * scale) / 2, (height * scale) / 2);
      ctx.scale(z, z);
      ctx.translate((-width * scale) / 2, (-height * scale) / 2);
      ctx.drawImage(img, 0, 0);
      const rw = Math.max(1, Math.round(rect.w * scale));
      const rh = Math.max(1, Math.round(rect.h * scale));
      const out = document.createElement('canvas');
      out.width = rw;
      out.height = rh;
      const octx = out.getContext('2d');
      if (!octx) {
        resolve('');
        return;
      }
      octx.drawImage(view, rect.x * scale, rect.y * scale, rect.w * scale, rect.h * scale, 0, 0, rw, rh);
      resolve(out.toDataURL('image/png'));
    };
    img.onerror = () => resolve('');
    img.src = dataUrl;
  });
}

export default function WordGraphScreen({ onClose, navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => screenStyles(colors), [colors]);
  const { width: winW, height: winH } = useWindowDimensions();
  const width = Math.max(280, winW - 16);
  const height = Math.max(320, Math.min(winH - 210, 640));
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [methods, setMethods] = useState(() =>
    sessionLayout?.methods?.length ? [...sessionLayout.methods] : ['ordinal']
  );
  const [layoutId, setLayoutId] = useState(() => sessionLayout?.layoutId || 'force');
  const [selected, setSelected] = useState(null);
  const [tableSort, setTableSort] = useState({ key: 'word', dir: 'asc' });
  const [tick, setTick] = useState(0);
  const [layoutKey, setLayoutKey] = useState(0);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [savingImage, setSavingImage] = useState(false);
  const [previewUri, setPreviewUri] = useState('');
  const [snipMode, setSnipMode] = useState(false);
  const [snipSquare, setSnipSquare] = useState(false);
  const [snipRect, setSnipRect] = useState(null);
  const [zoom, setZoom] = useState(() => sessionLayout?.zoom || 1);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };
  const scrollRef = useRef(null);
  const tableY = useRef(0);
  const scrollSetter = useRef(setScrollEnabled);
  scrollSetter.current = setScrollEnabled;
  const snipModeRef = useRef(false);
  const snipSquareRef = useRef(false);
  const snipDragRef = useRef(null);
  const setSnipRectRef = useRef(setSnipRect);
  snipModeRef.current = snipMode;
  snipSquareRef.current = snipSquare;
  setSnipRectRef.current = setSnipRect;
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
  const layoutRaf = useRef(0);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const restoredRef = useRef(false);
  const layoutTouchedRef = useRef(false);
  const leavingRef = useRef(false);
  const pendingLeave = useRef(null);
  const [exitAsk, setExitAsk] = useState(false);

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
    if (loading) return undefined;
    const nodes = graph.nodes;
    const edges = graph.edges;
    if (sessionLayout && !layoutTouchedRef.current) {
      if (!nodes.length) return undefined;
      if (restoredRef.current) return undefined;
      restoredRef.current = true;
      const pos = {};
      const added = [];
      nodes.forEach((node) => {
        const saved = sessionLayout.positions?.[node.id];
        if (!saved) {
          added.push(node.id);
          return;
        }
        pos[node.id] = {
          x: Math.max(16, Math.min(width - 16, saved.x)),
          y: Math.max(16, Math.min(height - 16, saved.y)),
          vx: 0,
          vy: 0,
          pin: !!saved.userPin,
          userPin: !!saved.userPin,
        };
      });
      Object.assign(pos, placeNewNodes(added, width, height));
      pinnedRef.current = {};
      Object.keys(pos).forEach((id) => {
        if (pos[id].userPin) pinnedRef.current[id] = { x: pos[id].x, y: pos[id].y };
      });
      posRef.current = pos;
      setSelected(null);
      setTick((n) => n + 1);
      if (added.length) {
        Alert.alert('Graph', 'New data nodes found, added to layout');
      }
      return undefined;
    }
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
      Object.keys(pinnedRef.current).forEach((id) => {
        const saved = pinnedRef.current[id];
        const p = posRef.current[id];
        if (!saved || !p) return;
        p.x = saved.x;
        p.y = saved.y;
        p.vx = 0;
        p.vy = 0;
        p.pin = true;
        p.userPin = true;
      });
      frame += 1;
      if (frame % 2 === 0) setTick((n) => n + 1);
      if (frame < limit) {
        raf = requestAnimationFrame(run);
        layoutRaf.current = raf;
      } else {
        layoutRaf.current = 0;
      }
    };
    raf = requestAnimationFrame(run);
    layoutRaf.current = raf;
    return () => {
      cancelAnimationFrame(raf);
      layoutRaf.current = 0;
    };
  }, [graph, width, height, layoutKey, layoutId, loading]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => Platform.OS !== 'web',
      onMoveShouldSetPanResponder: () => Platform.OS !== 'web',
      onPanResponderGrant: (e) => {
        const rawX = e.nativeEvent.locationX;
        const rawY = e.nativeEvent.locationY;
        if (snipModeRef.current) {
          scrollSetter.current(false);
          snipDragRef.current = { x: rawX, y: rawY };
          setSnipRectRef.current({ x: rawX, y: rawY, w: 0, h: 0 });
          return;
        }
        scrollSetter.current(false);
        const { width: w, height: h } = sizeRef.current;
        const point = unscalePoint(rawX, rawY, w, h, zoomRef.current);
        const best = nearestNode(rawX, rawY, graphRef.current.nodes, posRef.current, w, h, zoomRef.current);
        if (holdRef.current?.timer) clearTimeout(holdRef.current.timer);
        const id = best?.id || null;
        const grabbed = id ? posRef.current[id] : null;
        holdRef.current = {
          id,
          x: rawX,
          y: rawY,
          ox: grabbed ? grabbed.x - point.x : 0,
          oy: grabbed ? grabbed.y - point.y : 0,
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
        if (grabbed) {
          grabbed.pin = true;
          grabbed.vx = 0;
          grabbed.vy = 0;
          setSelected(id);
        } else {
          setSelected(null);
        }
      },
      onPanResponderMove: (e) => {
        const rawX = e.nativeEvent.locationX;
        const rawY = e.nativeEvent.locationY;
        if (snipDragRef.current) {
          setSnipRectRef.current(
            boxFromDrag(snipDragRef.current.x, snipDragRef.current.y, rawX, rawY, snipSquareRef.current)
          );
          return;
        }
        const hold = holdRef.current;
        if (hold && !hold.moved) {
          const dx = rawX - hold.x;
          const dy = rawY - hold.y;
          if (dx * dx + dy * dy > 9) {
            hold.moved = true;
            clearTimeout(hold.timer);
          }
        }
        if (hold && !hold.moved) return;
        const id = dragRef.current;
        if (!id || !posRef.current[id]) return;
        const { width: w, height: h } = sizeRef.current;
        const point = unscalePoint(rawX, rawY, w, h, zoomRef.current);
        const nextX = point.x + (hold?.ox || 0);
        const nextY = point.y + (hold?.oy || 0);
        posRef.current[id].x = nextX;
        posRef.current[id].y = nextY;
        posRef.current[id].vx = 0;
        posRef.current[id].vy = 0;
        if (posRef.current[id].userPin) pinnedRef.current[id] = { x: nextX, y: nextY };
        setTick((n) => n + 1);
      },
      onPanResponderRelease: () => {
        if (snipDragRef.current) {
          snipDragRef.current = null;
          scrollSetter.current(true);
          return;
        }
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
        if (snipDragRef.current) {
          snipDragRef.current = null;
          scrollSetter.current(true);
          return;
        }
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
      const rawX = event.clientX - rect.left;
      const rawY = event.clientY - rect.top;
      const { width: w, height: h } = sizeRef.current;
      const best = nearestNode(rawX, rawY, graphRef.current?.nodes, posRef.current, w, h, zoomRef.current);
      if (best) togglePinRef.current(best.id);
    };
    document.addEventListener('contextmenu', onMenu);
    return () => document.removeEventListener('contextmenu', onMenu);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const root = document.getElementById('word-graph-canvas');
    if (!root) return undefined;
    root.style.userSelect = 'none';
    root.style.webkitUserSelect = 'none';
    root.style.touchAction = 'none';
    root.style.cursor = 'grab';
    const endDrag = () => {
      const id = dragRef.current;
      if (id && posRef.current[id]) {
        const p = posRef.current[id];
        p.pin = !!p.userPin;
        if (p.userPin) pinnedRef.current[id] = { x: p.x, y: p.y };
      }
      dragRef.current = null;
      holdRef.current = null;
      root.style.cursor = 'grab';
      scrollSetter.current(true);
    };
    const place = (clientX, clientY) => {
      const rect = root.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };
    const down = (event) => {
      if (event.button != null && event.button !== 0) return;
      const raw = place(event.clientX, event.clientY);
      if (snipModeRef.current) {
        event.preventDefault();
        scrollSetter.current(false);
        snipDragRef.current = { x: raw.x, y: raw.y };
        setSnipRectRef.current({ x: raw.x, y: raw.y, w: 0, h: 0 });
        return;
      }
      const { width: w, height: h } = sizeRef.current;
      const best = nearestNode(raw.x, raw.y, graphRef.current?.nodes, posRef.current, w, h, zoomRef.current);
      if (!best || !posRef.current[best.id]) return;
      event.preventDefault();
      const point = unscalePoint(raw.x, raw.y, w, h, zoomRef.current);
      const grabbed = posRef.current[best.id];
      scrollSetter.current(false);
      root.style.cursor = 'grabbing';
      try {
        root.setPointerCapture(event.pointerId);
      } catch (err) {
        /* capture is optional */
      }
      dragRef.current = best.id;
      holdRef.current = {
        id: best.id,
        ox: grabbed.x - point.x,
        oy: grabbed.y - point.y,
        moved: true,
      };
      grabbed.pin = true;
      grabbed.vx = 0;
      grabbed.vy = 0;
      setSelected(best.id);
    };
    const move = (event) => {
      if (snipDragRef.current) {
        event.preventDefault();
        const raw = place(event.clientX, event.clientY);
        setSnipRectRef.current(
          boxFromDrag(snipDragRef.current.x, snipDragRef.current.y, raw.x, raw.y, snipSquareRef.current)
        );
        return;
      }
      const id = dragRef.current;
      const hold = holdRef.current;
      if (!id || !hold || !posRef.current[id]) return;
      event.preventDefault();
      const raw = place(event.clientX, event.clientY);
      const { width: w, height: h } = sizeRef.current;
      const point = unscalePoint(raw.x, raw.y, w, h, zoomRef.current);
      const nextX = point.x + hold.ox;
      const nextY = point.y + hold.oy;
      posRef.current[id].x = nextX;
      posRef.current[id].y = nextY;
      posRef.current[id].vx = 0;
      posRef.current[id].vy = 0;
      posRef.current[id].pin = true;
      if (posRef.current[id].userPin) pinnedRef.current[id] = { x: nextX, y: nextY };
      setTick((n) => n + 1);
    };
    const up = () => {
      if (snipDragRef.current) {
        snipDragRef.current = null;
        scrollSetter.current(true);
        return;
      }
      if (!dragRef.current) {
        scrollSetter.current(true);
        return;
      }
      endDrag();
    };
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
    return () => {
      endDrag();
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
    };
  }, [loading, graph.nodes.length]);

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
      const png = pngFromLayout(graph.nodes, graph.edges, positions, width, height, methodLabel, colors);
      const svg = buildGraphSvg(graph.nodes, graph.edges, positions, width, height, methodLabel, colors);
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

  const saveSnip = async () => {
    if (savingImage) return;
    const rect = snipRect;
    if (!rect || rect.w < 12 || rect.h < 12) {
      Alert.alert('Drag a box', 'Turn Snip on, then drag a rectangle on the graph.');
      return;
    }
    const box = {
      x: Math.max(0, Math.min(width - 1, rect.x)),
      y: Math.max(0, Math.min(height - 1, rect.y)),
      w: rect.w,
      h: rect.h,
    };
    box.w = Math.max(1, Math.min(box.w, width - box.x));
    box.h = Math.max(1, Math.min(box.h, height - box.y));
    if (box.w < 12 || box.h < 12) {
      Alert.alert('Drag a box', 'Keep the box on the graph.');
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
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const full = pngFromLayout(graph.nodes, graph.edges, positions, width, height, methodLabel, colors);
        const png = await snipPng(full, width, height, zoomRef.current, box);
        if (!png) throw new Error('Could not cut that box');
        const a = document.createElement('a');
        a.href = png;
        a.download = `word-graph-snip-${methodLabel}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setPreviewUri(png);
        return;
      }
      const frame = graphFrame(box, width, height, zoomRef.current);
      const svg = buildGraphSvg(
        graph.nodes,
        graph.edges,
        positions,
        width,
        height,
        methodLabel,
        colors,
        frame
      );
      const FileSystem = require('expo-file-system/legacy');
      const dest = `${FileSystem.cacheDirectory}word-graph-snip-${Date.now()}.svg`;
      await FileSystem.writeAsStringAsync(dest, svg);
      setPreviewUri('');
      try {
        const Sharing = require('expo-sharing');
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(dest, {
            mimeType: 'image/svg+xml',
            dialogTitle: 'Save graph snip',
            UTI: 'public.svg-image',
          });
          return;
        }
      } catch {
        /* expo-sharing is optional */
      }
      await Share.share({ title: 'Word graph snip', url: dest, message: 'Word graph snip' });
    } catch (e) {
      Alert.alert('Could not save snip', e?.message || 'Try again from the browser to download a PNG.');
    } finally {
      setSavingImage(false);
    }
  };

  const pickLayout = (id) => {
    layoutTouchedRef.current = true;
    restoredRef.current = false;
    if (id === layoutId) setLayoutKey((n) => n + 1);
    else setLayoutId(id);
  };

  const requestLeave = (action) => {
    pendingLeave.current = action || null;
    setExitAsk(true);
  };

  const finishLeave = (save) => {
    if (save) {
      sessionLayout = captureLayout(posRef.current, pinnedRef.current, zoomRef.current, methods, layoutId);
    } else {
      sessionLayout = null;
    }
    const action = pendingLeave.current;
    pendingLeave.current = null;
    setExitAsk(false);
    leavingRef.current = true;
    if (action && navigation?.dispatch) {
      navigation.dispatch(action);
      return;
    }
    if (onClose) onClose();
  };

  useEffect(() => {
    if (!navigation?.addListener) return undefined;
    const unsub = navigation.addListener('beforeRemove', (event) => {
      if (leavingRef.current) return;
      event.preventDefault();
      pendingLeave.current = event.data.action;
      setExitAsk(true);
    });
    return unsub;
  }, [navigation]);

  const adjustLayout = (id) => {
    if (layoutRaf.current) {
      cancelAnimationFrame(layoutRaf.current);
      layoutRaf.current = 0;
    }
    if (id === 'expand') posRef.current = scaleFromCenter(posRef.current, width, height, 1.28);
    else if (id === 'contract') posRef.current = scaleFromCenter(posRef.current, width, height, 0.78);
    else posRef.current = nudgeApart(posRef.current, graph.nodes, width, height);
    Object.keys(pinnedRef.current).forEach((pinId) => {
      const saved = pinnedRef.current[pinId];
      const p = posRef.current[pinId];
      if (!saved || !p) return;
      p.x = saved.x;
      p.y = saved.y;
      p.vx = 0;
      p.vy = 0;
      p.pin = true;
      p.userPin = true;
    });
    setTick((n) => n + 1);
  };

  const toggleMethod = (id) => {
    setMethods((cur) => {
      if (cur.includes(id)) return cur.length === 1 ? cur : cur.filter((m) => m !== id);
      return [...cur, id];
    });
  };

  const labelOf = (id) => graph.nodes.find((n) => n.id === id)?.label || id;

  const toggleTableSort = (key) => {
    setTableSort((cur) => {
      if (cur.key === key) return { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' };
      return { key, dir: key === 'pinned' ? 'desc' : 'asc' };
    });
  };

  const sortedTableRows = graph.nodes
    .filter((n) => n.kind === 'word')
    .map((node) => {
      const entry = node.entry || {};
      const pinned = !!posRef.current[node.id]?.userPin;
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
      return {
        node,
        entry,
        pinned,
        withWords,
        cells: [
          pinned ? 'Yes' : 'No',
          node.label,
          entry.ordinal ?? '—',
          entry.pythagorean ?? '—',
          entry.reverse ?? '—',
          entry.reduced ?? '—',
          preferredNumber(entry) ?? '—',
          withWords || '—',
          entry.notes || '—',
        ],
      };
    })
    .sort((a, b) => {
      const pick = (row) => {
        if (tableSort.key === 'pinned') return row.pinned ? 1 : 0;
        if (tableSort.key === 'word') return String(row.node.label).toLowerCase();
        if (tableSort.key === 'ordinal') return Number(row.entry.ordinal);
        if (tableSort.key === 'pythagorean') return Number(row.entry.pythagorean);
        if (tableSort.key === 'reverse') return Number(row.entry.reverse);
        if (tableSort.key === 'reduced') return Number(row.entry.reduced);
        if (tableSort.key === 'preferred') return Number(preferredNumber(row.entry));
        if (tableSort.key === 'overlap') return row.withWords.toLowerCase();
        return String(row.entry.notes || '').toLowerCase();
      };
      const va = pick(a);
      const vb = pick(b);
      let cmp = 0;
      if (typeof va === 'number' && typeof vb === 'number') {
        const na = Number.isFinite(va) ? va : -Infinity;
        const nb = Number.isFinite(vb) ? vb : -Infinity;
        cmp = na - nb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }
      if (cmp === 0) cmp = String(a.node.label).localeCompare(String(b.node.label));
      return tableSort.dir === 'asc' ? cmp : -cmp;
    });
  void tick;

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
          <TouchableOpacity style={styles.chip} onPress={() => requestLeave(null)}>
            <Text style={styles.chipText}>Back to list</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {exitAsk ? (
        <View style={styles.exitCard}>
          <Text style={styles.detailTitle}>Save before exiting?</Text>
          <Text style={styles.meta}>
            This will keep the layout until you next visit, unless you close the app.
          </Text>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.chip, styles.chipOn]} onPress={() => finishLeave(true)}>
              <Text style={[styles.chipText, styles.chipTextOn]}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chip} onPress={() => finishLeave(false)}>
              <Text style={styles.chipText}>Don't save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chip} onPress={() => setExitAsk(false)}>
              <Text style={styles.chipText}>Stay</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      <Text style={styles.heading}>Graph</Text>
      <Text style={styles.intro}>
        Each word stays joined to its number, even when nothing else shares it. Turn on more than one
        number set to compare edges. A gold line means the same two words are linked in both sets.
        Drag a circle to move it. The browser will not select the label.
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
        <TouchableOpacity
          style={styles.chip}
          onPress={() => {
            layoutTouchedRef.current = true;
            restoredRef.current = false;
            setLayoutKey((n) => n + 1);
          }}
        >
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
          style={[styles.chip, snipMode && styles.chipOn]}
          onPress={() => {
            setSnipMode((on) => {
              if (on) setSnipRect(null);
              return !on;
            });
          }}
        >
          <Text style={[styles.chipText, snipMode && styles.chipTextOn]}>{snipMode ? 'Snip on' : 'Snip'}</Text>
        </TouchableOpacity>
        {snipMode ? (
          <>
            <TouchableOpacity
              style={[styles.chip, snipSquare && styles.chipOn]}
              onPress={() => setSnipSquare((on) => !on)}
            >
              <Text style={[styles.chipText, snipSquare && styles.chipTextOn]}>
                {snipSquare ? 'Square on' : 'Square'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chip} onPress={saveSnip} disabled={savingImage}>
              <Text style={styles.chipText}>Save snip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.chip}
              onPress={() => {
                setSnipMode(false);
                setSnipRect(null);
              }}
            >
              <Text style={styles.chipText}>Cancel snip</Text>
            </TouchableOpacity>
          </>
        ) : null}
        <TouchableOpacity
          style={[styles.chip, selected && posRef.current[selected]?.userPin && styles.chipOn]}
          onPress={() => {
            if (!selected || !posRef.current[selected]) {
              Alert.alert('Pin this node', 'Tap a circle on the graph first.');
              return;
            }
            togglePinRef.current(selected);
          }}
        >
          <Text
            style={[
              styles.chipText,
              selected && posRef.current[selected]?.userPin && styles.chipTextOn,
            ]}
          >
            {selected && posRef.current[selected]?.userPin ? 'Unpin this node' : 'Pin this node'}
          </Text>
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
      {snipMode ? (
        <Text style={styles.meta}>
          Drag a box on the graph. Square keeps the sides equal. Save snip downloads that part only.
        </Text>
      ) : null}
      {loading ? (
        <ActivityIndicator color={colors.blueSoft} style={{ marginTop: 24 }} />
      ) : graph.nodes.length === 0 ? (
        <Text style={styles.intro}>No saved words yet.</Text>
      ) : (
        <View style={{ width, alignSelf: 'center' }}>
        <View nativeID="word-graph-canvas" style={[styles.canvas, { width, height }]} {...pan.panHandlers}>
          <View pointerEvents="none" style={{ width, height, transform: [{ scale: zoom }] }}>
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
                    backgroundColor: node.kind === 'number' ? colors.card : colorFor(node.n),
                    borderWidth: pinned ? 3 : node.overlap || node.kind === 'number' || on ? 2 : 0,
                    borderColor: pinned ? '#fbbf24' : node.overlap ? OVERLAP_COLOR : on ? colors.text : node.color || colorFor(node.n),
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
                    {node.label}
                  </Text>
                ) : (
                  <Text style={styles.hubMeta}>
                    {METHODS.find((m) => m.id === node.method)?.label || 'Number'} · {node.count}
                  </Text>
                )}
              </View>
            );
          })}
          </View>
          {snipRect && snipRect.w > 2 && snipRect.h > 2 ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: snipRect.x,
                top: snipRect.y,
                width: snipRect.w,
                height: snipRect.h,
                borderWidth: 2,
                borderColor: '#fbbf24',
                backgroundColor: 'rgba(251,191,36,0.16)',
                zIndex: 4,
              }}
            />
          ) : null}
        </View>
        <View style={styles.zoomBar}>
          <TouchableOpacity
            style={styles.zoomBtn}
            onPress={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.25) * 100) / 100))}
          >
            <Text style={styles.zoomLabel}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.zoomBtn}
            onPress={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
          >
            <Text style={styles.zoomLabel}>−</Text>
          </TouchableOpacity>
        </View>
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
          <Text style={styles.meta}>Gold outline means pinned. Long-press on a phone. Right-click in the browser.</Text>
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
          <Text style={styles.meta}>Gold outline means pinned. Long-press on a phone. Right-click in the browser.</Text>
        </View>
      ) : null}

      <View
        onLayout={(e) => {
          tableY.current = e.nativeEvent.layout.y;
        }}
      >
        <Text style={styles.layoutLabel}>Data table</Text>
        <Text style={styles.meta}>
          Tap a row to highlight that word. Tap a heading to sort, and tap it again to reverse. A gold
          outline on the graph means that node is pinned. Gold text means the word shares a link in more
          than one selected number set.
        </Text>
        {graph.nodes.filter((n) => n.kind === 'word').length === 0 ? (
          <Text style={styles.meta}>No saved words yet.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View style={styles.tableRow}>
                {[
                  ['pinned', 'Pinned'],
                  ['word', 'Word'],
                  ['ordinal', 'Ordinal'],
                  ['pythagorean', 'Pythagorean'],
                  ['reverse', 'Reverse'],
                  ['reduced', 'Reduced'],
                  ['preferred', 'Preferred'],
                  ['overlap', 'Overlap with'],
                  ['note', 'Note'],
                ].map(([key, label]) => {
                  const on = tableSort.key === key;
                  const arrow = on ? (tableSort.dir === 'asc' ? ' ↑' : ' ↓') : '';
                  const wide = key === 'overlap' || key === 'note' || key === 'word';
                  return (
                    <TouchableOpacity key={key} onPress={() => toggleTableSort(key)}>
                      <Text style={[styles.tableCell, styles.tableHead, wide && (key === 'word' ? styles.tableWord : styles.tableWide)]}>
                        {label}
                        {arrow}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {sortedTableRows.map((row) => {
                  const { node, cells } = row;
                  return (
                    <TouchableOpacity
                      key={node.id}
                      onPress={() => {
                        setSelected((cur) => (cur === node.id ? null : node.id));
                        scrollRef.current?.scrollTo({ y: 0, animated: true });
                      }}
                      style={[styles.tableRow, selected === node.id && { backgroundColor: colors.card }]}
                    >
                      {cells.map((value, i) => (
                        <Text
                          key={`${node.id}-${i}`}
                          style={[
                            styles.tableCell,
                            i === 1 && styles.tableWord,
                            (i === 7 || i === 8) && styles.tableWide,
                            i === 0 && row.pinned && { color: '#fbbf24', fontWeight: '800' },
                            i === 1 && node.overlap && { color: OVERLAP_COLOR },
                            selected === node.id && i === 1 && { color: colors.accent },
                          ]}
                        >
                          {String(value)}
                        </Text>
                      ))}
                    </TouchableOpacity>
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

function screenStyles(c) {
  return StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  content: { padding: 12, paddingBottom: 48 },
  kicker: {
    color: c.blueSoft,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  heading: { color: c.text, fontSize: 26, fontWeight: '800' },
  intro: { color: c.faint, fontSize: 13, lineHeight: 18, marginTop: 4, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  layoutLabel: {
    color: c.faint,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  chip: {
    borderWidth: 1,
    borderColor: c.cardBorder,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipOn: { backgroundColor: c.blue, borderColor: c.blue },
  chipText: { color: c.faint, fontWeight: '700', fontSize: 12 },
  chipTextOn: { color: '#fff' },
  canvas: {
    alignSelf: 'center',
    backgroundColor: c.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.cardBorder,
    overflow: 'hidden',
    userSelect: 'none',
    position: 'relative',
  },
  zoomBar: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    gap: 6,
    zIndex: 5,
  },
  zoomBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.cardBorder,
  },
  zoomLabel: { color: c.text, fontSize: 22, fontWeight: '800', marginTop: -2 },
  nodeLabel: { color: c.text, fontSize: 11, marginTop: 2, maxWidth: 88, userSelect: 'none' },
  nodeLabelOn: { color: c.accent, fontWeight: '800' },
  hubText: { color: c.text, fontSize: 11, fontWeight: '800', userSelect: 'none' },
  hubMeta: { color: c.faint, fontSize: 10, marginTop: 2, userSelect: 'none' },
  exitCard: {
    marginTop: 8,
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: c.blueSoft,
  },
  detail: {
    marginTop: 10,
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: c.cardBorder,
  },
  detailTitle: { color: c.text, fontWeight: '800', fontSize: 16 },
  meta: { color: c.faint, fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 8 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.cardBorder },
  tableCell: { color: c.text, fontSize: 12, width: 96, paddingVertical: 8, paddingHorizontal: 6 },
  tableHead: { color: c.blueSoft, fontWeight: '800', fontSize: 11 },
  tableWord: { width: 120, fontWeight: '700' },
  tableWide: { width: 200 },
});
}
