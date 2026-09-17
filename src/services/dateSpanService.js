import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';

const LEGACY_STORAGE_KEY = '@date_span_list';
const GUEST_STORAGE_KEY = '@date_span_list_guest';
const LAST_UID_KEY = '@timeline_last_uid';

function spansStorageKey(uid) {
  return uid ? `@date_span_list_${uid}` : GUEST_STORAGE_KEY;
}

function currentUid() {
  return auth?.currentUser?.uid || null;
}

// Bumps on login/logout so in-flight I/O cannot write after an auth switch.
let authEpoch = 0;
let activeAuthUid = null;

/** Call from App onAuthStateChanged so span I/O is scoped to the current uid. */
export function beginAuthScope(uid) {
  authEpoch += 1;
  activeAuthUid = uid || null;
  return authEpoch;
}

function isScopeCurrent(uid, epoch) {
  return epoch === authEpoch && (uid || null) === activeAuthUid;
}

/**
 * One-time migration of legacy global @date_span_list into a per-uid key.
 * Only adopts when @timeline_last_uid matches (same gate as profile/theme).
 */
async function migrateLegacySpansOnce(uid) {
  if (!uid) return;
  const scoped = spansStorageKey(uid);
  try {
    const existing = await AsyncStorage.getItem(scoped);
    if (existing != null) return;
    const lastUid = await AsyncStorage.getItem(LAST_UID_KEY);
    if (lastUid !== uid) {
      console.warn(
        'Skipping legacy date-span migration for',
        uid,
        '(last_uid=',
        lastUid,
        ') — not adopting foreign cache',
      );
      return;
    }
    const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy == null) return;
    await AsyncStorage.setItem(scoped, legacy);
    await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
    console.warn('Migrated legacy @date_span_list into', scoped);
  } catch (e) {
    console.warn('Legacy date-span migration skipped', e);
  }
}

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

/** Paper-style: 14y 6m 6d (YYy MMm DDd). */
export function formatDmy(span) {
  if (!span) return '';
  const days = span.calDays != null ? span.calDays : span.days != null ? span.days : 0;
  return `${span.years || 0}y ${span.months || 0}m ${days}d`;
}

