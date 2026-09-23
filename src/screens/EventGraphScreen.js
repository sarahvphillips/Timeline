import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CATEGORIES, getCategoryColor, getEvents } from '../services/eventService';
import { useTheme } from '../themeContext';

const NODE_CAP = 200;
const EMPTY_GRAPH = { nodes: [], edges: [] };
const HUBS = [
  { id: 'day', label: 'Day' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n) {
  return String(n).padStart(2, '0');
}

function eventWhen(event) {
  const raw = event?.date || event?.createdAt || '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return {
    year: String(year),
    yearLabel: String(year),
    month: `${year}-${pad(month)}`,
    monthLabel: `${MONTHS[month - 1]} ${String(year).slice(2)}`,
    day: `${year}-${pad(month)}-${pad(day)}`,
    dayLabel: `${day} ${MONTHS[month - 1]}`,
    full: `${pad(day)}/${pad(month)}/${year}`,
  };
}

function categoryName(id) {
  return CATEGORIES.find((c) => c.id === id)?.label || id || 'Other';
}

function buildEventGraph(events, hubIds) {
  const nodes = [];
  const edges = [];
  const seen = new Set();
  (events || []).forEach((event) => {
    if (!event?.id) return;
    const when = eventWhen(event);
    nodes.push({
      id: `ev:${event.id}`,
      kind: 'event',
      label: event.title || 'Untitled',
      event,
      when,
      color: getCategoryColor(event.category),
    });
    if (!when) return;
    const links = [];
    if (hubIds.includes('day')) links.push({ id: `day:${when.day}`, label: when.dayLabel, hub: 'day' });
    if (hubIds.includes('month')) links.push({ id: `month:${when.month}`, label: when.monthLabel, hub: 'month' });
    if (hubIds.includes('year')) links.push({ id: `year:${when.year}`, label: when.yearLabel, hub: 'year' });
    links.forEach((hub) => {
      if (!seen.has(hub.id)) {
        seen.add(hub.id);
        nodes.push({ id: hub.id, kind: 'hub', hub: hub.hub, label: hub.label, color: '#94a3b8' });
      }
      edges.push({
        id: `${event.id}->${hub.id}`,
        a: `ev:${event.id}`,
        b: hub.id,
        color: 'rgba(148,163,184,0.55)',
      });
    });
  });
  return { nodes, edges };
}

function placeNodes(nodes, edges, width, height) {
  const pos = {};
  const cx = width / 2;
  const cy = height / 2;
  nodes.forEach((node, i) => {
    const ring =
      node.kind === 'hub'
        ? node.hub === 'year'
          ? 78
          : node.hub === 'month'
            ? 150
            : 220
        : Math.min(width, height) * 0.4;
    const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
    pos[node.id] = { x: cx + Math.cos(angle) * ring, y: cy + Math.sin(angle) * ring };
  });
  const ids = nodes.map((node) => node.id);
  for (let step = 0; step < 40; step += 1) {
    const force = {};
    ids.forEach((id) => {
      force[id] = { x: 0, y: 0 };
    });
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = pos[ids[i]];
        const b = pos[ids[j]];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const dist = Math.hypot(dx, dy) || 0.1;
        const push = 800 / (dist * dist);
        dx /= dist;
        dy /= dist;
        force[ids[i]].x += dx * push;
        force[ids[i]].y += dy * push;
        force[ids[j]].x -= dx * push;
        force[ids[j]].y -= dy * push;
      }
    }
    edges.forEach((edge) => {
      const a = pos[edge.a];
      const b = pos[edge.b];
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const pull = (dist - 96) * 0.02;
      force[edge.a].x += (dx / dist) * pull;
      force[edge.a].y += (dy / dist) * pull;
      force[edge.b].x -= (dx / dist) * pull;
      force[edge.b].y -= (dy / dist) * pull;
    });
    ids.forEach((id) => {
      pos[id].x = Math.max(28, Math.min(width - 28, pos[id].x + Math.max(-8, Math.min(8, force[id].x))));
      pos[id].y = Math.max(28, Math.min(height - 28, pos[id].y + Math.max(-8, Math.min(8, force[id].y))));
    });
  }
  return pos;
}

