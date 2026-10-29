/**
 * Per-user word index: one doc, users/{uid}/meta/wordIndex.
 * entries: [{ k: normalised phrase, id: word doc id }].
 * A bulk commit reads that doc once, then writes new words and the index.
 */

const { lookupKey } = require('./wordBatch');

const INDEX_BYTE_CAP = 800 * 1024;

function estimateIndexBytes(entries) {
  let n = 80;
  (entries || []).forEach((entry) => {
    n += 16 + Buffer.byteLength(String(entry.k || '')) + Buffer.byteLength(String(entry.id || ''));
  });
  return n;
}

function entriesToMap(entries) {
  const map = new Map();
  (entries || []).forEach((entry) => {
    if (entry && entry.k && entry.id) map.set(String(entry.k), String(entry.id));
  });
  return map;
}

function mapToEntries(map) {
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, id]) => ({ k, id }));
}

function packIndex(map, now) {
  const entries = mapToEntries(map);
  const bytes = estimateIndexBytes(entries);
  return {
    seeded: true,
    count: entries.length,
    updatedAt: now,
    bytes,
    entries,
  };
}

function readIndex(data) {
  if (!data || data.seeded !== true || !Array.isArray(data.entries)) {
    return { seeded: false, map: new Map() };
  }
  return { seeded: true, map: entriesToMap(data.entries) };
}

function sizeError(bytes) {
  return {
    ok: false,
    status: 409,
    code: 'index_full',
    error: `The word index would be about ${bytes} bytes, over the ${INDEX_BYTE_CAP} byte guard. Nothing was written.`,
    bytes,
  };
}

function notReady(reads, writes) {
  return {
    ok: false,
    status: 409,
    code: 'index_not_ready',
    error: 'Word index is not built yet. POST /words/index/rebuild once, then send the batch.',
    reads,
    writes,
  };
}

function planBulk({ map, pending, now, makeWord }) {
  const next = new Map(map);
  const toAdd = [];
  const byKey = new Map();
  (pending || []).forEach((row, index) => {
    const existingId = next.get(row.key);
    if (existingId) {
      byKey.set(row.key, { status: 'existing', id: existingId });
      return;
    }
    const word = makeWord(row, index);
    next.set(row.key, word.id);
    toAdd.push(word);
    byKey.set(row.key, { status: 'added', id: word.id, word });
  });
  const indexDoc = toAdd.length ? packIndex(next, now) : null;
  if (indexDoc && indexDoc.bytes > INDEX_BYTE_CAP) return sizeError(indexDoc.bytes);
  return {
    ok: true,
    toAdd,
    byKey,
    indexDoc,
    reads: 1,
    writes: toAdd.length + (indexDoc ? 1 : 0),
  };
}

async function commitBulk(tx, { indexRef, wordRefFor, pending, now, makeWord }) {
  let reads = 0;
  let writes = 0;
  const snap = await tx.get(indexRef);
  reads += 1;
  const index = readIndex(snap.exists ? snap.data() : null);
  if (!index.seeded) return notReady(reads, writes);
  const plan = planBulk({ map: index.map, pending, now, makeWord });
  if (!plan.ok) return { ...plan, reads, writes };
  plan.toAdd.forEach((word) => {
    tx.set(wordRefFor(word.id), word);
    writes += 1;
  });
  if (plan.indexDoc) {
    tx.set(indexRef, plan.indexDoc);
    writes += 1;
  }
  return { ...plan, reads, writes };
}

function keyForId(map, id) {
  for (const [key, wordId] of map) {
    if (wordId === id) return key;
  }
  return null;
}

async function commitDelete(tx, { indexRef, wordRef, id, phrase, now, ownerUid }) {
  let reads = 0;
  let writes = 0;
  const snap = await tx.get(indexRef);
  reads += 1;
  const index = readIndex(snap.exists ? snap.data() : null);
  if (!index.seeded) return notReady(reads, writes);
  const next = new Map(index.map);
  let removedKey = keyForId(next, id);
  if (!removedKey && phrase) {
    const key = lookupKey(phrase);
    if (key && next.get(key) === id) removedKey = key;
  }
  if (removedKey) next.delete(removedKey);
  const tombstone = {
    id,
    phrase: phrase || removedKey || '',
    deleted: true,
    updatedAt: now,
    ownerUid: ownerUid || '',
  };
  tx.set(wordRef, tombstone, { merge: true });
  writes += 1;
  const indexDoc = packIndex(next, now);
  tx.set(indexRef, indexDoc);
  writes += 1;
  return { ok: true, reads, writes, removedKey, indexDoc };
}

