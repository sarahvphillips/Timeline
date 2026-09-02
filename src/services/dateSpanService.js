import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@date_span_list';

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function parseDateTime(dateStr, timeStr) {
  const d = String(dateStr || '').trim();
  const t = String(timeStr || '00:00:00').trim() || '00:00:00';
  const dm = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dm) return null;
  const tm = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!tm) return null;
  const year = Number(dm[1]);
  const month = Number(dm[2]) - 1;
  const day = Number(dm[3]);
  const hour = Number(tm[1]);
  const minute = Number(tm[2]);
  const second = Number(tm[3] || 0);
  if (month < 0 || month > 11 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const date = new Date(year, month, day, hour, minute, second);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function formatLongDate(date) {
  if (!date) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatIsoDate(date) {
  if (!date) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatIsoTime(date) {
  if (!date) return '00:00:00';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function padUnit(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export function calendarParts(start, end) {
  let y = end.getFullYear() - start.getFullYear();
  let m = end.getMonth() - start.getMonth();
  let d = end.getDate() - start.getDate();

  if (d < 0) {
    m -= 1;
    const prevMonth = end.getMonth() === 0 ? 11 : end.getMonth() - 1;
    const prevYear = end.getMonth() === 0 ? end.getFullYear() - 1 : end.getFullYear();
    d += daysInMonth(prevYear, prevMonth);
  }
  if (m < 0) {
    y -= 1;
    m += 12;
  }
  return { years: y, months: m, days: d };
}

/**
 * excludeEndDate (default true) matches timeanddate:
 * duration = end − start (do not count the end date as an extra full day).
 * include end date adds one day to the totals.
 */
export function calculateSpan(start, end, { excludeEndDate = true } = {}) {
  if (!start || !end) return null;
  let from = new Date(start.getTime());
  let to = new Date(end.getTime());
  const swapped = to < from;
  if (swapped) {
    const tmp = from;
    from = to;
    to = tmp;
  }

  const extraDayMs = excludeEndDate ? 0 : 86400000;
  const durationMs = Math.max(0, to.getTime() - from.getTime() + extraDayMs);

  const totalSeconds = Math.floor(durationMs / 1000);
  const totalMinutes = Math.floor(durationMs / 60000);
  const totalHours = Math.floor(durationMs / 3600000);
  const totalDays = Math.floor(durationMs / 86400000);
  const remMs = durationMs % 86400000;
  const hours = Math.floor(remMs / 3600000);
  const minutes = Math.floor((remMs % 3600000) / 60000);
  const seconds = Math.floor((remMs % 60000) / 1000);

  const calEnd = excludeEndDate ? to : new Date(to.getTime() + extraDayMs);
  const parts = calendarParts(from, excludeEndDate ? to : new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1, to.getHours(), to.getMinutes(), to.getSeconds()));
  const totalMonths = parts.years * 12 + parts.months;
  const weeks = Math.floor(totalDays / 7);
  const weekDays = totalDays % 7;
  const yearPct = (totalDays / 365) * 100;

  return {
    from,
    to,
    excludeEndDate,
    totalDays,
    hours,
    minutes,
    seconds,
    totalSeconds,
    totalMinutes,
    totalHours,
    years: parts.years,
    months: parts.months,
    calDays: parts.days,
    totalMonths,
    weeks,
    weekDays,
    yearPct,
    swapped,
    _calEnd: calEnd,
  };
}

/**
 * Inverse of calculateSpan totalDays: given From and N days, return To.
 * excludeEndDate true:  To = From + N days
 * excludeEndDate false: To = From + (N - 1) days
 */
export function dateFromDayCount(from, n, { excludeEndDate = true } = {}) {
  if (!from) return null;
  const days = Number(n);
  if (!Number.isFinite(days)) return null;
  const offset = excludeEndDate ? Math.trunc(days) : Math.trunc(days) - 1;
  const to = new Date(from.getTime());
  to.setDate(to.getDate() + offset);
  return to;
}

export function formatResultLine(span) {
  if (!span) return '';
  return `${padUnit(span.totalDays, 'day', 'days')}, ${padUnit(span.hours, 'hour', 'hours')}, ${padUnit(span.minutes, 'minute', 'minutes')} and ${padUnit(span.seconds, 'second', 'seconds')}`;
}

export function formatCalendarLine(span) {
  if (!span) return '';
  const endNote = span.excludeEndDate ? 'excluding the end date' : 'including the end date';
  return `${padUnit(span.years, 'year', 'years')}, ${padUnit(span.months, 'month', 'months')}, ${padUnit(span.calDays, 'day', 'days')} ${endNote}.`;
}

export function formatMonthLine(span) {
  if (!span) return '';
  const endNote = span.excludeEndDate ? 'excluding the end date' : 'including the end date';
  return `${padUnit(span.totalMonths, 'month', 'months')}, ${padUnit(span.calDays, 'day', 'days')} ${endNote}.`;
}

export function formatWeekLine(span) {
  if (!span) return '';
  if (span.weekDays === 0) return padUnit(span.weeks, 'week', 'weeks');
  return `${padUnit(span.weeks, 'week', 'weeks')} and ${padUnit(span.weekDays, 'day', 'days')}`;
}

export async function getSpans() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return (Array.isArray(list) ? list : []).sort(
      (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );
  } catch (e) {
    console.warn('Failed to load date span list', e);
    return [];
  }
}

export async function saveSpan(entry) {
  const list = await getSpans();
  const now = new Date().toISOString();
  const from = parseDateTime(entry.fromDate, entry.fromTime || '00:00:00');
  const to = parseDateTime(entry.toDate, entry.toTime || '00:00:00');
  const span =
    from && to
      ? calculateSpan(from, to, { excludeEndDate: entry.excludeEnd !== false })
      : null;
  const payload = {
    id: entry.id || Date.now().toString() + Math.random().toString(36).slice(2, 8),
    fromDate: entry.fromDate,
    fromTime: entry.fromTime || '00:00:00',
    toDate: entry.toDate,
    toTime: entry.toTime || '00:00:00',
    excludeEnd: entry.excludeEnd !== false,
    title: (entry.title || '').trim(),
    note: (entry.note || '').trim(),
    totalDays: span ? span.totalDays : Number(entry.totalDays) || 0,
    calendarLine: span ? formatCalendarLine(span) : entry.calendarLine || '',
    resultLine: span ? formatResultLine(span) : entry.resultLine || '',
    createdAt: entry.createdAt || now,
    updatedAt: now,
  };

  const index = list.findIndex((item) => String(item.id) === String(payload.id));
  if (index !== -1) {
    list[index] = {
      ...list[index],
      ...payload,
      id: list[index].id,
      createdAt: list[index].createdAt || payload.createdAt,
    };
  } else {
    list.unshift(payload);
  }

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return payload;
}

export async function deleteSpan(id) {
  const list = await getSpans();
  const next = list.filter((item) => String(item.id) !== String(id));
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function findSpansForNumber(list, rawNumber) {
  const n = Number(String(rawNumber).trim());
  if (!String(rawNumber).trim() || Number.isNaN(n)) return [];
  return (list || []).filter((item) => Number(item.totalDays) === n);
}
