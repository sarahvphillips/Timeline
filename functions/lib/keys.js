/** One active Grok bot key per account. Extra legacy keys stay until revoked or replaced. */

function decideKeyCreate({ activeCount = 0, replace = false, botType = 'grok' } = {}) {
  const type = String(botType || 'grok').trim().toLowerCase();
  if (type !== 'grok') {
    return { ok: false, status: 400, error: 'Only a Grok bot can be connected for now' };
  }
  const active = Number(activeCount) || 0;
  if (active >= 1 && !replace) {
    return {
      ok: false,
      status: 409,
      error: 'This account already has an active bot key. Send { replace: true } to revoke it and create a new one.',
    };
  }
  return { ok: true, botType: 'grok', revokeExisting: replace && active >= 1 };
}

module.exports = { decideKeyCreate };
