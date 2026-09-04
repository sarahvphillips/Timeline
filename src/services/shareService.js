import { Alert, Share, Platform } from 'react-native';
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
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from './firebase';
import { saveEvent, getEvents } from './eventService';
import { getProfile } from './profileService';

const PROFILE_PHOTO_KEY = '@profile_photo';

export const FRIEND_COLOURS = ['#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#a78bfa', '#fb7185'];

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function getUid() {
  return auth.currentUser?.uid || null;
}

function stripUndefined(value) {
  if (value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map(stripUndefined).filter((item) => item !== undefined);
  }
  // Keep Firestore FieldValue sentinels (arrayUnion, etc.) intact
  if (value && typeof value === 'object') {
    if (typeof value._methodName === 'string' || typeof value.isEqual === 'function') {
      return value;
    }
    const out = {};
    Object.keys(value).forEach((key) => {
      const next = stripUndefined(value[key]);
      if (next !== undefined) out[key] = next;
    });
    return out;
  }
  return value;
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

export function buildShareLink(code) {
  return `timelineapp://share/${String(code || '').toUpperCase()}`;
}

export function qrImageUrl(data, size = 220) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
}

async function loadLocalPhotoUri() {
  try {
    return (await AsyncStorage.getItem(PROFILE_PHOTO_KEY)) || null;
  } catch (_) {
    return null;
  }
}

async function currentParticipantProfile(colour) {
  const uid = getUid();
  const user = auth.currentUser;
  const profile = await getProfile().catch(() => ({ displayName: '' }));
  const photoUri = await loadLocalPhotoUri();
  const displayName =
    (profile && profile.displayName) ||
    (user && user.displayName) ||
    (user && user.email ? user.email.split('@')[0] : '') ||
    'Friend';
  const initial = (displayName || user?.email || 'F').charAt(0).toUpperCase();
  return stripUndefined({
    uid,
    displayName,
    email: user?.email || undefined,
    photoUri: photoUri || undefined,
    initial,
    colour: colour || FRIEND_COLOURS[0],
  });
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
        await updateDoc(doc(db, 'sharedEvents', shareId), {
          participantUids: arrayUnion(uid),
          [`participants.${uid}`]: stripUndefined(me) || me,
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
      sourceEventId: event.id,
      participantUids: [uid],
      participants: {
        [uid]: me,
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

  const shared = await getSharedEvent(invite.shareId);
  if (!shared) throw new Error('Shared event not found.');

  if ((shared.participantUids || []).includes(uid)) {
    // Already a participant — still ensure a local event exists.
    const local = await ensureLocalSharedEvent(shared, uid);
    return { shared, invite, event: local, alreadyParticipant: true };
  }

  const colourIndex = (shared.participantUids || []).length % FRIEND_COLOURS.length;
  const me = await currentParticipantProfile(FRIEND_COLOURS[colourIndex]);

  const shareRef = doc(db, 'sharedEvents', shared.id);
  const participantPatch = stripUndefined(me) || me;
  await updateDoc(shareRef, {
    participantUids: arrayUnion(uid),
    [`participants.${uid}`]: participantPatch,
    updatedAt: new Date().toISOString(),
  });

  await updateDoc(doc(db, 'eventInvites', code), {
    status: 'accepted',
    acceptedByUid: uid,
    acceptedAt: new Date().toISOString(),
  });

  const refreshed = await getSharedEvent(shared.id);
  const local = await ensureLocalSharedEvent(refreshed || shared, uid);
  return { shared: refreshed || shared, invite, event: local, alreadyParticipant: false };
}

async function ensureLocalSharedEvent(shared, uid) {
  const events = await getEvents();
  const existing = events.find(
    (e) => e.shareId === shared.id || (e.isShared && e.title === shared.title && e.date === shared.date),
  );
  if (existing) {
    if (!existing.shareId) {
      await saveEvent({
        ...existing,
        shareId: shared.id,
        isShared: true,
        sharedFrom: shared.createdByUid,
      });
    }
    return existing;
  }

  const payload = {
    title: shared.title,
    description: shared.description || '',
    date: shared.date || new Date().toISOString(),
    category: shared.category || 'personal',
    source: 'shared',
    nextAction: 'none',
    shareId: shared.id,
    isShared: true,
    sharedFrom: shared.createdByUid,
  };
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

  return Object.values(byId).sort((a, b) => new Date(b.date) - new Date(a.date));
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
      photoUri: profile.photoUri || null,
      initial: profile.initial || (profile.displayName || profile.email || 'F').charAt(0).toUpperCase(),
      colour: profile.colour || FRIEND_COLOURS[(index + 1) % FRIEND_COLOURS.length],
    };
  });
}

export function warnShare(message, error) {
  if (error !== undefined) console.warn(message, error);
  else console.warn(message);
  try {
    Alert.alert('Sharing', message);
  } catch (_) {}
}
