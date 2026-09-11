export const OWNER_EMAIL = "sarah.v.phillips@googlemail.com";
export const STORE_KEY = "timeline-admin-v1";
export const ADMIN_EVENT = "timeline-admin-changed";

export type FeatureKey =
  | "banking"
  | "checksums"
  | "purchases"
  | "deliveryPerk"
  | "gmailImport"
  | "inviteCodes"
  | "userBlock"
  | "auditLog";

export type FeatureAccess = "everyone" | "admin";
export type Role = "owner" | "admin" | "user";

export const FEATURES: {
  key: FeatureKey;
  title: string;
  blurb: string;
  defaultAccess: FeatureAccess;
}[] = [
  {
    key: "banking",
    title: "Banking hub",
    blurb: "Direct debits, rent, cards, spend graph.",
    defaultAccess: "everyone",
  },
  {
    key: "checksums",
    title: "App checksums",
    blurb: "SHA-256 list of events and clips.",
    defaultAccess: "everyone",
  },
  {
    key: "purchases",
    title: "Add purchase",
    blurb: "Manual, email, Amazon, Uber Eats, bank photo.",
    defaultAccess: "everyone",
  },
  {
    key: "deliveryPerk",
    title: "Delivery driver perk",
    blurb: "Driver name, reg, doorbell clips. Credits feature.",
    defaultAccess: "admin",
  },
  {
    key: "gmailImport",
    title: "Gmail import",
    blurb: "Pull receipts and mail into events.",
    defaultAccess: "admin",
  },
  {
    key: "inviteCodes",
    title: "Invite codes",
    blurb: "Codes you issue so someone can join Timeline.",
    defaultAccess: "admin",
  },
  {
    key: "userBlock",
    title: "Block a user",
    blurb: "Stop an email from using this Timeline.",
    defaultAccess: "admin",
  },
  {
    key: "auditLog",
    title: "Admin audit log",
    blurb: "Who granted admin, who changed a gate.",
    defaultAccess: "admin",
  },
];

export type AuditRow = {
  id: string;
  at: string;
  by: string;
  action: string;
  detail: string;
};

export type InviteCode = {
  code: string;
  note: string;
  at: string;
};

export type AdminState = {
  signedInEmail: string;
  admins: string[];
  gates: Record<FeatureKey, FeatureAccess>;
  blocked: string[];
  invites: InviteCode[];
  audit: AuditRow[];
};

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isOwnerEmail(email: string): boolean {
  return normalizeEmail(email) === OWNER_EMAIL;
}

export function defaultGates(): Record<FeatureKey, FeatureAccess> {
  return Object.fromEntries(FEATURES.map((f) => [f.key, f.defaultAccess])) as Record<
    FeatureKey,
    FeatureAccess
  >;
}

export function defaultState(): AdminState {
  return {
    signedInEmail: OWNER_EMAIL,
    admins: [],
    gates: defaultGates(),
    blocked: [],
    invites: [],
    audit: [],
  };
}

function mergeState(raw: unknown): AdminState {
  const base = defaultState();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Partial<AdminState>;
  const gates = { ...base.gates };
  if (o.gates && typeof o.gates === "object") {
    for (const f of FEATURES) {
      const v = (o.gates as Record<string, FeatureAccess>)[f.key];
      if (v === "everyone" || v === "admin") gates[f.key] = v;
    }
  }
  return {
    signedInEmail: typeof o.signedInEmail === "string" && o.signedInEmail.trim()
      ? normalizeEmail(o.signedInEmail)
      : OWNER_EMAIL,
    admins: Array.isArray(o.admins)
      ? [...new Set(o.admins.map((e) => normalizeEmail(String(e))).filter(Boolean))].filter(
          (e) => !isOwnerEmail(e),
        )
      : [],
    gates,
    blocked: Array.isArray(o.blocked)
      ? [...new Set(o.blocked.map((e) => normalizeEmail(String(e))).filter(Boolean))].filter(
          (e) => !isOwnerEmail(e),
        )
      : [],
    invites: Array.isArray(o.invites) ? o.invites : [],
    audit: Array.isArray(o.audit) ? o.audit : [],
  };
}

export function loadAdmin(): AdminState {
  if (typeof localStorage === "undefined") return defaultState();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    return mergeState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

export function saveAdmin(state: AdminState): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ADMIN_EVENT));
}

export function roleOf(email: string, state: AdminState): Role {
  const e = normalizeEmail(email);
  if (isOwnerEmail(e)) return "owner";
  if (state.admins.includes(e)) return "admin";
  return "user";
}

