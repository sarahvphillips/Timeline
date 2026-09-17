import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase';

const PEOPLE_KEY_PREFIX = '@timeline_people_v1_';
const WHEEL_STORE = '@timeline_date_circle_v2';

export function currentUid() {
  return auth.currentUser?.uid || null;
}

function storeKey(uid = currentUid()) {
  return uid ? `${PEOPLE_KEY_PREFIX}${uid}` : `${PEOPLE_KEY_PREFIX}guest`;
}

export function initialFromName(name) {
  const letters = String(name || '').replace(/[^A-Za-z]/g, '');
  return (letters.charAt(0) || '?').toUpperCase();
}

export function nameKey(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function digitsOnly(n) {
  return String(n || '').replace(/\D/g, '');
}

export function parseBirthday(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (!m) return '';
  const d = m[1].padStart(2, '0');
  const mo = m[2].padStart(2, '0');
  return `${m[3]}-${mo}-${d}`;
}

export function normalizePerson(raw) {
  const name = String(raw?.name || '').trim();
  return {
    id: String(raw?.id || ''),
    name,
    phone: String(raw?.phone || '').trim(),
    email: String(raw?.email || '').trim(),
    birthday: parseBirthday(raw?.birthday || ''),
    note: String(raw?.note || '').trim(),
    initial: raw?.initial || initialFromName(name),
    autoShareSms: Boolean(raw?.autoShareSms),
    autoShareCalls: Boolean(raw?.autoShareCalls),
    onApp: Boolean(raw?.onApp),
    inviteSent: Boolean(raw?.inviteSent),
    fromWheelId: String(raw?.fromWheelId || ''),
    joinCode: String(raw?.joinCode || '').toUpperCase(),
    linkedUid: String(raw?.linkedUid || ''),
    linkedEmail: String(raw?.linkedEmail || ''),
    createdAt: raw?.createdAt || new Date().toISOString(),
    updatedAt: raw?.updatedAt || new Date().toISOString(),
    ownerUid: raw?.ownerUid || currentUid() || undefined,
  };
}

export function findPerson(list, { contact, number, wheelId } = {}) {
  const d = digitsOnly(number);
  const k = nameKey(contact);
  return (
    (list || []).find((f) => {
      if (wheelId && f.fromWheelId === wheelId) return true;
      const fd = digitsOnly(f.phone);
      const phoneHit =
        d.length >= 7 &&
        fd.length >= 7 &&
        (fd === d || fd.endsWith(d) || d.endsWith(fd));
      const nameHit = Boolean(k) && nameKey(f.name) === k;
      return phoneHit || nameHit;
    }) || null
  );
}

export function inviteText(person, code, link) {
  const who = person?.name || 'there';
  const joinCode = String(code || person?.joinCode || '').toUpperCase();
  const joinLink = link || (joinCode ? buildJoinLink(joinCode) : '');
  const lines = [
    `Hi ${who} — I'm using Timeline to keep dates and notes in one place. You're on my people list (you don't need an account for that).`,
  ];
  if (joinCode) {
    lines.push(
      '',
      'If you want your own Timeline:',
      '1. Install Timeline (Expo Go is fine while we test)',
      '2. Create an account and sign in',
      '3. Home → Enter invite code → paste this code:',
      joinCode,
    );
    if (joinLink) {
      lines.push('', `Or open: ${joinLink}`);
    }
  }
  return lines.join('\n');
}

export function buildJoinLink(code) {
  return `timelineapp://join/${String(code || '').toUpperCase()}`;
}

const JOIN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeJoinCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += JOIN_CHARS[Math.floor(Math.random() * JOIN_CHARS.length)];
  }
  return code;
}

async function readList(uid = currentUid()) {
  try {
    const raw = await AsyncStorage.getItem(storeKey(uid));
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.map((item) => normalizePerson(item)).filter((p) => p.id && p.name);
  } catch {
    return [];
  }
}

async function writeList(list, uid = currentUid()) {
  await AsyncStorage.setItem(storeKey(uid), JSON.stringify(list || []));
}

export async function getPeople() {
  const list = await readList();
  return sortPeople(list);
}

function sortPeople(list) {
  const today = new Date().toISOString().slice(0, 10);
  return [...(list || [])].sort((a, b) => {
    const da = a.birthday ? a.birthday.slice(5) : '99-99';
    const db = b.birthday ? b.birthday.slice(5) : '99-99';
    const ta = `${today.slice(0, 4)}-${da}`;
    const tb = `${today.slice(0, 4)}-${db}`;
    if (a.birthday && b.birthday && ta !== tb) return ta.localeCompare(tb);
    if (a.birthday && !b.birthday) return -1;
    if (!a.birthday && b.birthday) return 1;
    return nameKey(a.name).localeCompare(nameKey(b.name));
  });
}

