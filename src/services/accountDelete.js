import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from './firebase';

const LAST_UID_KEY = '@timeline_last_uid';

async function deleteRefs(refs) {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function deleteCollection(colRef) {
  const snap = await getDocs(colRef);
  await deleteRefs(snap.docs.map((row) => row.ref));
}

async function deleteWhere(colName, field, value) {
  if (!value) return;
  const snap = await getDocs(query(collection(db, colName), where(field, '==', value)));
  await deleteRefs(snap.docs.map((row) => row.ref));
}

async function deleteCloudAccount(user) {
  const uid = user.uid;
  const email = String(user.email || '').trim().toLowerCase();
  let handle = '';
  try {
    const profile = await getDoc(doc(db, 'users', uid, 'settings', 'profile'));
    handle = profile.exists() ? String(profile.data()?.handle || '') : '';
  } catch (e) {
    console.warn('profile read before delete skipped', e);
  }

  await deleteCollection(collection(db, 'users', uid, 'events'));
  await deleteCollection(collection(db, 'users', uid, 'wordNumbers'));
  await deleteCollection(collection(db, 'users', uid, 'sessions'));
  await deleteCollection(collection(db, 'users', uid, 'settings'));
  await deleteWhere('sharedEvents', 'createdByUid', uid);
  await deleteWhere('sharedWordLists', 'createdByUid', uid);
  await deleteWhere('eventInvites', 'fromUid', uid);
  await deleteWhere('joinInvites', 'fromUid', uid);
  try {
    await deleteWhere('creditTransfers', 'fromUid', uid);
    await deleteWhere('creditTransfers', 'toUid', uid);
  } catch (e) {
    console.warn('credit transfer delete skipped', e);
  }

  if (email) {
    try {
      const index = await getDoc(doc(db, 'rewardsIndex', email));
      if (index.exists() && index.data()?.uid === uid) {
        await deleteDoc(doc(db, 'rewardsIndex', email));
      }
    } catch (e) {
      console.warn('rewards index delete skipped', e);
    }
  }
  if (handle) {
    try {
      const claimed = await getDoc(doc(db, 'profileHandles', handle));
      if (claimed.exists() && claimed.data()?.uid === uid) {
        await deleteDoc(doc(db, 'profileHandles', handle));
      }
    } catch (e) {
      console.warn('handle delete skipped', e);
    }
  }
  try {
    await deleteDoc(doc(db, 'publicProfiles', uid));
  } catch (e) {
    console.warn('public profile delete skipped', e);
  }
  try {
    await deleteDoc(doc(db, 'users', uid));
  } catch (e) {
    console.warn('user doc delete skipped', e);
  }
}

async function deleteLocalAccount(uid) {
  const keys = await AsyncStorage.getAllKeys();
  const drop = keys.filter((key) => key.includes(uid));
  const last = await AsyncStorage.getItem(LAST_UID_KEY);
  if (last === uid) drop.push(LAST_UID_KEY);
  if (drop.length) await AsyncStorage.multiRemove(drop);
}

export function accountNeedsPassword(user) {
  const current = user || auth.currentUser;
  return (current?.providerData || []).some((row) => row.providerId === 'password');
}

export async function deleteSignedInAccount(password) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in first.');
  if (accountNeedsPassword(user)) {
    if (!String(password || '').trim()) {
      const err = new Error('Enter the password for this account.');
      err.code = 'NEED_PASSWORD';
      throw err;
    }
    const cred = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, cred);
  }
  await deleteCloudAccount(user);
  await deleteLocalAccount(user.uid);
  await deleteUser(user);
}
