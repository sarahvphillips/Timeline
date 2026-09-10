import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { daysUntilNext, formatUk, toIso } from "@/lib/date-span";
import {
  FRIEND_STORE,
  initialFromName,
  inviteText,
  mergeFriends,
  SAMPLE_FRIENDS,
  type TimelineFriend,
} from "@/lib/friends";

export const Route = createFileRoute("/people")({ component: PeoplePage });

function PeoplePage() {
  const [friends, setFriends] = useState<TimelineFriend[]>(SAMPLE_FRIENDS);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [note, setNote] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FRIEND_STORE);
      if (raw) {
        const list = JSON.parse(raw) as TimelineFriend[];
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
      localStorage.setItem(FRIEND_STORE, JSON.stringify(friends));
    } catch {
      /* ignore */
    }
  }, [friends, ready]);

  function reset() {
    setName("");
    setPhone("");
    setEmail("");
    setBirthday("");
    setNote("");
    setEditingId(null);
  }

  function save(e: FormEvent) {
    e.preventDefault();
    const label = name.trim();
    if (!label) return;
    if (editingId) {
      setFriends((list) =>
        list.map((f) =>
          f.id !== editingId
            ? f
            : {
                ...f,
                name: label,
                phone: phone.trim(),
                email: email.trim(),
                birthday,
                note: note.trim(),
                initial: initialFromName(label),
              },
        ),
      );
    } else {
      const id = `p-${Date.now()}`;
      setFriends((list) => [
        {
          id,
          name: label,
          phone: phone.trim(),
          email: email.trim(),
          birthday,
          note: note.trim(),
          initial: initialFromName(label),
          autoShareSms: false,
          autoShareCalls: false,
          onApp: false,
          inviteSent: false,
          fromWheelId: "",
        },
        ...list,
      ]);
    }
    reset();
  }

  async function invite(f: TimelineFriend) {
    const text = inviteText(f);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* still mark sent */
    }
    setFriends((list) => list.map((x) => (x.id === f.id ? { ...x, inviteSent: true } : x)));
    setCopiedId(f.id);
  }

  const today = toIso(new Date());

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-6">
      <Link to="/" className="text-sm font-semibold text-primary">
        ← Home
      </Link>
      <h1 className="mt-3 text-3xl font-bold">People</h1>
      <p className="mt-2 text-sm text-muted">
        Real-life friends, even if they don’t use Timeline. They can sit under events, SMS, and the date
        circle. Invite is optional.
      </p>

      <form onSubmit={save} className="mt-6 space-y-3 rounded-radius border border-border bg-surface p-4">
        <h2 className="text-lg font-semibold">{editingId ? "Edit person" : "Add person"}</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name or initials"
          className="w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          placeholder="Phone (optional)"
          className="w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          inputMode="email"
          placeholder="Email (optional)"
          className="w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
        />
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Birthday
          <input
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            className="mt-1 w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
          />
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Note (optional)"
          className="w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
        />
        <button type="submit" className="w-full rounded-radius bg-primary py-3 font-semibold text-bg">
          {editingId ? "Save person" : "Add person"}
        </button>
        {editingId ? (
          <button type="button" onClick={reset} className="w-full py-2 text-sm text-muted">
            Cancel
          </button>
        ) : null}
      </form>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Your people</h2>
        <ul className="mt-3 space-y-3">
          {friends.map((f) => (
            <li key={f.id} className="rounded-radius border border-border bg-surface p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-bg">
                  {f.initial}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">{f.name}</p>
                  <p className="text-xs text-muted">
                    {f.onApp ? "Uses Timeline" : "Not on the app yet"}
                    {f.fromWheelId ? " · on date circle" : ""}
                    {f.inviteSent ? " · invite copied" : ""}
                  </p>
                </div>
              </div>
              {f.phone ? <p className="mt-2 text-sm text-muted">{f.phone}</p> : null}
              {f.email ? <p className="text-sm text-muted">{f.email}</p> : null}
              {f.birthday ? (
                <p className="text-sm text-muted">
                  Birthday {formatUk(f.birthday)} · {daysUntilNext(today, f.birthday)}d until next
                </p>
              ) : null}
              {f.note ? <p className="mt-1 text-sm">{f.note}</p> : null}
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(f.id);
                    setName(f.name);
                    setPhone(f.phone);
                    setEmail(f.email);
                    setBirthday(f.birthday);
                    setNote(f.note);
                  }}
                  className="text-sm text-muted"
                >
                  Edit
                </button>
                <button type="button" onClick={() => invite(f)} className="text-sm text-primary">
                  {copiedId === f.id ? "Invite copied" : "Invite to Timeline"}
                </button>
                <button
                  type="button"
                  onClick={() => setFriends((list) => list.filter((x) => x.id !== f.id))}
                  className="text-sm text-muted"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
