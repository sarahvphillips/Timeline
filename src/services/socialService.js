import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';

const LEGACY = '@timeline_social_v1';

function key() {
  const uid = auth.currentUser?.uid;
  return uid ? `@timeline_social_v1_${uid}` : '@timeline_social_v1_guest';
}

export const PLATFORMS = [
  'X',
  'Instagram',
  'Facebook',
  'TikTok',
  'Threads',
  'Reddit',
  'LinkedIn',
  'Bluesky',
  'Other',
];

export const ACTIONS = ['Posted', 'Shared', 'Saved', 'Liked', 'Replied'];

export function parseSocialLink(raw) {
  const text = String(raw || '').trim();
  if (!text) return { platform: null, titleGuess: '' };
  let host = '';
  try {
    host = new URL(text.startsWith('http') ? text : `https://${text}`).hostname.toLowerCase();
  } catch {
    host = text.toLowerCase();
  }
  if (/(^|\.)(x\.com|twitter\.com|t\.co)$/.test(host)) return { platform: 'X', titleGuess: 'X post' };
  if (/(^|\.)instagram\.com$/.test(host)) return { platform: 'Instagram', titleGuess: 'Instagram post' };
  if (/(^|\.)(facebook\.com|fb\.com|fb\.watch)$/.test(host)) {
    return { platform: 'Facebook', titleGuess: 'Facebook post' };
  }
  if (/(^|\.)tiktok\.com$/.test(host)) return { platform: 'TikTok', titleGuess: 'TikTok video' };
  if (/(^|\.)threads\.net$/.test(host)) return { platform: 'Threads', titleGuess: 'Threads post' };
  if (/(^|\.)reddit\.com$/.test(host)) return { platform: 'Reddit', titleGuess: 'Reddit post' };
  if (/(^|\.)linkedin\.com$/.test(host)) return { platform: 'LinkedIn', titleGuess: 'LinkedIn post' };
  if (/(^|\.)bsky\.app$/.test(host)) return { platform: 'Bluesky', titleGuess: 'Bluesky post' };
  return { platform: null, titleGuess: '' };
}

export function normalizeSocialUrl(raw, platform) {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  const path = text.replace(/^\/+/, '');
  if (platform === 'X' || /(^|\/)status\/\d+/.test(path) || path.startsWith('x.com') || path.startsWith('twitter.com')) {
    if (/^(x\.com|twitter\.com)\//i.test(path)) return `https://${path}`;
    return `https://x.com/${path}`;
  }
  if (platform === 'Instagram') return `https://www.instagram.com/${path}`;
  if (platform === 'Facebook') return `https://www.facebook.com/${path}`;
  if (platform === 'TikTok') return `https://www.tiktok.com/${path}`;
  if (platform === 'Threads') return `https://www.threads.net/${path}`;
  if (platform === 'Reddit') return `https://www.reddit.com/${path}`;
  if (platform === 'LinkedIn') return `https://www.linkedin.com/${path}`;
  if (platform === 'Bluesky') return `https://bsky.app/${path}`;
  return `https://${path}`;
}

export async function loadSocial() {
  try {
    const raw = (await AsyncStorage.getItem(key())) || (await AsyncStorage.getItem(LEGACY));
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveSocial(list) {
  await AsyncStorage.setItem(key(), JSON.stringify(list.slice(0, 200)));
}
