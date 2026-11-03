const crypto = require('crypto');

function maskEmail(email) {
  const value = String(email || '').trim();
  const at = value.indexOf('@');
  if (at < 1) return '';
  return `${value.slice(0, 1)}***${value.slice(at)}`;
}

function emailHash(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!value || !value.includes('@')) return '';
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function changedFields(before, after, fields) {
  const prev = before || {};
  const next = after || {};
  return (fields || []).filter((field) => String(prev[field] ?? '') !== String(next[field] ?? ''));
}

function duplicateGroups(entries) {
  const rows = Array.isArray(entries) ? entries : [];
  const byEmail = new Map();
  const byName = new Map();
  rows.forEach((row) => {
    if (!row || !row.uid) return;
    if (row.emailHash) {
      const list = byEmail.get(row.emailHash) || [];
      list.push(row);
      byEmail.set(row.emailHash, list);
    }
    const name = String(row.nameKey || '').trim().toLowerCase();
    if (name.length >= 3) {
      const list = byName.get(name) || [];
      list.push(row);
      byName.set(name, list);
    }
  });
  const groups = [];
  byEmail.forEach((list) => {
    if (list.length > 1) {
      groups.push({ kind: 'email', key: list[0].emailMask || 'same email', uids: list.map((row) => row.uid) });
    }
  });
  byName.forEach((list, name) => {
    const ids = [...new Set(list.map((row) => row.uid))];
    if (ids.length > 1) groups.push({ kind: 'name', key: name, uids: ids });
  });
  return groups.slice(0, 20);
}

function accountEntry(uid, profile, email) {
  const name = String((profile && (profile.displayName || profile.handle)) || '').trim().toLowerCase();
  return {
    nameKey: name.slice(0, 80),
    emailHash: emailHash(email),
    emailMask: maskEmail(email),
    at: new Date().toISOString(),
  };
}

function directoryWithinLimit(entries) {
  return JSON.stringify(entries || {}).length <= 700000;
}

async function postDiscord(url, content, fetchImpl = fetch) {
  const hook = String(url || '');
  if (!hook.includes('discord.com/api/webhooks')) return false;
  const body = JSON.stringify({ content: String(content || '').slice(0, 1800) });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetchImpl(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (res && res.ok) return true;
      const status = res && res.status;
      if (status !== 429 && status < 500) return false;
    } catch (_) {
      /* retry once */
    }
  }
  return false;
}

module.exports = {
  maskEmail,
  emailHash,
  changedFields,
  duplicateGroups,
  accountEntry,
  directoryWithinLimit,
  postDiscord,
};
