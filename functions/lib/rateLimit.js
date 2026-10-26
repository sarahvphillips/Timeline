/**
 * Per-key fixed window. Memory serves the hot path; an optional store
 * (one Firestore doc per key) is read once per window and written every
 * `flushEvery` hits, and on every hit once `headroom` from the cap.
 */

function createRateLimiter({ limit = 60, windowMs = 60000, now = Date.now, store = null, flushEvery = 15, headroom = 5 } = {}) {
  const memory = new Map();

  async function hit(key) {
    const t = now();
    const windowStart = t - (t % windowMs);
    let slot = memory.get(key);
    if (!slot || slot.windowStart !== windowStart) {
      let base = 0;
      if (store) {
        try {
          const saved = await store.read(key);
          if (saved && Number(saved.windowStart) === windowStart) base = Number(saved.count) || 0;
        } catch (_) { /* memory still enforces this instance */ }
      }
      slot = { windowStart, count: base, dirty: 0 };
      memory.set(key, slot);
    }
    if (slot.count + 1 > limit) {
      const retryAfter = Math.max(1, Math.ceil((slot.windowStart + windowMs - t) / 1000));
      return { ok: false, retryAfter, limit, count: slot.count };
    }
    slot.count += 1;
    slot.dirty += 1;
    const nearCap = slot.count >= limit - headroom;
    const firstOfWindow = slot.count === 1;
    if (store && (firstOfWindow || slot.dirty >= flushEvery || nearCap)) {
      try {
        await store.write(key, { windowStart: slot.windowStart, count: slot.count });
        if (!firstOfWindow || slot.dirty >= flushEvery || nearCap) slot.dirty = 0;
      } catch (_) { /* keep the in-memory count */ }
    }
    return { ok: true, retryAfter: 0, limit, count: slot.count };
  }

  return { hit, _memory: memory };
}

module.exports = { createRateLimiter };
