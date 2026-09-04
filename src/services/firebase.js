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
};
