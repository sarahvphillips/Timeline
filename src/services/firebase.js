import { Platform } from 'react-native';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyDdJQIMhbI5szhYz7_PfY5KMiUCSOWPs78',
  authDomain: 'timelineapp-3bc05.firebaseapp.com',
  projectId: 'timelineapp-3bc05',
  storageBucket: 'timelineapp-3bc05.firebasestorage.app',
  messagingSenderId: '258561318338',
  appId: '1:258561318338:web:f179fed76afffd3c918a5b',
  measurementId: 'G-ER1E95G97R',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

let auth;
if (globalThis._timelineAuth) {
  auth = globalThis._timelineAuth;
} else if (Platform.OS === 'web') {
  auth = getAuth(app);
  globalThis._timelineAuth = auth;
} else {
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e) {
    auth = getAuth(app);
  }
  globalThis._timelineAuth = auth;
}

const db = getFirestore(app);

const REMEMBER_KEY = '@timeline_remember_me';
const REMEMBER_EMAIL_KEY = '@timeline_remember_email';
const FORGET_TOKEN_KEY = '@timeline_forget_next_launch';
let thisProcessRememberToken = null;

export async function loadRememberMe() {
  try {
    const value = await AsyncStorage.getItem(REMEMBER_KEY);
    return value !== '0';
  } catch {
    return true;
  }
}

export async function loadRememberedEmail() {
  try {
    if (!(await loadRememberMe())) return '';
    return (await AsyncStorage.getItem(REMEMBER_EMAIL_KEY)) || '';
  } catch {
    return '';
  }
}

/** Stay signed in when remember is on. Otherwise the next time the app is opened, sign-in is required. */
export async function prepareSignIn(remember) {
  try {
    await AsyncStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
  } catch {
    /* the sign-in itself still proceeds */
  }
  if (remember) {
    thisProcessRememberToken = null;
    AsyncStorage.removeItem(FORGET_TOKEN_KEY).catch(() => {});
  }
  try {
    if (Platform.OS === 'web') {
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    } else if (remember) {
      await setPersistence(auth, getReactNativePersistence(AsyncStorage));
    } else {
      await setPersistence(auth, inMemoryPersistence);
    }
  } catch {
    if (!remember) {
      const token = String(Date.now());
      thisProcessRememberToken = token;
      AsyncStorage.setItem(FORGET_TOKEN_KEY, token).catch(() => {});
    }
  }
}

export async function saveRememberedEmail(email, remember) {
  try {
    if (remember && email) await AsyncStorage.setItem(REMEMBER_EMAIL_KEY, email);
    else await AsyncStorage.removeItem(REMEMBER_EMAIL_KEY);
  } catch {
    /* optional convenience only */
  }
}

/** If the last sign-in opted out, drop that saved session on the next launch. */
export async function dropUnrememberedSession() {
  let token = null;
  try {
    token = await AsyncStorage.getItem(FORGET_TOKEN_KEY);
  } catch {
    return false;
  }
  if (!token || token === thisProcessRememberToken) return false;
  try {
    await AsyncStorage.removeItem(FORGET_TOKEN_KEY);
    await signOut(auth);
  } catch {
    /* already signed out */
  }
  return true;
}

export {
  app,
  db,
  auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  loadRememberMe,
  loadRememberedEmail,
  prepareSignIn,
  saveRememberedEmail,
  dropUnrememberedSession,
};
