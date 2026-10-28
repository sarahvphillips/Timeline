const { createRateLimiter } = require('./lib/rateLimit');
const { pointsFor, allowanceCap, assessCharge, actionForMethod, DEFAULT_RULES } = require('./lib/allowance');
const { ukDay, nextMidnight } = require('./lib/ukTime');
const { checkDailyWordBudget, WORD_DAILY_READS, WORD_DAILY_WRITES } = require('./lib/wordBatch');

/**
 * Rate limit (60/min, Retry-After) and daily allowance (402).
 * Firestore is touched once a minute for the rate window and the usage
 * snapshot, plus a usage write every ~20 points (or a transaction near the cap).
 */
function createGuard(db, HttpError, opts = {}) {
  const limiter = createRateLimiter({
    limit: opts.limit || 60,
    store: {
      async read(key) {
        const snap = await db.collection('botRate').doc(key).get();
        return snap.exists ? snap.data() : null;
      },
      async write(key, data) {
        await db.collection('botRate').doc(key).set(
          { windowStart: data.windowStart, count: data.count },
          { merge: true },
        );
      },
    },
  });

  let rulesCache = { at: 0, rules: DEFAULT_RULES };
  const usageMem = new Map();

  async function rules() {
    if (Date.now() - rulesCache.at < 5 * 60 * 1000) return rulesCache.rules;
    try {
      const snap = await db.collection('config').doc('usageRules').get();
      rulesCache = {
        at: Date.now(),
        rules: { ...DEFAULT_RULES, ...(snap.exists ? snap.data() : {}) },
      };
    } catch (_) {
      rulesCache = { at: Date.now(), rules: rulesCache.rules || DEFAULT_RULES };
    }
    return rulesCache.rules;
  }

  function failRate(hit) {
    const err = new HttpError(429, `Rate limit: ${hit.limit} requests per minute`);
    err.retryAfter = hit.retryAfter;
    err.code = 'rate_limit';
    throw err;
  }

  function failAllowance(verdict, cfg) {
    const reset = nextMidnight(new Date(), (cfg && cfg.resetTz) || 'Europe/London');
    const err = new HttpError(
      402,
      "Daily allowance used. It resets at midnight UK time. A rewarded ad in the Timeline app can unlock more.",
    );
    err.retryAfter = reset.retryAfter;
    err.code = 'allowance_exhausted';
    err.details = {
      used: verdict.used,
      allowance: verdict.allowance,
      resetsAt: reset.resetsAt,
    };
    throw err;
  }

  async function enforceRate(hash) {
    const hit = await limiter.hit(hash);
    if (!hit.ok) failRate(hit);
  }

  async function loadSlot(uid, cfg) {
    const day = ukDay(new Date(), cfg.resetTz || 'Europe/London');
    const cached = usageMem.get(uid);
    if (cached && cached.date === day && Date.now() - cached.loadedAt < 60 * 1000) return cached;
    const [botSnap, usageSnap, entSnap] = await Promise.all([
      db.collection('users').doc(uid).collection('meta').doc('botUsage').get(),
      db.collection('users').doc(uid).collection('meta').doc('usage').get(),
      db.collection('users').doc(uid).collection('entitlements').doc('main').get(),
    ]);
    const bot = botSnap.exists ? botSnap.data() : {};
    const usage = usageSnap.exists ? usageSnap.data() : {};
    const ent = entSnap.exists ? entSnap.data() : {};
    const stored = bot.date === day ? Number(bot.points) || 0 : 0;
    const storedReads = bot.date === day ? Number(bot.wordReads) || 0 : 0;
    const storedWrites = bot.date === day ? Number(bot.wordWrites) || 0 : 0;
    const sameDay = cached && cached.date === day;
    const slot = {
      date: day,
      points: sameDay ? Math.max(stored, cached.points) : stored,
      wordReads: sameDay ? Math.max(storedReads, cached.wordReads || 0) : storedReads,
      wordWrites: sameDay ? Math.max(storedWrites, cached.wordWrites || 0) : storedWrites,
      cap: allowanceCap(cfg, ent, usage),
      loadedAt: Date.now(),
      dirty: 0,
    };
    usageMem.set(uid, slot);
    return slot;
  }

  async function flushNearCap(uid, slot, cfg) {
    const ref = db.collection('users').doc(uid).collection('meta').doc('botUsage');
    let over = null;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      const cur = data.date === slot.date ? Number(data.points) || 0 : 0;
      const next = Math.max(cur, slot.points);
      if (slot.cap !== Infinity && next > slot.cap) {
        over = { used: cur, allowance: slot.cap };
        slot.points = cur;
        return;
      }
      tx.set(ref, { date: slot.date, points: next, updatedAt: new Date().toISOString() }, { merge: true });
      slot.points = next;
    });
    slot.dirty = 0;
    slot.loadedAt = Date.now();
    if (over) failAllowance(over, cfg);
  }

  async function enforceAllowance(uid, method) {
    const cfg = await rules();
    const slot = await loadSlot(uid, cfg);
    const cost = pointsFor(actionForMethod(method), cfg);
    const verdict = assessCharge({ points: slot.points, cost, cap: slot.cap });
    if (!verdict.ok) failAllowance(verdict, cfg);
    if (slot.cap === Infinity || cost === 0) return;
    slot.points = verdict.used;
    slot.dirty += cost;
    const near = slot.points + 20 >= slot.cap;
    try {
      if (near) {
        await flushNearCap(uid, slot, cfg);
      } else if (slot.dirty >= 20) {
        const ref = db.collection('users').doc(uid).collection('meta').doc('botUsage');
        const pending = slot.dirty;
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const data = snap.exists ? snap.data() : {};
          const cur = data.date === slot.date ? Number(data.points) || 0 : 0;
          const next = cur + pending;
          tx.set(ref, { date: slot.date, points: next, updatedAt: new Date().toISOString() }, { merge: true });
          slot.points = Math.max(slot.points, next);
        });
        slot.dirty = 0;
        slot.loadedAt = Date.now();
      }
    } catch (e) {
      if (e && e.status) throw e;
      console.warn('botUsage flush failed', e && e.message);
    }
  }

  function wordCaps(cfg) {
    const reads = Number(cfg && cfg.wordDailyReads);
    const writes = Number(cfg && cfg.wordDailyWrites);
    return {
      reads: reads > 0 ? reads : WORD_DAILY_READS,
      writes: writes > 0 ? writes : WORD_DAILY_WRITES,
    };
  }

  async function writeWordBudget(uid, slot) {
    await db.collection('users').doc(uid).collection('meta').doc('botUsage').set({
      date: slot.date,
      wordReads: slot.wordReads || 0,
      wordWrites: slot.wordWrites || 0,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }

  /** Refuse before the word list is read when today's Word to Int budget cannot cover the estimate. */
  async function reserveWordOps(uid, reads, writes) {
    const nReads = Math.max(0, Number(reads) || 0);
    const nWrites = Math.max(0, Number(writes) || 0);
    if (!nReads && !nWrites) return;
    const cfg = await rules();
    const slot = await loadSlot(uid, cfg);
    const verdict = checkDailyWordBudget({
      usedReads: slot.wordReads || 0,
      usedWrites: slot.wordWrites || 0,
      reads: nReads,
      writes: nWrites,
      caps: wordCaps(cfg),
    });
    if (!verdict.ok) {
      const reset = nextMidnight(new Date(), cfg.resetTz || 'Europe/London');
      const err = new HttpError(402, verdict.error);
      err.retryAfter = reset.retryAfter;
      err.code = 'cost_limit';
      err.details = {
        usedReads: verdict.usedReads,
        usedWrites: verdict.usedWrites,
        estimatedReads: verdict.estimatedReads,
        estimatedWrites: verdict.estimatedWrites,
        readCap: verdict.readCap,
        writeCap: verdict.writeCap,
        resetsAt: reset.resetsAt,
      };
      throw err;
    }
    slot.wordReads = verdict.usedReads;
    slot.wordWrites = verdict.usedWrites;
    try {
      await writeWordBudget(uid, slot);
    } catch (e) {
      console.warn('word budget flush failed', e && e.message);
    }
  }

  /** Count a read that already happened (the one-time lookup backfill). Does not refuse. */
  async function noteWordOps(uid, reads, writes) {
    const nReads = Math.max(0, Number(reads) || 0);
    const nWrites = Math.max(0, Number(writes) || 0);
    if (!nReads && !nWrites) return;
    const cfg = await rules();
    const slot = await loadSlot(uid, cfg);
    slot.wordReads = (slot.wordReads || 0) + nReads;
    slot.wordWrites = (slot.wordWrites || 0) + nWrites;
    try {
      await writeWordBudget(uid, slot);
    } catch (e) {
      console.warn('word budget note failed', e && e.message);
    }
  }

  return { enforceRate, enforceAllowance, reserveWordOps, noteWordOps };
}

module.exports = { createGuard };
