/**
 * Sync-version bump. At most once per request, and skipped when the caller
 * passes ?nosync=1 or X-No-Sync: 1 (they call POST /sync/bump at the end).
 */
function createSync(db, FieldValue) {
  const syncRef = (uid) => db.collection('users').doc(uid).collection('meta').doc('sync');

  function skipped(req) {
    if (!req) return false;
    const q = req.query || {};
    const header = typeof req.get === 'function' ? req.get('x-no-sync') : '';
    return String(q.nosync || '') === '1' || String(header || '') === '1';
  }

  async function bumpSync(uid, what, req) {
    if (!uid) return false;
    if (skipped(req)) return false;
    if (req) {
      if (req._syncBumped) return false;
      req._syncBumped = true;
    }
    try {
      await syncRef(uid).set({
        version: FieldValue.increment(1),
        lastChanged: FieldValue.serverTimestamp(),
        lastChangedBy: 'bot',
        lastWhat: String(what || '').slice(0, 80),
      }, { merge: true });
      return true;
    } catch (e) {
      console.warn('bumpSync failed', e && e.message);
      return false;
    }
  }

  return { bumpSync, syncRef };
}

module.exports = { createSync };
