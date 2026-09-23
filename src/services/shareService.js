import { Alert, Share, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  query,
  where,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { saveEvent, getEvents, deleteEvent } from './eventService';
import { getProfile } from './profileService';
import { importSharedWords, getWordNumbers } from './wordToIntService';
import { buildShareLink, parseInviteCodeFromScan } from '../utils/inviteCode';
export { buildShareLink, parseInviteCodeFromScan };


export const FRIEND_COLOURS = ['#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#a78bfa', '#fb7185'];

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SHARED_GRAPH_KEY = '@timeline_shared_graph_v1';

function getUid() {
  return auth.currentUser?.uid || null;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function stripUndefined(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map(stripUndefined).filter((item) => item !== undefined);
  }
  // Keep Firestore FieldValue sentinels (arrayUnion, etc.) intact
  if (value && typeof value === 'object') {
    if (typeof value._methodName === 'string' || typeof value.isEqual === 'function') {
      return value;
    }
    // Reject Blob/File/Map/custom class instances — invalid nested entities for Firestore
    if (!isPlainObject(value)) return undefined;
    const out = {};
    Object.keys(value).forEach((key) => {
      const next = stripUndefined(value[key]);
      if (next !== undefined) out[key] = next;
    });
    return out;
  }
  // functions, symbols, etc. are not valid Firestore values
  return undefined;
}

/** Allowed plain fields under sharedEvents.participants.{uid} / invite participant patches. */
const PARTICIPANT_CLOUD_KEYS = [
  'uid',
  'displayName',
  'email',
  'initial',
  'colour',
  'status',
  'joinedAt',
  'leftAt',
  'acceptedAt',
  'declinedAt',
];

/**
 * Firestore-safe participant map entry.
 * Never includes photoUri or any local image ref (data:/blob:/asref:/File) — those are UI/local only.
 * TODO: friend avatars need Firebase Storage download URLs later.
 */
export function participantForCloud(me = {}) {
  if (!me || typeof me !== 'object') return {};
  const out = {};
  PARTICIPANT_CLOUD_KEYS.forEach((key) => {
    if (!(key in me) || me[key] === undefined || me[key] === null) return;
    const v = me[key];
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed) out[key] = trimmed;
      return;
    }
    if (typeof v === 'number' || typeof v === 'boolean') {
      out[key] = v;
    }
    // skip objects / arrays / odd refs
  });
  return out;
}

function toIso(value) {
  if (!value) return value;
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch (_) {
      return value;
    }
  }
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function makeInviteCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}


export function qrImageUrl(data, size = 220) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
}

async function currentParticipantProfile(colour) {
  const uid = getUid();
  const user = auth.currentUser;
  const profile = await getProfile().catch(() => ({ displayName: '' }));
  const displayName =
    (profile && profile.displayName) ||
    (user && user.displayName) ||
    (user && user.email ? user.email.split('@')[0] : '') ||
    'Friend';
  const initial = (displayName || user?.email || 'F').charAt(0).toUpperCase();
  // Local/UI helper only — never put photoUri here for cloud writes (use participantForCloud).
  return stripUndefined({
    uid,
    displayName,
    email: user?.email || undefined,
    initial,
    colour: colour || FRIEND_COLOURS[0],
  });
}

/**
 * Resolve inviter/friend email from invite + sharedEvent data already stored.
 * Client Auth cannot look up another user's email by uid safely, so we prefer
 * emails persisted at share/accept time (invite.fromEmail, createdByEmail,
 * participants[uid].email).
 */
export function resolveInviterEmail({ shared, invite, fromUid } = {}) {
  const uid = fromUid || invite?.fromUid || shared?.createdByUid || null;
  const candidates = [
    invite?.fromEmail,
    shared?.createdByEmail,
    uid && shared?.participants?.[uid]?.email,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.includes('@')) return c.trim();
  }
  return undefined;
}

/**
 * Label for event detail/source UI.
 * - Invitee (accepted share): "From friend - email" or "From friend - * - Creator's own shared event: "Shared event"
 * - Personal: null
 */
export function getEventFriendSourceLabel(event, myUid) {
  if (!event) return null;
  const fromFriend =
    event.source === 'shared' ||
    !!event.sharedFromEmail ||
    (event.sharedFrom && myUid && event.sharedFrom !== myUid);
  if (fromFriend) {
    const email = event.sharedFromEmail || event.fromEmail;
    if (typeof email === 'string' && email.includes('@')) {
      return `From friend - ${email}`;
    }
    return 'From friend';
  }
  if (event.isShared || event.shareId) return 'Shared event';
  return null;
}
/**
 * Create a sharedEvents doc + invite code for an existing local/cloud event.
 * Creator is already a participant. Links shareId onto the creator's event.
 */
