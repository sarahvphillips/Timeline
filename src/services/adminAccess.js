/** Pure admin role / feature-gate helpers (no Firebase). */
export const OWNER_EMAIL = 'sarah.v.phillips@googlemail.com';

export function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

export function isOwnerEmail(email) {
  return normalizeEmail(email) === OWNER_EMAIL;
}

export function roleOf(email, state) {
  const e = normalizeEmail(email);
  if (isOwnerEmail(e)) return 'owner';
  if ((state?.admins || []).includes(e)) return 'admin';
  return 'user';
}

export function isStaff(role) {
  return role === 'owner' || role === 'admin';
}

export function isBlocked(email, state) {
  const e = normalizeEmail(email);
  if (!e || isOwnerEmail(e)) return false;
  return (state?.blocked || []).includes(e);
}

export function canUseFeature(key, state, email) {
  const who = email || state?.signedInEmail;
  if (isBlocked(who, state)) return false;
  const access = (state?.gates && state.gates[key]) || 'everyone';
  if (access === 'everyone') return true;
  return isStaff(roleOf(who, state));
}

/** Home Add event: core hub action for every non-blocked role. Never hide it because the user became admin. */
export function canSeeHomeAddEvent(email, state) {
  return !isBlocked(email, state);
}

/** Home Admin button: staff-only; blocked users never see it. */
export function canSeeHomeAdmin(email, state) {
  if (isBlocked(email, state)) return false;
  return isStaff(roleOf(email, state));
}
