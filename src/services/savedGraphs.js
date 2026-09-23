import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';

const MAX_SAVED = 30;

function storageKey() {
  const uid = auth.currentUser?.uid || 'guest';
  return `@timeline_saved_graphs_${uid}`;
}

export async function listSavedGraphs() {
  try {
    const raw = await AsyncStorage.getItem(storageKey());
    const rows = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((row) => row && row.id && row.savedAt)
      .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  } catch {
    return [];
  }
}

export async function saveGraphSnapshot(snapshot) {
  const rows = await listSavedGraphs();
  const entry = {
    id: `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    savedAt: new Date().toISOString(),
    nodeCount: snapshot.nodeCount || 0,
    wordIds: Array.isArray(snapshot.wordIds) ? snapshot.wordIds : [],
    methods: Array.isArray(snapshot.methods) ? snapshot.methods : ['ordinal'],
    layoutId: snapshot.layoutId || 'force',
    zoom: snapshot.zoom || 1,
    positions: snapshot.positions || {},
  };
  const next = [entry, ...rows].slice(0, MAX_SAVED);
  await AsyncStorage.setItem(storageKey(), JSON.stringify(next));
  return entry;
}

export async function deleteSavedGraph(id) {
  const next = (await listSavedGraphs()).filter((row) => row.id !== id);
  await AsyncStorage.setItem(storageKey(), JSON.stringify(next));
  return next;
}