export async function createEventShare(event) {
  const uid = getUid();
  if (!uid) throw new Error('Sign in to share an event with a friend.');
  if (!event?.id) throw new Error('Save the event before sharing.');

  const now = new Date();
  const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  let code = makeInviteCode(6);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existingInvite = await getDoc(doc(db, 'eventInvites', code));
    if (!existingInvite.exists()) break;
    code = makeInviteCode(6);
  }

  const me = await currentParticipantProfile(FRIEND_COLOURS[0]);
  let shareId = event.shareId || null;
  let sharedPayload = null;

  if (shareId) {
    const existingShare = await getSharedEvent(shareId);
    if (existingShare) {
      sharedPayload = existingShare;
      // Ensure creator still listed
      if (!(existingShare.participantUids || []).includes(uid)) {
        const cloudMe = participantForCloud(me);
        await updateDoc(doc(db, 'sharedEvents', shareId), {
          participantUids: arrayUnion(uid),
          [`participants.${uid}`]: cloudMe,
          updatedAt: now.toISOString(),
        });
        sharedPayload = await getSharedEvent(shareId);
      }
    } else {
      shareId = null;
    }
  }

  if (!shareId) {
    shareId = `share_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    sharedPayload = stripUndefined({
      title: event.title || 'Shared event',
      description: event.description || '',
      date: event.date || now.toISOString(),
      category: event.category || 'personal',
      createdByUid: uid,
      createdByName: me.displayName,
      createdByEmail: me.email,
      sourceEventId: event.id,
      participantUids: [uid],
      participants: {
        [uid]: participantForCloud(me),
      },
      status: 'active',
      colour: '#8b5cf6',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    await setDoc(doc(db, 'sharedEvents', shareId), sharedPayload);
  }

  const invitePayload = stripUndefined({
    shareId,
    fromUid: uid,
    fromName: me.displayName,
    fromEmail: me.email,
    code,
    status: 'pending',
    eventTitle: (sharedPayload && sharedPayload.title) || event.title || 'Shared event',
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  });
  await setDoc(doc(db, 'eventInvites', code), invitePayload);

  await saveEvent({
    ...event,
    id: event.id,
    shareId,
    isShared: true,
    sharedFrom: event.sharedFrom || uid,
  });

  const link = buildShareLink(code);
  return { shareId, code, link, invite: invitePayload, shared: sharedPayload };
}

function slimWord(item) {
  return stripUndefined({
    phrase: item.phrase,
    notes: item.notes || '',
    preferred: item.preferred || 'ordinal',
    ordinal: item.ordinal,
    pythagorean: item.pythagorean,
    reverse: item.reverse,
    reduced: item.reduced,
    hashCode: item.hashCode,
  });
}

export async function createWordListShare(items) {
  const uid = getUid();
  if (!uid) throw new Error('Sign in to share your word list.');
  const words = (items || []).map(slimWord).filter((w) => w && w.phrase);
  if (!words.length) throw new Error('Pick at least one word to share.');

  const now = new Date();
  const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  let code = makeInviteCode(6);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existingInvite = await getDoc(doc(db, 'eventInvites', code));
    if (!existingInvite.exists()) break;
    code = makeInviteCode(6);
  }

  const me = await currentParticipantProfile(FRIEND_COLOURS[0]);
  const shareId = `words_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const payload = stripUndefined({
    kind: 'words',
    title: `Word list (${words.length})`,
    words,
    wordCount: words.length,
    createdByUid: uid,
    createdByName: me.displayName,
    createdByEmail: me.email,
    participantUids: [uid],
    participants: { [uid]: participantForCloud(me) },
    status: 'active',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  await setDoc(doc(db, 'sharedWordLists', shareId), payload);

  const invitePayload = stripUndefined({
    kind: 'words',
    shareId,
    fromUid: uid,
    fromName: me.displayName,
    fromEmail: me.email,
    code,
    status: 'pending',
    eventTitle: payload.title,
    wordCount: words.length,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  });
  await setDoc(doc(db, 'eventInvites', code), invitePayload);

  const link = buildShareLink(code);
  return { shareId, code, link, invite: invitePayload, shared: payload };
}

export async function stashSharedGraph(layout) {
  await AsyncStorage.setItem(SHARED_GRAPH_KEY, JSON.stringify(layout));
}

export async function takeSharedGraph() {
  const raw = await AsyncStorage.getItem(SHARED_GRAPH_KEY);
  if (!raw) return null;
  await AsyncStorage.removeItem(SHARED_GRAPH_KEY);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function createGraphShare({ nodes, positions, methods }) {
  const uid = getUid();
  if (!uid) throw new Error('Sign in to share the graph.');
  const words = [];
  const hubs = [];
  (nodes || []).forEach((node) => {
    const place = positions?.[node.id] || {};
    if (node.kind === 'word' && node.entry?.phrase) {
      words.push(
        stripUndefined({
          ...slimWord(node.entry),
          x: place.x,
          y: place.y,
          pinned: !!(place.userPin || place.pin),
        })
      );
    } else if (node.kind === 'number') {
      hubs.push(
        stripUndefined({
          id: node.id,
          label: node.label,
          method: node.method,
          x: place.x,
          y: place.y,
          pinned: !!(place.userPin || place.pin),
        })
      );
    }
  });
  if (!words.length) throw new Error('There are no word nodes to share.');

  const now = new Date();
  const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  let code = makeInviteCode(6);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existingInvite = await getDoc(doc(db, 'eventInvites', code));
    if (!existingInvite.exists()) break;
    code = makeInviteCode(6);
  }

  const me = await currentParticipantProfile(FRIEND_COLOURS[0]);
  const shareId = `graph_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const nodeCount = words.length + hubs.length;
  const payload = stripUndefined({
    kind: 'graph',
    title: `Word graph (${nodeCount} nodes)`,
    words,
    hubs,
    methods: Array.isArray(methods) && methods.length ? methods : ['ordinal'],
    wordCount: words.length,
    nodeCount,
    createdByUid: uid,
    createdByName: me.displayName,
    createdByEmail: me.email,
    participantUids: [uid],
    participants: { [uid]: participantForCloud(me) },
    status: 'active',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  await setDoc(doc(db, 'sharedWordLists', shareId), payload);

  const invitePayload = stripUndefined({
    kind: 'graph',
    shareId,
    fromUid: uid,
    fromName: me.displayName,
    fromEmail: me.email,
    code,
    status: 'pending',
    eventTitle: payload.title,
    wordCount: words.length,
    nodeCount,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  });
  await setDoc(doc(db, 'eventInvites', code), invitePayload);
  return { shareId, code, link: buildShareLink(code), invite: invitePayload, shared: payload };
}

async function acceptGraphInvite(invite, uid, code) {
  const list = await getSharedWordList(invite.shareId);
  if (!list || list.kind !== 'graph') throw new Error('Shared graph not found.');
  const nowIso = new Date().toISOString();
  if (!(list.participantUids || []).includes(uid)) {
    const colourIndex = (list.participantUids || []).length % FRIEND_COLOURS.length;
    const me = await currentParticipantProfile(FRIEND_COLOURS[colourIndex]);
    await updateDoc(doc(db, 'sharedWordLists', list.id), {
      participantUids: arrayUnion(uid),
      [`participants.${uid}`]: participantForCloud({ ...me, status: 'accepted', joinedAt: nowIso }),
      updatedAt: nowIso,
    });
  }
  await updateDoc(doc(db, 'eventInvites', code), {
    status: 'accepted',
    acceptedByUid: uid,
    acceptedAt: nowIso,
  });
  const imported = await importSharedWords(list.words || []);
  const local = await getWordNumbers();
  const byPhrase = new Map(local.map((item) => [String(item.phrase || '').toLowerCase(), item]));
  const positions = {};
  (list.words || []).forEach((word) => {
    const found = byPhrase.get(String(word.phrase || '').toLowerCase());
    if (!found || !Number.isFinite(Number(word.x))) return;
    positions[found.id] = { x: Number(word.x), y: Number(word.y), userPin: !!word.pinned };
  });
  (list.hubs || []).forEach((hub) => {
    if (!hub?.id || !Number.isFinite(Number(hub.x))) return;
    positions[hub.id] = { x: Number(hub.x), y: Number(hub.y), userPin: !!hub.pinned };
  });
  await stashSharedGraph({
    fromName: list.createdByName || invite.fromName || 'A friend',
    layout: {
      positions,
      zoom: 1,
      methods: list.methods || ['ordinal'],
      layoutId: 'force',
    },
  });
  return {
    kind: 'graph',
    shared: list,
    invite,
    imported,
    alreadyParticipant: (list.participantUids || []).includes(uid),
  };
}

export async function getSharedWordList(shareId) {
  if (!shareId) return null;
  const snap = await getDoc(doc(db, 'sharedWordLists', shareId));
  if (!snap.exists()) return null;
  const data = snap.data() || {};
  return { id: snap.id, ...data };
}

export async function getInviteByCode(code) {
  const normalised = String(code || '').trim().toUpperCase();
  if (!normalised) return null;
  const snap = await getDoc(doc(db, 'eventInvites', normalised));
  if (!snap.exists()) return null;
  const data = snap.data() || {};
  return {
    id: snap.id,
    ...data,
    code: data.code || snap.id,
    createdAt: toIso(data.createdAt),
    expiresAt: toIso(data.expiresAt),
  };
}

export async function getSharedEvent(shareId) {
  if (!shareId) return null;
  const snap = await getDoc(doc(db, 'sharedEvents', shareId));
  if (!snap.exists()) return null;
  const data = snap.data() || {};
  return {
    id: snap.id,
    ...data,
    date: toIso(data.date),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

function inviteIsUsable(invite) {
  if (!invite) return { ok: false, reason: 'Invite not found.' };
  if (invite.status === 'accepted') return { ok: false, reason: 'This invite was already accepted.' };
  if (invite.status === 'declined') return { ok: false, reason: 'This invite was declined.' };
  if (invite.status === 'expired') return { ok: false, reason: 'This invite has expired.' };
  if (invite.expiresAt) {
    const exp = new Date(invite.expiresAt).getTime();
    if (Number.isFinite(exp) && exp < Date.now()) {
      return { ok: false, reason: 'This invite has expired.' };
    }
  }
  return { ok: true };
}

async function acceptWordListInvite(invite, uid, code) {
  const list = await getSharedWordList(invite.shareId);
  if (!list) throw new Error('Shared word list not found.');
  const nowIso = new Date().toISOString();
  if (!(list.participantUids || []).includes(uid)) {
    const colourIndex = (list.participantUids || []).length % FRIEND_COLOURS.length;
    const me = await currentParticipantProfile(FRIEND_COLOURS[colourIndex]);
    await updateDoc(doc(db, 'sharedWordLists', list.id), {
      participantUids: arrayUnion(uid),
      [`participants.${uid}`]: participantForCloud({ ...me, status: 'accepted', joinedAt: nowIso }),
      updatedAt: nowIso,
    });
  }
  await updateDoc(doc(db, 'eventInvites', code), {
    status: 'accepted',
    acceptedByUid: uid,
    acceptedAt: nowIso,
  });
  const imported = await importSharedWords(list.words || []);
  return {
    kind: 'words',
    shared: list,
    invite,
    imported,
    alreadyParticipant: (list.participantUids || []).includes(uid),
  };
}

/**
 * Accept invite by code: add current user to shared event participants,
 * mark invite accepted, and create/link a local event copy.
 */
export async function acceptInviteByCode(rawCode) {
  const uid = getUid();
  if (!uid) throw new Error('Sign in to accept an invite.');

  const code = String(rawCode || '').trim().toUpperCase();
  const invite = await getInviteByCode(code);
  const usable = inviteIsUsable(invite);
  if (!usable.ok) throw new Error(usable.reason);

  if (invite.kind === 'graph') {
    return acceptGraphInvite(invite, uid, code);
  }

  if (invite.kind === 'words') {
    return acceptWordListInvite(invite, uid, code);
  }

  const shared = await getSharedEvent(invite.shareId);
  if (!shared) throw new Error('Shared event not found.');

  if ((shared.participantUids || []).includes(uid)) {
    // Already a participant â€” still ensure a local event exists.
    const local = await ensureLocalSharedEvent(shared, uid, invite);
    return { shared, invite, event: local, alreadyParticipant: true };
  }

  const colourIndex = (shared.participantUids || []).length % FRIEND_COLOURS.length;
  const me = await currentParticipantProfile(FRIEND_COLOURS[colourIndex]);
  const nowIso = new Date().toISOString();

  const shareRef = doc(db, 'sharedEvents', shared.id);
  const participantPatch = participantForCloud({ ...me, status: 'accepted', joinedAt: nowIso });
  await updateDoc(shareRef, {
    participantUids: arrayUnion(uid),
    [`participants.${uid}`]: participantPatch,
    updatedAt: nowIso,
  });

  await updateDoc(doc(db, 'eventInvites', code), {
    status: 'accepted',
    acceptedByUid: uid,
    acceptedAt: new Date().toISOString(),
  });

  const refreshed = await getSharedEvent(shared.id);
  const local = await ensureLocalSharedEvent(refreshed || shared, uid, invite);
  return { shared: refreshed || shared, invite, event: local, alreadyParticipant: false };
}

async function ensureLocalSharedEvent(shared, uid, invite = null) {
  const friendEmail = resolveInviterEmail({ shared, invite, fromUid: shared.createdByUid });
  const events = await getEvents();
  const existing = events.find(
    (e) => e.shareId === shared.id || (e.isShared && e.title === shared.title && e.date === shared.date),
  );
  if (existing) {
    const isInvitee = shared.createdByUid && shared.createdByUid !== uid;
    const inviteCodeHint = invite && (invite.code || invite.id);
    const needsMeta =
      !existing.shareId ||
      (isInvitee && existing.source !== 'shared') ||
      !existing.sharedFrom ||
      (friendEmail && !existing.sharedFromEmail) ||
      (inviteCodeHint && !existing.inviteCode);
    if (needsMeta) {
      const inviteCode =
        existing.inviteCode ||
        (invite && (invite.code || invite.id)) ||
        undefined;
      const patched = {
        ...existing,
        shareId: shared.id,
        isShared: true,
        sharedFrom: existing.sharedFrom || shared.createdByUid,
        sharedFromEmail: existing.sharedFromEmail || friendEmail,
        inviteCode: inviteCode || existing.inviteCode,
      };
      if (isInvitee) {
        patched.source = 'shared';
        patched.sharedFrom = shared.createdByUid;
        if (friendEmail) patched.sharedFromEmail = friendEmail;
      }
      await saveEvent(patched);
      return patched;
    }
    return existing;
  }

  const payload = stripUndefined({
    title: shared.title,
    description: shared.description || '',
    date: shared.date || new Date().toISOString(),
    category: shared.category || 'personal',
    source: 'shared',
    nextAction: 'none',
    shareId: shared.id,
    isShared: true,
    sharedFrom: shared.createdByUid,
    sharedFromEmail: friendEmail,
    inviteCode: (invite && (invite.code || invite.id)) || undefined,
  });
  await saveEvent(payload);
  const after = await getEvents();
  return after.find((e) => e.shareId === shared.id) || payload;
}

/**
 * Load shared events that include the current user.
 * Prefers Firestore query; falls back to local shareId pointers.
 */
export async function getMySharedEvents() {
  const uid = getUid();
  if (!uid) return [];

  const byId = {};

  try {
    const q = query(
      collection(db, 'sharedEvents'),
      where('participantUids', 'array-contains', uid),
    );
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const data = d.data() || {};
      byId[d.id] = {
        id: d.id,
        ...data,
        date: toIso(data.date),
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });
  } catch (e) {
    console.warn('sharedEvents query failed', e);
  }

  try {
    const local = await getEvents();
    const shareIds = [...new Set(local.filter((e) => e.shareId).map((e) => e.shareId))];
    await Promise.all(
      shareIds.map(async (shareId) => {
        if (byId[shareId]) return;
        try {
          const shared = await getSharedEvent(shareId);
          if (shared && (shared.participantUids || []).includes(uid)) {
            byId[shareId] = shared;
          }
        } catch (_) {}
      }),
    );
  } catch (_) {}

  return Object.values(byId)
    .filter((shared) => hasActiveOtherParticipants(shared, uid))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

/** True if share still has at least one other active friend (not left/declined). */
export function hasActiveOtherParticipants(shared, myUid) {
  const uids = shared?.participantUids || [];
  return uids.some((otherUid) => {
    if (!otherUid || otherUid === myUid) return false;
    const status = shared?.participants?.[otherUid]?.status;
    if (status === 'left' || status === 'declined') return false;
    return true;
  });
}

export async function copyTextToClipboard(text) {
  const value = String(text || '');
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  try {
    // Optional dependency; may be absent in Expo Go web.
    const Clipboard = require('expo-clipboard');
    if (Clipboard?.setStringAsync) {
      await Clipboard.setStringAsync(value);
      return true;
    }
  } catch (_) {}
  return false;
}

export async function shareInviteViaOs(code, eventTitle) {
  const link = buildShareLink(code);
  const message = `Join my Timeline event "${eventTitle || 'Shared event'}" with code ${code}\n${link}`;
  try {
    await Share.share(
      Platform.OS === 'ios'
        ? { message, url: link }
        : { message, title: 'Timeline invite' },
    );
    return true;
  } catch (e) {
    if (e?.message && /share.*cancel/i.test(e.message)) return false;
    console.warn('OS share failed', e);
    return false;
  }
}

export function colourForParticipant(shared, uid, indexFallback = 0) {
  const profile = shared?.participants?.[uid];
  if (profile?.colour) return profile.colour;
  return FRIEND_COLOURS[indexFallback % FRIEND_COLOURS.length];
}

export function listOtherParticipants(shared, myUid) {
  const uids = (shared?.participantUids || []).filter((id) => id && id !== myUid);
  return uids.map((uid, index) => {
    const profile = (shared.participants && shared.participants[uid]) || {};
    return {
      uid,
      displayName: profile.displayName || profile.email || 'Friend',
      email: profile.email || undefined,
      photoUri: profile.photoUri || null,
      initial: profile.initial || (profile.displayName || profile.email || 'F').charAt(0).toUpperCase(),
      colour: profile.colour || FRIEND_COLOURS[(index + 1) % FRIEND_COLOURS.length],
    };
  });
}


/**
 * True when this local event is a friend/invitee copy (not the creator's canonical event).
 * Creator: isShared/shareId but source stays personal; sharedFrom is self or unset.
 * Invitee: source === 'shared' and/or sharedFrom points at someone else.
 */
export function isSharedEventInvitee(event, myUid) {
  if (!event || !myUid) return false;
  if (event.source === 'shared') return true;
  if (event.sharedFrom && event.sharedFrom !== myUid) return true;
  return false;
}

function leaveNoticeLabel(profile) {
  const email = typeof profile?.email === 'string' && profile.email.includes('@') ? profile.email.trim() : '';
  const name = (profile?.displayName || '').trim();
  return email || name || 'A friend';
}

/**
 * Invitee leaves a shared event: remove personal copy only; mark participant left;
 * notify creator via sharedEvents.recentLeft (no push). Does NOT delete sharedEvents
 * or the creator's event.
 * Creator delete still uses deleteEvent on their own copy (may end the share for them;
 * sharedEvents doc can remain for other participants until they leave).
 */
export async function leaveSharedEvent(event, { action = 'left' } = {}) {
  const uid = getUid();
  if (!uid) throw new Error('Sign in to leave a shared event.');
  if (!event?.id) throw new Error('Missing event.');
  if (!isSharedEventInvitee(event, uid)) {
    throw new Error('Only invitees leave a shared event. Creators can delete their own event.');
  }

  const shareId = event.shareId || null;
  const nowIso = new Date().toISOString();
  const me = await currentParticipantProfile().catch(() => ({
    uid,
    displayName: auth.currentUser?.displayName || '',
    email: auth.currentUser?.email || undefined,
  }));
  const who = leaveNoticeLabel(me);
  const verb = action === 'declined' || action === 'rejected' ? 'declined' : 'left';
  const notice = `${who} ${verb} this shared event`;

  if (shareId) {
    const shareRef = doc(db, 'sharedEvents', shareId);
    const existingShare = await getSharedEvent(shareId);
    const prev = (existingShare?.participants && existingShare.participants[uid]) || {};
    const participantUpdate = participantForCloud({
      ...prev,
      ...me,
      uid,
      status: verb === 'declined' ? 'declined' : 'left',
      leftAt: nowIso,
    });
    const patch = {
      participantUids: arrayRemove(uid),
      [`participants.${uid}`]: participantUpdate,
      recentLeft: stripUndefined({
        uid,
        email: me.email || undefined,
        displayName: me.displayName || undefined,
        leftAt: nowIso,
        action: verb,
        notice,
      }),
      updatedAt: nowIso,
    };
    try {
      await updateDoc(shareRef, stripUndefined(patch) || patch);
    } catch (e) {
      console.warn('Could not update sharedEvents on leave', e);
      throw new Error(e?.message || 'Could not update the shared event. Try again.');
    }

    // Do not query eventInvites by shareId (rules/query fragile). Update the
    // single invite doc by id when we stored inviteCode on the local event.
    const inviteCode = event.inviteCode
      ? String(event.inviteCode).trim().toUpperCase()
      : null;
    if (inviteCode) {
      try {
        await updateDoc(doc(db, 'eventInvites', inviteCode), {
          status: 'declined',
          declinedByUid: uid,
          declinedAt: nowIso,
        });
      } catch (_) {
        // Silent — leave already succeeded; LogBox must not show a warn.
      }
    }
  }

  await deleteEvent(event.id);
  return { shareId, notice, action: verb };
}

/**
 * Reject/decline an invite by code. Notifies creator via recentLeft.
 * If already a participant with a local copy, uses the leave path.
 */
export async function rejectInviteByCode(rawCode) {
  const uid = getUid();
  if (!uid) throw new Error('Sign in to decline an invite.');

  const code = String(rawCode || '').trim().toUpperCase();
  const invite = await getInviteByCode(code);
  if (!invite) throw new Error('Invite not found.');
  if (invite.status === 'declined') return { alreadyDeclined: true, invite };

  const nowIso = new Date().toISOString();
  const me = await currentParticipantProfile().catch(() => ({
    uid,
    displayName: auth.currentUser?.displayName || '',
    email: auth.currentUser?.email || undefined,
  }));
  const who = leaveNoticeLabel(me);
  const notice = `${who} declined this shared event`;

  if (invite.shareId) {
    const shared = await getSharedEvent(invite.shareId);
    if (shared && (shared.participantUids || []).includes(uid)) {
      const events = await getEvents();
      const localEvent = events.find((e) => e.shareId === invite.shareId) || null;
      if (localEvent) {
        await updateDoc(doc(db, 'eventInvites', code), {
          status: 'declined',
          declinedByUid: uid,
          declinedAt: nowIso,
        });
        const result = await leaveSharedEvent(localEvent, { action: 'declined' });
        return { invite, shared, ...result };
      }
    }

    const shareRef = doc(db, 'sharedEvents', invite.shareId);
    try {
      await updateDoc(
        shareRef,
        stripUndefined({
          [`participants.${uid}`]: participantForCloud({
            ...me,
            uid,
            status: 'declined',
            leftAt: nowIso,
          }),
          recentLeft: {
            uid,
            email: me.email || undefined,
            displayName: me.displayName || undefined,
            leftAt: nowIso,
            action: 'declined',
            notice,
          },
          updatedAt: nowIso,
        }),
      );
    } catch (e) {
      console.warn('Could not notify creator on decline', e);
    }
  }

  await updateDoc(doc(db, 'eventInvites', code), {
    status: 'declined',
    declinedByUid: uid,
    declinedAt: nowIso,
  });

  return { invite, notice, action: 'declined' };
}

/** Clear creator-facing leave/decline banner after they have seen it. */
export async function clearRecentLeftNotice(shareId) {
  const uid = getUid();
  if (!uid || !shareId) return;
  const shared = await getSharedEvent(shareId);
  if (!shared) return;
  if (shared.createdByUid && shared.createdByUid !== uid) return;
  await updateDoc(doc(db, 'sharedEvents', shareId), {
    recentLeft: null,
    updatedAt: new Date().toISOString(),
  });
}

export function formatRecentLeftNotice(shared) {
  const rl = shared?.recentLeft;
  if (!rl) return null;
  if (typeof rl.notice === 'string' && rl.notice.trim()) return rl.notice.trim();
  const who =
    (typeof rl.email === 'string' && rl.email.includes('@') && rl.email.trim()) ||
    (rl.displayName && String(rl.displayName).trim()) ||
    'A friend';
  const verb = rl.action === 'declined' || rl.action === 'rejected' ? 'declined' : 'left';
  return `${who} ${verb} this shared event`;
}

function makeSuggestionId() {
  return `sug_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listEditSuggestions(shared) {
  const raw = shared?.editSuggestions;
  return Array.isArray(raw) ? raw.filter(Boolean) : [];
}

export function pendingEditSuggestions(shared) {
  return listEditSuggestions(shared).filter((s) => s && s.status === 'pending');
}

export function formatRecentSuggestionNotice(shared) {
  const rs = shared?.recentSuggestion;
  if (!rs) return null;
  if (typeof rs.notice === 'string' && rs.notice.trim()) return rs.notice.trim();
  const who =
    (typeof rs.fromEmail === 'string' && rs.fromEmail.includes('@') && rs.fromEmail.trim()) ||
    (rs.fromDisplayName && String(rs.fromDisplayName).trim()) ||
    'A friend';
  return `${who} suggested a note on this shared event`;
}

export function countPendingSuggestions(shared) {
  return pendingEditSuggestions(shared).length;
}

/** Clear creator-facing suggestion banner after they have seen it. */
export async function clearRecentSuggestionNotice(shareId) {
  const uid = getUid();
  if (!uid || !shareId) return;
  const shared = await getSharedEvent(shareId);
  if (!shared) return;
  if (shared.createdByUid && shared.createdByUid !== uid) return;
  await updateDoc(doc(db, 'sharedEvents', shareId), {
    recentSuggestion: null,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Invitee suggests a note on a shared event (does not edit core fields).
 * Persists on sharedEvents/{shareId}.editSuggestions[] and sets recentSuggestion
 * for the creator Share screen banner.
 */
export async function submitEditSuggestion(shareId, note) {
  const uid = getUid();
  if (!uid) throw new Error('Sign in to suggest a note.');
  if (!shareId) throw new Error('Missing shared event.');
  const trimmed = String(note || '').trim();
  if (!trimmed) throw new Error('Write a short note to suggest.');

  const shared = await getSharedEvent(shareId);
  if (!shared) throw new Error('Shared event not found.');
  if (shared.createdByUid === uid) {
    throw new Error('You own this event — edit it directly instead of suggesting.');
  }
  const stillParticipant = (shared.participantUids || []).includes(uid);
  if (!stillParticipant) {
    const hadEntry = !!(shared.participants && shared.participants[uid]);
    if (!hadEntry) throw new Error('Only invitees on this share can suggest notes.');
  }

  const me = await currentParticipantProfile().catch(() => ({
    uid,
    displayName: auth.currentUser?.displayName || '',
    email: auth.currentUser?.email || undefined,
  }));
  const nowIso = new Date().toISOString();
  const fromEmail =
    (typeof me.email === 'string' && me.email.includes('@') && me.email.trim()) ||
    (auth.currentUser?.email || undefined);
  const suggestion = stripUndefined({
    id: makeSuggestionId(),
    fromUid: uid,
    fromEmail: fromEmail || undefined,
    fromDisplayName: me.displayName || undefined,
    note: trimmed,
    status: 'pending',
    createdAt: nowIso,
  });

  const existing = listEditSuggestions(shared);
  const editSuggestions = [...existing, suggestion];
  const who = leaveNoticeLabel(me);
  const notice = `${who} suggested a note on this shared event`;

  await updateDoc(
    doc(db, 'sharedEvents', shareId),
    stripUndefined({
      editSuggestions,
      recentSuggestion: {
        suggestionId: suggestion.id,
        fromUid: uid,
        fromEmail: fromEmail || undefined,
        fromDisplayName: me.displayName || undefined,
        createdAt: nowIso,
        notice,
      },
      updatedAt: nowIso,
    }),
  );

  return { suggestion, notice };
}

function attributedNoteBlock(suggestion) {
  const who =
    (typeof suggestion?.fromEmail === 'string' && suggestion.fromEmail.includes('@')
      ? suggestion.fromEmail.trim()
      : null) ||
    (suggestion?.fromDisplayName && String(suggestion.fromDisplayName).trim()) ||
    'friend';
  return `\n\nNote from ${who}:\n${String(suggestion.note || '').trim()}`;
}

/**
 * Pull latest sharedEvents fields onto the user's local event copy (description etc.).
 * Used so invitees see approved notes without needing write access to each other.
 */
export async function syncLocalEventFromShared(localEvent) {
  const uid = getUid();
  if (!uid || !localEvent?.shareId) return localEvent || null;
  const shared = await getSharedEvent(localEvent.shareId);
  if (!shared) return localEvent;

  const nextDesc = shared.description != null ? String(shared.description) : localEvent.description || '';
  const nextTitle = shared.title != null ? String(shared.title) : localEvent.title;
  const nextDate = shared.date || localEvent.date;
  const nextCategory = shared.category || localEvent.category;

  const changed =
    nextDesc !== (localEvent.description || '') ||
    nextTitle !== localEvent.title ||
    nextDate !== localEvent.date ||
    nextCategory !== localEvent.category;

  if (!changed) return localEvent;

  const patched = {
    ...localEvent,
    title: nextTitle,
    description: nextDesc,
    date: nextDate,
    category: nextCategory || localEvent.category,
    shareId: shared.id,
    isShared: true,
  };
  await saveEvent(patched);
  return patched;
}

/**
 * Creator approves a pending suggestion: append attributed note to shared description,
 * mark approved, update creator's local event copy. Invitee copies refresh via
 * syncLocalEventFromShared when they open the event.
 */
export async function approveEditSuggestion(shareId, suggestionId) {
  const uid = getUid();
  if (!uid) throw new Error('Sign in to approve suggestions.');
  if (!shareId || !suggestionId) throw new Error('Missing suggestion.');

  const shared = await getSharedEvent(shareId);
  if (!shared) throw new Error('Shared event not found.');
  if (shared.createdByUid && shared.createdByUid !== uid) {
    throw new Error('Only the event creator can approve suggestions.');
  }

  const suggestions = listEditSuggestions(shared);
  const idx = suggestions.findIndex((s) => s && s.id === suggestionId);
  if (idx < 0) throw new Error('Suggestion not found.');
  const suggestion = suggestions[idx];
  if (suggestion.status !== 'pending') {
    throw new Error(`Suggestion is already ${suggestion.status}.`);
  }

  const nowIso = new Date().toISOString();
  const block = attributedNoteBlock(suggestion);
  const newDescription = `${shared.description || ''}${block}`;
  const updatedSuggestions = suggestions.map((s, i) =>
    i === idx
      ? stripUndefined({ ...s, status: 'approved', resolvedAt: nowIso, resolvedByUid: uid })
      : s,
  );

  const pendingLeft = updatedSuggestions.filter((s) => s.status === 'pending');
  const patch = stripUndefined({
    description: newDescription,
    editSuggestions: updatedSuggestions,
    updatedAt: nowIso,
    recentSuggestion: pendingLeft.length
      ? shared.recentSuggestion || null
      : null,
  });

  await updateDoc(doc(db, 'sharedEvents', shareId), patch);

  // Update creator's local event copy (and any same-shareId row we own).
  const events = await getEvents();
  const mine = events.filter((e) => e.shareId === shareId || e.id === shared.sourceEventId);
  for (const ev of mine) {
    await saveEvent({
      ...ev,
      description: newDescription,
      title: shared.title || ev.title,
      date: shared.date || ev.date,
      category: shared.category || ev.category,
      shareId,
      isShared: true,
    });
  }

  return {
    description: newDescription,
    suggestion: { ...suggestion, status: 'approved', resolvedAt: nowIso },
    pendingCount: pendingLeft.length,
  };
}

/** Creator declines a pending suggestion (no description change). */
export async function declineEditSuggestion(shareId, suggestionId) {
  const uid = getUid();
  if (!uid) throw new Error('Sign in to decline suggestions.');
  if (!shareId || !suggestionId) throw new Error('Missing suggestion.');

  const shared = await getSharedEvent(shareId);
  if (!shared) throw new Error('Shared event not found.');
  if (shared.createdByUid && shared.createdByUid !== uid) {
    throw new Error('Only the event creator can decline suggestions.');
  }

  const suggestions = listEditSuggestions(shared);
  const idx = suggestions.findIndex((s) => s && s.id === suggestionId);
  if (idx < 0) throw new Error('Suggestion not found.');
  const suggestion = suggestions[idx];
  if (suggestion.status !== 'pending') {
    throw new Error(`Suggestion is already ${suggestion.status}.`);
  }

  const nowIso = new Date().toISOString();
  const updatedSuggestions = suggestions.map((s, i) =>
    i === idx
      ? stripUndefined({ ...s, status: 'declined', resolvedAt: nowIso, resolvedByUid: uid })
      : s,
  );
  const pendingLeft = updatedSuggestions.filter((s) => s.status === 'pending');

  await updateDoc(
    doc(db, 'sharedEvents', shareId),
    stripUndefined({
      editSuggestions: updatedSuggestions,
      updatedAt: nowIso,
      recentSuggestion: pendingLeft.length ? shared.recentSuggestion || null : null,
    }),
  );

  return {
    suggestion: { ...suggestion, status: 'declined', resolvedAt: nowIso },
    pendingCount: pendingLeft.length,
  };
}

export function warnShare(message, error) {
  if (error !== undefined) console.warn(message, error);
  else console.warn(message);
  try {
    Alert.alert('Sharing', message);
  } catch (_) {}
}
