import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { GUEST_UID } from './guestSession';
import { saveEvent } from './eventService';

function uid() {
  return auth.currentUser?.uid || GUEST_UID;
}

function storageKey(id) {
  return `@timeline_todos_${id || GUEST_UID}`;
}

function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function cleanItem(raw) {
  const row = raw && typeof raw === 'object' ? raw : {};
  return {
    id: String(row.id || newId()),
    title: String(row.title || '').trim(),
    note: String(row.note || '').trim(),
    category: String(row.category || 'personal'),
    date: String(row.date || '').slice(0, 10),
    createdAt: row.createdAt || new Date().toISOString(),
    doneAt: row.doneAt || '',
    eventId: row.eventId || '',
  };
}

async function readLocal(id) {
  try {
    const raw = await AsyncStorage.getItem(storageKey(id));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(cleanItem).filter((row) => row.title) : [];
  } catch {
    return [];
  }
}

async function writeLocal(id, items) {
  await AsyncStorage.setItem(storageKey(id), JSON.stringify(items));
}

async function pushCloud(id, items) {
  if (!id || id === GUEST_UID || !auth.currentUser) return;
  await setDoc(doc(db, 'users', id, 'settings', 'todos'), {
    items,
    updatedAt: new Date().toISOString(),
  });
}

export async function loadTodos() {
  const id = uid();
  const local = await readLocal(id);
  if (!auth.currentUser || id === GUEST_UID) return local;
  try {
    const snap = await getDoc(doc(db, 'users', id, 'settings', 'todos'));
    if (!snap.exists()) {
      if (local.length) await pushCloud(id, local);
      return local;
    }
    const cloud = Array.isArray(snap.data()?.items) ? snap.data().items.map(cleanItem).filter((row) => row.title) : [];
    if (!cloud.length && local.length) {
      await pushCloud(id, local);
      return local;
    }
    await writeLocal(id, cloud);
    return cloud;
  } catch (e) {
    console.warn('Could not sync the to-do list. Using this device.', e);
    return local;
  }
}

async function saveTodos(items) {
  const id = uid();
  await writeLocal(id, items);
  try {
    await pushCloud(id, items);
  } catch (e) {
    console.warn('Could not sync the to-do list to the cloud. Saved on this device.', e);
  }
  return items;
}

export async function addTodo({ title, note, category, date }) {
  const text = String(title || '').trim();
  if (!text) {
    const err = new Error('Write the to-do first.');
    err.code = 'TODO_EMPTY';
    throw err;
  }
  const items = await loadTodos();
  const next = [
    cleanItem({
      id: newId(),
      title: text,
      note,
      category: category || 'personal',
      date,
      createdAt: new Date().toISOString(),
    }),
    ...items,
  ];
  return saveTodos(next);
}

export async function removeTodo(todoId) {
  const items = await loadTodos();
  return saveTodos(items.filter((row) => row.id !== todoId));
}

/** Tick off: the line becomes a timeline event, then leaves the open list. */
export async function completeTodo(todo) {
  const row = cleanItem(todo);
  const eventId = newId();
  const events = await saveEvent({
    id: eventId,
    title: row.title,
    description: row.note,
    date: row.date,
    category: row.category || 'personal',
    source: 'todo',
    nextAction: 'none',
  });
  const saved = (events || []).find((event) => event.id === eventId) || null;
  const id = uid();
  const items = await readLocal(id);
  const marked = { ...row, doneAt: new Date().toISOString(), eventId };
  const next = items.some((item) => item.id === row.id)
    ? items.map((item) => (item.id === row.id ? marked : item))
    : [marked, ...items];
  await saveTodos(next);
  return saved;
}
