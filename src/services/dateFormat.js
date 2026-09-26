import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';

/** Day first: 25/09. Default for Timeline. */
export const DATE_FORMAT_DMY = 'dmy';
/** Month first: 09/25. */
export const DATE_FORMAT_MDY = 'mdy';

const KEY_BASE = '@timeline_date_format';

function storageKey() {
  const uid = auth.currentUser?.uid || 'guest';
  return `${KEY_BASE}_${uid}`;
}

export function normalizeDateFormat(value) {
  return value === DATE_FORMAT_MDY ? DATE_FORMAT_MDY : DATE_FORMAT_DMY;
}

export function formatDayMonth(value, format = DATE_FORMAT_DMY) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return normalizeDateFormat(format) === DATE_FORMAT_MDY ? `${mm}/${dd}` : `${dd}/${mm}`;
}

export async function getDateFormat() {
  try {
    return normalizeDateFormat(await AsyncStorage.getItem(storageKey()));
  } catch {
    return DATE_FORMAT_DMY;
  }
}

export async function saveDateFormat(format) {
  const next = normalizeDateFormat(format);
  await AsyncStorage.setItem(storageKey(), next);
  return next;
}
