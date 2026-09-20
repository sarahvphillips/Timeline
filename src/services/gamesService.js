import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';

const LEGACY = '@timeline_games_v1';

function key() {
  const uid = auth.currentUser?.uid;
  return uid ? `@timeline_games_v1_${uid}` : '@timeline_games_v1_guest';
}

export const PLATFORMS = [
  'Steam',
  'PlayStation',
  'Android',
  'Nintendo Switch',
  'Xbox',
  'PC (other)',
  'Other',
];

export const STATUSES = ['Playing', 'Finished', 'Dropped', 'Backlog'];

export function parseGameLink(raw) {
  const text = String(raw || '').trim();
  if (!text) return { platform: null, steamAppId: '', titleGuess: '' };

  const steam = text.match(/store\.steampowered\.com\/app\/(\d+)(?:\/([^/?#]*))?/i);
  if (steam) {
    return {
      platform: 'Steam',
      steamAppId: steam[1],
      titleGuess: slugToTitle(steam[2] || ''),
    };
  }
  if (/playstation\.com|share\.playstation\.com/i.test(text)) {
    const slug = text.match(/\/(?:games|product|concept|title)\/([^/?#]+)/i);
    return {
      platform: 'PlayStation',
      steamAppId: '',
      titleGuess: slugToTitle(decodeURIComponent(slug?.[1] || '')),
    };
  }
  const play = text.match(/play\.google\.com\/store\/apps\/details\?id=([^&]+)/i);
  if (play) {
    return { platform: 'Android', steamAppId: '', titleGuess: play[1] };
  }
  if (/nintendo\.com|nintendo\.co\.uk/i.test(text)) {
    return { platform: 'Nintendo Switch', steamAppId: '', titleGuess: '' };
  }
  if (/xbox\.com|microsoft\.com\/.*xbox/i.test(text)) {
    return { platform: 'Xbox', steamAppId: '', titleGuess: '' };
  }
  return { platform: null, steamAppId: '', titleGuess: '' };
}

function slugToTitle(slug) {
  return decodeURIComponent(slug || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function steamHeader(appId) {
  if (!appId) return '';
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

export function playtimeLabel(hours, minutes) {
  const h = Number(hours) || 0;
  const m = Number(minutes) || 0;
  if (!h && !m) return '';
  if (h && !m) return `${h}h`;
  if (!h && m) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export async function loadGames() {
  const k = key();
  try {
    const raw = (await AsyncStorage.getItem(k)) || (await AsyncStorage.getItem(LEGACY));
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveGames(list) {
  await AsyncStorage.setItem(key(), JSON.stringify(list.slice(0, 200)));
}
