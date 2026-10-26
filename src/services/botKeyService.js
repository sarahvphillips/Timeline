/**
 * "Connect a bot" keys. The key itself is generated on the server (Node crypto,
 * 32 random bytes) by POST /keys/create, so the app needs no extra crypto library.
 * Only the SHA-256 hash is stored in Firestore (botKeys/{hash}) and on this device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';

export const BOT_API_URL = 'https://europe-west2-timelineapp-3bc05.cloudfunctions.net/api';

function localKey() {
  const uid = auth?.currentUser?.uid;
  return uid ? `@timeline_bot_keys_${uid}` : null;
}

async function idToken() {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in first.');
  return user.getIdToken();
}

async function call(path, body) {
  const token = await idToken();
  const res = await fetch(`${BOT_API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {}),
  });
  let data = {};
  try {
    data = await res.json();
  } catch (_) {}
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/** Keys created on this device: [{ hash, label, createdAt, revoked }]. */
export async function getLocalBotKeys() {
  const k = localKey();
  if (!k) return [];
  try {
    const raw = await AsyncStorage.getItem(k);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function saveLocalBotKeys(list) {
  const k = localKey();
  if (k) await AsyncStorage.setItem(k, JSON.stringify(list));
}

/** Returns { key, hash, label }. The key is never saved; show it once. Pass replace to retire the current key. */
export async function createBotKey(label, opts = {}) {
  const out = await call('/keys/create', { label, replace: opts.replace === true, botType: 'grok' });
  const list = await getLocalBotKeys();
  list.unshift({ hash: out.hash, label: out.label, createdAt: new Date().toISOString(), revoked: false });
  await saveLocalBotKeys(list);
  return out;
}

/** All keys for this account (any device), with lastUsedAt. Falls back to local list. */
export async function listBotKeys() {
  const local = await getLocalBotKeys();
  try {
    const { keys } = await call('/keys/list');
    const localHashes = new Set(local.map((k) => k.hash));
    return (keys || [])
      .map((k) => ({ ...k, thisDevice: localHashes.has(k.hash) }))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  } catch (e) {
    return local.map((k) => ({ ...k, thisDevice: true, offline: true }));
  }
}

export async function revokeBotKey(hash) {
  await call('/keys/revoke', { hash });
  const list = await getLocalBotKeys();
  await saveLocalBotKeys(list.map((k) => (k.hash === hash ? { ...k, revoked: true } : k)));
}
