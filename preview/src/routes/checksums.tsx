import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { formatBytes, formatClock, loadChecksums, shortHash, type ChecksumRow } from "@/lib/checksum";

export const Route = createFileRoute("/checksums")({ component: ChecksumsPage });

function ChecksumsPage() {
  const [rows, setRows] = useState<ChecksumRow[]>([]);

  useEffect(() => {
    setRows(loadChecksums());
  }, []);

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-6">
      <Link to="/" className="text-sm font-semibold text-primary">
        ← Home
      </Link>
      <h1 className="mt-3 text-3xl font-bold">App checksums</h1>
      <p className="mt-2 text-sm text-muted">
        SHA-256 of the <strong>trimmed Timeline copy</strong> (what you check later) and of the original
        source file. Original is never overwritten. Editing an event adds a new row; older rows stay.
      </p>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted">None yet. Save a life event or attach a delivery clip.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-radius border border-border bg-surface p-4">
              <p className="text-xs uppercase tracking-wide text-muted">
                {r.action} · {r.relatedKind}
              </p>
              <p className="font-semibold">{r.label}</p>
              <p className="break-all font-mono text-xs text-muted">{shortHash(r.sha256)}</p>
              {r.bytes ? (
                <p className="text-xs text-muted">
                  {formatBytes(r.bytes)}
                  {r.durationSec
                    ? ` · ${formatClock(r.clipStart)}–${formatClock(r.clipEnd || r.durationSec)} of ${formatClock(r.durationSec)}`
                    : ""}
                </p>
              ) : null}
              <p className="text-xs text-muted">{r.at}</p>
              <Link to={r.href} className="mt-2 inline-block text-sm text-primary">
                Open item
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