async function commitRename(tx, { indexRef, wordRef, id, nextPhrase, patch, now }) {
  let reads = 0;
  let writes = 0;
  const snap = await tx.get(indexRef);
  reads += 1;
  const index = readIndex(snap.exists ? snap.data() : null);
  if (!index.seeded) return notReady(reads, writes);
  const newKey = lookupKey(nextPhrase);
  if (!newKey || !/[a-z]/i.test(nextPhrase || '')) {
    return { ok: false, status: 400, error: 'text has no letters A-Z', reads, writes };
  }
  let oldKey = keyForId(index.map, id);
  if (!oldKey) {
    const wordSnap = await tx.get(wordRef);
    reads += 1;
    const data = wordSnap.exists && wordSnap.data ? wordSnap.data() : null;
    if (!wordSnap.exists || !data || data.deleted) {
      return { ok: false, status: 404, error: 'Word not found', reads, writes };
    }
    oldKey = lookupKey(data.phrase);
  }
  const taken = index.map.get(newKey);
  if (taken && taken !== id) {
    return { ok: false, status: 200, code: 'existing', id: taken, reads, writes };
  }
  const next = new Map(index.map);
  if (oldKey && oldKey !== newKey && next.get(oldKey) === id) next.delete(oldKey);
  next.set(newKey, id);
  const indexDoc = packIndex(next, now);
  if (indexDoc.bytes > INDEX_BYTE_CAP) return { ...sizeError(indexDoc.bytes), reads, writes };
  tx.set(wordRef, { ...(patch || {}), id, phrase: nextPhrase, lookupKey: newKey, updatedAt: now }, { merge: true });
  writes += 1;
  tx.set(indexRef, indexDoc);
  writes += 1;
  return { ok: true, reads, writes, indexDoc, id, newKey };
}

function rebuildEntries(docs, now) {
  const rows = (docs || [])
    .filter((doc) => doc && !doc.deleted && doc.phrase && /[a-z]/i.test(doc.phrase))
    .map((doc) => ({
      id: String(doc.id),
      key: lookupKey(doc.phrase),
      createdAt: String(doc.createdAt || ''),
    }))
    .filter((row) => row.key)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.key)) map.set(row.key, row.id);
  });
  const indexDoc = packIndex(map, now);
  if (indexDoc.bytes > INDEX_BYTE_CAP) return { ...sizeError(indexDoc.bytes), indexDoc: null };
  return { ok: true, indexDoc, count: indexDoc.count, bytes: indexDoc.bytes };
}

function listReadCost(total, limit) {
  const count = Math.max(0, Math.floor(Number(total) || 0));
  const page = Math.max(1, Math.floor(Number(limit) || 1));
  return { reads: Math.min(count, page), writes: 0 };
}

/** One index read, then match in memory. Does not read each word document. */
function matchByNumber(entries, number, score) {
  const target = Number(number);
  const matches = [];
  const list = entries instanceof Map
    ? Array.from(entries.entries()).map(([k, id]) => ({ k, id }))
    : (entries || []);
  list.forEach((entry) => {
    if (!entry || !entry.k || !entry.id) return;
    let value;
    try {
      value = score(entry.k, entry);
    } catch (_) {
      return;
    }
    if (value === target) matches.push({ id: String(entry.id), key: String(entry.k), number: value });
  });
  return { reads: 1, writes: 0, matches };
}

module.exports = {
  INDEX_BYTE_CAP,
  estimateIndexBytes,
  readIndex,
  packIndex,
  planBulk,
  commitBulk,
  commitDelete,
  commitRename,
  rebuildEntries,
  keyForId,
  listReadCost,
  matchByNumber,
};
