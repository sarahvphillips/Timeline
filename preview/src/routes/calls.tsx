import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FriendBadge } from "@/components/friend-badge";
import { LocationPicker } from "@/components/location-picker";
import { formatUk, nowClock, nowStamp, toIso } from "@/lib/date-span";
import {
  findFriend,
  FRIEND_STORE,
  mergeFriends,
  SAMPLE_FRIENDS,
  type TimelineFriend,
} from "@/lib/friends";

export const Route = createFileRoute("/calls")({ component: AddCallPage });

const CATEGORIES = ["Personal", "Family", "Work", "Other"] as const;
type Category = (typeof CATEGORIES)[number];
type Direction = "incoming" | "outgoing" | "missed";

type CallEntry = {
  id: string;
  direction: Direction;
  contact: string;
  number: string;
  date: string;
  time: string;
  minutes: string;
  seconds: string;
  note: string;
  category: Category;
  createdAt: string;
  friendId: string | null;
  sharedWithFriend: boolean;
  location: string;
};

const STORE = "timeline-calls-mock-v1";

function AddCallPage() {
  const [direction, setDirection] = useState<Direction>("incoming");
  const [contact, setContact] = useState("");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(() => toIso(new Date()));
  const [time, setTime] = useState(() => nowClock().slice(0, 5));
  const [minutes, setMinutes] = useState("0");
  const [seconds, setSeconds] = useState("0");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<Category>("Personal");
  const [location, setLocation] = useState("");
  const [shareThis, setShareThis] = useState(false);
  const [saved, setSaved] = useState<CallEntry[]>([]);
  const [friends, setFriends] = useState<TimelineFriend[]>(SAMPLE_FRIENDS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const list = JSON.parse(raw) as CallEntry[];
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
      localStorage.setItem(FRIEND_STORE, JSON.stringify(friends));
    } catch {
      /* ignore quota */
    }
  }, [saved, friends, ready]);

  const matched = useMemo(
    () => findFriend(friends, contact, number),
    [friends, contact, number],
  );

  useEffect(() => {
    setShareThis(Boolean(matched?.autoShareCalls));
  }, [matched?.id, matched?.autoShareCalls]);

  function reset() {
    setDirection("incoming");
    setContact("");
    setNumber("");
    setDate(toIso(new Date()));
    setTime(nowClock().slice(0, 5));
    setMinutes("0");
    setSeconds("0");
    setNote("");
    setCategory("Personal");
    setLocation("");
    setShareThis(false);
  }

  function save(e: FormEvent) {
    e.preventDefault();
    if (!contact.trim() && !number.trim() && !note.trim()) return;
    const friend = findFriend(friends, contact, number);
    setSaved((list) => [
      {
        id: `${Date.now()}`,
        direction,
        contact: contact.trim() || "Unknown",
        number: number.trim(),
        date,
        time: time.length === 5 ? `${time}:00` : time,
        minutes: minutes || "0",
        seconds: seconds || "0",
        note: note.trim(),
        category,
        location,
        createdAt: nowStamp(),
        friendId: friend?.id ?? null,
        sharedWithFriend: Boolean(friend && shareThis),
      },
      ...list,
    ]);
    reset();
  }

  function friendFor(call: CallEntry) {
    return friends.find((f) => f.id === call.friendId) ?? null;
  }

  function toggleShare(id: string) {
    setSaved((list) =>
      list.map((call) =>
        call.id === id && call.friendId
          ? { ...call, sharedWithFriend: !call.sharedWithFriend }
          : call,
      ),
    );
  }

  function toggleAutoShare(id: string) {
    setFriends((list) =>
      list.map((f) => (f.id === id ? { ...f, autoShareCalls: !f.autoShareCalls } : f)),
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-6">
      <Link to="/" className="text-sm font-semibold text-primary">
        ← Home
      </Link>
      <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-primary">Mock</p>
      <h1 className="text-3xl font-bold">Add phone call</h1>
      <p className="mt-2 text-sm text-muted">
        Log a call as a timeline event. Same people list as SMS. Not the phone log yet.
      </p>

      <form onSubmit={save} className="mt-6 space-y-4 rounded-radius border border-border bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Direction</p>
        <div className="flex flex-wrap gap-2">
          {(["incoming", "outgoing", "missed"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={direction === d}
              onClick={() => setDirection(d)}
              className={`min-h-11 flex-1 rounded-full border px-3 text-sm font-semibold capitalize ${
                direction === d ? "border-primary bg-primary text-bg" : "border-border bg-bg text-muted"
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Contact
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Who was the call with? Try KD"
            className="mt-1 w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
          />
        </label>

        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Number
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            inputMode="tel"
            placeholder="07700900001 for KD"
            className="mt-1 w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
          />
        </label>

        {matched ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Known on Timeline</p>
            <FriendBadge friend={matched} shared={shareThis} />
            <button
              type="button"
              onClick={() => setShareThis((v) => !v)}
              className="mt-3 flex min-h-11 w-full items-center gap-3 text-left"
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded border ${
                  shareThis ? "border-primary bg-primary" : "border-border bg-bg"
                }`}
              >
                {shareThis ? <span className="h-2.5 w-2.5 rounded-sm bg-bg" /> : null}
              </span>
              <span className="text-sm">
                Share this call with {matched.name}
                <span className="mt-0.5 block text-xs text-muted">
                  Off still keeps them linked on your copy only.
                </span>
              </span>
            </button>
          </div>
        ) : contact.trim() || number.trim() ? (
          <p className="text-sm text-muted">Not on your Timeline friends list yet.</p>
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
            Time
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="mt-1 w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
            />
          </label>
        </div>

        {direction !== "missed" ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
              Minutes
              <input
                inputMode="numeric"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))}
                className="mt-1 w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
              Seconds
              <input
                inputMode="numeric"
                value={seconds}
                onChange={(e) => setSeconds(e.target.value.replace(/\D/g, "").slice(0, 2))}
                className="mt-1 w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
              />
            </label>
          </div>
        ) : (
          <p className="text-sm text-muted">Missed calls have no duration.</p>
        )}

        <LocationPicker value={location} onChange={setLocation} />

        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Notes
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="What the call was about (optional)"
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
        <h2 className="text-lg font-semibold">Logged calls</h2>
        {saved.length === 0 ? (
          <p className="mt-3 text-sm text-muted">None yet. Try contact KD or number 07700900001.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {saved.map((call) => {
              const friend = friendFor(call);
              const dur =
                call.direction === "missed"
                  ? "Missed"
                  : `${call.minutes || "0"}m ${call.seconds || "0"}s`;
              return (
                <li key={call.id} className="rounded-radius border border-border bg-surface p-4">
                  <p className="text-xs uppercase tracking-wide text-muted">
                    {call.direction} · {call.category} · {dur}
                  </p>
                  <p className="font-semibold">{call.contact}</p>
                  {call.number ? <p className="text-sm text-muted">{call.number}</p> : null}
                  <p className="text-sm text-muted">
                    {formatUk(call.date)} {call.time.slice(0, 5)}
                  </p>
                  {call.location ? <p className="text-sm text-muted">Location · {call.location}</p> : null}
                  {call.note ? <p className="mt-2 text-sm">{call.note}</p> : null}
                  {friend ? (
                    <>
                      <FriendBadge friend={friend} shared={call.sharedWithFriend} />
                      <button
                        type="button"
                        onClick={() => toggleShare(call.id)}
                        className="mt-2 text-sm text-primary"
                      >
                        {call.sharedWithFriend ? "Stop sharing with them" : `Share with ${friend.name}`}
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setSaved((list) => list.filter((x) => x.id !== call.id))}
                    className="mt-3 block text-sm text-muted"
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8 rounded-radius border border-border bg-surface p-4">
        <h2 className="text-lg font-semibold">Auto-share calls</h2>
        <p className="mt-1 text-sm text-muted">
          The Timeline friends listed below have been set to always Auto-Share calls (when Auto can be
          seen on the right). Each call still has the option to not be shared individually.
        </p>
        <ul className="mt-4 space-y-2">
          {friends.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => toggleAutoShare(f.id)}
                className="flex min-h-11 w-full items-center gap-3 text-left"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-bg">
                  {f.initial}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{f.name}</span>
                  <span className="block text-xs text-muted">{f.phone || "No number yet"}</span>
                </span>
                <span
                  className={`rounded-full border px-3 py-1 text-xs ${
                    f.autoShareCalls ? "border-primary bg-primary text-bg" : "border-border text-muted"
                  }`}
                >
                  {f.autoShareCalls ? "Auto" : "Off"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
