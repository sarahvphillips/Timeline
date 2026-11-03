/** Pure sync decisions. No Firebase, so the tests can run them. */

export function syncPlan({ remoteVersion, savedVersion, since, localCount, capped } = {}) {
  const local = Number(localCount) > 0;
  const same = remoteVersion != null && savedVersion != null && String(remoteVersion) === String(savedVersion);
  if (!local) return { mode: 'full', reason: 'empty-cache' };
  if (same) return { mode: 'local', reason: 'unchanged', reads: 1 };
  if (capped) return { mode: 'local', reason: 'mismatch-deferred', reads: 1 };
  if (since) return { mode: 'delta', reason: 'changed' };
  return { mode: 'adopt', reason: 'cached-without-cursor', reads: 1 };
}

/** One edited document, after the sync stamp has already been read. */
export function readsForSingleEdit() {
  return { syncDoc: 1, changedDocs: 1, total: 2 };
}

/** First day of the previous London month, as a date prefix events can be compared with. */
export function recentWindowStart(now = new Date()) {
  let day;
  try {
    day = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch (_) {
    day = now.toISOString().slice(0, 10);
  }
  const [yearText, monthText] = day.split('-');
  let year = Number(yearText);
  let month = Number(monthText) - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}-01`;
}
