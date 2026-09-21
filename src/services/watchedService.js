import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';

const PREFIX = '@timeline_watched_v1_';

export const WATCH_KINDS = ['Film', 'TV series', 'Episode'];
export const WATCH_PLACES = ['Home', 'Cinema', 'Other'];
export const WATCH_STATUSES = ['Watched', 'Watching', 'Rewatch', 'Dropped', 'Wanted'];

function storeKey() {
  const uid = auth.currentUser?.uid;
  return `${PREFIX}${uid || 'guest'}`;
}

export function parseWatchLink(raw) {
  const text = String(raw || '').trim();
  if (!text) return { url: '', titleGuess: '' };
  try {
    const u = new URL(text.startsWith('http') ? text : `https://${text}`);
    const host = u.hostname.replace(/^www\./, '');
    if (host.includes('imdb.com')) {
      const slug = u.pathname.split('/').filter(Boolean)[1] || '';
      return { url: u.href, titleGuess: decodeURIComponent(slug.replace(/^tt\d+$/, '') || '') };
    }
    if (host.includes('letterboxd.com')) {
      const parts = u.pathname.split('/').filter(Boolean);
      const film = parts[0] === 'film' ? parts[1] : parts[0];
      return {
        url: u.href,
        titleGuess: decodeURIComponent(String(film || '').replace(/-/g, ' ')),
      };
    }
    return { url: u.href, titleGuess: '' };
  } catch {
    return { url: text, titleGuess: '' };
  }
}

export function scoreLabel(score) {
  if (score == null || score === '') return 'Unrated';
  return `${score}/10`;
}

export async function loadWatched() {
  try {
    const raw = await AsyncStorage.getItem(storeKey());
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveWatched(list) {
  await AsyncStorage.setItem(storeKey(), JSON.stringify(list.slice(0, 300)));
}
