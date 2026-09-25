import AsyncStorage from '@react-native-async-storage/async-storage';

export const GUEST_UID = 'guest-local';
export const GUEST_SESSION_KEY = '@timeline_guest_session';

export const GUEST_USER = {
  uid: GUEST_UID,
  email: null,
  displayName: 'Guest',
  isGuest: true,
};

export function isGuestUser(user) {
  return !!(user && (user.isGuest || user.uid === GUEST_UID));
}

export function isGuestUid(uid) {
  return !uid || uid === GUEST_UID || String(uid).startsWith('guest-');
}

export async function loadGuestSession() {
  try {
    return (await AsyncStorage.getItem(GUEST_SESSION_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function startGuestSession() {
  await AsyncStorage.setItem(GUEST_SESSION_KEY, '1');
  return GUEST_USER;
}

export async function endGuestSession() {
  try {
    await AsyncStorage.removeItem(GUEST_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
