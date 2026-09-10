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

export const Route = createFileRoute("/sms")({ component: AddSmsPage });

const CATEGORIES = ["Personal", "Family", "Work", "Other"] as const;
type Category = (typeof CATEGORIES)[number];
type Direction = "received" | "sent";

type SmsEntry = {
  id: string;
  direction: Direction;
  contact: string;
  number: string;
  date: string;
  time: string;
  body: string;
  category: Category;
  createdAt: string;
  friendId: string | null;
  sharedWithFriend: boolean;
  location: string;
};

const STORE = "timeline-sms-mock-v1";

function AddSmsPage() {
  const [direction, setDirection] = useState<Direction>("received");
  const [contact, setContact] = useState("");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(() => toIso(new Date()));
  const [time, setTime] = useState(() => nowClock().slice(0, 5));
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<Category>("Personal");
  const [location, setLocation] = useState("");
  const [shareThis, setShareThis] = useState(false);
  const [saved, setSaved] = useState<SmsEntry[]>([]);
  const [friends, setFriends] = useState<TimelineFriend[]>(SAMPLE_FRIENDS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const list = JSON.parse(raw) as SmsEntry[];
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
    setShareThis(Boolean(matched?.autoShareSms));
  }, [matched?.id, matched?.autoShareSms]);

  function reset() {
    setDirection("received");
    setContact("");
    setNumber("");
    setDate(toIso(new Date()));
    setTime(nowClock().slice(0, 5));
    setBody("");
    setCategory("Personal");
    setLocation("");
    setShareThis(false);
  }

  function save(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() && !contact.trim()) return;
    const friend = findFriend(friends, contact, number);
    setSaved((list) => [
      {
        id: `${Date.now()}`,
        direction,
        contact: contact.trim() || "Unknown",
        number: number.trim(),
        date,
        time: time.length === 5 ? `${time}:00` : time,
        body: body.trim(),
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

  function friendFor(sms: SmsEntry) {
    return friends.find((f) => f.id === sms.friendId) ?? null;
  }

  function toggleShare(id: string) {
    setSaved((list) =>
      list.map((sms) =>
        sms.id === id && sms.friendId
          ? { ...sms, sharedWithFriend: !sms.sharedWithFriend }
          : sms,
      ),
    );
  }

  function toggleAutoShare(id: string) {
    setFriends((list) =>
      list.map((f) => (f.id === id ? { ...f, autoShareSms: !f.autoShareSms } : f)),
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-6">
      <Link to="/" className="text-sm font-semibold text-primary">
        ← Home
      </Link>
      <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-primary">Mock</p>
      <h1 className="text-3xl font-bold">Add SMS</h1>
      <p className="mt-2 text-sm text-muted">
        If the contact is already on Timeline, their profile is linked. Sharing is optional.
      </p>

      <form onSubmit={save} className="mt-6 space-y-4 rounded-radius border border-border bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Direction</p>
        <div className="flex gap-2">
          {(["received", "sent"] as const).map((d) => (
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
            placeholder={direction === "received" ? "Who sent it? Try KD" : "Who did you text? Try KD"}
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
                Share this SMS with {matched.name}
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

        <LocationPicker value={location} onChange={setLocation} />

        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Message
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Paste or type the text"
            className={`mt-1 w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg ${
              direction === "sent" ? "text-right" : "text-left"
            }`}
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
        <h2 className="text-lg font-semibold">Logged texts</h2>
        {saved.length === 0 ? (
          <p className="mt-3 text-sm text-muted">None yet. Try contact KD or number 07700900001.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {saved.map((sms) => {
              const friend = friendFor(sms);
              return (
                <li key={sms.id} className="rounded-radius border border-border bg-surface p-4">
                  <p className="text-xs uppercase tracking-wide text-muted">
                    {sms.direction} · {sms.category}
                  </p>
                  <p className="font-semibold">{sms.contact}</p>
                  {sms.number ? <p className="text-sm text-muted">{sms.number}</p> : null}
                  <p className="text-sm text-muted">
                    {formatUk(sms.date)} {sms.time.slice(0, 5)}
                  </p>
                  {sms.location ? <p className="text-sm text-muted">Location · {sms.location}</p> : null}
                  {sms.body ? (
                    <p
                      className={`mt-2 rounded-radius px-3 py-2 text-sm ${
                        sms.direction === "sent" ? "bg-primary text-bg" : "bg-bg text-fg"
                      }`}
                    >
                      {sms.body}
                    </p>
                  ) : null}
                  {friend ? (
                    <>
                      <FriendBadge friend={friend} shared={sms.sharedWithFriend} />
                      <button
                        type="button"
                        onClick={() => toggleShare(sms.id)}
                        className="mt-2 text-sm text-primary"
                      >
                        {sms.sharedWithFriend ? "Stop sharing with them" : `Share with ${friend.name}`}
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setSaved((list) => list.filter((x) => x.id !== sms.id))}
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
        <h2 className="text-lg font-semibold">Auto-share SMS</h2>
        <p className="mt-1 text-sm text-muted">
          The Timeline friends listed below have been set to always Auto-Share SMS (when Auto can be seen
          on the right). Each SMS still has the option to not be shared individually.
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
                    f.autoShareSms ? "border-primary bg-primary text-bg" : "border-border text-muted"
                  }`}
                >
                  {f.autoShareSms ? "Auto" : "Off"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
