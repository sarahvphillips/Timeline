/** Same cap rules as the bot API. No Firebase imports, so tests can run it. */

export function allowanceCap({ rules, entitlements, adsUnlocked, adUnlockPoints } = {}) {
  const ent = entitlements || {};
  if (ent.premium === true || ent.allowanceExempt === true) {
    return { cap: Infinity, exempt: true, testing: false };
  }
  const override = Number(ent.dailyAllowance);
  const testing = Number.isFinite(override) && override > 0;
  const base = testing ? override : (Number(rules && rules.dailyAllowance) || 500);
  const unlocks = Math.max(0, Number(adsUnlocked) || 0);
  const bonus = unlocks * (Number(adUnlockPoints) || 200);
  return { cap: base + bonus, exempt: false, testing };
}
