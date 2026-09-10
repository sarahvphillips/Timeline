export type Ymd = { years: number; months: number; days: number; totalDays: number };

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatUk(iso: string): string {
  const d = parseIso(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

export function formatDob(iso: string): string {
  const d = parseIso(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Calendar span from earlier → later, same style as the paper wheel. */
export function spanYmd(fromIso: string, untilIso: string): Ymd & { from: string; to: string } {
  let a = parseIso(fromIso);
  let b = parseIso(untilIso);
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
    const prev = new Date(b.getFullYear(), b.getMonth(), 0).getDate();
    days += prev;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const totalDays = Math.round((b.getTime() - a.getTime()) / 86400000);
  return { years, months, days, totalDays, from: toIso(a), to: toIso(b) };
}

/** Paper-style: 14y 6m 6d */
export function formatDmy(s: Ymd): string {
  return `${s.years}y ${s.months}m ${s.days}d`;
}

export function formatSpan(s: Ymd): string {
  const bits = [
    s.years ? `${s.years}y` : null,
    s.months ? `${s.months}m` : null,
    `${s.days}d`,
  ].filter(Boolean);
  return bits.join(" ");
}

/** Whole days from focus until next birthday. Exclude end date = do not count the birthday itself. */
export function daysUntilNext(
  focusIso: string,
  birthIso: string,
  { excludeEndDate = true }: { excludeEndDate?: boolean } = {},
): number {
  const focus = parseIso(focusIso);
  const birth = parseIso(birthIso);
  let next = new Date(focus.getFullYear(), birth.getMonth(), birth.getDate());
  const start = new Date(focus.getFullYear(), focus.getMonth(), focus.getDate());
  if (next.getTime() < start.getTime()) {
    next = new Date(focus.getFullYear() + 1, birth.getMonth(), birth.getDate());
  }
  if (next.getTime() === start.getTime()) return 0;
  const raw = Math.round((next.getTime() - start.getTime()) / 86400000);
  return excludeEndDate ? Math.max(0, raw - 1) : raw;
}

/** |days until A's next birthday − days until B's next birthday| from a chosen date. */
export function daysBetweenBirthdays(
  focusIso: string,
  aIso: string,
  bIso: string,
  { excludeEndDate = true }: { excludeEndDate?: boolean } = {},
): number {
  const ua = daysUntilNext(focusIso, aIso, { excludeEndDate });
  const ub = daysUntilNext(focusIso, bIso, { excludeEndDate });
  return Math.abs(ua - ub);
}

/**
 * Days from one birthday to the other, year ignored (month and day only).
 * Does not use the date at the top. Same-year elapsed days from the earlier
 * anniversary to the later (8 May → 14 Nov = 190).
 */
export function daysBetweenAnniversaries(aIso: string, bIso: string): number {
  const a = parseIso(aIso);
  const b = parseIso(bIso);
  const leap = a.getMonth() === 1 && a.getDate() === 29 || b.getMonth() === 1 && b.getDate() === 29;
  const y = leap ? 2024 : 2025;
  const da = new Date(y, a.getMonth(), a.getDate());
  const db = new Date(y, b.getMonth(), b.getDate());
  return Math.round(Math.abs(db.getTime() - da.getTime()) / 86400000);
}

export type SpanDetail = Ymd & {
  from: string;
  to: string;
  weeks: number;
  weekDays: number;
  yearPct: number;
  totalMonths: number;
  excludeEndDate: boolean;
};

export function spanDetail(
  fromIso: string,
  untilIso: string,
  { excludeEndDate = true }: { excludeEndDate?: boolean } = {},
): SpanDetail {
  const base = spanYmd(fromIso, untilIso);
  const totalDays = excludeEndDate ? base.totalDays : base.totalDays + 1;
  return {
    ...base,
    totalDays,
    weeks: Math.floor(totalDays / 7),
    weekDays: totalDays % 7,
    yearPct: (totalDays / 365) * 100,
    totalMonths: base.years * 12 + base.months,
    excludeEndDate,
  };
}

export function formatResultLine(s: SpanDetail): string {
  return `${s.totalDays.toLocaleString()} days, 0 hours, 0 minutes and 0 seconds`;
}

export function formatCalendarLine(s: SpanDetail): string {
  const endNote = s.excludeEndDate ? "excluding the end date" : "including the end date";
  return `${s.years} years, ${s.months} months, ${s.days} days ${endNote}.`;
}

export function formatMonthLine(s: SpanDetail): string {
  const endNote = s.excludeEndDate ? "excluding the end date" : "including the end date";
  return `${s.totalMonths} months, ${s.days} days ${endNote}.`;
}

export function formatWeekLine(s: SpanDetail): string {
  if (s.weekDays === 0) return `${s.weeks} weeks`;
  return `${s.weeks} weeks and ${s.weekDays} days`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function nowClock(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function nowStamp(): string {
  const d = new Date();
  return `${toIso(d)} ${nowClock()}`;
}

export function formatStamp(stamp: string): string {
  const [date, time] = stamp.split(" ");
  if (!date) return stamp;
  return `${formatUk(date)}${time ? ` ${time}` : ""}`;
}

export function parseClock(t: string): number | null {
  const m = String(t || "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3] || 0);
  if (h > 23 || min > 59 || s > 59) return null;
  return h * 3600 + min * 60 + s;
}

export type ClockDiff = {
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  wrapped: boolean;
};

/** Difference between two times of day. If To is earlier, wrap past midnight. */
export function clockDiff(from: string, to: string): ClockDiff | null {
  const a = parseClock(from);
  const b = parseClock(to);
  if (a == null || b == null) return null;
  let sec = b - a;
  const wrapped = sec < 0;
  if (wrapped) sec += 86400;
  return {
    hours: Math.floor(sec / 3600),
    minutes: Math.floor((sec % 3600) / 60),
    seconds: sec % 60,
    totalSeconds: sec,
    wrapped,
  };
}

export function formatClockDiff(d: ClockDiff): string {
  return `${d.hours}h ${d.minutes}m ${d.seconds}s`;
}
