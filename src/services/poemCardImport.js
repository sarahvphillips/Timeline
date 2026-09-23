import { auth } from './firebase';
import { getEvents, saveEvent } from './eventService';
import { POEM_CARD_SEED } from '../data/poemCardSeed';

const WORD = {
  dont: "don't",
  isnt: "isn't",
  nothings: "nothing's",
};

function titleFromSlug(slug) {
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

export async function importPoemCards() {
  if (!auth.currentUser) {
    const err = new Error('Sign in first. These poem cards save on your account.');
    err.code = 'SIGNED_OUT';
    throw err;
  }
  const existing = await getEvents();
  const have = new Set((existing || []).map((event) => event.id));
  let added = 0;
  let skipped = 0;
  for (const card of POEM_CARD_SEED) {
    const id = `poem-card-${card.slug}`;
    if (have.has(id)) {
      skipped += 1;
      continue;
    }
    const link = `https://drive.google.com/file/d/${card.driveId}/view`;
    await saveEvent({
      id,
      title: titleFromSlug(card.slug),
      description: `Poem card from Google Drive.\n${link}`,
      date: card.modified,
      category: 'hobby',
      source: 'hobby',
      hobbyType: 'poetry',
      collectionName: 'Poem Compilation',
      labels: ['Poem', '#poem'],
      photoNote: 'The picture stays in Drive: Full poem cards 2026-09-23.',
      nextAction: 'none',
    });
    have.add(id);
    added += 1;
  }
  return { added, skipped, total: POEM_CARD_SEED.length };
}
