import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';

const KINDS = ['track', 'album', 'playlist', 'artist', 'episode', 'show'];

export function parseSpotify(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const uri = s.match(/^spotify:(track|album|playlist|artist|episode|show):([A-Za-z0-9]+)/i);
  if (uri) return { kind: uri[1].toLowerCase(), id: uri[2] };
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    const host = u.hostname.replace(/^www\./, '');
    if (!host.includes('spotify.com')) return null;
    const m = u.pathname.match(/\/(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/i);
    if (m && KINDS.includes(m[1].toLowerCase())) return { kind: m[1].toLowerCase(), id: m[2] };
  } catch {
    /* fall through */
  }
  return null;
}

export function openUrl(kind, id) {
  return `https://open.spotify.com/${kind}/${id}`;
}

function storeKey() {
  const uid = auth.currentUser?.uid;
  return uid ? `@timeline_spotify_v1_${uid}` : '@timeline_spotify_v1_guest';
}

export async function loadSpotify() {
  try {
    const raw = await AsyncStorage.getItem(storeKey());
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveSpotify(list) {
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
