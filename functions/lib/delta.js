/** Apply updatedAt deltas, including tombstones, onto an id map. */

function applyDelta(byId, changes) {
  const next = { ...(byId || {}) };
  (changes || []).forEach((row) => {
    if (!row || !row.id) return;
    if (row.deleted) {
      delete next[row.id];
      return;
    }
    next[row.id] = row;
  });
  return next;
}

function tombstone(event, now) {
  return {
    id: event.id,
    title: event.title || '',
    date: event.date || null,
    ownerUid: event.ownerUid || null,
    addedBy: event.addedBy || null,
    deleted: true,
    deletedAt: now,
    updatedAt: now,
  };
}

module.exports = { applyDelta, tombstone };
