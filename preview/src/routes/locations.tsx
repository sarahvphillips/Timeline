import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { FriendBadge } from "@/components/friend-badge";
import { formatUk, nowClock, nowStamp, toIso } from "@/lib/date-span";
import {
  FRIEND_STORE,
  mergeFriends,
  SAMPLE_FRIENDS,
  type TimelineFriend,
} from "@/lib/friends";

export const Route = createFileRoute("/locations")({ component: AddLocationPage });

const CATEGORIES = ["Travel", "Personal", "Family", "Work", "Other"] as const;
type Category = (typeof CATEGORIES)[number];

type Suggestion = { name: string; address: string };

const SUGGESTIONS: Suggestion[] = [
  { name: "Home", address: "Saved place" },
  { name: "Internet", address: "Not a physical place" },
  { name: "Local high street", address: "Town centre" },
  { name: "Railway station", address: "Station approach" },
  { name: "Supermarket", address: "Retail park" },
];

type Visit = {
  id: string;
  name: string;
  address: string;
  date: string;
  arrived: string;
  left: string;
  note: string;
  category: Category;
  fromGoogle: boolean;
  withIds: string[];
  sharedWithThem: boolean;
  createdAt: string;
};

const STORE = "timeline-locations-mock-v1";

function AddLocationPage() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [date, setDate] = useState(() => toIso(new Date()));
  const [arrived, setArrived] = useState(() => nowClock().slice(0, 5));
  const [left, setLeft] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<Category>("Travel");
  const [fromGoogle, setFromGoogle] = useState(false);
  const [withIds, setWithIds] = useState<string[]>([]);
  const [shareThis, setShareThis] = useState(false);
  const [saved, setSaved] = useState<Visit[]>([]);
  const [friends, setFriends] = useState<TimelineFriend[]>(SAMPLE_FRIENDS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const list = JSON.parse(raw) as Visit[];
        if (Array.isArray(list)) setSaved(list);
      }
      const fr = localStorage.getItem(FRIEND_STORE);
      if (fr) {
        const list = JSON.parse(fr) as TimelineFriend[];
        if (Array.isArray(list) && list.length) setFriends(mergeFriends(list));
      }
    } catch {
      /* ignore */
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORE, JSON.stringify(saved));
    } catch {
      /* ignore */
    }
  }, [saved, ready]);

  function pickSuggestion(s: Suggestion) {
    setName(s.name);
    setAddress(s.address);
    setFromGoogle(true);
  }

  function toggleWith(id: string) {
    setWithIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function reset() {
    setName("");
    setAddress("");
    setDate(toIso(new Date()));
    setArrived(nowClock().slice(0, 5));
    setLeft("");
    setNote("");
    setCategory("Travel");
    setFromGoogle(false);
    setWithIds([]);
    setShareThis(false);
  }

  function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaved((list) => [
      {
        id: `${Date.now()}`,
        name: name.trim(),
        address: address.trim(),
        date,
        arrived,
        left,
        note: note.trim(),
        category,
        fromGoogle,
        withIds,
        sharedWithThem: withIds.length > 0 && shareThis,
        createdAt: nowStamp(),
      },
      ...list,
    ]);
    reset();
  }

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-6">
      <Link to="/" className="text-sm font-semibold text-primary">
        ← Home
      </Link>
      <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-primary">Mock</p>
      <h1 className="text-3xl font-bold">Add location</h1>
      <p className="mt-2 text-sm text-muted">
        Places you visited. Tap a Google-style suggestion or type one. Later this can pull from Google
        Maps and Location History (sign-in + a Maps key). You can still tag an event as Home, Internet,
        or a named high-street place without any Google account.
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">From Google (sample)</h2>
        <ul className="mt-2 space-y-2">
          {SUGGESTIONS.map((s) => (
            <li key={s.name}>
              <button
                type="button"
                onClick={() => pickSuggestion(s)}
                className="flex min-h-11 w-full items-center justify-between rounded-radius border border-border bg-surface px-3 py-2 text-left"
              >
                <span>
                  <span className="block font-semibold">{s.name}</span>
                  <span className="block text-xs text-muted">{s.address}</span>
                </span>
                <span className="text-xs text-primary">Use</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <form onSubmit={save} className="mt-6 space-y-4 rounded-radius border border-border bg-surface p-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Place
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Place name"
            className="mt-1 w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Address or area
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Optional"
            className="mt-1 w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
          />
        </label>
        {fromGoogle ? (
          <p className="text-xs font-semibold text-primary">Marked as from Google</p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
            Arrived
            <input
              type="time"
              value={arrived}
              onChange={(e) => setArrived(e.target.value)}
              className="mt-1 w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
            />
          </label>
        </div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Left (optional)
          <input
            type="time"
            value={left}
            onChange={(e) => setLeft(e.target.value)}
            className="mt-1 w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
          />
        </label>

        <p className="text-xs font-semibold uppercase tracking-wide text-muted">With (People)</p>
        <div className="flex flex-wrap gap-2">
          {friends.map((f) => {
            const on = withIds.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleWith(f.id)}
                className={`min-h-11 rounded-full border px-3 text-sm font-semibold ${
                  on ? "border-primary bg-primary text-bg" : "border-border bg-bg text-muted"
                }`}
              >
                {f.name}
              </button>
            );
          })}
        </div>
        {withIds.length > 0 ? (
          <button
            type="button"
            onClick={() => setShareThis((v) => !v)}
            className="flex min-h-11 w-full items-center gap-3 text-left"
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded border ${
                shareThis ? "border-primary bg-primary" : "border-border bg-bg"
              }`}
            >
              {shareThis ? <span className="h-2.5 w-2.5 rounded-sm bg-bg" /> : null}
            </span>
            <span className="text-sm">
              Share this visit with tagged people
              <span className="mt-0.5 block text-xs text-muted">
                Off still shows them as related on your copy only.
              </span>
            </span>
          </button>
        ) : null}

        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Note
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Optional"
            className="mt-1 w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
          />
        </label>

        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Category</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={`min-h-11 rounded-full border px-3 text-sm font-semibold ${
                category === c ? "border-primary bg-primary text-bg" : "border-border bg-bg text-muted"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <button type="submit" className="w-full rounded-radius bg-primary py-3 font-semibold text-bg">
          Save to timeline
        </button>
      </form>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Logged places</h2>
        {saved.length === 0 ? (
          <p className="mt-3 text-sm text-muted">None yet. Tap a sample Google place or type one.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {saved.map((v) => {
              const tagged = friends.filter((f) => v.withIds.includes(f.id));
              return (
                <li key={v.id} className="rounded-radius border border-border bg-surface p-4">
                  <p className="text-xs uppercase tracking-wide text-muted">
                    {v.category}
                    {v.fromGoogle ? " · from Google" : ""}
                  </p>
                  <p className="text-lg font-semibold">{v.name}</p>
                  {v.address ? <p className="text-sm text-muted">{v.address}</p> : null}
                  <p className="text-sm text-muted">
                    {formatUk(v.date)} {v.arrived}
                    {v.left ? ` – ${v.left}` : ""}
                  </p>
                  {v.note ? <p className="mt-1 text-sm">{v.note}</p> : null}
                  {tagged.map((f) => (
                    <FriendBadge key={f.id} friend={f} shared={v.sharedWithThem} />
                  ))}
                  <button
                    type="button"
                    onClick={() => setSaved((list) => list.filter((x) => x.id !== v.id))}
                    className="mt-3 text-sm text-muted"
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
