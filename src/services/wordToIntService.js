import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

const LEGACY_WORD_KEY = '@word_to_int_list';
const GUEST_WORD_KEY = '@word_to_int_list_guest';
export const LAST_UID_KEY = '@timeline_last_uid';

// Firestore sync for wordNumbers (per-uid). Isolation: ownerUid checks,
// beginAuthScope, clear-local-cache, and pull-before-paint on the list screen.
export const WORD_NUMBERS_FIRESTORE_SYNC_ENABLED = true;

function wordStorageKey(uid) {
  return uid ? `@word_to_int_list_${uid}` : GUEST_WORD_KEY;
}

// Bumps on login/logout so in-flight sync cannot write after an auth switch.
let authEpoch = 0;
let activeAuthUid = null;

/** Call from App onAuthStateChanged so word-number I/O is scoped to the current uid. */
export function beginAuthScope(uid) {
  authEpoch += 1;
  activeAuthUid = uid || null;
  return authEpoch;
}

function isScopeCurrent(uid, epoch) {
  return epoch === authEpoch && (uid || null) === activeAuthUid;
}

async function migrateLegacyWordNumbersOnce(uid) {
  if (!uid) return;
  const scoped = wordStorageKey(uid);
  try {
    const existing = await AsyncStorage.getItem(scoped);
    if (existing != null) return;
    const legacy = await AsyncStorage.getItem(LEGACY_WORD_KEY);
    if (legacy == null) return;

    let list = [];
    try {
      list = JSON.parse(legacy);
    } catch (_) {
      return;
    }
    if (!Array.isArray(list)) return;

    const lastUid = await AsyncStorage.getItem(LAST_UID_KEY);
    const allOwnedByUid =
      list.length > 0 && list.every((item) => item && item.ownerUid === uid);
    if (lastUid !== uid && !allOwnedByUid) {
      console.warn(
        'Skipping legacy word-numbers migration for',
        uid,
        '(last_uid=',
        lastUid,
        ') — not adopting foreign cache',
      );
      return;
    }

    const stamped = list.map((item) => ({
      ...item,
      ownerUid: item.ownerUid || uid,
    }));
    await AsyncStorage.setItem(scoped, JSON.stringify(stamped));
    await AsyncStorage.removeItem(LEGACY_WORD_KEY);
    console.warn('Migrated legacy @word_to_int_list into', scoped);
  } catch (e) {
    console.warn('Legacy word-numbers migration skipped', e);
  }
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

function currentUid() {
  return auth?.currentUser?.uid || null;
}

function wordNumberDoc(uid, id) {
  return doc(db, 'users', uid, 'wordNumbers', String(id));
}

async function pushWordNumberToFirebase(payload) {
  if (!WORD_NUMBERS_FIRESTORE_SYNC_ENABLED) return;
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
  if (!WORD_NUMBERS_FIRESTORE_SYNC_ENABLED) return [];
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

async function readListRaw(uid = currentUid()) {
  if (uid) await migrateLegacyWordNumbersOnce(uid);
  const raw = await AsyncStorage.getItem(wordStorageKey(uid));
  if (!raw) return [];
  const list = JSON.parse(raw);
  if (!Array.isArray(list)) throw new Error('Word-to-int storage is not a list');
  return list;
}

async function writeList(list, uid = currentUid()) {
  await AsyncStorage.setItem(wordStorageKey(uid), JSON.stringify(list));
}

/** Clear the per-uid local wordNumbers cache only (does not touch other uids or Firestore). */
export async function clearLocalWordNumbersForUid(uid) {
  if (!uid) return;
  await AsyncStorage.setItem(wordStorageKey(uid), JSON.stringify([]));
}


function entryBelongsToUid(entry, uid) {
  // Strict: missing ownerUid does NOT belong — do not upload unscoped entries.
  if (!entry || !uid) return false;
  return entry.ownerUid === uid;
}

function sortWordNumbers(list) {
  return (list || []).sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
  );
}

export function phraseKey(phrase) {
  return String(phrase || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function findSavedPhrase(list, phrase) {
  const key = phraseKey(phrase);
  if (!key) return null;
  const letters = key.replace(/[^a-z]/g, '');
  return (
    (Array.isArray(list) ? list : []).find((item) => {
      const itemKey = phraseKey(item?.phrase);
      if (itemKey === key) return true;
      const itemLetters = itemKey.replace(/[^a-z]/g, '');
      return !!(letters && itemLetters === letters);
    }) || null
  );
}

/** Keep the oldest entry per phrase (capitals ignored). Empty phrases are dropped. */
export function dedupeWordNumbers(list) {
  const byKey = new Map();
  const dropped = [];
  const patched = [];
  const items = Array.isArray(list) ? [...list] : [];
  items.sort((a, b) => {
    const ta = Date.parse(a?.createdAt || '') || Number.MAX_SAFE_INTEGER;
    const tb = Date.parse(b?.createdAt || '') || Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
  items.forEach((item) => {
    const key = phraseKey(item?.phrase);
    if (!key) {
      dropped.push(item);
      return;
    }
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...item });
      return;
    }
    const keeper = byKey.get(key);
    if (!(keeper.notes || '').trim() && (item.notes || '').trim()) {
      keeper.notes = item.notes;
      keeper.updatedAt = new Date().toISOString();
      patched.push(keeper);
    }
    dropped.push(item);
  });
  return { kept: Array.from(byKey.values()), dropped, patched };
}

async function applyDedupe(list, uid, epoch) {
  const { kept, dropped, patched } = dedupeWordNumbers(list);
  if (dropped.length === 0 && patched.length === 0) return kept;
  if (uid && epoch != null && !isScopeCurrent(uid, epoch)) return kept;
  await writeList(kept, uid);
  if (uid && WORD_NUMBERS_FIRESTORE_SYNC_ENABLED) {
    await Promise.all(
      dropped.map(async (item) => {
        if (!item?.id) return;
        try {
          await deleteDoc(wordNumberDoc(uid, item.id));
        } catch (e) {
          console.warn('Duplicate word-number cloud delete skipped', e);
        }
      })
    );
    await Promise.all(
      patched.map(async (item) => {
        try {
          await pushWordNumberToFirebase(item);
        } catch (e) {
          console.warn('Duplicate word-number keeper update skipped', e);
        }
      })
    );
  }
  return kept;
}

/** Quiet sweep: drop case-insensitive duplicates that slipped onto the list. */
export async function scrubWordNumberDuplicates() {
  const uid = currentUid();
  const epoch = authEpoch;
  try {
    let list = await readListRaw(uid);
    if (uid) list = list.filter((item) => entryBelongsToUid(item, uid));
    const kept = await applyDedupe(list, uid, epoch);
    return sortWordNumbers(kept);
  } catch (e) {
    console.warn('Word-to-int duplicate scrub failed', e);
    return [];
  }
}

/** Local cache only — does not touch Firestore. Uses per-uid (or guest) key. */
export async function readLocalWordNumbers(uid = currentUid()) {
  try {
    if (uid) await migrateLegacyWordNumbersOnce(uid);
    let local = await readListRaw(uid);
    if (uid) {
      local = local.filter((item) => entryBelongsToUid(item, uid));
    }
    return sortWordNumbers(local);
  } catch (e) {
    console.warn('Failed to load word-to-int list', e);
    return [];
  }
}

/**
 * Pull cloud word-numbers for the signed-in user into the local (per-uid) cache.
 * No-op cloud I/O while WORD_NUMBERS_FIRESTORE_SYNC_ENABLED is false (local only).
 * Only uploads local entries that belong to this uid when cloud is empty.
 */
export async function syncWordNumbersFromCloud(uid) {
  if (!uid) {
    try {
      return await readListRaw(null);
    } catch (_) {
      return [];
    }
  }
  const epoch = authEpoch;
  await migrateLegacyWordNumbersOnce(uid);

  if (!WORD_NUMBERS_FIRESTORE_SYNC_ENABLED) {
    if (!isScopeCurrent(uid, epoch)) return [];
    return readLocalWordNumbers(uid);
  }

  return getWordNumbers();
}

/**
 * Load word-numbers for the UI.
 * If signed in and WORD_NUMBERS_FIRESTORE_SYNC_ENABLED, sync from Firestore.
 * Otherwise per-uid local cache only. Logged out uses guest cache only.
 */
export async function getWordNumbers() {
  const uid = currentUid();
  const epoch = authEpoch;
  try {
    if (uid) await migrateLegacyWordNumbersOnce(uid);
    let local = await readListRaw(uid);
    if (uid) {
      local = local.filter((item) => entryBelongsToUid(item, uid));
    }

    if (!uid || !WORD_NUMBERS_FIRESTORE_SYNC_ENABLED) {
      if (uid && !isScopeCurrent(uid, epoch)) return [];
      const cleaned = await applyDedupe(local, uid, epoch);
      return sortWordNumbers(cleaned);
    }

    let remote = [];
    try {
      remote = await fetchWordNumbersFromFirebase();
    } catch (e) {
      console.warn('Firebase word-to-int load skipped', e);
    }
    if (!isScopeCurrent(uid, epoch)) return sortWordNumbers(local);

    // If signed in, cloud empty: upload ONLY entries that already have ownerUid === uid.
    // Never stamp missing ownerUid onto foreign/unscoped entries just to upload.
    if (remote.length === 0) {
      if (local.length > 0) {
        await Promise.all(
          local.map(async (item) => {
            try {
              await pushWordNumberToFirebase({ ...item, ownerUid: uid });
            } catch (e) {
              console.warn('Failed to upload local word-number', e);
            }
          }),
        );
        if (!isScopeCurrent(uid, epoch)) return sortWordNumbers(local);
        await writeList(local, uid);
        const cleaned = await applyDedupe(local, uid, epoch);
        return sortWordNumbers(cleaned);
      }
      if (!isScopeCurrent(uid, epoch)) return [];
      await writeList([], uid);
      return [];
    }

    const remoteStamped = (remote || []).map((item) => ({
      ...item,
      ownerUid: item.ownerUid || uid || undefined,
    }));
    const merged = mergeLists(local, remoteStamped).filter((item) =>
      entryBelongsToUid(item, uid)
    );
    if (!isScopeCurrent(uid, epoch)) return sortWordNumbers(local);
    const cleaned = await applyDedupe(merged, uid, epoch);
    return sortWordNumbers(cleaned);
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

  const uid = currentUid();
  try {
    list = await applyDedupe(list, uid, authEpoch);
  } catch (e) {
    console.warn('Word-to-int pre-save scrub skipped', e);
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

  if (uid) payload.ownerUid = uid;

  const existing = findSavedPhrase(list, payload.phrase);
  if (existing && (!entry.id || String(existing.id) !== String(entry.id))) {
    const err = new Error('that word is already saved in the list!');
    err.code = 'DUPLICATE_PHRASE';
    throw err;
  }

  const index = list.findIndex((item) => entry.id && String(item.id) === String(entry.id));

  if (index !== -1) {
    payload.id = list[index].id;
    payload.createdAt = list[index].createdAt || payload.createdAt;
    list[index] = { ...list[index], ...payload };
  } else {
    list.unshift(payload);
  }

  await writeList(list, uid);
  const saved = await readListRaw(uid);
  const found = saved.find((item) => String(item.id) === String(payload.id));
  if (!found) {
    throw new Error('Save did not persist on this device');
  }

  if (!WORD_NUMBERS_FIRESTORE_SYNC_ENABLED) {
    found.cloudSaved = false;
    return found;
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

/** Merge a friend's shared words. Duplicates are skipped, not overwritten. */
export async function importSharedWords(entries) {
  const added = [];
  const skipped = [];
  for (const entry of entries || []) {
    const phrase = String(entry?.phrase || '').trim();
    if (!phrase) continue;
    try {
      const saved = await saveWordNumber({
        phrase,
        notes: entry.notes || '',
        preferred: entry.preferred || 'ordinal',
      });
      added.push(saved);
    } catch (e) {
      if (e?.code === 'DUPLICATE_PHRASE') skipped.push(phrase);
      else console.warn('Shared word import skipped', phrase, e);
    }
  }
  return { added, skipped, list: await getWordNumbers() };
}

export async function deleteWordNumber(id) {
  const uid = currentUid();
  const list = await readLocalWordNumbers(uid);
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
  await writeList(next, uid);
  if (uid && target?.id && WORD_NUMBERS_FIRESTORE_SYNC_ENABLED) {
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

const SORT_KEY = '@word_to_int_list_sort';
export const LIST_SORTS = [
  { id: 'added', label: 'Added' },
  { id: 'alpha', label: 'A–Z' },
  { id: 'number', label: 'Number' },
];

export async function getListSort() {
  try {
    const v = await AsyncStorage.getItem(SORT_KEY);
    if (v === 'alpha' || v === 'number' || v === 'added') return v;
  } catch (_) {
    /* keep default */
  }
  return 'added';
}

export async function setListSort(mode) {
  const id = mode === 'alpha' || mode === 'number' ? mode : 'added';
  try {
    await AsyncStorage.setItem(SORT_KEY, id);
  } catch (_) {
    /* still return the chosen mode for this session */
  }
  return id;
}

export function sortWordNumberList(list, mode) {
  const rows = [...(list || [])];
  if (mode === 'alpha') {
    rows.sort(
      (a, b) =>
        phraseKey(a.phrase).localeCompare(phraseKey(b.phrase)) ||
        String(a.phrase || '').localeCompare(String(b.phrase || ''))
    );
  } else if (mode === 'number') {
    rows.sort((a, b) => {
      const na = Number(preferredNumber(a));
      const nb = Number(preferredNumber(b));
      const fa = Number.isFinite(na) ? na : Infinity;
      const fb = Number.isFinite(nb) ? nb : Infinity;
      if (fa !== fb) return fa - fb;
      return phraseKey(a.phrase).localeCompare(phraseKey(b.phrase));
    });
  } else {
    rows.sort((a, b) => {
      const ta = Date.parse(a.createdAt || a.updatedAt || '') || 0;
      const tb = Date.parse(b.createdAt || b.updatedAt || '') || 0;
      if (tb !== ta) return tb - ta;
      return String(b.id || '').localeCompare(String(a.id || ''));
    });
  }
  return rows;
}

export function formatAddedAt(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return 'Added time unknown';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

/** Look up saved phrases for a number. Optional method: ordinal | pythagorean | reverse | reduced | hashcode | all. */
export function findPhrasesForNumber(list, rawNumber, methodFilter = 'all') {
  const n = Number(String(rawNumber).trim());
  if (!String(rawNumber).trim() || Number.isNaN(n)) return [];
  const filter = methodFilter || 'all';

  const hitsFor = (entry) => {
    if (filter === 'ordinal') return entry.ordinal === n ? ['ordinal'] : [];
    if (filter === 'pythagorean') return entry.pythagorean === n ? ['pythagorean'] : [];
    if (filter === 'reverse') return entry.reverse === n ? ['reverse'] : [];
    if (filter === 'reduced') return Number(entry.reduced) === n ? ['reduced'] : [];
    if (filter === 'hashcode') {
      const hash = entryHashCode(entry);
      if (hash === n || (hash != null && Math.abs(hash) === Math.abs(n))) return ['hashcode'];
      return [];
    }
    return numberMatches(entry, n).filter((h) => h !== 'preferred');
  };

  const rows = [];
  (list || []).forEach((entry) => {
    const hits = hitsFor(entry);
    if (!hits.length) return;
    rows.push({ ...entry, matchOn: hits, matchNumber: n });
  });
  rows.sort(
    (a, b) =>
      phraseKey(a.phrase).localeCompare(phraseKey(b.phrase)) ||
      String(a.phrase || '').localeCompare(String(b.phrase || ''))
  );
  return rows;
}

function searchStorageKey(uid) {
  return uid ? `@word_to_int_search_${uid}` : '@word_to_int_search_guest';
}

async function readNumberSearchList() {
  const uid = currentUid();
  try {
    const raw = await AsyncStorage.getItem(searchStorageKey(uid));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeNumberSearchList(list) {
  const uid = currentUid();
  await AsyncStorage.setItem(searchStorageKey(uid), JSON.stringify(list));
  return list;
}

export async function getNumberSearchList() {
  const list = await readNumberSearchList();
  return list
    .filter((row) => row && row.number != null && !Number.isNaN(Number(row.number)))
    .sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')));
}

export async function addNumberSearch(rawNumber, method) {
  const number = Number(String(rawNumber).trim());
  if (!String(rawNumber).trim() || Number.isNaN(number)) {
    const err = new Error('Type a number first.');
    err.code = 'BAD_NUMBER';
    throw err;
  }
  const methodId = method || 'all';
  const list = await readNumberSearchList();
  const existing = list.find((row) => Number(row.number) === number && (row.method || 'all') === methodId);
  if (existing) return { item: existing, already: true };
  const item = {
    id: `search-${Date.now()}`,
    number,
    method: methodId,
    addedAt: new Date().toISOString(),
  };
  await writeNumberSearchList([item, ...list]);
  return { item, already: false };
}

export async function removeNumberSearch(id) {
  const list = await readNumberSearchList();
  const next = list.filter((row) => String(row.id) !== String(id));
  await writeNumberSearchList(next);
  return next;
}

/** Drop search-list numbers that a newly saved word now answers. */
export async function dropSearchHitsForEntry(entry) {
  const list = await readNumberSearchList();
  const next = list.filter((row) => findPhrasesForNumber([entry], row.number, row.method || 'all').length === 0);
  if (next.length !== list.length) await writeNumberSearchList(next);
  return next;
}

export const METHODS = [
  { id: 'ordinal', label: 'Ordinal (A=1 … Z=26)', short: 'Ordinal' },
  { id: 'pythagorean', label: 'Pythagorean (1–9 cycle)', short: 'Pythagorean' },
  { id: 'reverse', label: 'Reverse (A=26 … Z=1)', short: 'Reverse' },
  { id: 'reduced', label: 'Reduced (single digit / master)', short: 'Reduced' },
  { id: 'hashcode', label: 'Java hashCode', short: 'hashCode' },
];

export const LOOKUP_METHODS = [
  { id: 'ordinal', short: 'Ordinal' },
  { id: 'pythagorean', short: 'Pythagorean' },
  { id: 'reverse', short: 'Reverse' },
  { id: 'reduced', short: 'Reduced' },
  { id: 'all', short: 'All' },
];
