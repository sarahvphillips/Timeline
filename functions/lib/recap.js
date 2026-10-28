/** Fold a year of events into a short recap. Paging lives with the caller. */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthIndex(date) {
  const raw = String(date || '');
  const m = raw.match(/\d{4}-(\d{2})/);
  if (!m) return -1;
  const n = Number(m[1]) - 1;
  return n >= 0 && n <= 11 ? n : -1;
}

function kindOf(event) {
  const src = String(event.source || 'manual').toLowerCase();
  const hobby = String(event.hobbyType || '').toLowerCase();
  if (hobby === 'poetry' || src === 'poem') return 'poem';
  if (src === 'todo' || event.fromTodo) return 'todo';
  if (src && src !== 'manual') return src;
  return 'event';
}

function emptyRecap(year, now = new Date()) {
  const y = Number(year);
  const title = y === now.getFullYear() ? `My ${y} so far` : `My ${y}`;
  return {
    year: y,
    title,
    count: 0,
    byMonth: MONTHS.map((name, i) => ({ month: i + 1, name, count: 0 })),
    byKind: {},
    highlights: [],
  };
}

function addEvent(recap, event) {
  if (!event || event.deleted) return recap;
  recap.count += 1;
  const month = monthIndex(event.date);
  if (month >= 0) recap.byMonth[month].count += 1;
  const kind = kindOf(event);
  recap.byKind[kind] = (recap.byKind[kind] || 0) + 1;
  recap.highlights.push({
    id: event.id,
    title: String(event.title || 'Untitled').slice(0, 180),
    date: event.date || null,
    kind,
  });
  if (recap.highlights.length > 12) recap.highlights.shift();
  return recap;
}

function foldEvents(year, events, now) {
  const recap = emptyRecap(year, now);
  (events || []).forEach((event) => addEvent(recap, event));
  return recap;
}

/** Stable date + id cursor. `order` is 'asc' or 'desc'. */
function encodeCursor(date, id) {
  return Buffer.from(JSON.stringify({ date: date || '', id: id || '' }), 'utf8').toString('base64url');
}

function decodeCursor(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
    if (!parsed || typeof parsed.date !== 'string' || typeof parsed.id !== 'string') return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

/**
 * Walk an already date-sorted list the way startAfter(date, id) would,
 * so tests can prove a year larger than one page is fully covered.
 */
function pageEvents(events, { pageSize = 100, order = 'asc' } = {}) {
  const dir = order === 'desc' ? -1 : 1;
  const sorted = [...(events || [])].sort((a, b) => {
    const byDate = String(a.date || '').localeCompare(String(b.date || ''));
    if (byDate !== 0) return byDate * dir;
    return String(a.id || '').localeCompare(String(b.id || '')) * dir;
  });
  const pages = [];
  for (let i = 0; i < sorted.length; i += pageSize) pages.push(sorted.slice(i, i + pageSize));
  if (!pages.length) pages.push([]);
  return pages;
}

module.exports = {
  MONTHS,
  emptyRecap,
  addEvent,
  foldEvents,
  kindOf,
  encodeCursor,
  decodeCursor,
  pageEvents,
};
