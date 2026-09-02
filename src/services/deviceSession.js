import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, getDoc, getDocs, collection } from 'firebase/firestore';
import { db } from './firebase';

const DEVICE_ID_KEY = '@timeline_device_id';
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

function stripUndefined(value) {
  if (value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value
      .map(stripUndefined)
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === 'object') {
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

function randomId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function sessionsCollection(uid) {
  return collection(db, 'users', uid, 'sessions');
}

function sessionDoc(uid, deviceId) {
  return doc(db, 'users', uid, 'sessions', deviceId);
}

function normalizeSession(data, fallbackId) {
  const session = { ...data, id: data.id || fallbackId };
  if (session.lastSeen) session.lastSeen = toIso(session.lastSeen);
  if (session.createdAt) session.createdAt = toIso(session.createdAt);
  return session;
}

export async function getOrCreateDeviceId() {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
  } catch (e) {
    console.warn('Could not read install id', e);
  }
  const id = randomId();
  try {
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  } catch (e) {
    console.warn('Could not persist install id', e);
  }
  return id;
}

/**
 * Upsert this install under users/{uid}/sessions/{deviceId}.
 * Merge keeps createdAt if it already exists. Failures are logged, not thrown.
 */
export async function registerThisDevice(uid) {
  if (!uid) return null;
  try {
    const deviceId = await getOrCreateDeviceId();
    const now = new Date().toISOString();
    const ref = sessionDoc(uid, deviceId);
    const payload = {
      id: deviceId,
      platform: Platform.OS,
      lastSeen: now,
      userAgent: `${Platform.OS} ${Platform.Version}`,
    };
    let existingCreatedAt = null;
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data() || {};
        existingCreatedAt = data.createdAt ? toIso(data.createdAt) : null;
      }
    } catch (e) {
      console.warn('Could not read existing device session', e);
    }
    if (!existingCreatedAt) {
      payload.createdAt = now;
    }
    await setDoc(ref, stripUndefined(payload), { merge: true });
    return deviceId;
  } catch (e) {
    console.warn('Could not register this device session', e);
    return null;
  }
}

export async function listSessions(uid) {
  if (!uid) return [];
  try {
    const snap = await getDocs(sessionsCollection(uid));
    const sessions = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      sessions.push(normalizeSession(data, d.id));
    });
    sessions.sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));
    return sessions;
  } catch (e) {
    console.warn('Could not list device sessions', e);
    return [];
  }
}

export function otherRecentSessions(sessions, thisId) {
  const cutoff = Date.now() - RECENT_MS;
  return (sessions || []).filter((s) => {
    if (!s || s.id === thisId) return false;
    const seen = new Date(s.lastSeen || 0).getTime();
    return Number.isFinite(seen) && seen >= cutoff;
  });
}