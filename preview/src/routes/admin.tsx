import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Shield } from "lucide-react";
import {
  FEATURES,
  OWNER_EMAIL,
  addInvite,
  blockUser,
  grantAdmin,
  revokeAdmin,
  setGate,
  setSignedIn,
  unblockUser,
  type FeatureAccess,
} from "@/lib/admin";
import { useAdmin } from "@/lib/use-admin";
import { StaffGate } from "@/components/admin-gate";

export const Route = createFileRoute("/admin")({ component: AdminPage });

function AdminPage() {
  return (
    <StaffGate>
      <AdminInner />
    </StaffGate>
  );
}

function AdminInner() {
  const { state, commit, owner, role } = useAdmin();
  const [email, setEmail] = useState("");
  const [blockEmail, setBlockEmail] = useState("");
  const [inviteNote, setInviteNote] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  function flash(msg: string) {
    setNotice(msg);
  }

  function onGrant(e: FormEvent) {
    e.preventDefault();
    const r = grantAdmin(state, email);
    if (!r.ok) {
      flash(r.error);
      return;
    }
    commit(r.state);
    setEmail("");
    flash(`Admin granted: ${email.trim().toLowerCase()}`);
  }

  function onBlock(e: FormEvent) {
    e.preventDefault();
    const r = blockUser(state, blockEmail);
    if (!r.ok) {
      flash(r.error);
      return;
    }
    commit(r.state);
    setBlockEmail("");
    flash("Blocked.");
  }

  function onInvite(e: FormEvent) {
    e.preventDefault();
    const r = addInvite(state, inviteNote);
    if (!r.ok) {
      flash(r.error);
      return;
    }
    commit(r.state);
    setInviteNote("");
    flash(`Invite code ${r.state.invites[0]?.code}`);
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
    } catch {
      flash("Could not copy.");
    }
  }

  const demoUser = "preview-user@timeline.local";

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-6">
      <Link to="/" className="text-sm font-semibold text-primary">
        ← Home
      </Link>
      <div className="mt-4 flex items-center gap-3">
        <Shield className="h-7 w-7 text-primary" aria-hidden />
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Staff</p>
          <h1 className="text-3xl font-bold">Admin</h1>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted">
        Admins are chosen only by Sarah. Nobody can add themselves.
      </p>

      <section className="mt-6 rounded-radius border border-border bg-surface p-4">
        <p className="text-xs uppercase tracking-wide text-muted">Signed in as</p>
        <p className="mt-1 font-semibold">{state.signedInEmail}</p>
        <p className="text-sm text-muted capitalize">{role}</p>
        <p className="mt-3 text-sm text-muted">Preview only — try the other seats:</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="min-h-11 rounded-radius border border-primary bg-primary px-3 text-sm font-semibold text-bg"
            onClick={() => commit(setSignedIn(state, OWNER_EMAIL))}
          >
            View as owner
          </button>
          {state.admins[0] ? (
            <button
              type="button"
              className="min-h-11 rounded-radius border border-border px-3 text-sm font-semibold"
              onClick={() => commit(setSignedIn(state, state.admins[0]))}
            >
              View as admin
            </button>
          ) : null}
          <button
            type="button"
            className="min-h-11 rounded-radius border border-border px-3 text-sm font-semibold"
            onClick={() => commit(setSignedIn(state, demoUser))}
          >
            View as regular user
          </button>
        </div>
      </section>

      {notice ? (
        <p className="mt-4 rounded-radius border border-primary/40 bg-primary/10 px-3 py-2 text-sm">{notice}</p>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Admins</h2>
        <p className="mt-1 text-sm text-muted">
          Owner: {OWNER_EMAIL} — always admin, cannot be removed.
        </p>
        {owner ? (
          <form onSubmit={onGrant} className="mt-3 flex flex-col gap-2">
            <label className="text-sm" htmlFor="admin-email">
              Grant admin to
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@example.com"
              className="min-h-11 rounded-radius border border-border bg-bg px-3 text-fg"
            />
            <button
              type="submit"
              className="min-h-11 rounded-radius bg-primary px-4 text-sm font-semibold text-bg"
            >
              Grant admin
            </button>
          </form>
        ) : (
          <p className="mt-2 text-sm text-muted">Only the owner can add or remove admins.</p>
        )}
        <ul className="mt-4 space-y-2">
          {state.admins.length === 0 ? (
            <li className="text-sm text-muted">No extra admins yet.</li>
          ) : (
            state.admins.map((a) => (
              <li
                key={a}
                className="flex items-center justify-between gap-3 rounded-radius border border-border bg-surface px-3 py-3"
              >
                <span className="text-sm">{a}</span>
                {owner ? (
                  <button
                    type="button"
                    className="min-h-11 text-sm font-semibold text-primary"
                    onClick={() => {
                      const r = revokeAdmin(state, a);
                      if (!r.ok) flash(r.error);
                      else {
                        commit(r.state);
                        flash("Admin removed.");
                      }
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Who can see each feature</h2>
        <p className="mt-1 text-sm text-muted">
          {owner
            ? "Flip a row to Admin only. Regular users will not see it on Home."
            : "Only the owner can change these."}
        </p>
        <ul className="mt-3 space-y-2">
          {FEATURES.map((f) => {
            const access: FeatureAccess = state.gates[f.key];
            return (
              <li key={f.key} className="rounded-radius border border-border bg-surface px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{f.title}</p>
                    <p className="text-sm text-muted">{f.blurb}</p>
                  </div>
                  {owner ? (
                    <button
                      type="button"
                      className="min-h-11 shrink-0 rounded-radius border border-border px-3 text-sm font-semibold"
                      onClick={() => {
                        const next: FeatureAccess = access === "admin" ? "everyone" : "admin";
                        const r = setGate(state, f.key, next);
                        if (!r.ok) flash(r.error);
                        else commit(r.state);
                      }}
                    >
                      {access === "admin" ? "Admin only" : "Everyone"}
                    </button>
                  ) : (
                    <span className="shrink-0 text-sm text-muted">
                      {access === "admin" ? "Admin only" : "Everyone"}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Invite codes</h2>
        <p className="mt-1 text-sm text-muted">Issue a code. Joining with it comes later.</p>
        <form onSubmit={onInvite} className="mt-3 flex flex-col gap-2">
          <input
            value={inviteNote}
            onChange={(e) => setInviteNote(e.target.value)}
            placeholder="Note (optional)"
            className="min-h-11 rounded-radius border border-border bg-bg px-3 text-fg"
          />
          <button
            type="submit"
            className="min-h-11 rounded-radius bg-primary px-4 text-sm font-semibold text-bg"
          >
            New code
          </button>
        </form>
        <ul className="mt-3 space-y-2">
          {state.invites.length === 0 ? (
            <li className="text-sm text-muted">None yet.</li>
          ) : (
            state.invites.map((inv) => (
              <li
                key={inv.code}
                className="flex items-center justify-between gap-3 rounded-radius border border-border bg-surface px-3 py-3"
              >
                <div>
                  <p className="font-mono text-lg font-semibold tracking-wide">{inv.code}</p>
                  {inv.note ? <p className="text-sm text-muted">{inv.note}</p> : null}
                </div>
                <button
                  type="button"
                  className="min-h-11 text-sm font-semibold text-primary"
                  onClick={() => copyCode(inv.code)}
                >
                  {copied === inv.code ? "Copied" : "Copy"}
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Block a user</h2>
        <form onSubmit={onBlock} className="mt-3 flex flex-col gap-2">
          <input
            type="email"
            value={blockEmail}
            onChange={(e) => setBlockEmail(e.target.value)}
            placeholder="email@example.com"
            className="min-h-11 rounded-radius border border-border bg-bg px-3 text-fg"
          />
          <button
            type="submit"
            className="min-h-11 rounded-radius border border-border px-4 text-sm font-semibold"
          >
            Block
          </button>
        </form>
        <ul className="mt-3 space-y-2">
          {state.blocked.length === 0 ? (
            <li className="text-sm text-muted">Nobody blocked.</li>
          ) : (
            state.blocked.map((b) => (
              <li
                key={b}
                className="flex items-center justify-between gap-3 rounded-radius border border-border bg-surface px-3 py-3"
              >
                <span className="text-sm">{b}</span>
                <button
                  type="button"
                  className="min-h-11 text-sm font-semibold text-primary"
                  onClick={() => commit(unblockUser(state, b))}
                >
                  Unblock
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Coming next (admin)</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li className="rounded-radius border border-border bg-surface px-3 py-3">
            Signed-in devices list (already on Expo) — approve or drop a session.
          </li>
          <li className="rounded-radius border border-border bg-surface px-3 py-3">
            Open Banking — stay gated until you turn it on.
          </li>
          <li className="rounded-radius border border-border bg-surface px-3 py-3">
            Firestore: `admins` collection, writeable only by owner uid.
          </li>
        </ul>
      </section>

      {state.audit.length ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Audit log</h2>
          <ul className="mt-3 space-y-2">
            {state.audit.slice(0, 12).map((row) => (
              <li key={row.id} className="rounded-radius border border-border bg-surface px-3 py-2">
                <p className="text-sm font-semibold">
                  {row.action} · {row.detail}
                </p>
                <p className="text-xs text-muted">
                  {row.by} · {new Date(row.at).toLocaleString("en-GB")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
