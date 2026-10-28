import { auth } from './firebase';
import { BOT_API_URL } from './botKeyService';

async function call(method, path, body) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken();
  const res = await fetch(`${BOT_API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  let data = {};
  try {
    data = await res.json();
  } catch (_) {}
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function createAdminKey(label) {
  return call('POST', '/admin/keys/create', { label: label || 'Admin bot' });
}

export function lookupAccount(email) {
  return call('GET', `/admin/lookup?email=${encodeURIComponent(email)}`);
}

export function getUserLimits(uid) {
  return call('GET', `/admin/users/${encodeURIComponent(uid)}/limits`);
}

export function setUserLimits(uid, patch) {
  return call('PATCH', `/admin/users/${encodeURIComponent(uid)}/limits`, patch);
}

export function listUserBotKeys(uid) {
  return call('GET', `/admin/users/${encodeURIComponent(uid)}/keys`);
}

export function revokeUserBotKey(uid, hash) {
  return call('POST', `/admin/users/${encodeURIComponent(uid)}/keys/revoke`, { hash });
}

export function listAdminTickets(status) {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return call('GET', `/admin/tickets${q}`);
}

export function updateAdminTicket(id, patch) {
  return call('PATCH', `/admin/tickets/${encodeURIComponent(id)}`, patch);
}
