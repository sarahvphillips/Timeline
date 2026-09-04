import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_KEY = '@timeline_profile';
const LABELS_KEY = '@timeline_labels';
const POEM_CATS_KEY = '@timeline_poem_categories';

export const DEFAULT_LABELS = [
  'AI', 'Cars', 'Crafting', 'Family', 'Figaro', 'Greek', 'Life problems',
  'Love', 'Mafia', 'Money', 'Nature', 'Norse', 'Programming',
  'Songs and Celebrity', 'Space', 'Work', 'WoW',
];

export const DEFAULT_POEM_CATEGORIES = [
  'Lyric', 'Free verse', 'Sonnet', 'Song', 'Spoken word', 'Other',
];

export async function getProfile() {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (!raw) return { displayName: '', dateOfBirth: '' };
    const parsed = JSON.parse(raw);
    return {
      displayName: parsed.displayName || '',
      dateOfBirth: parsed.dateOfBirth || '',
    };
  } catch {
    return { displayName: '', dateOfBirth: '' };
  }
}

export async function saveProfile(profile) {
  const next = {
    displayName: String(profile.displayName || '').trim(),
    dateOfBirth: String(profile.dateOfBirth || '').trim(),
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  return next;
}

async function loadList(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [...fallback];
    const list = JSON.parse(raw);
    return Array.isArray(list) && list.length ? list : [...fallback];
  } catch {
    return [...fallback];
  }
}

export async function getLabels() {
  return loadList(LABELS_KEY, DEFAULT_LABELS);
}

export async function saveLabels(list) {
  const next = [...new Set((list || []).map((s) => String(s).trim()).filter(Boolean))];
  await AsyncStorage.setItem(LABELS_KEY, JSON.stringify(next));
  return next;
}

export async function getPoemCategories() {
  return loadList(POEM_CATS_KEY, DEFAULT_POEM_CATEGORIES);
}

export async function savePoemCategories(list) {
  const next = [...new Set((list || []).map((s) => String(s).trim()).filter(Boolean))];
  await AsyncStorage.setItem(POEM_CATS_KEY, JSON.stringify(next));
  return next;
}
