/**
 * Daily allowance math shared by the bot API and its tests.
 * Points follow config/usageRules: reads*wR + writes*wW + deletes*wD.
 */

const DEFAULT_RULES = {
  dailyAllowance: 500,
  resetTz: 'Europe/London',
  adUnlockPoints: 200,
  wR: 1,
  wW: 3,
  wD: 1,
};

const DEFAULT_ACTIONS = {
  read: { reads: 1, writes: 0, deletes: 0 },
  write: { reads: 4, writes: 3, deletes: 0 },
  delete: { reads: 4, writes: 2, deletes: 1 },
};

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pointsFor(action, rules) {
  const cfg = rules && typeof rules === 'object' ? rules : DEFAULT_RULES;
  const spec = (cfg.actions && cfg.actions[action]) || DEFAULT_ACTIONS[action] || DEFAULT_ACTIONS.read;
  if (!spec || spec.enabled === false) return 0;
  if (spec.points != null && spec.points !== '') return Math.max(0, num(spec.points, 0));
  const wR = num(cfg.wR, DEFAULT_RULES.wR);
  const wW = num(cfg.wW, DEFAULT_RULES.wW);
  const wD = num(cfg.wD, DEFAULT_RULES.wD);
  return Math.max(0,
    num(spec.reads, 0) * wR
    + num(spec.writes, 0) * wW
    + num(spec.deletes, 0) * wD);
}

function unlockBonus(usage, rules) {
  const raw = usage && usage.adsUnlocked;
  const count = raw === true ? 1 : num(raw, 0);
  if (count <= 0) return 0;
  return count * num(rules && rules.adUnlockPoints, DEFAULT_RULES.adUnlockPoints);
}

/** Per-user entitlements.dailyAllowance overrides the global cap. Premium skips the cap. */
function allowanceCap(rules, entitlements, usage) {
  const cfg = { ...DEFAULT_RULES, ...(rules || {}) };
  const ent = entitlements || {};
  if (ent.premium === true || ent.allowanceExempt === true) return Infinity;
  const override = num(ent.dailyAllowance, 0);
  const base = override > 0 ? override : num(cfg.dailyAllowance, DEFAULT_RULES.dailyAllowance);
  return base + unlockBonus(usage, cfg);
}

function assessCharge({ points, cost, cap }) {
  const used = num(points, 0);
  const next = used + num(cost, 0);
  if (cap !== Infinity && next > cap) {
    return { ok: false, used, allowance: cap, cost: num(cost, 0) };
  }
  return { ok: true, used: next, allowance: cap, cost: num(cost, 0) };
}

function actionForMethod(method) {
  const m = String(method || 'GET').toUpperCase();
  if (m === 'DELETE') return 'delete';
  if (m === 'GET' || m === 'HEAD') return 'read';
  return 'write';
}

module.exports = {
  DEFAULT_RULES,
  DEFAULT_ACTIONS,
  pointsFor,
  allowanceCap,
  assessCharge,
  actionForMethod,
  unlockBonus,
};
