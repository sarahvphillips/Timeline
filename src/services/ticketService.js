import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from './firebase';

/** A problem report. Status changes happen in the admin API, never by email from here. */
export async function createTicket({ title, detail }) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in first.');
  const text = String(title || '').trim();
  if (!text) throw new Error('Add a short title.');
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, 'tickets'), {
    uid: user.uid,
    email: user.email || '',
    title: text.slice(0, 200),
    detail: String(detail || '').trim().slice(0, 5000),
    status: 'open',
    createdAt: now,
    updatedAt: now,
  });
  return { id: ref.id };
}

export async function listMyTickets() {
  const user = auth.currentUser;
  if (!user) return [];
  const snap = await getDocs(query(collection(db, 'tickets'), where('uid', '==', user.uid)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
