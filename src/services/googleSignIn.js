import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GoogleAuthProvider,
  getAdditionalUserInfo,
  linkWithPopup,
  signInWithPopup,
} from 'firebase/auth';
import { auth, prepareSignIn, saveRememberedEmail } from './firebase';
import { WELCOME_NEXT_KEY } from '../legal/welcomeEmail';

function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

export function googleProviderLinked(user) {
  return !!(user && (user.providerData || []).some((row) => row && row.providerId === 'google.com'));
}

function webOnlyError() {
  const error = new Error(
    'Google sign-in works in the laptop browser. On the phone it arrives with the Play Store build.',
  );
  error.code = 'GOOGLE_WEB_ONLY';
  return error;
}

export async function signInWithGoogle(remember) {
  if (Platform.OS !== 'web') throw webOnlyError();
  await prepareSignIn(remember !== false);
  const result = await signInWithPopup(auth, googleProvider());
  const info = getAdditionalUserInfo(result);
  if (info && info.isNewUser) {
    await AsyncStorage.setItem(WELCOME_NEXT_KEY, '1').catch(() => {});
  }
  const email = result?.user?.email || '';
  if (email) await saveRememberedEmail(email, remember !== false);
  return result;
}

export async function linkGoogleAccount() {
  if (Platform.OS !== 'web') throw webOnlyError();
  if (!auth.currentUser) {
    const error = new Error('Sign in with your email first, then link Google.');
    error.code = 'GOOGLE_SIGNED_OUT';
    throw error;
  }
  return linkWithPopup(auth.currentUser, googleProvider());
}

export function googleSignInMessage(error) {
  const code = error?.code || '';
  if (code === 'GOOGLE_WEB_ONLY' || code === 'GOOGLE_SIGNED_OUT') return error.message;
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Google sign-in was cancelled.';
  }
  if (code === 'auth/popup-blocked') {
    return 'The browser blocked the Google window. Allow pop-ups for this site, then try again.';
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return 'That email already has a password. Sign in with email, then open Settings and tap Link Google.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'This website is not allowed to use Google sign-in yet. In Firebase, add it under Authentication → Settings → Authorized domains.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Google sign-in is not switched on yet. In Firebase, open Authentication → Sign-in method → Google → Enable.';
  }
  if (code === 'auth/credential-already-in-use') {
    return 'That Google account is already linked to a different Timeline login.';
  }
  return error?.message || 'Google sign-in did not finish. Try again.';
}
