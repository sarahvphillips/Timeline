import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { formatUk, nowStamp, toIso } from "@/lib/date-span";
import { FeatureGate } from "@/components/admin-gate";

export const Route = createFileRoute("/banking")({ component: BankingRoute });

function BankingRoute() {
  return (
    <FeatureGate feature="banking">
      <BankingPage />
    </FeatureGate>
  );
}

const KINDS = [
  "Direct debit",
  "Standing order",
  "Rent",
  "Credit card",
  "Large spend",
  "Incoming",
] as const;
type Kind = (typeof KINDS)[number];

type BankEvent = {
  id: string;
  kind: Kind;
  payee: string;
  amount: string;
  due: string;
  monthly: boolean;
  note: string;
  onTimeline: boolean;
  createdAt: string;
};

const STORE = "timeline-banking-v1";
const PURCHASE_STORE = "timeline-purchases-mock-v1";

function monthKey(iso: string): string {
  return (iso || "").slice(0, 7);
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleString("en-GB", { month: "short", year: "2-digit" });
}

function BankingPage() {
  const [rows, setRows] = useState<BankEvent[]>([]);
  const [ready, setReady] = useState(false);
  const [kind, setKind] = useState<Kind>("Direct debit");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState(() => toIso(new Date()));
  const [monthly, setMonthly] = useState(true);
  const [note, setNote] = useState("");
  const [spendByMonth, setSpendByMonth] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const list = JSON.parse(raw) as BankEvent[];
        if (Array.isArray(list)) setRows(list);
      }
      const bought = localStorage.getItem(PURCHASE_STORE);
      if (bought) {
        const list = JSON.parse(bought) as { date?: string; amount?: string }[];
        const map: Record<string, number> = {};
        for (const p of list) {
          const k = monthKey(p.date || "");
          const n = Number(p.amount);
          if (!k || !n) continue;
          map[k] = (map[k] || 0) + n;
        }
        setSpendByMonth(map);
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
      localStorage.setItem(STORE, JSON.stringify(rows));
    } catch {
      /* ignore */
    }
  }, [rows, ready]);

  const upcoming = useMemo(
    () => [...rows].sort((a, b) => a.due.localeCompare(b.due)),
    [rows],
  );

  const bars = useMemo(() => {
    const now = new Date();
    const keys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const fromBank: Record<string, number> = { ...spendByMonth };
    for (const r of rows) {
      if (r.kind === "Incoming") continue;
      const k = monthKey(r.due);
      const n = Number(r.amount);
      if (!k || !n) continue;
      fromBank[k] = (fromBank[k] || 0) + n;
    }
    const max = Math.max(1, ...keys.map((k) => fromBank[k] || 0));
    return keys.map((k) => ({ key: k, total: fromBank[k] || 0, pct: Math.round(((fromBank[k] || 0) / max) * 100) }));
  }, [rows, spendByMonth]);

  function save(e: FormEvent) {
    e.preventDefault();
    if (!payee.trim() && !amount.trim()) return;
    setRows((list) => [
      {
        id: `${Date.now()}`,
        kind,
        payee: payee.trim() || kind,
        amount: amount.trim(),
        due,
        monthly,
        note: note.trim(),
        onTimeline: false,
        createdAt: nowStamp(),
      },
      ...list,
    ]);
    setPayee("");
    setAmount("");
    setNote("");
  }

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-6">
      <Link to="/" className="text-sm font-semibold text-primary">
        ← Home
      </Link>
      <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-primary">Banking</p>
      <h1 className="text-3xl font-bold">Money on Timeline</h1>
      <p className="mt-2 text-sm text-muted">
        Own section — not mixed with poems or life events unless you pin one to the timeline. Direct
        debits, rent, credit cards, large spend. Open Banking later, if you want it.
      </p>

      <section className="mt-6 rounded-radius border border-border bg-surface p-4">
        <h2 className="text-lg font-semibold">Spending (last 6 months)</h2>
        <p className="mt-1 text-xs text-muted">From purchases you have logged, plus these banking events.</p>
        <div className="mt-4 flex h-36 items-end gap-2">
          {bars.map((b) => (
            <div key={b.key} className="flex flex-1 flex-col items-center gap-1">
              <p className="text-[10px] text-muted">£{Math.round(b.total)}</p>
              <div className="w-full rounded-t bg-primary/80" style={{ height: `${Math.max(b.pct, 4)}%` }} />
              <p className="text-[10px] text-muted">{monthLabel(b.key)}</p>
            </div>
          ))}
        </div>
      </section>

      <form onSubmit={save} className="mt-6 space-y-3 rounded-radius border border-border bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Add a money event</p>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`min-h-11 rounded-full border px-3 text-sm font-semibold ${
                kind === k ? "border-primary bg-primary text-bg" : "border-border bg-bg text-muted"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <p className="text-sm font-semibold text-primary">Type: {kind}</p>
        <input
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          placeholder="Who / what — landlord, Virgin Media, Lloyds card…"
          className="w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
        />
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Amount (£)
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className="mt-1 w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Due / paid
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="mt-1 w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={monthly} onChange={(e) => setMonthly(e.target.checked)} />
          Repeats every month
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Optional note"
          className="w-full rounded-radius border border-border bg-bg px-3 py-3 text-fg"
        />
        <button type="submit" className="w-full rounded-radius bg-primary py-3 font-semibold text-bg">
          Save money event
        </button>
      </form>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Upcoming / logged</h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-muted">None yet. Rent and a couple of direct debits are a good start.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {upcoming.map((r) => (
              <li key={r.id} className="rounded-radius border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-muted">
                  {r.kind}
                  {r.monthly ? " · monthly" : ""}
                </p>
                <p className="text-lg font-semibold">{r.payee}</p>
                {r.amount ? <p className="text-primary">£{r.amount}</p> : null}
                <p className="text-sm text-muted">{formatUk(r.due)}</p>
                {r.note ? <p className="mt-1 text-sm">{r.note}</p> : null}
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setRows((list) =>
                        list.map((x) => (x.id === r.id ? { ...x, onTimeline: !x.onTimeline } : x)),
                      )
                    }
                    className="text-sm text-muted"
                  >
                    {r.onTimeline ? "On timeline" : "Pin to timeline"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRows((list) => list.filter((x) => x.id !== r.id))}
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

      <p className="mt-8 text-sm text-muted">
        Card spend from a notification still lives under{" "}
        <Link to="/purchases" className="text-primary">
          Add purchase
        </Link>
        . Large or repeating money belongs here.
      </p>
    </main>
  );
}
