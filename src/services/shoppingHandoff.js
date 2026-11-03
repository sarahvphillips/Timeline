import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export async function saveShoppingHandoff(payload) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in so your Grok Bot can read this list.');
  const body = { ...payload, updatedAt: new Date().toISOString() };
  await setDoc(doc(db, 'users', uid, 'meta', 'shoppingHandoff'), body);
  return body;
}
