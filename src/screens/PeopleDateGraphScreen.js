import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getPeople } from '../services/peopleService';
import {
  getSpans,
  daysBetweenAnniversaries,
  daysUntilNext,
  formatUk,
} from '../services/dateSpanService';

const SETS = [
  { id: 'people', label: 'People', color: '#93c5fd' },
  { id: 'spans', label: 'Days between', color: '#86efac' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const OVERLAP = '#fbbf24';

function todayIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function buildGraph(people, spans, sets) {
  const showPeople = sets.includes('people');
  const showSpans = sets.includes('spans');
  const nodes = [];
  const edges = [];
  const overlaps = [];
  const focus = todayIso();

  if (showPeople) {
    const byMonth = new Map();
    people.forEach((person) => {
      if (!person?.id || !person?.name) return;
      nodes.push({
        id: person.id,
        kind: 'person',
        label: person.name,
        entry: person,
        color: '#93c5fd',
      });
      if (!person.birthday) return;
      const month = Number(String(person.birthday).slice(5, 7));
      if (!month) return;
      if (!byMonth.has(month)) byMonth.set(month, []);
      byMonth.get(month).push(person);
    });
    byMonth.forEach((members, month) => {
      if (members.length < 2) return;
      const hid = `month:${month}`;
      nodes.push({
        id: hid,
        kind: 'hub',
        label: MONTHS[month - 1] || String(month),
        color: '#93c5fd',
        count: members.length,
      });
      members.forEach((person) => {
        edges.push({ id: `${person.id}->${hid}`, a: person.id, b: hid, color: '#93c5fd' });
      });
    });
  }

  if (showSpans) {
    const byDays = new Map();
    spans.forEach((span) => {
      if (!span?.id) return;
      const id = `span:${span.id}`;
      const days = Number(span.totalDays);
      nodes.push({
        id,
        kind: 'span',
        label: span.title || (Number.isFinite(days) ? `${days}d` : 'Span'),
        entry: span,
        color: '#86efac',
      });
      if (!Number.isFinite(days)) return;
      if (!byDays.has(days)) byDays.set(days, []);
      byDays.get(days).push(span);
    });
    byDays.forEach((members, days) => {
      if (members.length < 2) return;
      const hid = `days:${days}`;
      nodes.push({
        id: hid,
        kind: 'hub',
        label: `${days}d`,
        color: '#86efac',
        count: members.length,
      });
      members.forEach((span) => {
        edges.push({ id: `span:${span.id}->${hid}`, a: `span:${span.id}`, b: hid, color: '#86efac' });
      });
    });
  }

  if (showPeople && showSpans) {
    const dated = people.filter((p) => p?.birthday && p?.id);
    for (let i = 0; i < dated.length; i += 1) {
      for (let j = i + 1; j < dated.length; j += 1) {
        const gap = daysBetweenAnniversaries(dated[i].birthday, dated[j].birthday);
        const hits = spans.filter((span) => Number(span.totalDays) === gap);
        if (!hits.length) continue;
        overlaps.push({
          a: dated[i].id,
          b: dated[j].id,
          aName: dated[i].name,
          bName: dated[j].name,
          gap,
          spans: hits.map((span) => span.title || `${span.totalDays}d`),
        });
        edges.push({
          id: `overlap:${dated[i].id}:${dated[j].id}`,
          a: dated[i].id,
          b: dated[j].id,
          color: OVERLAP,
          overlap: true,
        });
      }
    }
  }

  return { nodes, edges, overlaps, focus };
}

function placeCircle(nodes, width, height) {
  const pos = {};
  const cx = width / 2;
  const cy = height / 2;
  const people = nodes.filter((n) => n.kind !== 'hub');
  const hubs = nodes.filter((n) => n.kind === 'hub');
  people.forEach((node, i) => {
    const ang = (i / Math.max(people.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const r = Math.min(width, height) * 0.38;
    pos[node.id] = { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
  });
  hubs.forEach((node, i) => {
    const ang = (i / Math.max(hubs.length, 1)) * Math.PI * 2;
    const r = Math.min(width, height) * 0.16;
    pos[node.id] = { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
  });
  return pos;
}

export default function PeopleDateGraphScreen() {
  const { width: winW, height: winH } = useWindowDimensions();
  const width = Math.max(280, winW - 24);
  const height = Math.max(320, Math.min(winH - 220, 560));
  const [people, setPeople] = useState([]);
  const [spans, setSpans] = useState([]);
  const [sets, setSets] = useState(['people']);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      setLoading(true);
      Promise.all([getPeople(), getSpans()])
        .then(([p, s]) => {
          if (!on) return;
          setPeople(Array.isArray(p) ? p : []);
          setSpans(Array.isArray(s) ? s : []);
        })
        .finally(() => {
          if (on) setLoading(false);
        });
      return () => {
        on = false;
      };
    }, [])
  );

  const graph = useMemo(() => buildGraph(people, spans, sets), [people, spans, sets]);
  const pos = useMemo(() => placeCircle(graph.nodes, width, height), [graph, width, height]);

  const toggle = (id) => {
    setSets((cur) => {
      if (cur.includes(id)) return cur.length === 1 ? cur : cur.filter((x) => x !== id);
      return [...cur, id];
    });
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Utilities</Text>
      <Text style={styles.heading}>People and dates</Text>
      <Text style={styles.intro}>
        Tap People, then Days between. Both stay highlighted. Tap a highlighted one again to turn it
        off. A gold line means a saved day-count matches the gap between two birthdays.
      </Text>
      <View style={styles.row}>
        {SETS.map((set) => {
          const on = sets.includes(set.id);
          return (
            <TouchableOpacity
              key={set.id}
              style={[styles.chip, on && { backgroundColor: set.color, borderColor: set.color }]}
              onPress={() => toggle(set.id)}
            >
              <Text style={[styles.chipText, on && { color: '#0a0a0b' }]}>{set.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {loading ? (
        <ActivityIndicator color="#93c5fd" style={{ marginTop: 24 }} />
      ) : graph.nodes.length === 0 ? (
        <Text style={styles.intro}>Nothing saved for the sets that are on.</Text>
      ) : (
        <View style={{ width, alignSelf: 'center' }}>
        <View style={[styles.canvas, { width, height }]}>
          <View pointerEvents="none" style={{ width, height, transform: [{ scale: zoom }] }}>
          {graph.edges.map((e) => {
            const a = pos[e.a];
            const b = pos[e.b];
            if (!a || !b) return null;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const angle = Math.atan2(dy, dx);
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
                  backgroundColor: e.color,
                  transform: [{ rotate: `${angle}rad` }],
                }}
              />
            );
          })}
          {graph.nodes.map((node) => {
            const p = pos[node.id];
            if (!p) return null;
            const size = node.kind === 'hub' ? 34 : 12;
            return (
              <View
                key={node.id}
                pointerEvents="none"
                style={{ position: 'absolute', left: p.x - size / 2, top: p.y - size / 2, alignItems: 'center' }}
              >
                <View
                  style={{
                    width: size,
                    height: size,
                    borderRadius: size,
                    backgroundColor: node.kind === 'hub' ? '#0f172a' : node.color,
                    borderWidth: node.kind === 'hub' ? 2 : 0,
                    borderColor: node.color,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {node.kind === 'hub' ? <Text style={styles.hubText}>{node.label}</Text> : null}
                </View>
                {node.kind !== 'hub' ? (
                  <Text style={styles.nodeLabel} numberOfLines={1}>
                    {node.label}
                  </Text>
                ) : null}
              </View>
            );
          })}
          </View>
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

      <Text style={styles.layoutLabel}>Data table</Text>
      {sets.includes('people') ? (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={styles.tableRow}>
              {['Person', 'Birthday', 'Days until', 'Note'].map((h) => (
                <Text key={h} style={[styles.cell, styles.head, h !== 'Days until' && styles.wide]}>
                  {h}
                </Text>
              ))}
            </View>
            {people.map((person) => (
              <View key={person.id} style={styles.tableRow}>
                <Text style={[styles.cell, styles.wide]}>{person.name}</Text>
                <Text style={[styles.cell, styles.wide]}>{person.birthday ? formatUk(person.birthday) : '—'}</Text>
                <Text style={styles.cell}>
                  {person.birthday ? daysUntilNext(graph.focus, person.birthday) : '—'}
                </Text>
                <Text style={[styles.cell, styles.wide]}>{person.note || '—'}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}
      {sets.includes('spans') ? (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={{ marginTop: 12 }}>
            <View style={styles.tableRow}>
              {['Days between', 'From', 'To', 'Days', 'Note'].map((h) => (
                <Text key={h} style={[styles.cell, styles.head, styles.wide]}>
                  {h}
                </Text>
              ))}
            </View>
            {spans.map((span) => (
              <View key={span.id} style={styles.tableRow}>
                <Text style={[styles.cell, styles.wide]}>{span.title || '—'}</Text>
                <Text style={[styles.cell, styles.wide]}>{formatUk(span.fromDate) || span.fromDate || '—'}</Text>
                <Text style={[styles.cell, styles.wide]}>{formatUk(span.toDate) || span.toDate || '—'}</Text>
                <Text style={[styles.cell, styles.wide]}>{span.totalDays ?? '—'}</Text>
                <Text style={[styles.cell, styles.wide]}>{span.note || '—'}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}
      <Text style={styles.layoutLabel}>Overlap</Text>
      {graph.overlaps.length === 0 ? (
        <Text style={styles.intro}>
          No gold links yet. Turn on both People and Days between. A link appears when a saved day-count
          equals the days between two birthdays, ignoring the year.
        </Text>
      ) : (
        graph.overlaps.map((row) => (
          <Text key={`${row.a}-${row.b}`} style={styles.overlap}>
            {row.aName} and {row.bName}: {row.gap}d · {row.spans.join(', ')}
          </Text>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0a0a0b' },
  content: { padding: 12, paddingBottom: 48 },
  kicker: { color: '#93c5fd', fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  heading: { color: '#f8fafc', fontSize: 26, fontWeight: '800' },
  intro: { color: '#94a3b8', fontSize: 13, lineHeight: 18, marginTop: 4, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { borderWidth: 1, borderColor: '#334155', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { color: '#94a3b8', fontWeight: '700', fontSize: 12 },
  layoutLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 6,
  },
  canvas: {
    alignSelf: 'center',
    backgroundColor: '#0a0a0b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
  },
  zoomBar: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', gap: 6, zIndex: 5 },
  zoomBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#334155',
  },
  zoomLabel: { color: '#f8fafc', fontSize: 22, fontWeight: '800', marginTop: -2 },
  hubText: { color: '#e2e8f0', fontSize: 10, fontWeight: '800' },
  nodeLabel: { color: '#e2e8f0', fontSize: 11, marginTop: 2, maxWidth: 88 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  cell: { color: '#e2e8f0', width: 88, fontSize: 12, paddingVertical: 8, paddingHorizontal: 6 },
  head: { color: '#93c5fd', fontWeight: '800', fontSize: 11 },
  wide: { width: 140 },
  overlap: { color: OVERLAP, fontSize: 13, lineHeight: 20, marginBottom: 4 },
});
