export type TimelineFriend = {
  id: string;
  name: string;
  phone: string;
  email: string;
  birthday: string;
  note: string;
  initial: string;
  autoShareSms: boolean;
  autoShareCalls: boolean;
  onApp: boolean;
  inviteSent: boolean;
  fromWheelId: string;
};

export const SAMPLE_FRIENDS: TimelineFriend[] = [
  {
    id: "kd",
    name: "KD",
    phone: "07700900001",
    email: "",
    birthday: "",
    note: "",
    initial: "K",
    autoShareSms: false,
    autoShareCalls: false,
    onApp: false,
    inviteSent: false,
    fromWheelId: "",
  },
  {
    id: "sp",
    name: "S.P",
    phone: "07700900002",
    email: "",
    birthday: "1986-11-14",
    note: "",
    initial: "S",
    autoShareSms: false,
    autoShareCalls: false,
    onApp: false,
    inviteSent: false,
    fromWheelId: "sp",
  },
  {
    id: "dh",
    name: "DH",
    phone: "07700900003",
    email: "",
    birthday: "1972-05-08",
    note: "",
    initial: "D",
    autoShareSms: false,
    autoShareCalls: false,
    onApp: false,
    inviteSent: false,
    fromWheelId: "dh",
  },
  {
    id: "em",
    name: "EM",
    phone: "07700900004",
    email: "",
    birthday: "1972-06-28",
    note: "",
    initial: "E",
    autoShareSms: false,
    autoShareCalls: false,
    onApp: false,
    inviteSent: false,
    fromWheelId: "em",
  },
  {
    id: "dt",
    name: "DT",
    phone: "07700900005",
    email: "",
    birthday: "1989-06-05",
    note: "",
    initial: "D",
    autoShareSms: false,
    autoShareCalls: false,
    onApp: false,
    inviteSent: false,
    fromWheelId: "dt",
  },
];

export const FRIEND_STORE = "timeline-friends-mock-v2";

export function initialFromName(name: string): string {
  const letters = (name || "").replace(/[^A-Za-z]/g, "");
  return (letters.charAt(0) || "?").toUpperCase();
}

export function normalizeFriend(raw: Partial<TimelineFriend> & { id: string; name: string }): TimelineFriend {
  return {
    id: raw.id,
    name: raw.name,
    phone: raw.phone || "",
    email: raw.email || "",
    birthday: raw.birthday || "",
    note: raw.note || "",
    initial: raw.initial || initialFromName(raw.name),
    autoShareSms: Boolean(raw.autoShareSms),
    autoShareCalls: Boolean(raw.autoShareCalls),
    onApp: Boolean(raw.onApp),
    inviteSent: Boolean(raw.inviteSent),
    fromWheelId: raw.fromWheelId || "",
  };
}

export function digitsOnly(n: string): string {
  return (n || "").replace(/\D/g, "");
}

export function nameKey(s: string): string {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function findFriend(
  friends: TimelineFriend[],
  contact: string,
  number: string,
): TimelineFriend | null {
  const d = digitsOnly(number);
  const k = nameKey(contact);
  if (!d && !k) return null;
  return (
    friends.find((f) => {
      const fd = digitsOnly(f.phone);
      const phoneHit =
        d.length >= 7 &&
        fd.length >= 7 &&
        (fd === d || fd.endsWith(d) || d.endsWith(fd));
      const nameHit = Boolean(k) && nameKey(f.name) === k;
      return phoneHit || nameHit;
    }) ?? null
  );
}

export function findFriendByWheel(friends: TimelineFriend[], wheelId: string, name: string): TimelineFriend | null {
  const k = nameKey(name);
  return (
    friends.find((f) => f.fromWheelId === wheelId || (k && nameKey(f.name) === k)) ?? null
  );
}

export function mergeFriends(current: TimelineFriend[]): TimelineFriend[] {
  const list = current.map((f) => normalizeFriend(f));
  const seen = new Set(list.map((f) => f.id));
  const extra = SAMPLE_FRIENDS.filter((f) => !seen.has(f.id) && !list.some((c) => nameKey(c.name) === nameKey(f.name)));
  return [...list, ...extra];
}

export function inviteText(friend: TimelineFriend): string {
  return `Hi ${friend.name} — I'm using Timeline to keep dates and notes in one place. You're on my people list (you don't need an account for that). If you'd like your own Timeline, say and I'll send an invite.`;
}
