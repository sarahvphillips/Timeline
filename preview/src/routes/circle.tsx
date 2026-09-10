import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toJpeg } from "html-to-image";
import {
  daysBetweenAnniversaries,
  daysBetweenBirthdays,
  daysUntilNext,
  formatCalendarLine,
  formatDob,
  formatDmy,
  formatMonthLine,
  formatResultLine,
  formatSpan,
  formatStamp,
  formatUk,
  formatWeekLine,
  nowClock,
  nowStamp,
  spanDetail,
  spanYmd,
  toIso,
} from "@/lib/date-span";
import { snapshotWheel } from "@/lib/wheel-snapshot";
import {
  findFriendByWheel,
  FRIEND_STORE,
  initialFromName,
  inviteText,
  mergeFriends,
  SAMPLE_FRIENDS,
  type TimelineFriend,
} from "@/lib/friends";
import {
  concatNumbers,
  digitSum,
  findPhrasesForNumber,
  formatDigitSum,
  formatHits,
  mergeWordLists,
  ordinalSum,
  TEST_WORDS,
  type WordEntry,
} from "@/lib/word-to-int";

export const Route = createFileRoute("/circle")({ component: DateCirclePage });

type Person = {
  id: string;
  initials: string;
  date: string;
  role: "hub" | "ring";
  angle: number;
};

const SAMPLE: Person[] = [
  { id: "ps", initials: "PS", date: "1940-07-13", role: "hub", angle: 0 },
  { id: "sp", initials: "S.P", date: "1986-11-14", role: "ring", angle: -90 },
  { id: "dh", initials: "DH", date: "1972-05-08", role: "ring", angle: 0 },
  { id: "em", initials: "EM", date: "1972-06-28", role: "ring", angle: 90 },
  { id: "dt", initials: "DT", date: "1989-06-05", role: "ring", angle: 180 },
];

const STORE = "timeline-date-circle-v2";
const PAIR_STORE = "timeline-date-circle-pairs-v1";
const WORD_STORE = "timeline-date-circle-words-v1";
const EVENT_STORE = "timeline-date-circle-events-v1";
const WHEEL_CATEGORY = "wheel of dates";

type EventEdit = { at: string; what: string };

type WheelEvent = {
  id: string;
  date: string;
  category: typeof WHEEL_CATEGORY;
  title: string;
  note: string;
  wheelImage: string;
  extraImage: string;
  createdAt: string;
  createdTime: string;
  edits: EventEdit[];
};

type SavedPair = {
  id: string;
  aInitials: string;
  aDate: string;
  bInitials: string;
  bDate: string;
  focus: string;
  excludeEnd: boolean;
  untilA: number;
  untilB: number;
  birthdayGap: number;
  fullSpan: string;
};