/** DD/MM/YYYY from YYYY-MM-DD or a Date. */
export function formatDob(isoOrDate) {
  if (!isoOrDate) return '';
  if (isoOrDate instanceof Date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(isoOrDate.getDate())}/${pad(isoOrDate.getMonth() + 1)}/${isoOrDate.getFullYear()}`;
  }
  const d = String(isoOrDate).slice(0, 10);
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(isoOrDate);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function toIsoDate(date) {
  if (!date) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseIsoDay(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Whole days from focus until next birthday. excludeEndDate skips counting the birthday itself. */
export function daysUntilNext(focusIso, birthIso, { excludeEndDate = true } = {}) {
  const focus = parseIsoDay(focusIso);
  const birth = parseIsoDay(birthIso);
  const start = new Date(focus.getFullYear(), focus.getMonth(), focus.getDate());
  let next = new Date(focus.getFullYear(), birth.getMonth(), birth.getDate());
  if (next.getTime() < start.getTime()) {
    next = new Date(focus.getFullYear() + 1, birth.getMonth(), birth.getDate());
  }
  if (next.getTime() === start.getTime()) return 0;
  const raw = Math.round((next.getTime() - start.getTime()) / 86400000);
  return excludeEndDate ? Math.max(0, raw - 1) : raw;
}

export function daysBetweenBirthdays(focusIso, aIso, bIso, { excludeEndDate = true } = {}) {
  return Math.abs(
    daysUntilNext(focusIso, aIso, { excludeEndDate }) -
      daysUntilNext(focusIso, bIso, { excludeEndDate }),
  );
}

/** Month/day only — does not change when the focus date changes. */
export function daysBetweenAnniversaries(aIso, bIso) {
  const a = parseIsoDay(aIso);
  const b = parseIsoDay(bIso);
  const leap =
    (a.getMonth() === 1 && a.getDate() === 29) || (b.getMonth() === 1 && b.getDate() === 29);
  const y = leap ? 2024 : 2025;
  const da = new Date(y, a.getMonth(), a.getDate());
  const db = new Date(y, b.getMonth(), b.getDate());
  return Math.round(Math.abs(db.getTime() - da.getTime()) / 86400000);
}

export function spanYmd(fromIso, untilIso) {
  let a = parseIsoDay(fromIso);
  let b = parseIsoDay(untilIso);
  if (a.getTime() > b.getTime()) {
    const swap = a;
    a = b;
    b = swap;
  }
  let years = b.getFullYear() - a.getFullYear();
  let months = b.getMonth() - a.getMonth();
  let days = b.getDate() - a.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(b.getFullYear(), b.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const totalDays = Math.round((b.getTime() - a.getTime()) / 86400000);
  return {
    years,
    months,
    days,
    totalDays,
    from: toIsoDate(a),
    to: toIsoDate(b),
  };
}

export function digitSum(n) {
  const digits = String(Math.abs(Math.trunc(n))).split('');
  const total = digits.reduce((s, d) => s + Number(d), 0);
  return { total, parts: digits.join('+') };
}

export function concatNumbers(a, b) {
  return Number(`${a}${b}`);
}

export function formatUk(isoOrDate) {
  if (!isoOrDate) return '';
  if (isoOrDate instanceof Date) {
    return `${isoOrDate.getDate()}/${isoOrDate.getMonth() + 1}/${isoOrDate.getFullYear()}`;
  }
  const d = parseIsoDay(isoOrDate);
  if (Number.isNaN(d.getTime())) return String(isoOrDate);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

export function formatSpan(s) {
  if (!s) return '';
  const days = s.calDays != null ? s.calDays : s.days != null ? s.days : 0;
  const bits = [s.years ? `${s.years}y` : null, s.months ? `${s.months}m` : null, `${days}d`].filter(Boolean);
  return bits.join(' ');
}

export function spanDetail(fromIso, untilIso, { excludeEndDate = true } = {}) {
  const from = parseIsoDay(fromIso);
  const to = parseIsoDay(untilIso);
  return calculateSpan(from, to, { excludeEndDate });
}

async function readListRaw(uid = currentUid()) {
  if (uid) await migrateLegacySpansOnce(uid);
  const raw = await AsyncStorage.getItem(spansStorageKey(uid));
  if (!raw) return [];
  const list = JSON.parse(raw);
  return Array.isArray(list) ? list : [];
}

async function writeList(list, uid = currentUid()) {
  await AsyncStorage.setItem(spansStorageKey(uid), JSON.stringify(list));
}

/** Clear the per-uid local date-span cache only (does not touch other uids or Firestore). */
export async function clearLocalSpansForUid(uid) {
  if (!uid) return;
  await AsyncStorage.setItem(spansStorageKey(uid), JSON.stringify([]));
}

export async function getSpans() {
  const uid = currentUid();
  const epoch = authEpoch;
  try {
    const list = await readListRaw(uid);
    if (uid && !isScopeCurrent(uid, epoch)) return [];
    return list.sort(
      (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );
  } catch (e) {
    console.warn('Failed to load date span list', e);
    return [];
  }
}

export async function saveSpan(entry) {
  const uid = currentUid();
  const epoch = authEpoch;
  const list = await readListRaw(uid);
  if (uid && !isScopeCurrent(uid, epoch)) {
    throw new Error('Account changed — span not saved');
  }
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
    ymd: span ? formatDmy(span) : entry.ymd || '',
    createdAt: entry.createdAt || now,
    updatedAt: now,
    ownerUid: uid || undefined,
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

  if (uid && !isScopeCurrent(uid, epoch)) {
    throw new Error('Account changed — span not saved');
  }
  await writeList(list, uid);
  return payload;
}

export async function deleteSpan(id) {
  const uid = currentUid();
  const epoch = authEpoch;
  const list = await readListRaw(uid);
  const next = list.filter((item) => String(item.id) !== String(id));
  if (uid && !isScopeCurrent(uid, epoch)) return list;
  await writeList(next, uid);
  return next;
}

export function findSpansForNumber(list, rawNumber) {
  const n = Number(String(rawNumber).trim());
  if (!String(rawNumber).trim() || Number.isNaN(n)) return [];
  return (list || []).filter((item) => Number(item.totalDays) === n);
}