export async function savePerson(entry) {
  const uid = currentUid();
  const list = await readList(uid);
  const name = String(entry?.name || '').trim();
  if (!name) throw new Error('Need a name');
  const now = new Date().toISOString();
  const payload = normalizePerson({
    ...entry,
    name,
    id: entry.id || `p-${Date.now()}`,
    createdAt: entry.createdAt || now,
    updatedAt: now,
    ownerUid: uid || undefined,
  });
  const sameName = list.find(
    (p) => nameKey(p.name) === nameKey(payload.name) && String(p.id) !== String(payload.id)
  );
  if (sameName) {
    const err = new Error('that person is already in the list');
    err.code = 'DUPLICATE_PERSON';
    throw err;
  }
  const index = list.findIndex((p) => String(p.id) === String(payload.id));
  if (index === -1) list.unshift(payload);
  else {
    payload.createdAt = list[index].createdAt || payload.createdAt;
    list[index] = { ...list[index], ...payload };
  }
  await writeList(list, uid);
  return payload;
}

export async function deletePerson(id) {
  const uid = currentUid();
  const next = (await readList(uid)).filter((p) => String(p.id) !== String(id));
  await writeList(next, uid);
  return sortPeople(next);
}

export async function patchPerson(id, fields) {
  const uid = currentUid();
  const list = await readList(uid);
  const index = list.findIndex((p) => String(p.id) === String(id));
  if (index === -1) throw new Error('Person not found');
  list[index] = normalizePerson({
    ...list[index],
    ...fields,
    id: list[index].id,
    updatedAt: new Date().toISOString(),
  });
  await writeList(list, uid);
  return list[index];
}

export async function importFromDateCircle() {
  let wheel = [];
  try {
    const raw = await AsyncStorage.getItem(WHEEL_STORE);
    if (raw) {
      const parsed = JSON.parse(raw);
      wheel = Array.isArray(parsed?.people) ? parsed.people : [];
    }
  } catch {
    wheel = [];
  }
  if (!wheel.length) return { added: 0, list: await getPeople() };
  const uid = currentUid();
  const list = await readList(uid);
  let added = 0;
  wheel.forEach((p) => {
    const label = String(p.initials || p.name || '').trim();
    if (!label) return;
    const existing = findPerson(list, { contact: label, wheelId: p.id });
    if (existing) {
      if (!existing.birthday && p.date) existing.birthday = parseBirthday(p.date);
      if (!existing.fromWheelId) existing.fromWheelId = p.id;
      return;
    }
    list.unshift(
      normalizePerson({
        id: `p-${Date.now()}-${added}`,
        name: label,
        birthday: p.date,
        fromWheelId: p.id,
      })
    );
    added += 1;
  });
  await writeList(list, uid);
  return { added, list: sortPeople(list) };
}

export async function addPersonToDateCircle(person) {
  if (!person?.birthday) {
    throw new Error('Need a birthday to put them on the date circle');
  }
  let parsed = { people: [], focus: new Date().toISOString().slice(0, 10) };
  try {
    const raw = await AsyncStorage.getItem(WHEEL_STORE);
    if (raw) parsed = { ...parsed, ...JSON.parse(raw) };
  } catch {
    /* keep default */
  }
  const people = Array.isArray(parsed.people) ? parsed.people : [];
  const existing = people.find(
    (p) =>
      p.id === person.fromWheelId ||
      nameKey(p.initials) === nameKey(person.name)
  );
  if (existing) {
    existing.date = person.birthday;
    existing.initials = person.name;
    await AsyncStorage.setItem(WHEEL_STORE, JSON.stringify({ ...parsed, people }));
    if (!person.fromWheelId) await patchPerson(person.id, { fromWheelId: existing.id });
    return existing;
  }
  const ring = people.filter((p) => p.role !== 'hub');
  const used = ring.map((p) => p.angle);
  let angle = -90;
  for (let i = 0; i < 12; i += 1) {
    const tryA = -90 + i * 30;
    if (!used.some((u) => Math.abs(u - tryA) < 15)) {
      angle = tryA;
      break;
    }
  }
  const node = {
    id: person.fromWheelId || person.id,
    initials: person.name,
    date: person.birthday,
    role: people.length ? 'ring' : 'hub',
    angle,
  };
  people.push(node);
  await AsyncStorage.setItem(WHEEL_STORE, JSON.stringify({ ...parsed, people }));
  await patchPerson(person.id, { fromWheelId: node.id });
  return node;
}

