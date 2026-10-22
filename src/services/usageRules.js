/**
 * Pure maths for the daily usage allowance.
 *
 * No Firebase and no AsyncStorage here, so the rules can be unit-tested and
 * reused by the Admin editor. `config/usageRules` is the source of truth; this
 * module turns a stored (possibly half-edited) document into safe rules.
 *
 * Points = reads x wR + writes x wW + deletes x wD, unless an action sets its
 * own `points` override. An action with `enabled: false` must not run.
 */

/** The allowance resets at midnight in this zone. */
export const RESET_TZ = 'Europe/London';

/**
 * Starting action table, measured on 20 Oct 2026. An everyday user should
 * land near 500 reads and 100 writes a day, so 100 daily users fit the free
 * tier (50K reads and 20K writes).
 */
export const DEFAULT_ACTIONS = {
  addEvent: { reads: 4, writes: 3, deletes: 0 },
  bulkEdit: { reads: 2, writes: 2, deletes: 0 },
  delete: { reads: 4, writes: 2, deletes: 1 },
  wordLookup: { reads: 1, writes: 0, deletes: 0 },
  fullLoad: { reads: 1, writes: 0, deletes: 0 },
};

/** Order the Admin editor shows actions in, with the words users see. */
export const ACTION_ORDER = ['addEvent', 'bulkEdit', 'delete', 'wordLookup', 'fullLoad'];

export const ACTION_LABELS = {
  addEvent: 'Add an event',
  bulkEdit: 'Bulk text edit (per item)',
  delete: 'Delete (per item)',
  wordLookup: 'Word to Int lookup',
  fullLoad: 'Full event load (per event)',
};

export const DEFAULT_USAGE_RULES = {
  dailyAllowance: 500,
  resetTz: RESET_TZ,
  adUnlockPoints: 200,
  version: 1,
  wR: 1,
  wW: 3,
  wD: 1,
  actions: DEFAULT_ACTIONS,
};

const MAX_ALLOWANCE = 1000000;
const MAX_WEIGHT = 1000;
const MAX_ACTION_COST = 100000;
const MAX_TIMES = 1000;

function count(value, fallback = 0, max = MAX_ACTION_COST) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, max);
}

function weight(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, MAX_WEIGHT);
}

function normalizeAction(raw, fallback) {
  const base = fallback || { reads: 0, writes: 0, deletes: 0 };
  const out = {
    reads: count(raw && raw.reads, base.reads),
    writes: count(raw && raw.writes, base.writes),
    deletes: count(raw && raw.deletes, base.deletes),
    enabled: !(raw && raw.enabled === false),
  };
  if (raw && raw.points !== undefined && raw.points !== null && raw.points !== '') {
    out.points = count(raw.points, 0);
  }
  return out;
}

/** Merge a stored `config/usageRules` doc over the defaults, clamping junk. */
export function normalizeRules(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const storedActions = src.actions && typeof src.actions === 'object' ? src.actions : {};
  const actions = {};
  new Set([...Object.keys(DEFAULT_ACTIONS), ...Object.keys(storedActions)]).forEach((name) => {
    const key = String(name).trim();
    if (!key) return;
    actions[key] = normalizeAction(storedActions[key], DEFAULT_ACTIONS[key]);
  });
  const tz = typeof src.resetTz === 'string' && src.resetTz.trim() ? src.resetTz.trim() : RESET_TZ;
  return {
    dailyAllowance: count(src.dailyAllowance, DEFAULT_USAGE_RULES.dailyAllowance, MAX_ALLOWANCE),
    resetTz: tz,
    adUnlockPoints: count(src.adUnlockPoints, DEFAULT_USAGE_RULES.adUnlockPoints, MAX_ALLOWANCE),
    version: count(src.version, DEFAULT_USAGE_RULES.version, Number.MAX_SAFE_INTEGER),
    wR: weight(src.wR, DEFAULT_USAGE_RULES.wR),
    wW: weight(src.wW, DEFAULT_USAGE_RULES.wW),
    wD: weight(src.wD, DEFAULT_USAGE_RULES.wD),
    actions,
  };
}

