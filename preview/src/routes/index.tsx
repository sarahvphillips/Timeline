import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadChecksums, shortHash, type ChecksumRow } from "@/lib/checksum";

export const Route = createFileRoute("/")({ component: HomePage });

const OPTIONS = [
  {
    to: "/circle" as const,
    title: "Date circle",
    blurb: "People on a wheel. Days until birthdays, DoB lines, word to int.",
    primary: true,
  },
  {
    to: "/life" as const,
    title: "Life events",
    blurb: "Birthdays, house moves, weddings, jobs — dated markers on your timeline.",
    primary: false,
  },
  {
    to: "/people" as const,
    title: "People",
    blurb: "Real-life friends, even if they don’t use Timeline. Invite optional.",
    primary: false,
  },
  {
    to: "/sms" as const,
    title: "Add SMS",
    blurb: "Log a received or sent text as a timeline event. Mock — not the phone inbox.",
    primary: false,
  },
  {
    to: "/calls" as const,
    title: "Add phone call",
    blurb: "Incoming, outgoing, or missed. Same people and share options as SMS.",
    primary: false,
  },
  {
    to: "/locations" as const,
    title: "Add location",
    blurb: "Google-style places visited. Tag people. Mock — not Location History yet.",
    primary: false,
  },
  {
    to: "/purchases" as const,
    title: "Add purchase",
    blurb: "Manual, email, Amazon, Uber Eats, notification screenshot, bank photo.",
    primary: false,
  },
  {
    to: "/banking" as const,
    title: "Banking",
    blurb: "Direct debits, rent, credit cards, large spend, a simple graph. Own event type.",
    primary: false,
  },
  {
    to: "/checksums" as const,
    title: "App checksums",
    blurb: "SHA-256 of events and original videos. Edits keep an older row.",
    primary: false,
  },
  {
    to: "/mockups" as const,
    title: "Design sketches",
    blurb: "Add food, cupboard, Gmail, share, month poems.",
    primary: false,
  },
];

function HomePage() {
  const [rows, setRows] = useState<ChecksumRow[]>([]);
  useEffect(() => {
    setRows(loadChecksums().slice(0, 6));
  }, []);

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-8">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">Timeline</p>
      <h1 className="mt-1 text-3xl font-bold">Home</h1>
      <p className="mt-2 text-sm text-muted">
        Preview home. Date circle and Life events are the new side-features.
      </p>

      <ul className="mt-8 space-y-3">
        {OPTIONS.map((item) => (
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
    </main>
  );
}