function nodesWithin(nodes, edges, pins, depth) {
  const pinned = new Set();
  nodes.forEach((node) => {
    if (pins[node.id]) pinned.add(node.id);
  });
  const keep = new Set(pinned);
  const hops = Math.max(0, Math.min(5, Number(depth) || 0));
  if (!hops) return keep;
  const adj = new Map();
  edges.forEach((edge) => {
    if (!adj.has(edge.a)) adj.set(edge.a, new Set());
    if (!adj.has(edge.b)) adj.set(edge.b, new Set());
    adj.get(edge.a).add(edge.b);
    adj.get(edge.b).add(edge.a);
  });
  let frontier = [...pinned];
  for (let hop = 0; hop < hops; hop += 1) {
    const next = [];
    frontier.forEach((id) => {
      (adj.get(id) || []).forEach((other) => {
        if (keep.has(other)) return;
        keep.add(other);
        next.push(other);
      });
    });
    frontier = next;
  }
  return keep;
}

function nearestNode(x, y, nodes, pos, zoom, width, height) {
  const z = zoom || 1;
  const cx = width / 2;
  const cy = height / 2;
  let best = null;
  let bestD = Infinity;
  nodes.forEach((node) => {
    const p = pos[node.id];
    if (!p) return;
    const sx = cx + (p.x - cx) * z;
    const sy = cy + (p.y - cy) * z;
    const d = Math.hypot(sx - x, sy - y);
    const limit = node.kind === 'hub' ? 30 : 22;
    if (d <= limit && d < bestD) {
      best = node;
      bestD = d;
    }
  });
  return best;
}

function openEvent(navigation, event) {
  if (!event) return;
  if (event.source === 'food') navigation.navigate('AddFood', { event });
  else if (event.source === 'laundry') navigation.navigate('AddWashLoad', { event });
  else if (event.source === 'youtube') navigation.navigate('YouTube', { event });
  else if (event.source === 'spotify') navigation.navigate('Spotify', { event });
  else if (event.source === 'game') navigation.navigate('Games', { event });
  else if (event.source === 'watched' || event.watchKind) navigation.navigate('AddWatched', { event });
  else if (event.source === 'social') navigation.navigate('Social', { event });
  else if (event.source === 'sms') navigation.navigate('AddSms', { event });
  else if (event.source === 'call') navigation.navigate('AddCall', { event });
  else if (event.source === 'location') navigation.navigate('AddLocation', { event });
  else if (event.source === 'life') navigation.navigate('AddLifeEvent', { event });
  else if (event.hobbyType === 'poetry') navigation.navigate('AddPoem', { event });
  else if (event.hobbyType === 'singing' || event.hobbyType === 'music') navigation.navigate('AddSinging', { event });
  else if (event.source === 'qr') navigation.navigate('AddQr', { event });
  else navigation.navigate('AddEvent', { event });
}