function DateCirclePage() {
  const [people, setPeople] = useState<Person[]>(SAMPLE);
  const [focus, setFocus] = useState("2026-04-16");
  const [excludeEnd, setExcludeEnd] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [initials, setInitials] = useState("");
  const [birth, setBirth] = useState("");
  const [savedPairs, setSavedPairs] = useState<SavedPair[]>([]);
  const [words, setWords] = useState<WordEntry[]>([]);
  const [newPhrase, setNewPhrase] = useState("");
  const [ready, setReady] = useState(false);
  const [events, setEvents] = useState<WheelEvent[]>([]);
  const [eventDate, setEventDate] = useState(() => toIso(new Date()));
  const [eventImage, setEventImage] = useState("");
  const [useToday, setUseToday] = useState(true);
  const [openEdits, setOpenEdits] = useState<string | null>(null);
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [friends, setFriends] = useState<TimelineFriend[]>(SAMPLE_FRIENDS);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const parsed = JSON.parse(raw) as { people: Person[]; focus: string };
        if (parsed.people?.length) setPeople(parsed.people);
        if (parsed.focus) setFocus(parsed.focus);
      }
      const pairsRaw = localStorage.getItem(PAIR_STORE);
      if (pairsRaw) {
        const list = JSON.parse(pairsRaw) as SavedPair[];
        if (Array.isArray(list)) setSavedPairs(list);
      }
      const wordsRaw = localStorage.getItem(WORD_STORE);
      let loaded: WordEntry[] = [];
      if (wordsRaw) {
        const list = JSON.parse(wordsRaw) as WordEntry[];
        if (Array.isArray(list)) loaded = list;
      }
      setWords(mergeWordLists(loaded, TEST_WORDS));
      const eventsRaw = localStorage.getItem(EVENT_STORE);
      if (eventsRaw) {
        const list = JSON.parse(eventsRaw) as WheelEvent[];
        if (Array.isArray(list)) {
          setEvents(
            list.map((ev) => ({
              ...ev,
              createdAt: ev.createdAt || `${ev.date} 00:00:00`,
              createdTime: ev.createdTime || "00:00:00",
              edits: ev.edits || [],
            })),
          );
        }
      }
      const fr = localStorage.getItem(FRIEND_STORE);
      if (fr) {
        const list = JSON.parse(fr) as TimelineFriend[];
        if (Array.isArray(list) && list.length) setFriends(mergeFriends(list));
      }
    } catch {
      setWords(TEST_WORDS);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORE, JSON.stringify({ people, focus }));
    } catch {
      /* ignore quota */
    }
  }, [people, focus, ready]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(PAIR_STORE, JSON.stringify(savedPairs));
    } catch {
      /* ignore quota */
    }
  }, [savedPairs, ready]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(WORD_STORE, JSON.stringify(words));
    } catch {
      /* ignore quota */
    }
  }, [words, ready]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(EVENT_STORE, JSON.stringify(events));
    } catch {
      /* ignore quota */
    }
  }, [events, ready]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(FRIEND_STORE, JSON.stringify(friends));
    } catch {
      /* ignore quota */
    }
  }, [friends, ready]);

  const hub = people.find((p) => p.role === "hub") ?? people[0];
  const ring = people.filter((p) => p.id !== hub?.id);

  const birthdays = useMemo(() => {
    return [...people]
      .map((p) => ({ ...p, until: daysUntilNext(focus, p.date, { excludeEndDate: excludeEnd }) }))
      .sort((a, b) => a.until - b.until);
  }, [people, focus, excludeEnd]);
  const nearest = birthdays.slice(0, 2);
  const spokePairs = useMemo(() => {
    const lines: { a: Person; b: Person; span: ReturnType<typeof spanYmd> }[] = [];
    for (let i = 0; i < people.length; i += 1) {
      for (let j = i + 1; j < people.length; j += 1) {
        lines.push({
          a: people[i],
          b: people[j],
          span: spanYmd(people[i].date, people[j].date),
        });
      }
    }
    return lines;
  }, [people]);

  function tap(id: string) {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  const pair = useMemo(() => {
    if (picked.length !== 2) return null;
    const a = people.find((p) => p.id === picked[0]);
    const b = people.find((p) => p.id === picked[1]);
    if (!a || !b) return null;
    const span = spanYmd(a.date, b.date);
    const detail = spanDetail(a.date, b.date, { excludeEndDate: excludeEnd });
    const untilA = daysUntilNext(focus, a.date, { excludeEndDate: excludeEnd });
    const untilB = daysUntilNext(focus, b.date, { excludeEndDate: excludeEnd });
    const birthdayGap = daysBetweenBirthdays(focus, a.date, b.date, {
      excludeEndDate: excludeEnd,
    });
    const anniversaryDays = daysBetweenAnniversaries(a.date, b.date);
    return { a, b, span, detail, birthdayGap, anniversaryDays, untilA, untilB };
  }, [picked, people, focus, excludeEnd]);

  function addPerson(e: FormEvent) {
    e.preventDefault();
    const label = initials.trim().toUpperCase();
    if (!label || !birth) return;
    const used = ring.map((p) => p.angle);
    let angle = -90;
    for (let i = 0; i < 12; i += 1) {
      const tryA = -90 + i * 30;
      if (!used.some((u) => Math.abs(u - tryA) < 15)) {
        angle = tryA;
        break;
      }
    }
    setPeople((list) => [
      ...list,
      { id: `${Date.now()}`, initials: label, date: birth, role: "ring", angle },
    ]);
    setInitials("");
    setBirth("");
  }

  function setHub(id: string) {
    setPeople((list) => list.map((p) => ({ ...p, role: p.id === id ? "hub" : "ring" })));
  }

  function savePair() {
    if (!pair) return;
    const untilA = daysUntilNext(focus, pair.a.date, { excludeEndDate: excludeEnd });
    const untilB = daysUntilNext(focus, pair.b.date, { excludeEndDate: excludeEnd });
    const row: SavedPair = {
      id: `${Date.now()}`,
      aInitials: pair.a.initials,
      aDate: pair.a.date,
      bInitials: pair.b.initials,
      bDate: pair.b.date,
      focus,
      excludeEnd,
      untilA,
      untilB,
      birthdayGap: pair.birthdayGap,
      fullSpan: formatSpan(pair.span),
    };
    setSavedPairs((list) => [row, ...list]);
  }

  function deletePair(id: string) {
    setSavedPairs((list) => list.filter((p) => p.id !== id));
  }

  function addWord(e: FormEvent) {
    e.preventDefault();
    const phrase = newPhrase.trim();
    if (!phrase) return;
    setWords((list) => [
      { id: `${Date.now()}`, phrase, ordinal: ordinalSum(phrase) },
      ...list,
    ]);
    setNewPhrase("");
  }

  function deleteWord(id: string) {
    setWords((list) => list.filter((w) => w.id !== id));
  }

  function loadTestWords() {
    setWords((list) => mergeWordLists(list, TEST_WORDS));
  }

  function onPickImage(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setEventImage(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  async function addWheelEvent() {
    const date = useToday ? toIso(new Date()) : eventDate;
    const title = pair
      ? `Wheel of dates · ${pair.a.initials} → ${pair.b.initials}`
      : "Wheel of dates";
    const note = pair
      ? `${pair.untilA}d to ${pair.a.initials} · ${pair.untilB}d to ${pair.b.initials} · ${pair.birthdayGap}d between birthdays`
      : "Date circle snapshot";
    const hubNode = people.find((p) => p.role === "hub") ?? people[0];
    let wheelImage = "";
    if (wheelRef.current) {
      try {
        wheelImage = await toJpeg(wheelRef.current, {
          quality: 0.92,
          backgroundColor: "#140e24",
          pixelRatio: 2,
        });
      } catch {
        wheelImage = "";
      }
    }
    if (!wheelImage) {
      wheelImage = snapshotWheel(
        people.map((p) => ({
          id: p.id,
          initials: p.initials,
          untilLabel:
            p.id === hubNode?.id
              ? formatUk(p.date)
              : `${daysUntilNext(focus, p.date, { excludeEndDate: excludeEnd })}d`,
          role: p.role,
          angle: p.angle,
          picked: picked.includes(p.id),
        })),
        formatUk(focus),
      );
    }
    setEvents((list) => [
      {
        id: `${Date.now()}`,
        date,
        category: WHEEL_CATEGORY,
        title,
        note,
        wheelImage,
        extraImage: eventImage,
        createdAt: nowStamp(),
        createdTime: nowClock(),
        edits: [],
      },
      ...list,
    ]);
  }

  function deleteEvent(id: string) {
    setEvents((list) => list.filter((e) => e.id !== id));
  }

  function addPersonFromWheel(p: Person) {
    if (findFriendByWheel(friends, p.id, p.initials)) return;
    setFriends((list) => [
      {
        id: `p-${Date.now()}`,
        name: p.initials,
        phone: "",
        email: "",
        birthday: p.date,
        note: "Added from date circle",
        initial: initialFromName(p.initials),
        autoShareSms: false,
        autoShareCalls: false,
        onApp: false,
        inviteSent: false,
        fromWheelId: p.id,
      },
      ...list,
    ]);
  }

  async function inviteFromWheel(p: Person) {
    let friend = findFriendByWheel(friends, p.id, p.initials);
    if (!friend) {
      addPersonFromWheel(p);
      friend = {
        id: p.id,
        name: p.initials,
        phone: "",
        email: "",
        birthday: p.date,
        note: "",
        initial: initialFromName(p.initials),
        autoShareSms: false,
        autoShareCalls: false,
        onApp: false,
        inviteSent: false,
        fromWheelId: p.id,
      };
    }
    try {
      await navigator.clipboard.writeText(inviteText(friend));
    } catch {
      /* ignore */
    }
    setFriends((list) =>
      list.map((f) =>
        f.fromWheelId === p.id || nameKeyMatch(f.name, p.initials) ? { ...f, inviteSent: true } : f,
      ),
    );
    setCopiedId(p.id);
  }

  function nameKeyMatch(a: string, b: string) {
    return a.replace(/[^A-Za-z0-9]/g, "").toUpperCase() === b.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  }

  function startEditNote(ev: WheelEvent) {
    setEditNoteId(ev.id);
    setEditNote(ev.note);
  }

  function saveEditNote() {
    if (!editNoteId) return;
    const next = editNote.trim();
    setEvents((list) =>
      list.map((ev) =>
        ev.id !== editNoteId
          ? ev
          : {
              ...ev,
              note: next,
              edits: [{ at: nowStamp(), what: `Note: ${next || "(empty)"}` }, ...(ev.edits || [])],
            },
      ),
    );
    setEditNoteId(null);
  }

  const wordMath = useMemo(() => {
    if (!pair) return null;
    const sumA = digitSum(pair.untilA);
    const sumB = digitSum(pair.untilB);
    const joined = concatNumbers(sumA.total, sumB.total);
    return {
      sumA,
      sumB,
      joined,
      hitsA: findPhrasesForNumber(words, sumA.total),
      hitsB: findPhrasesForNumber(words, sumB.total),
      hitsJoined: findPhrasesForNumber(words, joined),
      hitsGap: findPhrasesForNumber(words, pair.birthdayGap),
      hitsAnn: findPhrasesForNumber(words, pair.anniversaryDays),
    };
  }, [pair, words]);

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Timeline</p>
          <h1 className="text-3xl font-bold">Date circle</h1>
        </div>
        <div className="flex gap-3">
          <Link to="/" className="text-sm text-muted underline-offset-2 hover:underline">
            Home
          </Link>
          <Link to="/people" className="text-sm text-muted underline-offset-2 hover:underline">
            People
          </Link>
          <Link to="/mockups" className="text-sm text-muted underline-offset-2 hover:underline">
            Sketches
          </Link>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted">
        Side-feature. Top date = days left until birthdays. Tap two people for the gap between them.
      </p>

      <section className="mt-5 rounded-radius border border-border bg-surface p-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Date at the top
          <input
            type="date"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            className="mt-1 w-full rounded-radius border border-border bg-bg px-3 py-2 text-base text-fg"
          />
        </label>
        <button
          type="button"
          onClick={() => setExcludeEnd((v) => !v)}
          className="mt-3 flex min-h-11 items-center gap-3 text-left"
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded border ${
              excludeEnd ? "border-primary bg-primary" : "border-border bg-bg"
            }`}
          >
            {excludeEnd ? <span className="h-2.5 w-2.5 rounded-sm bg-bg" /> : null}
          </span>
          <span className="text-sm">
            Exclude the end date
            <span className="mt-0.5 block text-xs text-muted">
              Same as Days between. Off counts the birthday; on matches your 21d note.
            </span>
          </span>
        </button>
        <p className="mt-3 text-sm font-semibold text-primary">Days left until birthday</p>
        <ul className="mt-2 space-y-1">
          {nearest.map((p) => (
            <li key={p.id} className="text-lg font-bold">
              {p.until === 0 ? "Today" : `${p.until}d`} to {p.initials}
            </li>
          ))}
        </ul>
        {birthdays.length > 2 ? (
          <ul className="mt-2 space-y-0.5 text-sm text-muted">
            {birthdays.slice(2).map((p) => (
              <li key={p.id}>
                {p.until === 0 ? "Today" : `${p.until}d`} to {p.initials}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div ref={wheelRef} className="relative mx-auto mt-6 aspect-square w-full max-w-sm bg-bg">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full text-border"
          viewBox="0 0 100 100"
          aria-hidden
        >
          {ring.map((p) => {
            const rad = (p.angle * Math.PI) / 180;
            const x = 50 + Math.cos(rad) * 38;
            const y = 50 + Math.sin(rad) * 38;
            const hot = picked.includes(p.id) && picked.includes(hub?.id ?? "");
            const label = hub ? formatDmy(spanYmd(hub.date, p.date)) : "";
            const lx = 50 + (x - 50) * 0.58;
            const ly = 50 + (y - 50) * 0.58;
            return (
              <g key={`spoke-${p.id}`}>
                <line
                  x1="50"
                  y1="50"
                  x2={x}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth={hot ? 0.9 : 0.35}
                  className={hot ? "text-primary" : "text-border"}
                />
                <rect
                  x={lx - 10}
                  y={ly - 2.4}
                  width="20"
                  height="4.8"
                  rx="1"
                  className="fill-bg"
                />
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className={hot ? "fill-primary" : "fill-muted"}
                  fontSize="2.8"
                  fontWeight="700"
                >
                  {label}
                </text>
              </g>
            );
          })}
          {picked.length === 2
            ? (() => {
                const pos = (id: string) => {
                  const p = people.find((n) => n.id === id);
                  if (!p) return { x: 50, y: 50 };
                  if (p.role === "hub" || p.id === hub?.id) return { x: 50, y: 50 };
                  const rad = (p.angle * Math.PI) / 180;
                  return { x: 50 + Math.cos(rad) * 38, y: 50 + Math.sin(rad) * 38 };
                };
                const pa = people.find((n) => n.id === picked[0]);
                const pb = people.find((n) => n.id === picked[1]);
                const a = pos(picked[0]);
                const b = pos(picked[1]);
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;
                const bothHub =
                  (pa?.id === hub?.id || pa?.role === "hub") ||
                  (pb?.id === hub?.id || pb?.role === "hub");
                return (
                  <g>
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke="currentColor"
                      strokeWidth="0.9"
                      className="text-primary"
                    />
                    {!bothHub && pa && pb ? (
                      <>
                        <rect
                          x={mx - 11}
                          y={my - 2.6}
                          width="22"
                          height="5.2"
                          rx="1"
                          className="fill-bg"
                        />
                        <text
                          x={mx}
                          y={my}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="fill-primary"
                          fontSize="2.8"
                          fontWeight="700"
                        >
                          {formatDmy(spanYmd(pa.date, pb.date))}
                        </text>
                      </>
                    ) : null}
                  </g>
                );
              })()
            : null}
        </svg>
        <div className="absolute inset-[12%] rounded-full border border-border" />
        {hub ? (
          <button
            type="button"
            onClick={() => tap(hub.id)}
            className={`absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 ${
              picked.includes(hub.id)
                ? "border-primary bg-primary text-bg"
                : "border-border bg-surface text-fg"
            }`}
          >
            <span className="text-sm font-bold leading-none">{hub.initials}</span>
            <span className="mt-1 text-[10px] leading-none opacity-80">{formatUk(hub.date)}</span>
          </button>
        ) : null}
        {ring.map((p) => {
          const rad = (p.angle * Math.PI) / 180;
          const x = 50 + Math.cos(rad) * 38;
          const y = 50 + Math.sin(rad) * 38;
          const on = picked.includes(p.id);
          const until = daysUntilNext(focus, p.date, { excludeEndDate: excludeEnd });
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => tap(p.id)}
              style={{ left: `${x}%`, top: `${y}%` }}
              className={`absolute z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 ${
                on ? "border-primary bg-primary text-bg" : "border-border bg-surface text-fg"
              }`}
            >
              <span className="text-sm font-bold leading-none">{p.initials}</span>
              <span className="mt-1 text-[10px] leading-none opacity-80">{until}d</span>
            </button>
          );
        })}
      </div>

      {pair ? (
        <section className="mt-6 rounded-radius border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pair</p>
          <p className="mt-1 text-xl font-bold">
            {pair.a.initials} → {pair.b.initials}
          </p>
          <p className="mt-1 text-primary">{formatDmy(pair.span)}</p>
          <p className="text-sm text-muted">
            {pair.a.initials} {formatDob(pair.a.date)} → {pair.b.initials} {formatDob(pair.b.date)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {formatUk(pair.span.from)} to {formatUk(pair.span.to)} · {pair.span.totalDays} days
            (full dates, years included)
          </p>
          <div className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Days between</p>
            <p>From: {formatUk(pair.detail.from)}</p>
            <p>To: {formatUk(pair.detail.to)}</p>
            <p className="font-semibold text-fg">{formatResultLine(pair.detail)}</p>
            <p className="text-muted">Or {formatCalendarLine(pair.detail)}</p>
            <p className="text-muted">Or {formatMonthLine(pair.detail)}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Alternative time units
            </p>
            <p>• {pair.detail.totalDays.toLocaleString()} days</p>
            <p>• {formatWeekLine(pair.detail)}</p>
            <p>• {pair.detail.yearPct.toFixed(2)}% of a common year (365 days)</p>
            <p>• {(pair.detail.totalDays * 24).toLocaleString()} hours</p>
          </div>
          <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-muted">
            From the date at the top
          </p>
          <p className="text-sm">
            {pair.untilA}d until {pair.a.initials}'s next birthday
          </p>
          <p className="text-sm">
            {pair.untilB}d until {pair.b.initials}'s next birthday
          </p>
          <p className="mt-1 text-lg font-bold text-primary">
            Difference {pair.birthdayGap}d
          </p>
          <p className="text-xs text-muted">
            |{pair.untilA} − {pair.untilB}|. Changes if you change the date at the top.
          </p>
          <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Between the two birthdays (year ignored)
          </p>
          <p className="text-lg font-bold text-primary">{pair.anniversaryDays}d</p>
          <p className="text-xs text-muted">
            {formatDob(pair.a.date).slice(0, 5)} to {formatDob(pair.b.date).slice(0, 5)} each year. Does not
            use the date at the top.
          </p>
          {wordMath ? (
            <div className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Word to int</p>
              <p>
                {pair.a.initials} {pair.untilA}d ({formatDigitSum(pair.untilA)})=({wordMath.sumA.total}){" "}
                <span className="text-primary">{formatHits(wordMath.hitsA)}</span>
              </p>
              <p>
                {pair.b.initials} {pair.untilB}d ({formatDigitSum(pair.untilB)})=({wordMath.sumB.total}){" "}
                <span className="text-primary">{formatHits(wordMath.hitsB)}</span>
              </p>
              <p>
                ({wordMath.sumA.total})({wordMath.sumB.total}) = {wordMath.joined}{" "}
                <span className="text-primary">{formatHits(wordMath.hitsJoined)}</span>
              </p>
              <p>
                Difference {pair.birthdayGap} ={" "}
                <span className="text-primary">{formatHits(wordMath.hitsGap)}</span>
              </p>
              <p>
                {pair.anniversaryDays} (year ignored) ={" "}
                <span className="text-primary">{formatHits(wordMath.hitsAnn)}</span>
              </p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={savePair}
            className="mt-4 w-full rounded-radius bg-primary py-3 font-semibold text-bg"
          >
            Save to birthday-gap list
          </button>
        </section>
      ) : (
        <p className="mt-6 text-sm text-muted">Tap two dots. Long-press is not needed.</p>
      )}

      <section className="mt-6 rounded-radius border border-border bg-surface p-4">
        <h2 className="text-lg font-semibold">Add to timeline</h2>
        <p className="mt-1 text-sm text-muted">
          Saves a picture of the wheel as it looks right now. Category:{" "}
          <span className="text-fg">wheel of dates</span>. Extra photo is optional.
        </p>
        <button
          type="button"
          onClick={() => setUseToday(true)}
          className={`mt-3 mr-2 min-h-11 rounded-full border px-4 text-sm ${
            useToday ? "border-primary bg-primary text-bg" : "border-border text-muted"
          }`}
        >
          Current date
        </button>
        <button
          type="button"
          onClick={() => setUseToday(false)}
          className={`mt-3 min-h-11 rounded-full border px-4 text-sm ${
            !useToday ? "border-primary bg-primary text-bg" : "border-border text-muted"
          }`}
        >
          Chosen date
        </button>
        {!useToday ? (
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="mt-3 w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
          />
        ) : (
          <p className="mt-2 text-sm text-muted">Uses {formatUk(toIso(new Date()))}</p>
        )}
        <label className="mt-3 block text-sm text-muted">
          Extra image if something else is relevant (optional)
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onPickImage(e.target.files?.[0])}
            className="mt-1 block w-full text-sm text-fg"
          />
        </label>
        {eventImage ? (
          <img src={eventImage} alt="Extra" className="mt-3 max-h-40 rounded-radius border border-border" />
        ) : null}
        <p className="mt-2 text-xs text-muted">
          Wheel photo is taken from the circle above when you tap add.
        </p>
        <button
          type="button"
          onClick={addWheelEvent}
          className="mt-4 w-full rounded-radius bg-primary py-3 font-semibold text-bg"
        >
          Add wheel of dates event
        </button>
        {events.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {events.map((ev) => (
              <li key={ev.id} className="rounded-radius border border-border bg-bg p-3">
                <p className="text-xs uppercase tracking-wide text-muted">{ev.category}</p>
                <p className="font-semibold">{ev.title}</p>
                <p className="text-sm text-muted">
                  Event date {formatUk(ev.date)} · created {formatStamp(ev.createdAt)} ({ev.createdTime})
                </p>
                <p className="text-sm text-muted">{ev.note}</p>
                {ev.wheelImage ? (
                  <img src={ev.wheelImage} alt="Wheel" className="mt-2 max-h-48 w-full rounded-radius object-contain" />
                ) : null}
                {ev.extraImage ? (
                  <img src={ev.extraImage} alt="Extra" className="mt-2 max-h-32 rounded-radius" />
                ) : null}
                {editNoteId === ev.id ? (
                  <div className="mt-2">
                    <textarea
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      className="w-full rounded-radius border border-border bg-surface px-3 py-2 text-sm text-fg"
                      rows={3}
                    />
                    <button type="button" onClick={saveEditNote} className="mt-2 text-sm text-primary">
                      Save edit
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => startEditNote(ev)} className="mt-2 mr-3 text-sm text-muted">
                    Edit note
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpenEdits((id) => (id === ev.id ? null : ev.id))}
                  className="mt-2 mr-3 text-sm text-muted"
                >
                  Edits ({(ev.edits || []).length})
                </button>
                {openEdits === ev.id ? (
                  <ul className="mt-2 space-y-1 text-sm text-muted">
                    {(ev.edits || []).length === 0 ? (
                      <li>No edits yet.</li>
                    ) : (
                      ev.edits.map((ed, i) => (
                        <li key={`${ev.id}-ed-${i}`}>
                          {formatStamp(ed.at)} — {ed.what}
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
                <button type="button" onClick={() => deleteEvent(ev.id)} className="mt-2 text-sm text-muted">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">DoB lines</h2>
        <p className="mt-1 text-sm text-muted">
          Every pair on the wheel. DD/MM/YYYY and result as YYy MMm DDd.
        </p>
        <ul className="mt-3 space-y-2">
          {spokePairs.map((row) => (
            <li key={`${row.a.id}-${row.b.id}`} className="rounded-radius border border-border bg-surface px-3 py-2">
              <p className="font-semibold">
                {row.a.initials} {formatDob(row.a.date)} → {row.b.initials} {formatDob(row.b.date)}
              </p>
              <p className="text-primary">{formatDmy(row.span)}</p>
              <p className="text-xs text-muted">
                {daysBetweenAnniversaries(row.a.date, row.b.date)}d between birthdays (year ignored)
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">People</h2>
        <p className="mt-1 text-sm text-muted">
          On the wheel for dates. Add as a real-life friend even if they don’t use Timeline.
        </p>
        <ul className="mt-3 space-y-2">
          {people.map((p) => {
            const asFriend = findFriendByWheel(friends, p.id, p.initials);
            return (
              <li key={p.id} className="rounded-radius border border-border bg-surface px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => tap(p.id)} className="min-w-0 text-left">
                    <span className="font-semibold">{p.initials}</span>
                    <span className="ml-2 text-sm text-muted">{formatUk(p.date)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setHub(p.id)}
                    className="shrink-0 rounded-full border border-border px-3 py-1 text-xs text-muted"
                  >
                    {p.role === "hub" ? "Hub" : "Make hub"}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-3">
                  {asFriend ? (
                    <span className="text-xs text-muted">
                      {asFriend.onApp ? "Uses Timeline" : "Friend, not on the app"}
                    </span>
                  ) : (
                    <button type="button" onClick={() => addPersonFromWheel(p)} className="text-sm text-primary">
                      Add as person
                    </button>
                  )}
                  <button type="button" onClick={() => inviteFromWheel(p)} className="text-sm text-muted">
                    {copiedId === p.id ? "Invite copied" : "Invite to Timeline"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Word to int list</h2>
        <p className="mt-1 text-sm text-muted">
          A=1 … Z=26, letters only (sarah = 47). Local list for this preview — not the Expo Firestore copy.
        </p>
        <form onSubmit={addWord} className="mt-3 flex gap-2">
          <input
            value={newPhrase}
            onChange={(e) => setNewPhrase(e.target.value)}
            placeholder="Add a word or phrase"
            className="min-w-0 flex-1 rounded-radius border border-border bg-surface px-3 py-3 text-fg"
          />
          <button type="submit" className="rounded-radius bg-primary px-4 font-semibold text-bg">
            Add
          </button>
        </form>
        <button type="button" onClick={loadTestWords} className="mt-2 text-sm text-muted">
          Load test words
        </button>
        {words.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Empty — add words to see hits on a pair.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {words.map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between gap-2 rounded-radius border border-border bg-surface px-3 py-2"
              >
                <span>
                  <span className="font-semibold">{w.phrase}</span>
                  <span className="ml-2 text-sm text-muted">{w.ordinal}</span>
                </span>
                <button type="button" onClick={() => deleteWord(w.id)} className="text-sm text-muted">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Birthday-gap list</h2>
        <p className="mt-1 text-sm text-muted">
          Own list, like Word to int. Not added to the Timeline.
        </p>
        {savedPairs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing saved yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {savedPairs.map((row) => (
              <li key={row.id} className="rounded-radius border border-border bg-surface px-3 py-3">
                <p className="font-semibold">
                  {row.aInitials} → {row.bInitials}
                </p>
                <p className="text-primary">{row.birthdayGap}d between birthdays</p>
                <p className="text-xs text-muted">
                  {row.untilA}d to {row.aInitials} · {row.untilB}d to {row.bInitials} · from{" "}
                  {formatUk(row.focus)}
                  {row.excludeEnd ? " · end date excluded" : ""}
                </p>
                <p className="text-xs text-muted">Full dates: {row.fullSpan}</p>
                <button
                  type="button"
                  onClick={() => deletePair(row.id)}
                  className="mt-2 text-sm text-muted"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form onSubmit={addPerson} className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold">Add person</h2>
        <input
          value={initials}
          onChange={(e) => setInitials(e.target.value)}
          placeholder="Initials"
          className="w-full rounded-radius border border-border bg-surface px-3 py-3 text-fg"
        />
        <input
          type="date"
          value={birth}
          onChange={(e) => setBirth(e.target.value)}
          className="w-full rounded-radius border border-border bg-surface px-3 py-3 text-fg"
        />
        <button
          type="submit"
          className="w-full rounded-radius bg-primary py-3 font-semibold text-bg"
        >
          Add to circle
        </button>
        <button
          type="button"
          onClick={() => {
            setPeople(SAMPLE);
            setFocus("2026-04-16");
            setPicked([]);
          }}
          className="w-full py-2 text-sm text-muted"
        >
          Reset to sample wheel
        </button>
      </form>
    </main>
  );
}
