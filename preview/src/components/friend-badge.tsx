import type { TimelineFriend } from "@/lib/friends";

export function FriendBadge({
  friend,
  shared,
}: {
  friend: TimelineFriend;
  shared?: boolean;
}) {
  return (
    <div className="mt-3 flex items-center gap-3 rounded-radius border border-border bg-bg px-3 py-2">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-bg">
        {friend.initial}
      </span>
      <div className="min-w-0">
        <p className="font-semibold">{friend.name}</p>
        <p className="text-xs text-muted">
          {friend.onApp ? "Uses Timeline" : "Not on the app yet"}
          {shared ? " · shared with them" : " · related, not shared"}
        </p>
      </div>
    </div>
  );
}
