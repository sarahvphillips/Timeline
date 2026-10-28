const { rebuildEntries, commitBulk, commitDelete, commitRename, INDEX_BYTE_CAP } = require('./lib/wordIndex');

function createWordIndexIo(db, FieldPath) {
  const wordsCol = (uid) => db.collection('users').doc(uid).collection('wordNumbers');
  const indexRef = (uid) => db.collection('users').doc(uid).collection('meta').doc('wordIndex');

  async function saveBulk(uid, pending, makeWord, now) {
    const ref = indexRef(uid);
    return db.runTransaction((tx) => commitBulk(tx, {
      indexRef: ref,
      wordRefFor: (id) => wordsCol(uid).doc(id),
      pending,
      now,
      makeWord,
    }));
  }

  async function removeWord(uid, id, phrase, now, ownerUid) {
    return db.runTransaction((tx) => commitDelete(tx, {
      indexRef: indexRef(uid),
      wordRef: wordsCol(uid).doc(id),
      id,
      phrase,
      now,
      ownerUid,
    }));
  }

  async function renameWord(uid, id, nextPhrase, patch, now) {
    return db.runTransaction((tx) => commitRename(tx, {
      indexRef: indexRef(uid),
      wordRef: wordsCol(uid).doc(id),
      id,
      nextPhrase,
      patch,
      now,
    }));
  }

  async function rebuild(uid, nowIso) {
    const now = nowIso || new Date().toISOString();
    const docs = [];
    let reads = 0;
    let cursor = null;
    for (;;) {
      let query = wordsCol(uid).orderBy(FieldPath.documentId()).limit(500);
      if (cursor) query = query.startAfter(cursor);
      const snap = await query.get();
      reads += snap.size;
      snap.docs.forEach((docSnap) => docs.push({ id: docSnap.id, ...docSnap.data() }));
      if (snap.size < 500) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
    const built = rebuildEntries(docs, now);
    if (!built.ok) return { ...built, reads, writes: 0 };
    await indexRef(uid).set(built.indexDoc);
    return {
      ok: true,
      seeded: true,
      count: built.count,
      bytes: built.bytes,
      byteCap: INDEX_BYTE_CAP,
      reads,
      writes: 1,
    };
  }

  async function readIndexDoc(uid) {
    const snap = await indexRef(uid).get();
    return snap.exists ? snap.data() : null;
  }

  return { saveBulk, removeWord, renameWord, rebuild, readIndexDoc, wordsCol, indexRef };
}

module.exports = { createWordIndexIo };
