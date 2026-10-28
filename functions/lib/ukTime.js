/** UK civil day and the next Europe/London midnight, for allowance resets. */

function ukParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const bag = {};
  fmt.formatToParts(date).forEach((p) => {
    if (p.type !== 'literal') bag[p.type] = p.value;
  });
  return bag;
}

function ukDay(date = new Date(), timeZone = 'Europe/London') {
  try {
    const p = ukParts(date, timeZone);
    return `${p.year}-${p.month}-${p.day}`;
  } catch (_) {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Seconds until the next midnight in `timeZone`, and the UTC instant of that midnight.
 * Walks forward minute by minute across the DST fold (at most 26 hours).
 */
function nextMidnight(date = new Date(), timeZone = 'Europe/London') {
  const start = date.getTime();
  let t = start - (start % 60000) + 60000;
  const limit = start + 26 * 60 * 60 * 1000;
  let prev = ukDay(date, timeZone);
  while (t < limit) {
    const day = ukDay(new Date(t), timeZone);
    if (day !== prev) {
      const retryAfter = Math.max(1, Math.ceil((t - start) / 1000));
      return { retryAfter, resetsAt: new Date(t).toISOString() };
    }
    t += 60000;
  }
  const fallback = start + 24 * 60 * 60 * 1000;
  return { retryAfter: 86400, resetsAt: new Date(fallback).toISOString() };
}

module.exports = { ukDay, nextMidnight };