/** Points for one set of read/write/delete counts. */
export function pointsFor(cost, rules) {
  const r = rules || DEFAULT_USAGE_RULES;
  return count(cost && cost.reads) * weight(r.wR, 1)
    + count(cost && cost.writes) * weight(r.wW, 3)
    + count(cost && cost.deletes) * weight(r.wD, 1);
}

/**
 * What one call of `name` costs, multiplied by `times` items.
 * `points` honours the action override; `enabled: false` means "do not run it".
 */
export function actionCost(rules, name, times = 1) {
  const r = rules || DEFAULT_USAGE_RULES;
  const action = (r.actions && r.actions[name]) || { reads: 0, writes: 0, deletes: 0, enabled: true };
  const n = Math.max(0, count(times, 1, MAX_TIMES));
  const reads = count(action.reads) * n;
  const writes = count(action.writes) * n;
  const deletes = count(action.deletes) * n;
  const points = action.points !== undefined
    ? count(action.points) * n
    : pointsFor({ reads, writes, deletes }, r);
  return { reads, writes, deletes, points, enabled: action.enabled !== false };
}

/** The day's allowance: the admin figure plus whatever verified ads unlocked. */
export function allowanceFor(rules, adPoints = 0) {
  const r = rules || DEFAULT_USAGE_RULES;
  const base = count(r.dailyAllowance, DEFAULT_USAGE_RULES.dailyAllowance, MAX_ALLOWANCE);
  return base + count(adPoints, 0, MAX_ALLOWANCE);
}

/** UK calendar day as YYYY-MM-DD (Europe/London, so BST/GMT is handled). */
export function ukDay(date = new Date(), tz = RESET_TZ) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || RESET_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return new Date(date).toISOString().slice(0, 10);
  }
}

/** A fresh counter row for today. */
export function emptyUsage(today = ukDay()) {
  return { date: today, reads: 0, writes: 0, deletes: 0 };
}

/**
 * Read a stored counter row, resetting it when the UK day has rolled over.
 * Counters never go backwards, so a half-written or corrupt doc is harmless.
 */
export function normalizeUsage(raw, today = ukDay()) {
  if (!raw || raw.date !== today) return emptyUsage(today);
  return {
    date: today,
    reads: count(raw.reads, 0, Number.MAX_SAFE_INTEGER),
    writes: count(raw.writes, 0, Number.MAX_SAFE_INTEGER),
    deletes: count(raw.deletes, 0, Number.MAX_SAFE_INTEGER),
  };
}

/** Points already spent today. */
export function usagePointsOf(usage, rules) {
  return pointsFor(usage || emptyUsage(), rules || DEFAULT_USAGE_RULES);
}

/** Add one action's cost to a counter row (returns a new row). */
export function addCost(usage, cost) {
  const row = usage || emptyUsage();
  return {
    date: row.date,
    reads: count(row.reads) + count(cost && cost.reads),
    writes: count(row.writes) + count(cost && cost.writes),
    deletes: count(row.deletes) + count(cost && cost.deletes),
  };
}

/**
 * Everything the UI needs to say "you've used today's free allowance".
 * `adPoints` must come from the server-written entitlement, never from the app.
 */
export function statusFor(usage, rules, adPoints = 0) {
  const r = rules || DEFAULT_USAGE_RULES;
  const row = usage || emptyUsage();
  const used = usagePointsOf(row, r);
  const allowance = allowanceFor(r, adPoints);
  return {
    date: row.date,
    reads: count(row.reads),
    writes: count(row.writes),
    deletes: count(row.deletes),
    used,
    allowance,
    remaining: Math.max(0, allowance - used),
    over: used >= allowance,
  };
}
