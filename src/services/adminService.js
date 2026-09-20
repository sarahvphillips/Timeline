import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  OWNER_EMAIL,
  normalizeEmail,
  isOwnerEmail,
  roleOf,
  isStaff,
  isBlocked,
  canUseFeature,
  canSeeHomeAddEvent,
  canSeeHomeAdmin,
} from './adminAccess';

export {
  OWNER_EMAIL,
  normalizeEmail,
  isOwnerEmail,
  roleOf,
  isStaff,
  isBlocked,
  canUseFeature,
  canSeeHomeAddEvent,
  canSeeHomeAdmin,
};

const STORE_KEY = '@timeline_admin_v1';

export const FEATURES = [
  { key: 'banking', title: 'Banking hub', blurb: 'Direct debits, rent, cards, spend graph.', defaultAccess: 'everyone' },
  { key: 'checksums', title: 'App checksums', blurb: 'SHA-256 list of events and clips.', defaultAccess: 'everyone' },
  { key: 'purchases', title: 'Add purchase', blurb: 'Manual, email, Amazon, Uber Eats, bank photo.', defaultAccess: 'everyone' },
  { key: 'deliveryPerk', title: 'Delivery driver perk', blurb: 'Driver name, reg, doorbell clips.', defaultAccess: 'admin' },
  { key: 'gmailImport', title: 'Gmail import', blurb: 'Pull receipts and mail into events.', defaultAccess: 'admin' },
  { key: 'inviteCodes', title: 'Invite codes', blurb: 'Codes you issue so someone can join Timeline.', defaultAccess: 'admin' },
  { key: 'userBlock', title: 'Block a user', blurb: 'Stop an email from using this Timeline.', defaultAccess: 'admin' },
  { key: 'openBanking', title: 'Open Banking', blurb: 'Sandbox bank import. Live AIS later. Screenshots stay.', defaultAccess: 'everyone' },
];

export function defaultGates() {
  const gates = {};
  FEATURES.forEach((f) => {
    gates[f.key] = f.defaultAccess;
  });
  return gates;
}

export function defaultState(signedInEmail) {
  return {
    signedInEmail: normalizeEmail(signedInEmail) || OWNER_EMAIL,
    admins: [],
    gates: defaultGates(),
    blocked: [],
    invites: [],
    audit: [],
  };
}

function mergeState(raw, signedInEmail) {
  const base = defaultState(signedInEmail);
  if (!raw || typeof raw !== 'object') return base;
  const gates = { ...base.gates };
  if (raw.gates && typeof raw.gates === 'object') {
    FEATURES.forEach((f) => {
      const v = raw.gates[f.key];
      if (v === 'everyone' || v === 'admin') gates[f.key] = v;
    });
  }
  const emails = (list) =>
    [...new Set((Array.isArray(list) ? list : []).map((e) => normalizeEmail(String(e))).filter(Boolean))].filter(
      (e) => !isOwnerEmail(e),
    );
  return {
    signedInEmail: normalizeEmail(signedInEmail || raw.signedInEmail) || OWNER_EMAIL,
    admins: emails(raw.admins),
    gates,
    blocked: emails(raw.blocked),
    invites: Array.isArray(raw.invites) ? raw.invites : [],
    audit: Array.isArray(raw.audit) ? raw.audit : [],
  };
}

function staffDoc() {
  return doc(db, 'app', 'staff');
}

function userStaffDoc(uid) {
  return doc(db, 'users', uid, 'settings', 'staff');
}

function isDenied(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  return code.includes('permission-denied') || msg.includes('insufficient permissions');
}

function stamp() {
  return new Date().toISOString();
}

function audit(state, action, detail) {
  return {
    id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: stamp(),
    by: normalizeEmail(state.signedInEmail),
    action,
    detail,
  };
}

function payloadForCloud(state) {
  return {
    ownerEmail: OWNER_EMAIL,
    admins: state.admins,
    gates: state.gates,
    blocked: state.blocked,
    invites: state.invites,
    audit: (state.audit || []).slice(0, 80),
    updatedAt: stamp(),
  };
}

let memCache = null;
let memAt = 0;
const MEM_MS = 8000;

