import { Platform, Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';
import { versionLine } from '../version';
import { readLocalEvents, saveEvent } from './eventService';
import {
  readLocalWordNumbers,
  getNumberSearchList,
  addWordSearch,
  addNumberSearch,
  importSharedWords,
} from './wordToIntService';
import { getSpans, saveSpan } from './dateSpanService';
import {
  getProfile,
  getLabels,
  getPoemCategories,
  getEventCategories,
  saveLabels,
  savePoemCategories,
  saveEventCategories,
} from './profileService';
import { getPeople, savePerson } from './peopleService';

export const BACKUP_KIND = 'timeline.app.backup';
export const BACKUP_FORMAT = 1;

function uidKey() {
  return auth?.currentUser?.uid || 'guest';
}

function graphsKey() {
  return `@timeline_saved_graphs_${uidKey()}`;
}

async function listSavedGraphs() {
  try {
    const raw = await AsyncStorage.getItem(graphsKey());
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function writeSavedGraphs(rows) {
  await AsyncStorage.setItem(graphsKey(), JSON.stringify(rows.slice(0, 30)));
}

function slimEvent(event) {
  if (!event || typeof event !== 'object') return null;
  const copy = { ...event };
  Object.keys(copy).forEach((key) => {
    const val = copy[key];
    if (typeof val === 'function') delete copy[key];
    if (typeof val === 'string' && val.startsWith('data:') && val.length > 20000) {
      copy[key] = '';
      copy.mediaOmitted = true;
    }
  });
  return copy;
}

export async function buildBackup() {
  const [events, words, searches, spans, graphs, profile, labels, poemCats, eventCats, people] =
    await Promise.all([
      readLocalEvents().catch(() => []),
      readLocalWordNumbers().catch(() => []),
      getNumberSearchList().catch(() => []),
      getSpans().catch(() => []),
      listSavedGraphs(),
      getProfile().catch(() => ({})),
      getLabels().catch(() => []),
      getPoemCategories().catch(() => []),
      getEventCategories().catch(() => []),
      getPeople().catch(() => []),
    ]);
  return {
    kind: BACKUP_KIND,
    format: BACKUP_FORMAT,
    app: versionLine(),
    exportedAt: new Date().toISOString(),
    events: (events || []).map(slimEvent).filter(Boolean),
    words: Array.isArray(words) ? words : [],
    searches: Array.isArray(searches) ? searches : [],
    spans: Array.isArray(spans) ? spans : [],
    graphs: Array.isArray(graphs) ? graphs : [],
    people: Array.isArray(people) ? people : [],
    labels: Array.isArray(labels) ? labels : [],
    poemCategories: Array.isArray(poemCats) ? poemCats : [],
    eventCategories: Array.isArray(eventCats) ? eventCats : [],
    profile: profile
      ? {
          displayName: profile.displayName || '',
          dateOfBirth: profile.dateOfBirth || '',
          handle: profile.handle || '',
        }
      : {},
  };
}

export function backupFileName(pack) {
  const day = String(pack?.exportedAt || new Date().toISOString()).slice(0, 10);
  return `Timeline-backup-${day}.json`;
}

export function parseBackup(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || data.kind !== BACKUP_KIND) {
    const err = new Error('This file is not a Timeline backup.');
    err.code = 'NOT_BACKUP';
    throw err;
  }
  return data;
}

export function backupCounts(pack) {
  return {
    events: (pack.events || []).length,
    words: (pack.words || []).length,
    searches: (pack.searches || []).length,
    spans: (pack.spans || []).length,
    graphs: (pack.graphs || []).length,
    people: (pack.people || []).length,
  };
}

export async function importBackup(pack) {
  const counts = { events: 0, words: 0, searches: 0, spans: 0, graphs: 0, people: 0, skipped: 0 };
  const existingEvents = await readLocalEvents().catch(() => []);
  const eventIds = new Set((existingEvents || []).map((row) => String(row.id)));
  for (const event of pack.events || []) {
    if (!event) continue;
    if (event.id && eventIds.has(String(event.id))) {
      counts.skipped += 1;
      continue;
    }
    try {
      await saveEvent({ ...event, id: undefined });
      counts.events += 1;
    } catch {
      counts.skipped += 1;
    }
  }

  if ((pack.words || []).length) {
    try {
      const result = await importSharedWords(pack.words);
      counts.words = (result.added || []).length;
      counts.skipped += (result.skipped || []).length;
    } catch {
      counts.skipped += (pack.words || []).length;
    }
  }

  for (const row of pack.searches || []) {
    try {
      if (row.phrase) {
        const added = await addWordSearch(row.phrase);
        if (!added.already) counts.searches += 1;
      } else if (row.number != null) {
        const added = await addNumberSearch(row.number, row.method || 'all');
        if (!added.already) counts.searches += 1;
      }
    } catch {
      counts.skipped += 1;
    }
  }

  const existingSpans = await getSpans().catch(() => []);
  const spanIds = new Set((existingSpans || []).map((row) => String(row.id)));
  for (const span of pack.spans || []) {
    if (span?.id && spanIds.has(String(span.id))) {
      counts.skipped += 1;
      continue;
    }
    try {
      await saveSpan({ ...span, id: undefined });
      counts.spans += 1;
    } catch {
      counts.skipped += 1;
    }
  }

  if ((pack.graphs || []).length) {
    const have = await listSavedGraphs();
    const haveIds = new Set(have.map((row) => row.id));
    const extra = pack.graphs.filter((row) => row?.id && !haveIds.has(row.id));
    if (extra.length) {
      await writeSavedGraphs([...extra, ...have]);
      counts.graphs = extra.length;
    }
  }

  for (const person of pack.people || []) {
    try {
      await savePerson({ ...person, id: person.id });
      counts.people += 1;
    } catch {
      counts.skipped += 1;
    }
  }

  try {
    if ((pack.labels || []).length) {
      const have = await getLabels();
      const set = new Set((have || []).map((row) => String(row).toLowerCase()));
      const merged = [...have];
      pack.labels.forEach((label) => {
        if (label && !set.has(String(label).toLowerCase())) merged.push(label);
      });
      await saveLabels(merged);
    }
    if ((pack.poemCategories || []).length) {
      const have = await getPoemCategories();
      const set = new Set((have || []).map((row) => String(row.id || row).toLowerCase()));
      const extra = pack.poemCategories.filter((row) => row && !set.has(String(row.id || row).toLowerCase()));
      if (extra.length) await savePoemCategories([...(have || []), ...extra]);
    }
    if ((pack.eventCategories || []).length) {
      const have = await getEventCategories();
      const set = new Set((have || []).map((row) => String(row.id || row).toLowerCase()));
      const extra = pack.eventCategories.filter((row) => row && !set.has(String(row.id || row).toLowerCase()));
      if (extra.length) await saveEventCategories([...(have || []), ...extra]);
    }
  } catch {
    /* lists are optional */
  }

  return counts;
}

export async function shareBackupFile() {
  const pack = await buildBackup();
  const name = backupFileName(pack);
  const json = JSON.stringify(pack, null, 2);
  const counts = backupCounts(pack);

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { name, counts, method: 'download' };
  }

  const FileSystem = require('expo-file-system/legacy');
  const dest = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(dest, json);
  try {
    const Sharing = require('expo-sharing');
    if (Sharing && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(dest, {
        mimeType: 'application/json',
        dialogTitle: 'Save Timeline backup',
        UTI: 'public.json',
      });
      return { name, counts, method: 'share' };
    }
  } catch {
    /* fall through */
  }
  await Share.share({ title: name, message: json.slice(0, 4000) });
  return { name, counts, method: 'share-text' };
}

export async function pickAndImportBackup() {
  const DocumentPicker = require('expo-document-picker');
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (picked.canceled || picked.type === 'cancel') return { canceled: true };
  const asset = picked.assets?.[0] || picked;
  const uri = asset.uri;
  if (!uri) throw new Error('Could not read that file.');
  let raw = '';
  if (Platform.OS === 'web' && asset.file) {
    raw = await asset.file.text();
  } else {
    const FileSystem = require('expo-file-system/legacy');
    raw = await FileSystem.readAsStringAsync(uri);
  }
  const pack = parseBackup(raw);
  const imported = await importBackup(pack);
  return { canceled: false, imported, counts: backupCounts(pack), exportedAt: pack.exportedAt };
}
