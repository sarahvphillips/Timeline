import { Link } from "@tanstack/react-router";
import { ShieldOff } from "lucide-react";
import type { ReactNode } from "react";
import { useAdmin } from "@/lib/use-admin";
import type { FeatureKey } from "@/lib/admin";

export function LockedNotice({ title, reason }: { title: string; reason: string }) {
  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-6">
      <Link to="/" className="text-sm font-semibold text-primary">
        ← Home
      </Link>
      <div className="mt-8 rounded-radius border border-border bg-surface p-6">
        <ShieldOff className="h-8 w-8 text-muted" aria-hidden />
        <h1 className="mt-3 text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted">{reason}</p>
      </div>
    </main>
  );
}

export function FeatureGate({
  feature,
  children,
}: {
  feature: FeatureKey;
  children: ReactNode;
}) {
  const { can, blocked } = useAdmin();
  if (blocked) {
    return (
      <LockedNotice
        title="Account blocked"
        reason="This email cannot use Timeline. Ask the owner if that is a mistake."
      />
    );
  }
  if (!can(feature)) {
    return (
      <LockedNotice
        title="Admin only"
        reason="Sarah chooses who can use this. If you need it, she has to add you as an admin."
      />
    );
  }
  return <>{children}</>;
}

export function StaffGate({ children }: { children: ReactNode }) {
  const { staff, blocked } = useAdmin();
  if (blocked) {
    return (
      <LockedNotice
        title="Account blocked"
        reason="This email cannot use Timeline. Ask the owner if that is a mistake."
      />
    );
  }
  if (!staff) {
    return (
      <LockedNotice
        title="Admin only"
        reason="Admins are chosen only by Sarah. There is no self-serve admin."
      />
    );
  }
  return <>{children}</>;
}
