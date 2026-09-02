import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, getDocs, deleteDoc, collection } from 'firebase/firestore';
import { auth, db } from './firebase';

const STORAGE_KEY = '@word_to_int_list';

let cloudWarningShown = false;

function warnCloud(message, error) {
  if (error !== undefined) {
    console.warn(message, error);
  } else {
    console.warn(message);
  }
  if (cloudWarningShown) return;
  cloudWarningShown = true;
  try {
    Alert.alert('Cloud sync', message);
  } catch (_) {}
}

function getUid() {
  return auth.currentUser?.uid || null;
}

function wordNumbersCollection(uid) {
  return collection(db, 'users', uid, 'wordNumbers');
}

function wordNumberDoc(uid, entryId) {
  return doc(db, 'users', uid, 'wordNumbers', entryId);
}

/** Strip undefined (Firestore rejects it) and convert Date to ISO strings. */
function stripUndefined(value) {
  if (value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value
      .map(stripUndefined)
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((key) => {
      const next = stripUndefined(value[key]);
      if (next !== undefined) out[key] = next;
    });
    return out;
  }
  return value;
}

function toIso(value) {
  if (!value) return value;
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch (_) {
      return value;
    }
  }
  if (value instanceof Date) return value.toISOString();
  return value;
}

function normalizeWordNumber(data, fallbackId) {
  const entry = { ...data, id: data.id || fallbackId };
  if (entry.createdAt) entry.createdAt = toIso(entry.createdAt);
  if (entry.updatedAt) entry.updatedAt = toIso(entry.updatedAt);
  return entry;
}

function sortWordNumbers(list) {
  return list.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

async function writeCache(list) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

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

export async function getWordNumbers() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return sortWordNumbers(list);
  } catch (e) {
    console.warn('Failed to load word-to-int list', e);
    return [];
  }
}

/**
 * Pull cloud word numbers for the signed-in user into the local cache.
 * Cloud wins on id conflict. If cloud is empty and local has entries,
 * upload local so existing numbers appear on other devices.
 */
export async function syncWordNumbersFromCloud(uid) {
  if (!uid) return getWordNumbers();

  const local = await getWordNumbers();

  try {
    const snap = await getDocs(wordNumbersCollection(uid));
    const cloudEntries = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      cloudEntries.push(normalizeWordNumber(data, d.id));
    });

    if (cloudEntries.length === 0) {
      if (local.length > 0) {
        await Promise.all(
          local.map(async (entry) => {
            try {
              await setDoc(wordNumberDoc(uid, entry.id), stripUndefined(entry));
            } catch (e) {
              console.warn('Failed to upload local word number to Firestore', e);
            }
          }),
        );
      }
      return local;
    }

    const byId = {};
    local.forEach((entry) => {
      if (entry?.id) byId[entry.id] = entry;
    });
    const localOnly = [];
    local.forEach((entry) => {
      if (entry?.id && !cloudEntries.some((c) => c.id === entry.id)) {
        localOnly.push(entry);
      }
    });
    cloudEntries.forEach((entry) => {
      if (entry?.id) byId[entry.id] = entry;
    });

    if (localOnly.length > 0) {
      await Promise.all(
        localOnly.map(async (entry) => {
          try {
            await setDoc(wordNumberDoc(uid, entry.id), stripUndefined(entry));
          } catch (e) {
            console.warn('Failed to upload local-only word number to Firestore', e);
          }
        }),
      );
    }

    const merged = sortWordNumbers(Object.values(byId));
    await writeCache(merged);
    return merged;
  } catch (e) {
    warnCloud(
      'Could not load numbers from the cloud. Showing numbers saved on this device.',
      e,
    );
    return local;
  }
}

export async function saveWordNumber(entry) {
  const list = await getWordNumbers();
  const now = new Date().toISOString();
  const result = convertPhrase(entry.phrase);
  const payload = {
    id: entry.id || Date.now().toString() + Math.random().toString(36).slice(2, 8),
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

  const index = list.findIndex(
    (item) =>
      item.id === payload.id ||
      String(item.phrase || '').toLowerCase() === payload.phrase.toLowerCase()
  );
  let saved;
  if (index !== -1) {
    saved = {
      ...list[index],
      ...payload,
      id: list[index].id,
      createdAt: list[index].createdAt || payload.createdAt,
    };
    list[index] = saved;
  } else {
    saved = payload;
    list.unshift(payload);
  }

  await writeCache(list);

  if (saved?.id && getUid()) {
    try {
      await setDoc(wordNumberDoc(getUid(), saved.id), stripUndefined(saved));
    } catch (e) {
      warnCloud(
        'Could not sync this number to the cloud. It is saved on this device.',
        e,
      );
    }
  }

  return payload;
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
  const removed = list.filter((item) => !next.some((n) => String(n.id) === String(item.id)));
  await writeCache(next);

  const uid = getUid();
  if (uid) {
    await Promise.all(
      removed.map(async (item) => {
        if (!item?.id) return;
        try {
          await deleteDoc(wordNumberDoc(uid, item.id));
        } catch (e) {
          warnCloud(
            'Could not delete this number from the cloud. It is removed on this device.',
            e,
          );
        }
      }),
    );
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