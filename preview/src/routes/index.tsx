import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { loadChecksums, shortHash, type ChecksumRow } from "@/lib/checksum";
import { OWNER_EMAIL, setSignedIn, type FeatureKey } from "@/lib/admin";
import { useAdmin } from "@/lib/use-admin";

export const Route = createFileRoute("/")({ component: HomePage });

const OPTIONS: {
  to: "/circle" | "/life" | "/people" | "/sms" | "/calls" | "/locations" | "/purchases" | "/banking" | "/checksums" | "/mockups";
  title: string;
  blurb: string;
  primary?: boolean;
  feature?: FeatureKey;
}[] = [
  {
    to: "/circle",
    title: "Date circle",
    blurb: "People on a wheel. Days until birthdays, DoB lines, word to int.",
    primary: true,
  },
  {
    to: "/life",
    title: "Life events",
    blurb: "Birthdays, house moves, weddings, jobs — dated markers on your timeline.",
  },
  {
    to: "/people",
    title: "People",
    blurb: "Real-life friends, even if they don’t use Timeline. Invite optional.",
  },
  {
    to: "/sms",
    title: "Add SMS",
    blurb: "Log a received or sent text as a timeline event. Mock — not the phone inbox.",
  },
  {
    to: "/calls",
    title: "Add phone call",
    blurb: "Incoming, outgoing, or missed. Same people and share options as SMS.",
  },
  {
    to: "/locations",
    title: "Add location",
    blurb: "Google-style places visited. Tag people. Mock — not Location History yet.",
  },
  {
    to: "/purchases",
    title: "Add purchase",
    blurb: "Manual, email, Amazon, Uber Eats, notification screenshot, bank photo.",
    feature: "purchases",
  },
  {
    to: "/banking",
    title: "Banking",
    blurb: "Direct debits, rent, credit cards, large spend, a simple graph. Own event type.",
    feature: "banking",
  },
  {
    to: "/checksums",
    title: "App checksums",
    blurb: "SHA-256 of events and original videos. Edits keep an older row.",
    feature: "checksums",
  },
  {
    to: "/mockups",
    title: "Design sketches",
    blurb: "Add food, cupboard, Gmail, share, month poems.",
  },
];

function HomePage() {
  const [rows, setRows] = useState<ChecksumRow[]>([]);
  const { staff, can, role, state, blocked, commit } = useAdmin();

  useEffect(() => {
    setRows(loadChecksums().slice(0, 6));
  }, []);

  const visible = OPTIONS.filter((item) => !item.feature || can(item.feature));
  const showChecksums = can("checksums");

  if (blocked) {
    return (
      <main className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-8">
        <h1 className="text-3xl font-bold">Timeline</h1>
        <p className="mt-3 text-sm text-muted">
          This email is blocked. Only Sarah can unblock it from Admin.
        </p>
        <button
          type="button"
          className="mt-6 min-h-11 rounded-radius bg-primary px-4 text-sm font-semibold text-bg"
          onClick={() => commit(setSignedIn(state, OWNER_EMAIL))}
        >
          View as owner
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-8">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">Timeline</p>
      <h1 className="mt-1 text-3xl font-bold">Home</h1>
      <p className="mt-2 text-sm text-muted">
        {state.signedInEmail} · {role}
      </p>

      <ul className="mt-8 space-y-3">
        {staff ? (
          <li>
            <Link
              to="/admin"
              className="flex items-start gap-3 rounded-radius border border-border bg-surface px-4 py-4 text-fg"
            >
              <Shield className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
              <span>
                <p className="text-lg font-semibold">Admin</p>
                <p className="mt-1 text-sm text-muted">
                  Grant admins, lock features, invite codes, block list. Only you pick who is staff.
                </p>
              </span>
            </Link>
          </li>
        ) : null}
        {visible.map((item) => (
          <li key={item.title}>
            <Link
              to={item.to}
              className={`block rounded-radius border px-4 py-4 ${
                item.primary
                  ? "border-primary bg-primary text-bg"
                  : "border-border bg-surface text-fg"
              }`}
            >
              <p className="text-lg font-semibold">{item.title}</p>
              <p className={`mt-1 text-sm ${item.primary ? "text-bg/80" : "text-muted"}`}>
                {item.blurb}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {showChecksums ? (
        <section className="mt-10">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-lg font-semibold">App checksums</h2>
            <Link to="/checksums" className="text-sm text-primary">
              All
            </Link>
          </div>
          {rows.length === 0 ? (
            <p className="mt-2 text-sm text-muted">None yet. Save an event or attach a delivery clip.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {rows.map((r) => (
                <li key={r.id}>
                  <a href={r.href} className="block rounded-radius border border-border bg-surface px-3 py-2">
                    <p className="text-sm font-semibold">{r.label}</p>
                    <p className="font-mono text-xs text-muted">
                      {r.action} · {shortHash(r.sha256)}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <p className="mt-10 text-xs text-muted">Preview seats — not shown in the phone app.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="min-h-11 rounded-radius border border-border px-3 text-sm font-semibold"
          onClick={() => commit(setSignedIn(state, OWNER_EMAIL))}
        >
          View as owner
        </button>
        <button
          type="button"
          className="min-h-11 rounded-radius border border-border px-3 text-sm font-semibold"
          onClick={() => commit(setSignedIn(state, "preview-user@timeline.local"))}
        >
          View as regular user
        </button>
      </div>
    </main>
  );
}