export async function loadAdmin(signedInEmail) {
  const email = normalizeEmail(signedInEmail) || normalizeEmail(auth.currentUser?.email);
  const uid = auth.currentUser?.uid;
  if (memCache && Date.now() - memAt < MEM_MS) {
    return { ...memCache, signedInEmail: email || memCache.signedInEmail };
  }

  let local = defaultState(email);
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (raw) local = mergeState(JSON.parse(raw), email);
  } catch (_) {}

  const adopt = async (data) => {
    const merged = mergeState(data, email);
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(payloadForCloud(merged)));
    memCache = merged;
    memAt = Date.now();
    return merged;
  };

  if (uid) {
    try {
      const snap = await getDoc(userStaffDoc(uid));
      if (snap.exists()) return adopt(snap.data());
    } catch (e) {
      if (!isDenied(e)) console.warn('Admin settings load failed; using device copy.', e);
    }
  }

  try {
    const snap = await getDoc(staffDoc());
    if (snap.exists()) return adopt(snap.data());
  } catch (e) {
    if (!isDenied(e)) console.warn('Admin shared load failed; using device copy.', e);
  }

  const out = { ...local, signedInEmail: email || local.signedInEmail };
  memCache = out;
  memAt = Date.now();
  return out;
}

export async function saveAdmin(state) {
  const next = mergeState(state, state.signedInEmail);
  const payload = payloadForCloud(next);
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(payload));
  memCache = next;
  memAt = Date.now();
  const uid = auth.currentUser?.uid;
  if (isOwnerEmail(next.signedInEmail) && uid) {
    try {
      await setDoc(userStaffDoc(uid), payload, { merge: true });
    } catch (e) {
      if (!isDenied(e)) console.warn('Admin settings save failed; kept on this device.', e);
    }
    try {
      await setDoc(staffDoc(), payload, { merge: true });
    } catch (e) {
      if (!isDenied(e)) console.warn('Admin shared save failed; kept on this device.', e);
    }
  }
  return next;
}

export function grantAdmin(state, email) {
  if (!isOwnerEmail(state.signedInEmail)) {
    return { ok: false, error: 'Only the owner can grant admin.' };
  }
  const e = normalizeEmail(email);
  if (!e || !e.includes('@')) return { ok: false, error: 'Enter a full email address.' };
  if (isOwnerEmail(e)) return { ok: false, error: 'That email is already the owner.' };
  if (state.admins.includes(e)) return { ok: false, error: 'Already an admin.' };
  return {
    ok: true,
    state: {
      ...state,
      admins: [...state.admins, e],
      audit: [audit(state, 'grant-admin', e), ...state.audit].slice(0, 80),
    },
  };
}

export function revokeAdmin(state, email) {
  if (!isOwnerEmail(state.signedInEmail)) {
    return { ok: false, error: 'Only the owner can remove admin.' };
  }
  const e = normalizeEmail(email);
  if (isOwnerEmail(e)) return { ok: false, error: 'The owner cannot be removed.' };
  if (!state.admins.includes(e)) return { ok: false, error: 'Not on the admin list.' };
  return {
    ok: true,
    state: {
      ...state,
      admins: state.admins.filter((a) => a !== e),
      audit: [audit(state, 'revoke-admin', e), ...state.audit].slice(0, 80),
    },
  };
}

export function setGate(state, key, access) {
  if (!isOwnerEmail(state.signedInEmail)) {
    return { ok: false, error: 'Only the owner can change who sees a feature.' };
  }
  return {
    ok: true,
    state: {
      ...state,
      gates: { ...state.gates, [key]: access },
      audit: [audit(state, 'set-gate', `${key} → ${access}`), ...state.audit].slice(0, 80),
    },
  };
}

export function blockUser(state, email) {
  if (!isStaff(roleOf(state.signedInEmail, state))) {
    return { ok: false, error: 'Admin only.' };
  }
  const e = normalizeEmail(email);
  if (!e || !e.includes('@')) return { ok: false, error: 'Enter a full email address.' };
  if (isOwnerEmail(e)) return { ok: false, error: 'The owner cannot be blocked.' };
  if (state.blocked.includes(e)) return { ok: false, error: 'Already blocked.' };
  return {
    ok: true,
    state: {
      ...state,
      blocked: [...state.blocked, e],
      admins: state.admins.filter((a) => a !== e),
      audit: [audit(state, 'block-user', e), ...state.audit].slice(0, 80),
    },
  };
}

export function unblockUser(state, email) {
  const e = normalizeEmail(email);
  return {
    ...state,
    blocked: state.blocked.filter((b) => b !== e),
    audit: [audit(state, 'unblock-user', e), ...state.audit].slice(0, 80),
  };
}

export function makeInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function addInvite(state, note) {
  if (!isStaff(roleOf(state.signedInEmail, state))) {
    return { ok: false, error: 'Admin only.' };
  }
  const code = makeInviteCode();
  return {
    ok: true,
    state: {
      ...state,
      invites: [{ code, note: String(note || '').trim(), at: stamp() }, ...state.invites].slice(0, 40),
      audit: [audit(state, 'invite-code', code), ...state.audit].slice(0, 80),
    },
  };
}
