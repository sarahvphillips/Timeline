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
  { id: 'ordinal', label: 'Ordinal' },
  { id: 'pythagorean', label: 'Pythagorean' },
  { id: 'reverse', label: 'Reverse' },
  { id: 'reduced', label: 'Reduced' },
];

const PALETTE = ['#93c5fd', '#c4b5fd', '#f9a8d4', '#86efac', '#fcd34d', '#67e8f9', '#fda4af', '#a5b4fc'];

function numberFor(entry, method) {
  if (!entry) return null;
  if (method === 'pythagorean') return entry.pythagorean;
  if (method === 'reverse') return entry.reverse;
  if (method === 'reduced') return entry.reduced;
  return entry.ordinal;
}

function buildGraph(list, method) {
  const words = (list || []).filter((w) => w?.phrase && w?.id).slice(0, 200);
  const groups = new Map();
  words.forEach((w) => {
    const n = Number(numberFor(w, method));
    if (!Number.isFinite(n)) return;
    if (!groups.has(n)) groups.set(n, []);
    groups.get(n).push(w);
  });
  const nodes = words.map((w) => ({
    id: w.id,
    kind: 'word',
    label: w.phrase,
    n: Number(numberFor(w, method)),
    entry: w,
  }));
  const edges = [];
  groups.forEach((members, n) => {
    if (members.length < 2) return;
    const hid = `hub:${method}:${n}`;
    nodes.push({ id: hid, kind: 'number', label: String(n), n, count: members.length });
    members.forEach((w) => edges.push({ id: `${w.id}->${hid}`, a: w.id, b: hid }));
  });
  return { nodes, edges, truncated: (list || []).length > words.length };
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

function stepForces(pos, nodes, edges, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const ids = nodes.map((n) => n.id);
  ids.forEach((id) => {
    const p = pos[id];
    if (!p || p.pin) return;
    p.vx += (cx - p.x) * 0.008;
    p.vy += (cy - p.y) * 0.008;
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
      const force = 900 / d2;
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
    const force = (dist - 92) * 0.02;
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
    p.vx *= 0.82;
    p.vy *= 0.82;
    p.x = Math.max(pad, Math.min(width - pad, p.x + p.vx));
    p.y = Math.max(pad, Math.min(height - pad, p.y + p.vy));
  });
}

function xml(text) {
  return String(text ?? '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"');
}

function buildGraphSvg(nodes, edges, pos, width, height, method) {
  const w = Math.round(width);
  const h = Math.round(height);
  const lines = edges
    .map((e) => {
      const a = pos[e.a];
      const b = pos[e.b];
      if (!a || !b) return '';
      return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="#94a3b8" stroke-opacity="0.7" stroke-width="1" />`;
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
  ctx.strokeStyle = 'rgba(148,163,184,0.7)';
  ctx.lineWidth = 1;
  edges.forEach((e) => {
    const a = pos[e.a];
    const b = pos[e.b];
    if (!a || !b) return;
    ctx.beginPath();
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
  const [method, setMethod] = useState('ordinal');
  const [selected, setSelected] = useState(null);
  const [tick, setTick] = useState(0);
  const [layoutKey, setLayoutKey] = useState(0);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [savingImage, setSavingImage] = useState(false);
  const [previewUri, setPreviewUri] = useState('');
  const scrollSetter = useRef(setScrollEnabled);
  scrollSetter.current = setScrollEnabled;
  const graph = useMemo(() => buildGraph(list, method), [list, method]);
  const posRef = useRef({});
  const dragRef = useRef(null);
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
    posRef.current = seedPositions(graph.nodes, width, height);
    setSelected(null);
    let frame = 0;
    let raf = 0;
    const run = () => {
      stepForces(posRef.current, graph.nodes, graph.edges, width, height);
      frame += 1;
      if (frame % 2 === 0) setTick((n) => n + 1);
      if (frame < 240) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [graph, width, height, layoutKey]);

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
        dragRef.current = best?.id || null;
        if (best && posRef.current[best.id]) {
          posRef.current[best.id].pin = true;
          setSelected(best.id);
        } else {
          setSelected(null);
        }
      },
      onPanResponderMove: (e) => {
        const id = dragRef.current;
        if (!id || !posRef.current[id]) return;
        posRef.current[id].x = e.nativeEvent.locationX;
        posRef.current[id].y = e.nativeEvent.locationY;
        posRef.current[id].vx = 0;
        posRef.current[id].vy = 0;
        setTick((n) => n + 1);
      },
      onPanResponderRelease: () => {
        const id = dragRef.current;
        if (id && posRef.current[id]) posRef.current[id].pin = false;
        dragRef.current = null;
        scrollSetter.current(true);
      },
      onPanResponderTerminate: () => {
        dragRef.current = null;
        scrollSetter.current(true);
      },
    })
  ).current;

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
      const png = pngFromLayout(graph.nodes, graph.edges, positions, width, height, method);
      const svg = buildGraphSvg(graph.nodes, graph.edges, positions, width, height, method);
      if (png && Platform.OS === 'web' && typeof document !== 'undefined') {
        const a = document.createElement('a');
        a.href = png;
        a.download = `word-graph-${method}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setPreviewUri(png);
        return;
      }
      const FileSystem = require('expo-file-system/legacy');
      const name = `word-graph-${method}-${Date.now()}.svg`;
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

  return (
    <ScrollView
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
        Words that share a number sit on the same hub. Drag a node. A word with no match stays alone.
      </Text>
      <View style={styles.row}>
        {METHODS.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.chip, method === m.id && styles.chipOn]}
            onPress={() => setMethod(m.id)}
          >
            <Text style={[styles.chipText, method === m.id && styles.chipTextOn]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.chip} onPress={() => setLayoutKey((n) => n + 1)}>
          <Text style={styles.chipText}>Layout again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.chip} onPress={saveImage} disabled={savingImage}>
          <Text style={styles.chipText}>{savingImage ? 'Saving…' : 'Save image'}</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator color="#93c5fd" style={{ marginTop: 24 }} />
      ) : graph.nodes.length === 0 ? (
        <Text style={styles.intro}>No saved words yet.</Text>
      ) : (
        <View style={[styles.canvas, { width, height }]} {...pan.panHandlers}>
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
                  height: 1,
                  backgroundColor: dim ? 'rgba(100,116,139,0.15)' : 'rgba(148,163,184,0.55)',
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
                    borderWidth: node.kind === 'number' || on ? 2 : 0,
                    borderColor: on ? '#fff' : colorFor(node.n),
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
                  <Text style={styles.hubMeta}>{node.count} words</Text>
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
              ? `Same ${method}: ${neighbours
                  .filter((n) => n.kind === 'word')
                  .map((n) => n.label)
                  .join(', ') || 'only this word on the hub'}`
              : 'No other saved word shares this number.'}
          </Text>
        </View>
      ) : selectedNode?.kind === 'number' ? (
        <View style={styles.detail}>
          <Text style={styles.detailTitle}>Number {selectedNode.label}</Text>
          <Text style={styles.meta}>
            {neighbours.map((n) => n.label).join(' · ')}
          </Text>
        </View>
      ) : null}
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
  meta: { color: '#94a3b8', fontSize: 12, lineHeight: 17, marginTop: 4 },
});