export default function EventGraphScreen({ navigation }) {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.max(320, Math.min(windowWidth - 32, 860));
  const height = Math.max(420, Math.min(640, Math.round(width * 0.85)));
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allOn, setAllOn] = useState(false);
  const [picked, setPicked] = useState([]);
  const [hubs, setHubs] = useState(['day', 'month', 'year']);
  const [selected, setSelected] = useState(null);
  const [pins, setPins] = useState({});
  const [pinnedDepth, setPinnedDepth] = useState(null);
  const [zoom, setZoom] = useState(1);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      setLoading(true);
      getEvents()
        .then((rows) => {
          if (!on) return;
          const list = Array.isArray(rows) ? rows : [];
          setEvents(list);
          const built = buildEventGraph(list, ['day', 'month', 'year']);
          setAllOn(built.nodes.length > 0 && built.nodes.length <= NODE_CAP);
        })
        .catch(() => {
          if (on) setEvents([]);
        })
        .finally(() => {
          if (on) setLoading(false);
        });
      return () => {
        on = false;
      };
    }, [])
  );

  const categoryIds = useMemo(() => {
    const ids = [];
    const seen = new Set();
    events.forEach((event) => {
      const id = event.category || 'other';
      if (seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    });
    return ids;
  }, [events]);

  const filtered = useMemo(() => {
    if (allOn) return events;
    if (!picked.length) return [];
    const allowed = new Set(picked);
    return events.filter((event) => allowed.has(event.category || 'other'));
  }, [events, allOn, picked]);

  const built = useMemo(() => buildEventGraph(filtered, hubs), [filtered, hubs]);
  const tooBig = built.nodes.length > NODE_CAP;
  const graph = tooBig ? EMPTY_GRAPH : built;
  const pos = useMemo(
    () => (graph.nodes.length ? placeNodes(graph.nodes, graph.edges, width, height) : {}),
    [graph, width, height]
  );

  const keep = useMemo(() => {
    if (pinnedDepth == null) return null;
    return nodesWithin(graph.nodes, graph.edges, pins, pinnedDepth);
  }, [pinnedDepth, graph, pins]);

  const shownNodes = keep ? graph.nodes.filter((node) => keep.has(node.id)) : graph.nodes;
  const shownEdges = keep
    ? graph.edges.filter((edge) => keep.has(edge.a) && keep.has(edge.b))
    : graph.edges;

  useEffect(() => {
    if (selected && !shownNodes.some((node) => node.id === selected)) setSelected(null);
  }, [selected, shownNodes]);

  const byId = useMemo(() => {
    const map = {};
    graph.nodes.forEach((node) => {
      map[node.id] = node;
    });
    return map;
  }, [graph]);

  const selectedNode = selected ? byId[selected] : null;
  const neighbours = useMemo(() => {
    if (!selected) return [];
    const ids = new Set();
    shownEdges.forEach((edge) => {
      if (edge.a === selected) ids.add(edge.b);
      if (edge.b === selected) ids.add(edge.a);
    });
    return [...ids].map((id) => byId[id]).filter(Boolean);
  }, [selected, shownEdges, byId]);

  const linkedIds = useMemo(() => {
    const set = new Set();
    if (!selected) return set;
    set.add(selected);
    neighbours.forEach((node) => set.add(node.id));
    return set;
  }, [selected, neighbours]);

  const toggleCategory = (id) => {
    setAllOn(false);
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((item) => item !== id);
      if (cur.length >= 5) {
        Alert.alert('Five categories', 'Turn one off before adding another, or choose All.');
        return cur;
      }
      return [...cur, id];
    });
  };

  const toggleHub = (id) => {
    setHubs((cur) => {
      if (cur.includes(id)) return cur.length === 1 ? cur : cur.filter((item) => item !== id);
      return [...cur, id];
    });
  };

  const togglePin = (id) => {
    if (!id) return;
    setPins((cur) => ({ ...cur, [id]: !cur[id] }));
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Text style={[styles.kicker, { color: colors.blueSoft }]}>Utilities</Text>
      <Text style={[styles.heading, { color: colors.text }]}>Event graph</Text>
      <Text style={[styles.intro, { color: colors.faint }]}>
        An event links to its day, month and year. Tap a node to highlight what it joins. Open event
        is on the row under the graph. The graph stops at {NODE_CAP} nodes.
      </Text>

      <Text style={[styles.label, { color: colors.muted }]}>Categories</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.chip, { borderColor: colors.cardBorder }, allOn && { backgroundColor: colors.blue, borderColor: colors.blue }]}
          onPress={() => {
            setAllOn(true);
            setPicked([]);
          }}
        >
          <Text style={[styles.chipText, { color: colors.text }, allOn && styles.chipTextOn]}>All</Text>
        </TouchableOpacity>
        {categoryIds.map((id) => {
          const on = !allOn && picked.includes(id);
          return (
            <TouchableOpacity
              key={id}
              style={[styles.chip, { borderColor: colors.cardBorder }, on && { backgroundColor: getCategoryColor(id), borderColor: getCategoryColor(id) }]}
              onPress={() => toggleCategory(id)}
            >
              <Text style={[styles.chipText, { color: colors.text }, on && styles.chipTextOn]}>{categoryName(id)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={[styles.meta, { color: colors.faint }]}>
        {allOn ? 'All categories are on.' : picked.length ? `${picked.length} of 5 categories.` : 'Choose up to five categories, or All.'}
      </Text>

      <Text style={[styles.label, { color: colors.muted }]}>Time hubs</Text>
      <View style={styles.row}>
        {HUBS.map((hub) => {
          const on = hubs.includes(hub.id);
          return (
            <TouchableOpacity
              key={hub.id}
              style={[styles.chip, { borderColor: colors.cardBorder }, on && { backgroundColor: colors.blue, borderColor: colors.blue }]}
              onPress={() => toggleHub(hub.id)}
            >
              <Text style={[styles.chipText, { color: colors.text }, on && styles.chipTextOn]}>{hub.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.chip, { borderColor: colors.cardBorder }, pinnedDepth === 0 && { backgroundColor: colors.blue, borderColor: colors.blue }]}
          onPress={() => setPinnedDepth((cur) => (cur === 0 ? null : 0))}
        >
          <Text style={[styles.chipText, { color: colors.text }, pinnedDepth === 0 && styles.chipTextOn]}>Pinned nodes</Text>
        </TouchableOpacity>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity
            key={`hop-${n}`}
            style={[styles.chip, { borderColor: colors.cardBorder }, pinnedDepth === n && { backgroundColor: colors.blue, borderColor: colors.blue }]}
            onPress={() => setPinnedDepth((cur) => (cur === n ? null : n))}
          >
            <Text style={[styles.chipText, { color: colors.text }, pinnedDepth === n && styles.chipTextOn]}>
              {n === 1 ? '1 relation' : `${n} relations`}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[styles.chip, { borderColor: colors.cardBorder }]} onPress={() => setPins({})}>
          <Text style={[styles.chipText, { color: colors.text }]}>Unpin all</Text>
        </TouchableOpacity>
      </View>
      {pinnedDepth != null ? (
        <Text style={[styles.meta, { color: colors.faint }]}>
          {keep && keep.size
            ? pinnedDepth === 0
              ? 'Showing pinned nodes only.'
              : `Showing pinned nodes and nodes up to ${pinnedDepth} ${pinnedDepth === 1 ? 'relation' : 'relations'} away.`
            : 'Nothing is pinned yet. Pin a node, then choose how far out to show.'}
        </Text>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.blueSoft} style={{ marginTop: 24 }} />
      ) : tooBig ? (
        <Text style={[styles.intro, { color: colors.faint }]}>
          This selection is {built.nodes.length} nodes. The graph stops at {NODE_CAP}. Choose fewer
          categories, or turn off Day hubs. Year hubs pull in every event from that year once you go
          two relations out.
        </Text>
      ) : shownNodes.length === 0 ? (
        <Text style={[styles.intro, { color: colors.faint }]}>
          {events.length ? 'Nothing to draw for this selection.' : 'No events saved yet.'}
        </Text>
      ) : (
        <View style={{ width, alignSelf: 'center' }}>
          <Pressable
            style={[styles.canvas, { width, height, backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            onPress={(e) => {
              const node = nearestNode(e.nativeEvent.locationX, e.nativeEvent.locationY, shownNodes, pos, zoom, width, height);
              if (!node) return;
              setSelected((cur) => (cur === node.id ? null : node.id));
            }}
          >
            <View pointerEvents="none" style={{ width, height, transform: [{ scale: zoom }] }}>
              {shownEdges.map((edge) => {
                const a = pos[edge.a];
                const b = pos[edge.b];
                if (!a || !b) return null;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.hypot(dx, dy) || 1;
                const dim = selected && !linkedIds.has(edge.a) && !linkedIds.has(edge.b);
                return (
                  <View
                    key={edge.id}
                    style={{
                      position: 'absolute',
                      left: (a.x + b.x) / 2 - dist / 2,
                      top: (a.y + b.y) / 2,
                      width: dist,
                      height: 1,
                      backgroundColor: dim ? 'rgba(100,116,139,0.15)' : edge.color,
                      transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
                    }}
                  />
                );
              })}
              {shownNodes.map((node) => {
                const p = pos[node.id];
                if (!p) return null;
                const on = selected === node.id;
                const dim = selected && !linkedIds.has(node.id);
                const pinned = !!pins[node.id];
                const size = node.kind === 'hub' ? 36 : 12;
                return (
                  <View
                    key={node.id}
                    style={{
                      position: 'absolute',
                      left: p.x - (node.kind === 'hub' ? size / 2 : 36),
                      top: p.y - size / 2,
                      width: node.kind === 'hub' ? size : 72,
                      alignItems: 'center',
                      opacity: dim ? 0.28 : 1,
                    }}
                  >
                    <View
                      style={{
                        width: size,
                        height: size,
                        borderRadius: size,
                        backgroundColor: node.kind === 'hub' ? colors.bg : node.color,
                        borderWidth: pinned ? 3 : on || node.kind === 'hub' ? 2 : 0,
                        borderColor: pinned ? '#fbbf24' : on ? '#fbbf24' : node.color,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {node.kind === 'hub' ? (
                        <Text style={[styles.hubText, { color: colors.text }]} numberOfLines={1}>
                          {node.label}
                        </Text>
                      ) : null}
                    </View>
                    {node.kind === 'event' ? (
                      <Text style={[styles.nodeLabel, { color: on ? '#fbbf24' : colors.faint }]} numberOfLines={1}>
                        {node.label}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </Pressable>
          <View style={styles.zoomBar}>
            <TouchableOpacity style={[styles.zoomBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.25) * 100) / 100))}>
              <Text style={[styles.zoomLabel, { color: colors.text }]}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.zoomBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}>
              <Text style={[styles.zoomLabel, { color: colors.text }]}>−</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {selectedNode ? (
        <View style={[styles.detail, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.detailTitle, { color: colors.text }]}>{selectedNode.label}</Text>
          {selectedNode.kind === 'event' ? (
            <Text style={[styles.meta, { color: colors.faint }]}>
              {selectedNode.when?.full || 'No date'} · {categoryName(selectedNode.event?.category)}
            </Text>
          ) : (
            <Text style={[styles.meta, { color: colors.faint }]}>
              {selectedNode.hub === 'day' ? 'Day hub' : selectedNode.hub === 'month' ? 'Month hub' : 'Year hub'}
            </Text>
          )}
          <Text style={[styles.meta, { color: colors.faint }]}>
            {neighbours.length ? `Joined to ${neighbours.map((node) => node.label).join(', ')}` : 'Nothing else is joined in this view.'}
          </Text>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.chip, { borderColor: colors.cardBorder }]} onPress={() => togglePin(selectedNode.id)}>
              <Text style={[styles.chipText, { color: colors.text }]}>{pins[selectedNode.id] ? 'Unpin' : 'Pin'}</Text>
            </TouchableOpacity>
            {selectedNode.kind === 'event' ? (
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: colors.blue, borderColor: colors.blue }]}
                onPress={() => openEvent(navigation, selectedNode.event)}
              >
                <Text style={[styles.chipText, styles.chipTextOn]}>Open event</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : (
        <Text style={[styles.meta, { color: colors.faint }]}>Tap a node to highlight its links. Open event stays on this row.</Text>
      )}

      <Text style={[styles.label, { color: colors.muted }]}>Events in this selection</Text>
      {filtered.length === 0 ? (
        <Text style={[styles.meta, { color: colors.faint }]}>No events in the categories that are on.</Text>
      ) : (
        filtered.slice(0, 80).map((event) => {
          const id = `ev:${event.id}`;
          const on = selected === id;
          return (
            <TouchableOpacity
              key={event.id}
              style={[styles.eventRow, { borderColor: colors.cardBorder }, on && { borderColor: '#fbbf24' }]}
              onPress={() => setSelected((cur) => (cur === id ? null : id))}
            >
              <Text style={[styles.eventTitle, { color: on ? '#fbbf24' : colors.text }]} numberOfLines={1}>
                {pins[id] ? 'Pinned · ' : ''}
                {event.title || 'Untitled'}
              </Text>
              <Text style={[styles.meta, { color: colors.faint }]}>
                {eventWhen(event)?.full || 'No date'} · {categoryName(event.category)}
              </Text>
            </TouchableOpacity>
          );
        })
      )}
      {filtered.length > 80 ? (
        <Text style={[styles.meta, { color: colors.faint }]}>The list shows the first 80. The graph still uses the full selection, up to {NODE_CAP} nodes.</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, marginBottom: 4 },
  heading: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '700', marginTop: 8, marginBottom: 6 },
  meta: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 13, fontWeight: '700' },
  chipTextOn: { color: '#ffffff' },
  canvas: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  hubText: { fontSize: 9, fontWeight: '800', textAlign: 'center' },
  nodeLabel: { fontSize: 10, marginTop: 2, maxWidth: 72, textAlign: 'center' },
  zoomBar: { position: 'absolute', top: 8, right: 8, gap: 6 },
  zoomBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  zoomLabel: { fontSize: 20, fontWeight: '700', lineHeight: 22 },
  detail: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 12 },
  detailTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  eventRow: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  eventTitle: { fontSize: 15, fontWeight: '700' },
});
