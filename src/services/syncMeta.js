import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { noteRead, noteWrite } from './usageService';

const FULL_SYNC_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE = 200;
const MAX_PAGES = 15;

export function syncDoc(uid) {
  return doc(db, 'users', uid, 'meta', 'sync');
}

export function syncKeys(uid) {
  return {
    ver: `@timeline_sync_ver_${uid}`,
    at: `@timeline_sync_at_${uid}`,
    full: `@timeline_full_at_${uid}`,
  };
}

let cache = { uid: null, at: 0, data: undefined };

export function clearSyncCache() {
  cache = { uid: null, at: 0, data: undefined };
}

/** One read of users/{uid}/meta/sync, reused for a few seconds so events and words share it. */
export async function readSyncMeta(uid) {
  if (!uid) return null;
  if (cache.uid === uid && Date.now() - cache.at < 5000) return cache.data;
  const snap = await getDoc(syncDoc(uid));
  noteRead(1);
  const data = snap.exists() ? snap.data() : null;
  cache = { uid, at: Date.now(), data };
  return data;
}

export async function markSyncSeen(uid, version, full, at) {
  const keys = syncKeys(uid);
  const pairs = [
    [keys.ver, String(version || Date.now())],
    [keys.at, at || new Date().toISOString()],
  ];
  if (full) pairs.push([keys.full, String(Date.now())]);
  await AsyncStorage.multiSet(pairs);
}

export async function bumpSync(uid) {
  if (!uid) return;
  const version = Date.now();
  const lastChanged = new Date().toISOString();
  await setDoc(syncDoc(uid), {
    version,
    lastChanged,
    lastChangedBy: 'app',
  }, { merge: true });
  noteWrite(1);
  cache = { uid, at: Date.now(), data: { version, lastChanged, lastChangedBy: 'app' } };
  await markSyncSeen(uid, version, false, lastChanged);
}

export function fullSyncFresh(fullAt) {
  return !!(fullAt && Date.now() - fullAt < FULL_SYNC_MS);
}

/**
 * Pages where('updatedAt','>', since) orderBy updatedAt.
 * Returns the docs and whether the cap was hit (caller should full-sync).
 */
export async function fetchUpdatedSince(colRef, since) {
  const rows = [];
  let cursor = null;
  let pages = 0;
  let capped = false;
  while (pages < MAX_PAGES) {
    const parts = [where('updatedAt', '>', since), orderBy('updatedAt'), limit(PAGE)];
    const q = cursor ? query(colRef, ...parts, startAfter(cursor)) : query(colRef, ...parts);
    const snap = await getDocs(q);
    pages += 1;
    noteRead(snap.size);
    snap.forEach((d) => rows.push(d));
    if (snap.size < PAGE) break;
    cursor = snap.docs[snap.docs.length - 1];
    if (pages >= MAX_PAGES) capped = true;
  }
  return { docs: rows, capped };
}

export function collectionRef(uid, name) {
  return collection(db, 'users', uid, name);
}
