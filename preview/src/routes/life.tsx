import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { LocationPicker } from "@/components/location-picker";
import { logChecksum, sha256Text } from "@/lib/checksum";
import { daysUntilNext, formatUk, nowStamp, toIso } from "@/lib/date-span";

export const Route = createFileRoute("/life")({ component: LifeEventsPage });

const KINDS = [
  "Birthday",
  "House move",
  "Wedding",
  "Graduation",
  "New job",
  "New baby",
  "Other",
] as const;

type Kind = (typeof KINDS)[number];

type LifeEvent = {
  id: string;
  kind: Kind;
  title: string;
  date: string;
  who: string;
  place: string;
  note: string;
  extraImage: string;
  createdAt: string;
  onTimeline: boolean;
  checksum: string;
  edits: { at: string; what: string; sha256: string }[];
};

const KIND_HINT: Record<Kind, string> = {
  Birthday: "Date of birth. Coming-up uses the next birthday from today.",
  "House move": "Day you moved (or will move). Place is the address or area.",
  Wedding: "Ceremony or the day that mattered.",
  Graduation: "Ceremony or result day.",
  "New job": "Start date, or the day you accepted.",
  "New baby": "Birth date, or the day you want on the timeline.",
  Other: "Any other life marker. Title says what it is.",
};

function KindChips({
  value,
  onChange,
}: {
  value: Kind;
  onChange: (k: Kind) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {KINDS.map((k) => {
        const on = value === k;
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(k)}
            className={`min-h-11 rounded-full border px-3 text-sm font-semibold ${
              on ? "border-primary bg-primary text-bg" : "border-border bg-bg text-muted"
            }`}
          >
            {k}
          </button>
        );
      })}
    </div>
  );
}

const STORE = "timeline-life-events-v1";

