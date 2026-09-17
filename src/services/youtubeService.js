import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';

export function parseYoutubeId(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0] || '';
      return id.length >= 11 ? id.slice(0, 11) : null;
    }
    const v = u.searchParams.get('v');
    if (v && v.length >= 11) return v.slice(0, 11);
    const m = u.pathname.match(/\/(shorts|embed|live|v)\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[2];
  } catch {
    /* fall through */
  }
  const loose = s.match(/(?:v=|youtu\.be\/|\/(?:shorts|embed|live)\/)([a-zA-Z0-9_-]{11})/);
  return loose ? loose[1] : null;
}

export function watchUrl(videoId) {
  return `https://youtu.be/${videoId}`;
}

export function thumbUrl(videoId) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

function storeKey() {
  const uid = auth.currentUser?.uid;
  return uid ? `@timeline_youtube_v1_${uid}` : '@timeline_youtube_v1_guest';
}

export async function loadYoutube() {
  try {
    const raw = await AsyncStorage.getItem(storeKey());
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveYoutube(list) {
  try {
    await AsyncStorage.setItem(storeKey(), JSON.stringify((list || []).slice(0, 200)));
  } catch {
    /* quota */
  }
}

export const SAMPLE_SHARE_FRIENDS = [
  { id: 'sp', name: 'S.P' },
  { id: 'dh', name: 'DH' },
  { id: 'dt', name: 'DT' },
];
