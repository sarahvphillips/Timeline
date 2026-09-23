import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { auth } from './firebase';
import { getEvents, saveEvent } from './eventService';
import { persistPickedImage } from './imagePicker';
import { POEM_CARD_SEED } from '../data/poemCardSeed';

const BULK_KEY = '@timeline_poem_cards_bulk_20260923';

const WORD = {
  dont: "don't",
  isnt: "isn't",
  nothings: "nothing's",
};

export function titleFromSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      const shown = WORD[lower] || lower;
      return shown.charAt(0).toUpperCase() + shown.slice(1);
    })
    .join(' ');
}

function poemCardDay(iso) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
  return `${day}T12:00:00`;
}

function slugFromName(name) {
  return String(name || '')
    .split(/[/\\]/)
    .pop()
    .replace(/\.[a-z0-9]+$/i, '')
    .trim()
    .toLowerCase();
}

export async function poemBulkAlreadyImported() {
  const flag = await AsyncStorage.getItem(BULK_KEY);
  return flag === '1';
}

function pickWebFolder() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/png,image/*';
    input.setAttribute('webkitdirectory', '');
    input.onchange = () => resolve(Array.from(input.files || []));
    input.click();
  });
}

async function chooseCardFiles() {
  if (Platform.OS === 'web') {
    const files = await pickWebFolder();
    const rows = [];
    for (const file of files) {
      const uri = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read a poem card.'));
        reader.readAsDataURL(file);
      });
      rows.push({ name: file.name, uri });
    }
    return rows;
  }
  const result = await DocumentPicker.getDocumentAsync({
    type: ['image/*', 'image/png', 'image/jpeg'],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets) return [];
  return result.assets.map((asset) => ({ name: asset.name, uri: asset.uri }));
}

export async function importPoemCards() {
  if (!auth.currentUser) {
    const err = new Error('Sign in first. These poem cards save on your account.');
    err.code = 'SIGNED_OUT';
    throw err;
  }
  const picked = await chooseCardFiles();
  if (!picked.length) return { added: 0, updated: 0, skipped: 0, total: POEM_CARD_SEED.length, cancelled: true };
  const bySlug = new Map();
  picked.forEach((file) => {
    const slug = slugFromName(file.name);
    if (slug) bySlug.set(slug, file);
  });
  const existing = await getEvents();
  const have = new Map((existing || []).map((event) => [event.id, event]));
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const card of POEM_CARD_SEED) {
    const file = bySlug.get(card.slug);
    if (!file) continue;
    const id = `poem-card-${card.slug}`;
    const stored = await persistPickedImage(file.uri, `${card.slug}.png`, null, 'image/png');
    const imageUri = stored && stored.uri ? stored.uri : file.uri;
    const date = poemCardDay(card.modified);
    const prev = have.get(id);
    if (prev && prev.imageUri && !String(prev.imageUri).includes('drive.google.com') && String(prev.date || '').slice(0, 10) === date.slice(0, 10)) {
      skipped += 1;
      continue;
    }
    await saveEvent({
      id,
      title: titleFromSlug(card.slug),
      description: prev && prev.description && !String(prev.description).includes('drive.google.com') ? prev.description : '',
      date,
      category: 'hobby',
      source: 'hobby',
      hobbyType: 'poetry',
      collectionName: 'Poem Compilation',
      labels: ['Poem', '#poem'],
      imageUri,
      photoNote: 'Stored with the app, the same way as a photo from this device.',
      nextAction: 'none',
    });
    if (prev) updated += 1;
    else added += 1;
  }
  const done = added + updated + skipped >= POEM_CARD_SEED.length;
  if (done) await AsyncStorage.setItem(BULK_KEY, '1');
  return { added, updated, skipped, total: POEM_CARD_SEED.length, matched: added + updated + skipped, cancelled: false };
}