export function isStaff(role: Role): boolean {
  return role === "owner" || role === "admin";
}

export function canUseFeature(key: FeatureKey, state: AdminState, email = state.signedInEmail): boolean {
  const access = state.gates[key] ?? "everyone";
  if (access === "everyone") return true;
  return isStaff(roleOf(email, state));
}

function stamp(): string {
  return new Date().toISOString();
}

function audit(state: AdminState, action: string, detail: string): AuditRow {
  return {
    id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: stamp(),
    by: normalizeEmail(state.signedInEmail),
    action,
    detail,
  };
}

export function grantAdmin(state: AdminState, email: string): { ok: true; state: AdminState } | { ok: false; error: string } {
  if (!isOwnerEmail(state.signedInEmail)) {
    return { ok: false, error: "Only the owner can grant admin." };
  }
  const e = normalizeEmail(email);
  if (!e || !e.includes("@")) return { ok: false, error: "Enter a full email address." };
  if (isOwnerEmail(e)) return { ok: false, error: "That email is already the owner." };
  if (state.admins.includes(e)) return { ok: false, error: "Already an admin." };
  const next: AdminState = {
    ...state,
    admins: [...state.admins, e],
    audit: [audit(state, "grant-admin", e), ...state.audit].slice(0, 80),
  };
  return { ok: true, state: next };
}

export function revokeAdmin(state: AdminState, email: string): { ok: true; state: AdminState } | { ok: false; error: string } {
  if (!isOwnerEmail(state.signedInEmail)) {
    return { ok: false, error: "Only the owner can remove admin." };
  }
  const e = normalizeEmail(email);
  if (isOwnerEmail(e)) return { ok: false, error: "The owner cannot be removed." };
  if (!state.admins.includes(e)) return { ok: false, error: "Not on the admin list." };
  const next: AdminState = {
    ...state,
    admins: state.admins.filter((a) => a !== e),
    audit: [audit(state, "revoke-admin", e), ...state.audit].slice(0, 80),
  };
  return { ok: true, state: next };
}

export function setGate(
  state: AdminState,
  key: FeatureKey,
  access: FeatureAccess,
): { ok: true; state: AdminState } | { ok: false; error: string } {
  if (!isOwnerEmail(state.signedInEmail)) {
    return { ok: false, error: "Only the owner can change who sees a feature." };
  }
  const next: AdminState = {
    ...state,
    gates: { ...state.gates, [key]: access },
    audit: [audit(state, "set-gate", `${key} → ${access}`), ...state.audit].slice(0, 80),
  };
  return { ok: true, state: next };
}

export function blockUser(state: AdminState, email: string): { ok: true; state: AdminState } | { ok: false; error: string } {
  if (!isStaff(roleOf(state.signedInEmail, state))) {
    return { ok: false, error: "Admin only." };
  }
  const e = normalizeEmail(email);
  if (!e || !e.includes("@")) return { ok: false, error: "Enter a full email address." };
  if (isOwnerEmail(e)) return { ok: false, error: "The owner cannot be blocked." };
  if (state.blocked.includes(e)) return { ok: false, error: "Already blocked." };
  const next: AdminState = {
    ...state,
    blocked: [...state.blocked, e],
    admins: state.admins.filter((a) => a !== e),
    audit: [audit(state, "block-user", e), ...state.audit].slice(0, 80),
  };
  return { ok: true, state: next };
}

export function unblockUser(state: AdminState, email: string): AdminState {
  const e = normalizeEmail(email);
  return {
    ...state,
    blocked: state.blocked.filter((b) => b !== e),
    audit: [audit(state, "unblock-user", e), ...state.audit].slice(0, 80),
  };
}

export function makeInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function addInvite(state: AdminState, note: string): { ok: true; state: AdminState } | { ok: false; error: string } {
  if (!isStaff(roleOf(state.signedInEmail, state))) {
    return { ok: false, error: "Admin only." };
  }
  const code = makeInviteCode();
  const next: AdminState = {
    ...state,
    invites: [{ code, note: note.trim(), at: stamp() }, ...state.invites].slice(0, 40),
    audit: [audit(state, "invite-code", code), ...state.audit].slice(0, 80),
  };
  return { ok: true, state: next };
}

export function setSignedIn(state: AdminState, email: string): AdminState {
  return { ...state, signedInEmail: normalizeEmail(email) || OWNER_EMAIL };
}
