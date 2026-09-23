import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Alert,
  Platform,
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

const LAYOUTS = [
  { id: 'force', label: 'ForceAtlas' },
  { id: 'circle', label: 'Circle' },
  { id: 'radial', label: 'Radial' },
  { id: 'arc', label: 'Arc' },
  { id: 'time', label: 'By time' },
  { id: 'grid', label: 'Grid' },
  { id: 'random', label: 'Random' },
];

function placeCircle(nodes, width, height) {
  const pos = {};
  const cx = width / 2;
  const cy = height / 2;
  const ordered = [...nodes].sort((a, b) => String(a.label).localeCompare(String(b.label)));
  const r = Math.min(width, height) * 0.38;
  ordered.forEach((node, i) => {
    const ang = (i / Math.max(ordered.length, 1)) * Math.PI * 2 - Math.PI / 2;
    pos[node.id] = { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
  });
  return pos;
}

function finestHub(node, edges, byId) {
  const linked = edges
    .filter((edge) => edge.a === node.id || edge.b === node.id)
    .map((edge) => byId[edge.a === node.id ? edge.b : edge.a])
    .filter((item) => item?.kind === 'hub');
  return linked.find((item) => item.hub === 'day') || linked.find((item) => item.hub === 'month') || linked.find((item) => item.hub === 'year') || null;
}

function placeRadial(nodes, edges, width, height) {
  const hubs = nodes.filter((node) => node.kind === 'hub');
  if (!hubs.length) return placeCircle(nodes, width, height);
  const byId = {};
  nodes.forEach((node) => {
    byId[node.id] = node;
  });
  const groups = {};
  hubs.forEach((hub) => {
    groups[hub.id] = [];
  });
  nodes
    .filter((node) => node.kind === 'event')
    .forEach((node) => {
      const hub = finestHub(node, edges, byId);
      if (hub) groups[hub.id].push(node.id);
    });
  const cx = width / 2;
  const cy = height / 2;
  const inner = Math.min(width, height) * 0.18;
  const outer = Math.min(width, height) * 0.4;
  const pos = {};
  const ordered = [...hubs].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  ordered.forEach((hub, i) => {
    const ang = (i / ordered.length) * Math.PI * 2 - Math.PI / 2;
    pos[hub.id] = { x: cx + Math.cos(ang) * inner, y: cy + Math.sin(ang) * inner };
    const members = groups[hub.id] || [];
    const spread = Math.min(Math.PI * 0.85, 0.4 + members.length * 0.08);
    members.forEach((id, k) => {
      const t = members.length === 1 ? 0 : (k / (members.length - 1)) * 2 - 1;
      const a = ang + t * spread;
      pos[id] = { x: cx + Math.cos(a) * outer, y: cy + Math.sin(a) * outer };
    });
  });
  nodes.forEach((node) => {
    if (!pos[node.id]) pos[node.id] = { x: cx, y: cy };
  });
  return pos;
}

function placeArc(nodes, width, height) {
  const pos = {};
  const events = nodes.filter((node) => node.kind === 'event').sort((a, b) => String(a.when?.day || a.label).localeCompare(String(b.when?.day || b.label)));
  const hubs = nodes.filter((node) => node.kind === 'hub').sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const span = (count, i, y) => ({
    x: count <= 1 ? width / 2 : 28 + ((width - 56) * i) / (count - 1),
    y,
  });
  events.forEach((node, i) => {
    pos[node.id] = span(events.length, i, height - 48);
  });
  hubs.forEach((node, i) => {
    pos[node.id] = span(hubs.length, i, node.hub === 'year' ? 40 : node.hub === 'month' ? 88 : 136);
  });
  return pos;
}

function placeByTime(nodes, edges, width, height) {
  const pos = {};
  const events = nodes
    .filter((node) => node.kind === 'event')
    .sort((a, b) => String(a.when?.day || '').localeCompare(String(b.when?.day || '')));
  events.forEach((node, i) => {
    pos[node.id] = {
      x: events.length <= 1 ? width / 2 : 32 + ((width - 64) * i) / (events.length - 1),
      y: height * 0.74,
    };
  });
  nodes
    .filter((node) => node.kind === 'hub')
    .forEach((hub) => {
      const pts = edges
        .filter((edge) => edge.a === hub.id || edge.b === hub.id)
        .map((edge) => pos[edge.a === hub.id ? edge.b : edge.a])
        .filter(Boolean);
      const x = pts.length ? pts.reduce((sum, point) => sum + point.x, 0) / pts.length : width / 2;
      const y = hub.hub === 'year' ? 42 : hub.hub === 'month' ? height * 0.28 : height * 0.5;
      pos[hub.id] = { x, y };
    });
  return pos;
}

function placeGrid(nodes, width, height) {
  const ordered = [...nodes].sort((a, b) => String(a.when?.day || a.label).localeCompare(String(b.when?.day || b.label)));
  const cols = Math.max(1, Math.ceil(Math.sqrt(ordered.length)));
  const rows = Math.max(1, Math.ceil(ordered.length / cols));
  const pos = {};
  ordered.forEach((node, i) => {
    pos[node.id] = {
      x: 36 + ((width - 72) * ((i % cols) + 0.5)) / cols,
      y: 40 + ((height - 80) * (Math.floor(i / cols) + 0.5)) / rows,
    };
  });
  return pos;
}

function placeRandom(nodes, width, height) {
  const pos = {};
  nodes.forEach((node) => {
    pos[node.id] = { x: 36 + Math.random() * (width - 72), y: 40 + Math.random() * (height - 80) };
  });
  return pos;
}

function placeLayout(id, nodes, edges, width, height) {
  if (id === 'circle') return placeCircle(nodes, width, height);
  if (id === 'radial') return placeRadial(nodes, edges, width, height);
  if (id === 'arc') return placeArc(nodes, width, height);
  if (id === 'time') return placeByTime(nodes, edges, width, height);
  if (id === 'grid') return placeGrid(nodes, width, height);
  if (id === 'random') return placeRandom(nodes, width, height);
  return placeNodes(nodes, edges, width, height);
}

function scaleFromCenter(pos, width, height, factor) {
  const cx = width / 2;
  const cy = height / 2;
  const next = {};
  Object.keys(pos || {}).forEach((id) => {
    const p = pos[id];
    if (!p) return;
    if (p.userPin) {
      next[id] = { ...p };
      return;
    }
    next[id] = {
      x: Math.max(28, Math.min(width - 28, cx + (p.x - cx) * factor)),
      y: Math.max(28, Math.min(height - 28, cy + (p.y - cy) * factor)),
    };
  });
  return next;
}

function nudgeApart(pos, nodes, width, height) {
  const next = {};
  nodes.forEach((node) => {
    const p = pos[node.id];
    if (p) next[node.id] = { ...p };
  });
  const ids = nodes.map((node) => node.id);
  for (let step = 0; step < 28; step += 1) {
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = next[ids[i]];
        const b = next[ids[j]];
        if (!a || !b || (a.userPin && b.userPin)) continue;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= 46) continue;
        if (dist < 0.1) {
          dx = 1;
          dy = 0.3;
          dist = 1;
        }
        const push = (46 - dist) / 2;
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
  }
  ids.forEach((id) => {
    const p = next[id];
    if (!p || p.userPin) return;
    p.x = Math.max(28, Math.min(width - 28, p.x));
    p.y = Math.max(28, Math.min(height - 28, p.y));
  });
  return next;
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
    const limit = node.kind === 'hub' ? 42 : 34;
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
  const [layoutId, setLayoutId] = useState('force');
  const [layoutKey, setLayoutKey] = useState(0);
  const [positions, setPositions] = useState({});
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const posRef = useRef({});
  const pinsRef = useRef({});
  const dragRef = useRef(null);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  posRef.current = positions;
  pinsRef.current = pins;

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
  useEffect(() => {
    if (!graph.nodes.length) {
      posRef.current = {};
      setPositions({});
      return;
    }
    const next = placeLayout(layoutId, graph.nodes, graph.edges, width, height);
    Object.keys(next).forEach((id) => {
      if (pinsRef.current[id]) next[id] = { ...next[id], userPin: true };
    });
    posRef.current = next;
    setPositions(next);
  }, [graph, width, height, layoutId, layoutKey]);

  const pos = positions;

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
    const nextOn = !pinsRef.current[id];
    const nextPins = { ...pinsRef.current, [id]: nextOn };
    pinsRef.current = nextPins;
    setPins(nextPins);
    setPositions((cur) => {
      const p = cur[id];
      if (!p) return cur;
      const next = { ...cur, [id]: { ...p, userPin: nextOn } };
      posRef.current = next;
      return next;
    });
  };

  const moveNode = (id, dx, dy) => {
    setPositions((cur) => {
      const p = cur[id];
      if (!p) return cur;
      const next = {
        ...cur,
        [id]: {
          ...p,
          x: Math.max(16, Math.min(width - 16, p.x + dx)),
          y: Math.max(16, Math.min(height - 16, p.y + dy)),
          userPin: true,
        },
      };
      posRef.current = next;
      return next;
    });
    setPins((cur) => {
      if (cur[id]) return cur;
      const next = { ...cur, [id]: true };
      pinsRef.current = next;
      return next;
    });
  };

  const adjustLayout = (mode) => {
    setPositions((cur) => {
      const marked = { ...cur };
      Object.keys(marked).forEach((id) => {
        if (marked[id]) marked[id] = { ...marked[id], userPin: !!pinsRef.current[id] };
      });
      const next =
        mode === 'contract'
          ? scaleFromCenter(marked, width, height, 0.82)
          : mode === 'noverlap'
            ? nudgeApart(marked, graph.nodes, width, height)
            : scaleFromCenter(marked, width, height, 1.18);
      posRef.current = next;
      return next;
    });
  };

  const bindNode = (id) => ({
    onPointerDown: (event) => {
      const native = event.nativeEvent || event;
      if (native.button === 2) {
        event.preventDefault?.();
        togglePin(id);
        return;
      }
      try {
        event.currentTarget?.setPointerCapture?.(native.pointerId);
      } catch {
        /* capture is web-only */
      }
      const x = native.pageX ?? native.clientX;
      const y = native.pageY ?? native.clientY;
      const drag = { id, x, y, moved: false, timer: null };
      drag.timer = setTimeout(() => {
        if (dragRef.current === drag && !drag.moved) togglePin(id);
      }, 550);
      dragRef.current = drag;
      setScrollEnabled(false);
      setSelected(id);
    },
    onPointerMove: (event) => {
      const drag = dragRef.current;
      if (!drag || drag.id !== id) return;
      const native = event.nativeEvent || event;
      const x = native.pageX ?? native.clientX;
      const y = native.pageY ?? native.clientY;
      const dx = x - drag.x;
      const dy = y - drag.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      drag.x = x;
      drag.y = y;
      if (!drag.moved) return;
      moveNode(id, dx / (zoomRef.current || 1), dy / (zoomRef.current || 1));
    },
    onPointerUp: () => {
      const drag = dragRef.current;
      if (drag?.id !== id) return;
      clearTimeout(drag.timer);
      dragRef.current = null;
      setScrollEnabled(true);
    },
    onPointerCancel: () => {
      const drag = dragRef.current;
      if (drag?.id === id) clearTimeout(drag.timer);
      if (drag?.id === id) dragRef.current = null;
      setScrollEnabled(true);
    },
    onContextMenu: (event) => {
      event.preventDefault?.();
      togglePin(id);
    },
  });

  const shownRef = useRef(shownNodes);
  shownRef.current = shownNodes;
  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const root = document.getElementById('event-graph-canvas');
    if (!root) return undefined;
    root.style.touchAction = 'none';
    root.style.cursor = 'grab';
    root.style.userSelect = 'none';
    let drag = null;
    const place = (clientX, clientY) => {
      const rect = root.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };
    const unscale = (x, y) => {
      const { width: w, height: h } = sizeRef.current;
      const z = zoomRef.current || 1;
      return { x: w / 2 + (x - w / 2) / z, y: h / 2 + (y - h / 2) / z };
    };
    const down = (event) => {
      if (event.button != null && event.button !== 0) return;
      const raw = place(event.clientX, event.clientY);
      const { width: w, height: h } = sizeRef.current;
      const best = nearestNode(raw.x, raw.y, shownRef.current, posRef.current, zoomRef.current, w, h);
      if (!best || !posRef.current[best.id]) return;
      event.preventDefault();
      const point = unscale(raw.x, raw.y);
      const grabbed = posRef.current[best.id];
      drag = {
        id: best.id,
        ox: grabbed.x - point.x,
        oy: grabbed.y - point.y,
        moved: false,
        x: event.clientX,
        y: event.clientY,
      };
      try {
        root.setPointerCapture(event.pointerId);
      } catch {
        /* optional */
      }
      root.style.cursor = 'grabbing';
      setScrollEnabled(false);
      setSelected(best.id);
    };
    const move = (event) => {
      if (!drag || !posRef.current[drag.id]) return;
      event.preventDefault();
      const raw = place(event.clientX, event.clientY);
      const point = unscale(raw.x, raw.y);
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) drag.moved = true;
      const { width: w, height: h } = sizeRef.current;
      const id = drag.id;
      const nextX = Math.max(16, Math.min(w - 16, point.x + drag.ox));
      const nextY = Math.max(16, Math.min(h - 16, point.y + drag.oy));
      setPositions((cur) => {
        const prev = cur[id];
        if (!prev) return cur;
        const next = { ...cur, [id]: { ...prev, x: nextX, y: nextY, userPin: true } };
        posRef.current = next;
        return next;
      });
      if (drag.moved && !pinsRef.current[id]) {
        pinsRef.current = { ...pinsRef.current, [id]: true };
        setPins(pinsRef.current);
      }
    };
    const up = () => {
      drag = null;
      root.style.cursor = 'grab';
      setScrollEnabled(true);
    };
    const menu = (event) => {
      if (!root.contains(event.target)) return;
      event.preventDefault();
      const raw = place(event.clientX, event.clientY);
      const { width: w, height: h } = sizeRef.current;
      const best = nearestNode(raw.x, raw.y, shownRef.current, posRef.current, zoomRef.current, w, h);
      if (!best) return;
      const nextOn = !pinsRef.current[best.id];
      const nextPins = { ...pinsRef.current, [best.id]: nextOn };
      pinsRef.current = nextPins;
      setPins(nextPins);
      setPositions((cur) => {
        const p = cur[best.id];
        if (!p) return cur;
        const next = { ...cur, [best.id]: { ...p, userPin: nextOn } };
        posRef.current = next;
        return next;
      });
      setSelected(best.id);
    };
    root.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    document.addEventListener('contextmenu', menu);
    return () => {
      root.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.removeEventListener('contextmenu', menu);
    };
  }, [shownNodes.length, tooBig, loading, width, height]);

  return (
    <ScrollView
      scrollEnabled={scrollEnabled}
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.content}
    >
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

      <Text style={[styles.label, { color: colors.muted }]}>Layout</Text>
      <View style={styles.row}>
        {LAYOUTS.map((opt) => {
          const on = layoutId === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.chip, { borderColor: colors.cardBorder }, on && { backgroundColor: colors.blue, borderColor: colors.blue }]}
              onPress={() => {
                if (opt.id === layoutId) setLayoutKey((n) => n + 1);
                else setLayoutId(opt.id);
              }}
            >
              <Text style={[styles.chipText, { color: colors.text }, on && styles.chipTextOn]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity style={[styles.chip, { borderColor: colors.cardBorder }]} onPress={() => adjustLayout('expand')}>
          <Text style={[styles.chipText, { color: colors.text }]}>Expand</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.chip, { borderColor: colors.cardBorder }]} onPress={() => adjustLayout('contract')}>
          <Text style={[styles.chipText, { color: colors.text }]}>Contract</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.chip, { borderColor: colors.cardBorder }]} onPress={() => adjustLayout('noverlap')}>
          <Text style={[styles.chipText, { color: colors.text }]}>No overlap</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.meta, { color: colors.faint }]}>
        Drag a node to move it. That pins it, so Expand and Contract leave it where you put it. Right-click or hold a node to pin it without moving.
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
          <View
            nativeID="event-graph-canvas"
            style={[styles.canvas, { width, height, backgroundColor: colors.card, borderColor: colors.cardBorder }]}
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
            {Platform.OS === 'web'
              ? null
              : shownNodes.map((node) => {
                  const p = pos[node.id];
                  if (!p) return null;
                  const sx = width / 2 + (p.x - width / 2) * zoom;
                  const sy = height / 2 + (p.y - height / 2) * zoom;
                  const hit = node.kind === 'hub' ? 48 : 40;
                  return (
                    <View
                      key={`hit-${node.id}`}
                      {...bindNode(node.id)}
                      style={{
                        position: 'absolute',
                        left: sx - hit / 2,
                        top: sy - hit / 2,
                        width: hit,
                        height: node.kind === 'event' ? hit + 16 : hit,
                        zIndex: selected === node.id ? 4 : 2,
                      }}
                    />
                  );
                })}
          </View>
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