function LifeEventsPage() {
  const [events, setEvents] = useState<LifeEvent[]>([]);
  const [ready, setReady] = useState(false);
  const [kind, setKind] = useState<Kind>("Birthday");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => toIso(new Date()));
  const [who, setWho] = useState("");
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  const [extraImage, setExtraImage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const list = JSON.parse(raw) as LifeEvent[];
        if (Array.isArray(list)) {
          setEvents(
            list.map((ev) => ({
              ...ev,
              checksum: ev.checksum || "",
              edits: ev.edits || [],
            })),
          );
        }
      }
    } catch {
      /* keep empty */
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORE, JSON.stringify(events));
    } catch {
      /* ignore quota */
    }
  }, [events, ready]);

  const sorted = useMemo(
    () => [...events].sort((a, b) => a.date.localeCompare(b.date)),
    [events],
  );

  const upcoming = useMemo(() => {
    const today = toIso(new Date());
    return sorted
      .map((ev) => ({
        ...ev,
        until: ev.kind === "Birthday" ? daysUntilNext(today, ev.date) : null,
      }))
      .filter((ev) => ev.kind === "Birthday" || ev.date >= today)
      .sort((a, b) => {
        const au = a.until ?? 9999;
        const bu = b.until ?? 9999;
        if (a.kind === "Birthday" && b.kind === "Birthday") return au - bu;
        return a.date.localeCompare(b.date);
      })
      .slice(0, 4);
  }, [sorted]);

  function resetForm() {
    setKind("Birthday");
    setTitle("");
    setDate(toIso(new Date()));
    setWho("");
    setPlace("");
    setNote("");
    setExtraImage("");
    setEditingId(null);
  }

  function onPickImage(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setExtraImage(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const label = title.trim() || kind;
    if (!date) return;
    const checksum = await sha256Text(JSON.stringify({ kind, title: label, date, who, place, note }));
    const stamp = nowStamp();
    if (editingId) {
      setEvents((list) =>
        list.map((ev) =>
          ev.id !== editingId
            ? ev
            : {
                ...ev,
                kind,
                title: label,
                date,
                who: who.trim(),
                place: place.trim(),
                note: note.trim(),
                extraImage,
                checksum,
                edits: [...(ev.edits || []), { at: stamp, what: "edited", sha256: checksum }],
              },
        ),
      );
      logChecksum({
        relatedKind: "life",
        relatedId: editingId,
        href: "/life",
        label,
        sha256: checksum,
        action: "edited",
        bytes: 0,
        durationSec: 0,
        clipStart: 0,
        clipEnd: 0,
      });
    } else {
      const id = `${Date.now()}`;
      setEvents((list) => [
        {
          id,
          kind,
          title: label,
          date,
          who: who.trim(),
          place: place.trim(),
          note: note.trim(),
          extraImage,
          createdAt: stamp,
          onTimeline: false,
          checksum,
          edits: [{ at: stamp, what: "created", sha256: checksum }],
        },
        ...list,
      ]);
      logChecksum({
        relatedKind: "life",
        relatedId: id,
        href: "/life",
        label,
        sha256: checksum,
        action: "created",
        bytes: 0,
        durationSec: 0,
        clipStart: 0,
        clipEnd: 0,
      });
    }
    resetForm();
  }

  function startEdit(ev: LifeEvent) {
    setEditingId(ev.id);
    setKind(ev.kind);
    setTitle(ev.title);
    setDate(ev.date);
    setWho(ev.who);
    setPlace(ev.place);
    setNote(ev.note);
    setExtraImage(ev.extraImage);
  }

  function addToTimeline(id: string) {
    setEvents((list) => list.map((ev) => (ev.id === id ? { ...ev, onTimeline: true } : ev)));
  }

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-6">
      <Link to="/" className="text-sm font-semibold text-primary">
        ← Home
      </Link>
      <h1 className="mt-3 text-3xl font-bold">Life events</h1>
      <p className="mt-2 text-sm text-muted">
        Birthdays, house moves, weddings and the rest. Stored on this device for the preview.
      </p>

      {upcoming.length > 0 ? (
        <section className="mt-6 rounded-radius border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Coming up</h2>
          <ul className="mt-2 space-y-2">
            {upcoming.map((ev) => (
              <li key={ev.id}>
                <p className="font-semibold">{ev.title}</p>
                <p className="text-sm text-muted">
                  {ev.kind}
                  {ev.until != null ? ` · ${ev.until === 0 ? "today" : `${ev.until}d until birthday`}` : ` · ${formatUk(ev.date)}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <form onSubmit={save} className="mt-6 space-y-3 rounded-radius border border-border bg-surface p-4">
        <h2 className="text-lg font-semibold">{editingId ? "Edit event" : "Add life event"}</h2>
        <p className="text-sm font-semibold text-primary">Type: {kind}</p>
        <KindChips value={kind} onChange={setKind} />
        <p className="text-sm text-muted">{KIND_HINT[kind]}</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "Birthday" ? "Whose birthday?" : "Title"}
          className="w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
        />
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
          />
        </label>
        <input
          value={who}
          onChange={(e) => setWho(e.target.value)}
          placeholder="People (optional)"
          className="w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
        />
        <LocationPicker value={place} onChange={setPlace} />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          rows={3}
          className="w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
        />
        <label className="block text-sm text-muted">
          Photo (optional)
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onPickImage(e.target.files?.[0])}
            className="mt-1 block w-full text-sm text-fg"
          />
        </label>
        {extraImage ? (
          <img src={extraImage} alt="" className="max-h-40 rounded-radius border border-border" />
        ) : null}
        <button type="submit" className="w-full rounded-radius bg-primary py-3 font-semibold text-bg">
          {editingId ? "Save changes" : "Save life event"}
        </button>
        {editingId ? (
          <button type="button" onClick={resetForm} className="w-full py-2 text-sm text-muted">
            Cancel edit
          </button>
        ) : null}
      </form>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Saved</h2>
        {sorted.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing yet. Add a birthday or a house move above.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {sorted.map((ev) => (
              <li key={ev.id} className="rounded-radius border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-muted">{ev.kind}</p>
                <p className="text-lg font-semibold">{ev.title}</p>
                <p className="text-sm text-muted">{formatUk(ev.date)}</p>
                {ev.who ? <p className="text-sm text-muted">{ev.who}</p> : null}
                {ev.place ? <p className="text-sm text-muted">Location · {ev.place}</p> : null}
                {ev.note ? <p className="mt-1 text-sm">{ev.note}</p> : null}
                {ev.checksum ? (
                  <p className="mt-2 break-all font-mono text-xs text-muted">sha {ev.checksum.slice(0, 12)}…</p>
                ) : null}
                {(ev.edits || []).length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-muted">
                    {ev.edits.map((ed, i) => (
                      <li key={`${ev.id}-ed-${i}`}>
                        {ed.at} — {ed.what} — {ed.sha256.slice(0, 8)}…
                      </li>
                    ))}
                  </ul>
                ) : null}
                {ev.extraImage ? (
                  <img src={ev.extraImage} alt="" className="mt-2 max-h-40 rounded-radius" />
                ) : null}
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Change type</p>
                <div className="mt-2">
                  <KindChips
                    value={ev.kind}
                    onChange={(k) =>
                      setEvents((list) => list.map((x) => (x.id === ev.id ? { ...x, kind: k } : x)))
                    }
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" onClick={() => startEdit(ev)} className="text-sm text-muted">
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => addToTimeline(ev.id)}
                    className="text-sm text-muted"
                  >
                    {ev.onTimeline ? "On timeline" : "Add to timeline"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEvents((list) => list.filter((x) => x.id !== ev.id))}
                    className="text-sm text-muted"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
