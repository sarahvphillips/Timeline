import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

const STORAGE_KEY = '@word_to_int_list';

function lettersOnly(text) {
  return (text || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

function ordinalValue(ch) {
  return ch.charCodeAt(0) - 64; // A=1 ... Z=26
}

function pythagoreanValue(ch) {
  const n = ordinalValue(ch);
  return ((n - 1) % 9) + 1; // A=1 ... I=9, J=1 ...
}

function reverseOrdinalValue(ch) {
  return 27 - ordinalValue(ch); // A=26 ... Z=1
}

function reduceNumber(n) {
  let value = n;
  const steps = [value];
  while (value > 9 && value !== 11 && value !== 22 && value !== 33) {
    value = String(value)
      .split('')
      .reduce((sum, d) => sum + Number(d), 0);
    steps.push(value);
  }
  return { value, steps };
}

/** Java String.hashCode: 31 * hash + char, 32-bit signed int. Uses the original phrase. */
export function javaHashCode(text) {
  const s = String(text ?? '');
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) {
    hash = (Math.imul(31, hash) + s.charCodeAt(i)) | 0;
  }
  return hash;
}

function entryHashCode(entry) {
  if (!entry) return null;
  if (entry.hashCode != null && !Number.isNaN(Number(entry.hashCode))) {
    return Number(entry.hashCode);
  }
  return javaHashCode(entry.phrase || '');
}

export function convertPhrase(phrase) {
  const raw = (phrase || '').trim();
  const letters = lettersOnly(raw);
  const breakdown = letters.split('').map((ch) => ({
    letter: ch,
    ordinal: ordinalValue(ch),
    pythagorean: pythagoreanValue(ch),
    reverse: reverseOrdinalValue(ch),
  }));

  const ordinal = breakdown.reduce((s, b) => s + b.ordinal, 0);
  const pythagorean = breakdown.reduce((s, b) => s + b.pythagorean, 0);
  const reverse = breakdown.reduce((s, b) => s + b.reverse, 0);
  const letterCount = letters.length;
  const wordCount = raw ? raw.split(/\s+/).filter(Boolean).length : 0;
  const hashCode = javaHashCode(raw);

  return {
    phrase: raw,
    letters,
    letterCount,
    wordCount,
    breakdown,
    ordinal,
    pythagorean,
    reverse,
    hashCode,
    reducedOrdinal: reduceNumber(ordinal),
    reducedPythagorean: reduceNumber(pythagorean),
    reducedReverse: reduceNumber(reverse),
  };
}

export function formatBreakdown(result, field = 'ordinal') {
  if (!result?.breakdown?.length) return '';
  if (field === 'hashcode') return '';
  return result.breakdown.map((b) => `${b.letter}(${b[field]})`).join(' + ');
}

function currentUid() {
  return auth?.currentUser?.uid || null;
}

function wordNumberDoc(uid, id) {
  return doc(db, 'users', uid, 'wordNumbers', String(id));
}

async function pushWordNumberToFirebase(payload) {
  const uid = currentUid();
  if (!uid) {
    throw new Error('Not signed in — cannot save to Firebase');
  }
  const clean = {};
  Object.keys(payload).forEach((key) => {
    if (payload[key] !== undefined) clean[key] = payload[key];
  });
  await setDoc(wordNumberDoc(uid, clean.id), clean, { merge: true });
}

async function fetchWordNumbersFromFirebase() {
  const uid = currentUid();
  if (!uid) return [];
  const snap = await getDocs(collection(db, 'users', uid, 'wordNumbers'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function mergeLists(localList, remoteList) {
  const map = new Map();
  [...(localList || []), ...(remoteList || [])].forEach((item) => {
    if (!item?.id) return;
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
      return;
    }
    const a = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
    const b = new Date(item.updatedAt || item.createdAt || 0).getTime();
    map.set(item.id, b >= a ? { ...existing, ...item } : { ...item, ...existing });
  });
  return Array.from(map.values());
}

async function readListRaw() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const list = JSON.parse(raw);
  if (!Array.isArray(list)) throw new Error('Word-to-int storage is not a list');
  return list;
}

/**
 * Pull cloud word-numbers for the signed-in user into the local cache.
 * Used on login from App.js. getWordNumbers already merges remote.
 */
export async function syncWordNumbersFromCloud(uid) {
  if (!uid) {
    try {
      return await readListRaw();
    } catch (_) {
      return [];
    }
  }
  return getWordNumbers();
}

export async function getWordNumbers() {
  try {
    const local = await readListRaw();
    let remote = [];
    try {
      remote = await fetchWordNumbersFromFirebase();
    } catch (e) {
      console.warn('Firebase word-to-int load skipped', e);
    }
    const merged = mergeLists(local, remote);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged.sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );
  } catch (e) {
    console.warn('Failed to load word-to-int list', e);
    return [];
  }
}

export async function saveWordNumber(entry) {
  const result = convertPhrase(entry.phrase);
  if (!result.phrase) {
    throw new Error('Missing phrase');
  }

  let list;
  try {
    list = await readListRaw();
  } catch (e) {
    console.warn('Word-to-int list unreadable; not overwriting', e);
    throw new Error('Could not read the saved number list');
  }

  const now = new Date().toISOString();
  const payload = {
    id: entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    phrase: result.phrase,
    notes: (entry.notes || '').trim(),
    preferred: entry.preferred || 'ordinal',
    ordinal: result.ordinal,
    pythagorean: result.pythagorean,
    reverse: result.reverse,
    reduced: result.reducedOrdinal.value,
    hashCode: result.hashCode,
    letterCount: result.letterCount,
    createdAt: entry.createdAt || now,
    updatedAt: now,
  };

  const index = list.findIndex((item) => {
    if (entry.id && String(item.id) === String(entry.id)) return true;
    return (
      String(item.phrase || '').trim().toLowerCase() === payload.phrase.toLowerCase() &&
      (item.preferred || 'ordinal') === payload.preferred
    );
  });

  if (index !== -1) {
    payload.id = list[index].id;
    payload.createdAt = list[index].createdAt || payload.createdAt;
    list[index] = { ...list[index], ...payload };
  } else {
    list.unshift(payload);
  }

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  const saved = await readListRaw();
  const found = saved.find((item) => String(item.id) === String(payload.id));
  if (!found) {
    throw new Error('Save did not persist on this device');
  }

  try {
    await pushWordNumberToFirebase(found);
    found.cloudSaved = true;
  } catch (e) {
    found.cloudSaved = false;
    found.cloudError = e?.message || 'Firebase save failed';
    console.warn('Firebase word-to-int save failed', e);
  }
  return found;
}

export async function deleteWordNumber(id) {
  const list = await getWordNumbers();
  const target = list.find((item) => String(item.id) === String(id));
  const next = list.filter((item) => {
    if (String(item.id) === String(id)) return false;
    if (
      target?.phrase &&
      String(item.phrase || '').toLowerCase() === String(target.phrase).toLowerCase()
    ) {
      return false;
    }
    return true;
  });
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  const uid = currentUid();
  if (uid && target?.id) {
    try {
      await deleteDoc(wordNumberDoc(uid, target.id));
    } catch (e) {
      console.warn('Firebase word-to-int delete skipped', e);
    }
  }
  return next;
}

export function preferredNumber(entry) {
  if (!entry) return null;
  if (entry.preferred === 'pythagorean') return entry.pythagorean;
  if (entry.preferred === 'reverse') return entry.reverse;
  if (entry.preferred === 'reduced') return entry.reduced;
  if (entry.preferred === 'hashcode') return entryHashCode(entry);
  return entry.ordinal;
}

export function numberMatches(entry, n) {
  if (!entry || Number.isNaN(n)) return [];
  const hits = [];
  const hash = entryHashCode(entry);
  if (preferredNumber(entry) === n) hits.push('preferred');
  if (entry.ordinal === n) hits.push('ordinal');
  if (entry.pythagorean === n) hits.push('pythagorean');
  if (entry.reverse === n) hits.push('reverse');
  if (entry.reduced === n) hits.push('reduced');
  if (hash === n) hits.push('hashcode');
  else if (hash != null && n != null && Math.abs(hash) === Math.abs(n)) hits.push('hashcode');
  return [...new Set(hits)];
}

/** Look up saved phrases for a number. Preferred match first. */
export function findPhrasesForNumber(list, rawNumber) {
  const n = Number(String(rawNumber).trim());
  if (!String(rawNumber).trim() || Number.isNaN(n)) return [];

  const preferred = [];
  const other = [];

  (list || []).forEach((entry) => {
    const hits = numberMatches(entry, n);
    if (!hits.length) return;
    const row = { ...entry, matchOn: hits, matchNumber: n };
    if (hits.includes('preferred') && preferredNumber(entry) === n) {
      preferred.push(row);
    } else {
      other.push(row);
    }
  });

  return [...preferred, ...other];
}

export const METHODS = [
  { id: 'ordinal', label: 'Ordinal (A=1 … Z=26)', short: 'Ordinal' },
  { id: 'pythagorean', label: 'Pythagorean (1–9 cycle)', short: 'Pythagorean' },
  { id: 'reverse', label: 'Reverse (A=26 … Z=1)', short: 'Reverse' },
  { id: 'reduced', label: 'Reduced (single digit / master)', short: 'Reduced' },
  { id: 'hashcode', label: 'Java hashCode', short: 'hashCode' },
];
