import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';

function key() {
  const uid = auth?.currentUser?.uid;
  return uid ? `@timeline_show_workshop_${uid}` : '@timeline_show_workshop_guest';
}

/** On while features are still being built. Turn off before a tester build. */
export async function getShowWorkshop() {
  try {
    const raw = await AsyncStorage.getItem(key());
    if (raw == null) return true;
    return raw === '1';
  } catch {
    return true;
  }
}

export async function saveShowWorkshop(on) {
  await AsyncStorage.setItem(key(), on ? '1' : '0');
  return !!on;
}
