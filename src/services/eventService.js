import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@timeline_events';

/**
 * Event shape:
 * {
 *   id: string,
 *   title: string,
 *   description: string,
 *   date: string (ISO),
 *   category: string,
 *   source: 'manual' | 'email' | 'hobby',
 *   nextAction: 'none' | 'ask_grok_reply' | 'follow_up' | 'done',
 *   emailFrom?: string,
 *   hobbyType?: 'poetry' | 'singing' | 'music' | 'reading' | 'other',
 *   audioNote?: string,   // filename or note for singing/music files
 *   readingProgress?: string, // e.g. "Chapter 3, page 42"
 *   collectionName?: string,  // album or poetry book name
 *   coverPhotoNote?: string,  // optional caption for cover image
 *   photoNote?: string,       // optional caption for the event/poem photo
 *   imageUri?: string,        // persisted local file URI for the event photo
 *   coverImageUri?: string,   // persisted local file URI for a poem/album cover
 *   createdAt: string (ISO),
 *   updatedAt: string (ISO)
 * }
 */

export async function getEvents() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const events = JSON.parse(raw);
    return events.sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (e) {
    console.warn('Failed to load events', e);
    return [];
  }
}

export async function saveEvent(event) {
  const events = await getEvents();
  const now = new Date().toISOString();

  if (event.id) {
    const index = events.findIndex((e) => e.id === event.id);
    if (index !== -1) {
      events[index] = { ...events[index], ...event, updatedAt: now };
    }
  } else {
    const newEvent = {
      ...event,
      id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
      source: event.source || 'manual',
      nextAction: event.nextAction || 'none',
      createdAt: now,
      updatedAt: now,
    };
    events.push(newEvent);
  }

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  return events;
}

export async function deleteEvent(id) {
  const events = await getEvents();
  const filtered = events.filter((e) => e.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return filtered;
}

export const CATEGORIES = [
  { id: 'personal', label: 'Personal', color: '#3b82f6' },
  { id: 'work', label: 'Work', color: '#8b5cf6' },
  { id: 'family', label: 'Family', color: '#ec4899' },
  { id: 'health', label: 'Health', color: '#22c55e' },
  { id: 'travel', label: 'Travel', color: '#f59e0b' },
  { id: 'hobby', label: 'Hobby', color: '#8b5cf6' },
  { id: 'days_between', label: 'Days Between', color: '#06b6d4' },
  { id: 'other', label: 'Other', color: '#64748b' },
];

export const HOBBY_TYPES = [
  { id: 'poetry', label: 'Poetry', icon: '✎' },
  { id: 'singing', label: 'Singing', icon: '♪' },
  { id: 'music', label: 'Music', icon: '♫' },
  { id: 'reading', label: 'Reading', icon: '📖' },
  { id: 'other', label: 'Other', icon: '✦' },
];

export const NEXT_ACTIONS = [
  { id: 'none', label: 'None' },
  { id: 'ask_grok_reply', label: 'Ask Grok to draft a reply' },
  { id: 'follow_up', label: 'Follow up later' },
  { id: 'done', label: 'Done / Archive' },
];

export function getCategoryColor(categoryId) {
  const cat = CATEGORIES.find((c) => c.id === categoryId);
  return cat ? cat.color : '#64748b';
}

export function getNextActionLabel(actionId) {
  const action = NEXT_ACTIONS.find((a) => a.id === actionId);
  return action ? action.label : 'None';
}

export function getHobbyTypeLabel(typeId) {
  const t = HOBBY_TYPES.find((h) => h.id === typeId);
  return t ? t.label : '';
}

export function getHobbyTypeIcon(typeId) {
  const t = HOBBY_TYPES.find((h) => h.id === typeId);
  return t ? t.icon : '✦';
}

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function getMonthLetter(monthIndex) {
  return MONTH_LETTERS[monthIndex] || '';
}

export function getMonthName(monthIndex) {
  return MONTH_NAMES[monthIndex] || '';
}

export function getEventsByYear(events) {
  const map = {};
  events.forEach((e) => {
    const y = new Date(e.date).getFullYear();
    if (!map[y]) map[y] = [];
    map[y].push(e);
  });
  return map;
}

export function getYearSummaries(events) {
  const byYear = getEventsByYear(events);
  const years = Object.keys(byYear).map(Number);
  const current = new Date().getFullYear();
  for (let y = current - 3; y <= current + 1; y += 1) {
    if (!years.includes(y)) years.push(y);
  }
  years.sort((a, b) => a - b);
  return years.map((year) => ({
    year,
    count: (byYear[year] || []).length,
  }));
}

export function getMonthSummaries(events, year) {
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i,
    letter: MONTH_LETTERS[i],
    name: MONTH_NAMES[i],
    count: 0,
    categories: [],
  }));
  events.forEach((e) => {
    const d = new Date(e.date);
    if (d.getFullYear() === year) {
      const bucket = months[d.getMonth()];
      bucket.count += 1;
      const color = getCategoryColor(e.category);
      if (!bucket.categories.includes(color)) bucket.categories.push(color);
    }
  });
  return months;
}

export function filterEventsByYearMonth(events, year, month) {
  return events.filter((e) => {
    const d = new Date(e.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

/** Builds a prompt the user can copy/paste into Grok */
export function buildGrokReplyPrompt(event) {
  const parts = [
    'Please draft a reply to this email.',
    '',
    `Subject: ${event.title || '(no subject)'}`,
  ];
  if (event.emailFrom) {
    parts.push(`From: ${event.emailFrom}`);
  }
  if (event.date) {
    parts.push(`Date: ${new Date(event.date).toLocaleString()}`);
  }
  parts.push('');
  if (event.description && event.description.trim()) {
    parts.push('--- Original email text ---');
    parts.push(event.description.trim());
    parts.push('--- End of email ---');
  } else {
    parts.push('(No original email text was saved with this event. Draft a short, polite general reply.)');
  }
  parts.push('');
  parts.push('Write a clear, polite draft reply I can copy and send.');
  return parts.join('\n');
}