function joinInviteDoc(code) {
  return doc(db, 'joinInvites', String(code).toUpperCase());
}

export async function getJoinInvite(code) {
  const normalised = String(code || '').trim().toUpperCase();
  if (!normalised) return null;
  const snap = await getDoc(joinInviteDoc(normalised));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data(), code: snap.id };
}

export async function createJoinInvite(person) {
  const uid = currentUid();
  if (!uid) throw new Error('Sign in to send a join code.');
  if (!person?.id) throw new Error('Save the person first.');

  const existingCode = String(person.joinCode || '').trim().toUpperCase();
  if (existingCode) {
    try {
      const existing = await getJoinInvite(existingCode);
      if (existing && existing.status === 'pending' && existing.fromUid === uid) {
        const link = buildJoinLink(existingCode);
        return {
          code: existingCode,
          link,
          text: inviteText(person, existingCode, link),
          reused: true,
        };
      }
    } catch {
      /* mint a new one */
    }
  }

  let code = makeJoinCode(6);
  for (let i = 0; i < 6; i += 1) {
    const snap = await getDoc(joinInviteDoc(code));
    if (!snap.exists()) break;
    code = makeJoinCode(6);
  }

  const now = new Date().toISOString();
  const payload = {
    code,
    type: 'join',
    fromUid: uid,
    fromEmail: auth.currentUser?.email || '',
    fromName: auth.currentUser?.displayName || '',
    personId: person.id,
    personName: person.name,
    personEmail: person.email || '',
    status: 'pending',
    createdAt: now,
  };
  await setDoc(joinInviteDoc(code), payload);
  await patchPerson(person.id, { joinCode: code, inviteSent: true });
  const link = buildJoinLink(code);
  return { code, link, text: inviteText({ ...person, joinCode: code }, code, link), reused: false };
}

export async function acceptJoinInvite(code) {
  const uid = currentUid();
  if (!uid) throw new Error('Sign in to accept a join invite.');
  const invite = await getJoinInvite(code);
  if (!invite) throw new Error('No join invite found for that code.');
  if (invite.fromUid === uid) {
    throw new Error('That is your own join code. Send it to the other person.');
  }
  if (invite.status === 'accepted' && invite.acceptedByUid === uid) {
    return { alreadyAccepted: true, invite };
  }
  if (invite.status === 'accepted') {
    throw new Error('This join code was already used.');
  }
  if (invite.status && invite.status !== 'pending') {
    throw new Error(`This invite is ${invite.status}.`);
  }
  const now = new Date().toISOString();
  await updateDoc(joinInviteDoc(invite.code), {
    status: 'accepted',
    acceptedByUid: uid,
    acceptedByEmail: auth.currentUser?.email || '',
    acceptedAt: now,
  });
  return {
    alreadyAccepted: false,
    invite: {
      ...invite,
      status: 'accepted',
      acceptedByUid: uid,
      acceptedByEmail: auth.currentUser?.email || '',
    },
  };
}

/** Owner: mark local people as on the app when their join code was accepted. */
export async function syncAcceptedJoins() {
  const uid = currentUid();
  if (!uid) return await getPeople();
  let remote = [];
  try {
    const snap = await getDocs(query(collection(db, 'joinInvites'), where('fromUid', '==', uid)));
    remote = snap.docs.map((d) => ({ id: d.id, ...d.data(), code: d.id }));
  } catch (e) {
    console.warn('join invite sync skipped', e);
    return getPeople();
  }
  const list = await readList(uid);
  let changed = false;
  remote.forEach((inv) => {
    if (inv.status !== 'accepted') return;
    const person = list.find(
      (p) =>
        String(p.id) === String(inv.personId) ||
        String(p.joinCode || '').toUpperCase() === String(inv.code || '').toUpperCase()
    );
    if (!person) return;
    if (person.onApp && person.linkedUid === inv.acceptedByUid) return;
    person.onApp = true;
    person.linkedUid = inv.acceptedByUid || person.linkedUid;
    person.linkedEmail = inv.acceptedByEmail || person.linkedEmail || person.email;
    person.inviteSent = true;
    person.joinCode = inv.code || person.joinCode;
    person.updatedAt = new Date().toISOString();
    changed = true;
  });
  if (changed) await writeList(list, uid);
  return sortPeople(list);
}

