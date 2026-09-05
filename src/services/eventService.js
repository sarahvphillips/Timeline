import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, getDocs, deleteDoc, collection } from 'firebase/firestore';
import { auth, db } from './firebase';

const LEGACY_EVENTS_KEY = '@timeline_events';
const GUEST_EVENTS_KEY = '@timeline_events_guest';
export const LAST_UID_KEY = '@timeline_last_uid';

// Firestore sync for events (per-uid). Isolation: ownerUid checks, beginAuthScope,
// clear-local-cache, and pull-before-paint on Year/Month lists.
export const EVENTS_FIRESTORE_SYNC_ENABLED = true;

function eventsStorageKey(uid) {
  return uid ? `@timeline_events_${uid}` : GUEST_EVENTS_KEY;
}

/**
 * One-time migration of legacy global @timeline_events into a per-uid key.
 * Adopts only events with ownerUid === uid, or (if @timeline_last_uid === uid)
 * events with missing ownerUid. Never uses cloud non-empty as a reason to adopt.
 * Leaves foreign-ownerUid rows in the legacy key for the rightful owner.
 */
async function migrateLegacyEventsOnce(uid) {
  if (!uid) return;
  const scoped = eventsStorageKey(uid);
  try {
    const existing = await AsyncStorage.getItem(scoped);
    if (existing != null) return;
    const legacy = await AsyncStorage.getItem(LEGACY_EVENTS_KEY);
    if (legacy == null) return;

    let events = [];
    try {
      events = JSON.parse(legacy);
    } catch (_) {
      return;
    }
    if (!Array.isArray(events) || events.length === 0) return;

    const lastUid = await AsyncStorage.getItem(LAST_UID_KEY);
    const lastUidMatches = lastUid === uid;

    // Only take events that already belong to this uid. If this device's last
    // login was this uid, also adopt pre-ownerUid (missing) events — never
    // foreign ownerUid rows, and never cloud non-empty as a reason to adopt.
    const adoptable = events.filter((ev) => {
      if (!ev) return false;
      if (ev.ownerUid === uid) return true;
      if (lastUidMatches && !ev.ownerUid) return true;
      return false;
    });
    if (adoptable.length === 0) {
      console.warn(
        'Skipping legacy events migration for',
        uid,
        '(last_uid=',
        lastUid,
        ') — no events owned by this account',
      );
      return;
    }

    const stamped = adoptable.map((ev) => ({
      ...ev,
      ownerUid: ev.ownerUid || uid,
    }));
    await AsyncStorage.setItem(scoped, JSON.stringify(stamped));

    const remaining = events.filter((ev) => !adoptable.includes(ev));
    if (remaining.length === 0) {
      await AsyncStorage.removeItem(LEGACY_EVENTS_KEY);
    } else {
      await AsyncStorage.setItem(LEGACY_EVENTS_KEY, JSON.stringify(remaining));
    }
    console.warn('Migrated legacy @timeline_events into', scoped);
  } catch (e) {
    console.warn('Legacy events migration skipped', e);
  }
}

/** Clear the per-uid local events cache (e.g. after confirming cloud is empty). */
export async function clearLocalEventsForUid(uid) {
  if (!uid) return;
  await AsyncStorage.setItem(eventsStorageKey(uid), JSON.stringify([]));
}

/**
 * Event shape:
 * {
 *   id: string,
 *   title: string,
 *   description: string,
 *   date: string (ISO),
 *   category: string,
 *   source: 'manual' | 'email' | 'hobby' | 'shared' | ...,
 *   isShared?: boolean,
 *   shareId?: string,
 *   sharedFrom?: string,       // inviter uid
 *   sharedFromEmail?: string,  // inviter email (persisted on accept)
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

let cloudWarningShown = false;

function warnCloud(message, error) {
  if (error !== undefined) {
    console.warn(message, error);
  } else {
    console.warn(message);
  }
  if (cloudWarningShown) return;
  cloudWarningShown = true;
  try {
    Alert.alert('Cloud sync', message);
  } catch (_) {}
}

function getUid() {
  return auth.currentUser?.uid || null;
}

// Bumps on login/logout so in-flight sync cannot write after an auth switch.
let authEpoch = 0;
let activeAuthUid = null;

/** Call from App onAuthStateChanged so event I/O is scoped to the current uid. */
export function beginAuthScope(uid) {
  authEpoch += 1;
  activeAuthUid = uid || null;
  return authEpoch;
}

function isScopeCurrent(uid, epoch) {
  return epoch === authEpoch && (uid || null) === activeAuthUid;
}

function eventsCollection(uid) {
  return collection(db, 'users', uid, 'events');
}

function eventDoc(uid, eventId) {
  return doc(db, 'users', uid, 'events', eventId);
}

/** Strip undefined (Firestore rejects it) and convert Date to ISO strings. */
function stripUndefined(value) {
  if (value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value
      .map(stripUndefined)
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((key) => {
      const next = stripUndefined(value[key]);
      if (next !== undefined) out[key] = next;
    });
    return out;
  }
  return value;
}


/** True for device-local paths that must not be treated as portable cloud URLs. */
function isLocalOnlyImageUri(uri) {
  if (!uri || typeof uri !== 'string') return false;
  const t = uri.trim();
  if (!t) return false;
  if (/^(https?:|gs:)/i.test(t)) return false;
  if (/^(file:|content:|blob:|ph:|assets-library:|ms-appdata:|ms-appx:|data:)/i.test(t)) return true;
  // Bare absolute / relative paths without a remote scheme
  if (!t.includes('://')) return true;
  return false;
}

/**
 * Prepare an event for Firestore: strip undefined and omit local-only image URIs
 * so we never upload file:// (etc.) as if they were portable. Does not invent Storage.
 * Use with setDoc merge:true so omitting image fields does not wipe existing cloud URLs.
 */
function eventPayloadForCloud(event, uid) {
  const payload = { ...event, ownerUid: uid };
  ['imageUri', 'coverImageUri'].forEach((key) => {
    if (isLocalOnlyImageUri(payload[key])) {
      delete payload[key];
    }
  });
  return stripUndefined(payload);
}

function toIso(value) {
  if (!value) return value;
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch (_) {
      return value;
    }
  }
  if (value instanceof Date) return value.toISOString();
  return value;
}

function normalizeEvent(data, fallbackId) {
  const event = { ...data, id: data.id || fallbackId };
  if (event.date) event.date = toIso(event.date);
  if (event.createdAt) event.createdAt = toIso(event.createdAt);
  if (event.updatedAt) event.updatedAt = toIso(event.updatedAt);
  return event;
}

function sortEvents(events) {
  return events.sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function writeCache(events, uid = getUid()) {
  await AsyncStorage.setItem(eventsStorageKey(uid), JSON.stringify(events));
}

function eventBelongsToUid(ev, uid) {
  // Strict: missing ownerUid does NOT belong — do not upload unscoped events.
  if (!ev || !uid) return false;
  return ev.ownerUid === uid;
}

/** For UI/local cache under this uid's key: hide foreign ownerUid; keep missing. */
function eventVisibleForUid(ev, uid) {
  if (!ev || !uid) return false;
  if (!ev.ownerUid) return true;
  return ev.ownerUid === uid;
}

async function pushEventToCloud(event) {
  if (!EVENTS_FIRESTORE_SYNC_ENABLED) return;
  const uid = getUid();
  if (!uid || !event?.id) return;
  if (event.ownerUid !== uid) {
    console.warn('Refusing to upload event without matching ownerUid', event.id);
    return;
  }
  // merge: true so stripping local-only imageUri/coverImageUri does not wipe cloud fields
  await setDoc(eventDoc(uid, event.id), eventPayloadForCloud(event, uid), { merge: true });
}

/** Local cache only — does not touch Firestore. Uses per-uid (or guest) key. */
export async function readLocalEvents(uid = getUid()) {
  try {
    // Legacy migration runs only from syncEventsFromCloud (needs cloud emptiness).
    const raw = await AsyncStorage.getItem(eventsStorageKey(uid));
    if (!raw) return [];
    const events = JSON.parse(raw);
    return sortEvents(Array.isArray(events) ? events : []);
  } catch (e) {
    console.warn('Failed to load events', e);
    return [];
  }
}

/**
 * Load events for the UI.
 * If signed in and EVENTS_FIRESTORE_SYNC_ENABLED, sync from Firestore first.
 * Otherwise per-uid local cache only. Logged out uses guest cache only.
 */
export async function getEvents() {
  const uid = getUid();
  if (uid) {
    if (!EVENTS_FIRESTORE_SYNC_ENABLED) {
      await migrateLegacyEventsOnce(uid);
      const local = await readLocalEvents(uid);
      // Hard isolation: never surface another account's cached rows.
      return local.filter((ev) => eventVisibleForUid(ev, uid));
    }
    try {
      return await syncEventsFromCloud(uid);
    } catch (e) {
      console.warn('getEvents: cloud sync failed, using local', e);
      const local = await readLocalEvents(uid);
      return local.filter((ev) => eventVisibleForUid(ev, uid));
    }
  }
  return readLocalEvents(null);
}

/**
 * Pull cloud events for the signed-in user into the local cache.
 * No-op cloud I/O while EVENTS_FIRESTORE_SYNC_ENABLED is false (local only).
 * When enabled: cloud wins on id conflict; upload only ownerUid === uid locals.
 * Drops/deletes cloud docs whose ownerUid is set to a different account
 * (self-heal for historical cross-account contamination under this uid path).
 */
export async function syncEventsFromCloud(uid) {
  if (!uid) return readLocalEvents(null);

  const epoch = authEpoch;
  await migrateLegacyEventsOnce(uid);

  if (!EVENTS_FIRESTORE_SYNC_ENABLED) {
    if (!isScopeCurrent(uid, epoch)) return [];
    const local = await readLocalEvents(uid);
    const visible = local.filter((ev) => eventVisibleForUid(ev, uid));
    if (visible.length !== local.length) {
      await writeCache(visible, uid);
    }
    return visible;
  }

  try {
    const snap = await getDocs(eventsCollection(uid));
    if (!isScopeCurrent(uid, epoch)) return [];

    const cloudEvents = [];
    const foreignIds = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      // Path is this uid's collection, but ownerUid may still mark a foreign row
      // left from an earlier bleed — do not show or keep those.
      if (data.ownerUid && data.ownerUid !== uid) {
        foreignIds.push(d.id);
        return;
      }
      cloudEvents.push(normalizeEvent({ ...data, ownerUid: data.ownerUid || uid }, d.id));
    });

    if (foreignIds.length > 0) {
      await Promise.all(
        foreignIds.map(async (id) => {
          try {
            await deleteDoc(eventDoc(uid, id));
          } catch (e) {
            console.warn('Failed to remove foreign ownerUid event from cloud', id, e);
          }
        }),
      );
    }

    if (!isScopeCurrent(uid, epoch)) return [];

    const localAll = await readLocalEvents(uid);
    const local = localAll.filter((ev) => eventBelongsToUid(ev, uid));

    if (cloudEvents.length === 0) {
      if (local.length > 0) {
        await Promise.all(
          local.map(async (ev) => {
            try {
              await setDoc(eventDoc(uid, ev.id), eventPayloadForCloud(ev, uid), { merge: true });
            } catch (e) {
              console.warn('Failed to upload local event to Firestore', e);
            }
          }),
        );
        if (!isScopeCurrent(uid, epoch)) return local;
        await writeCache(local, uid);
        return local;
      }
      await writeCache([], uid);
      return [];
    }

    const byId = {};
    local.forEach((ev) => {
      if (ev?.id) byId[ev.id] = ev;
    });
    const localOnly = [];
    local.forEach((ev) => {
      if (ev?.id && !cloudEvents.some((c) => c.id === ev.id)) {
        localOnly.push(ev);
      }
    });
    cloudEvents.forEach((ev) => {
      if (ev?.id) byId[ev.id] = ev;
    });

    if (localOnly.length > 0) {
      await Promise.all(
        localOnly.map(async (ev) => {
          try {
            await setDoc(eventDoc(uid, ev.id), eventPayloadForCloud(ev, uid), { merge: true });
          } catch (e) {
            console.warn('Failed to upload local-only event to Firestore', e);
          }
        }),
      );
    }

    if (!isScopeCurrent(uid, epoch)) return Object.values(byId);
    const merged = sortEvents(Object.values(byId));
    await writeCache(merged, uid);
    return merged;
  } catch (e) {
    warnCloud(
      'Could not load events from the cloud. Showing events saved on this device.',
      e,
    );
    const localAll = await readLocalEvents(uid);
    return localAll.filter((ev) => eventBelongsToUid(ev, uid));
  }
}

export async function saveEvent(event) {
  const uid = getUid();
  let events;
  if (uid) {
    if (EVENTS_FIRESTORE_SYNC_ENABLED) {
      events = await syncEventsFromCloud(uid).catch(async () => {
        const local = await readLocalEvents(uid);
        return local.filter((ev) => eventBelongsToUid(ev, uid));
      });
    } else {
      await migrateLegacyEventsOnce(uid);
      const local = await readLocalEvents(uid);
      events = local.filter((ev) => eventVisibleForUid(ev, uid));
    }
  } else {
    events = await readLocalEvents(null);
  }
  const now = new Date().toISOString();
  let saved = null;

  if (event.id) {
    const index = events.findIndex((e) => e.id === event.id);
    if (index !== -1) {
      saved = {
        ...events[index],
        ...event,
        updatedAt: now,
        ownerUid: uid || events[index].ownerUid || undefined,
      };
      events[index] = saved;
    } else if (uid) {
      // Allow save of a known id that is not yet in this user's cache
      saved = {
        ...event,
        updatedAt: now,
        createdAt: event.createdAt || now,
        ownerUid: uid,
      };
      events.push(saved);
    }
  } else {
    saved = {
      ...event,
      id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
      source: event.source || 'manual',
      nextAction: event.nextAction || 'none',
      createdAt: now,
      updatedAt: now,
      ownerUid: uid || undefined,
    };
    events.push(saved);
  }

  if (!saved) return events;

  await writeCache(events, uid);

  if (saved && uid) {
    try {
      await pushEventToCloud(saved);
    } catch (e) {
      warnCloud(
        'Could not sync this event to the cloud. It is saved on this device.',
        e,
      );
    }
  }

  return events;
}

export async function deleteEvent(id) {
  const uid = getUid();
  const events = await readLocalEvents(uid);
  const filtered = events.filter((e) => e.id !== id);
  await writeCache(filtered, uid);

  if (uid && EVENTS_FIRESTORE_SYNC_ENABLED) {
    try {
      await deleteDoc(eventDoc(uid, id));
    } catch (e) {
      warnCloud(
        'Could not delete this event from the cloud. It is removed on this device.',
        e,
      );
    }
  }

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


const WEEKDAY_NAMES = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];
const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function getWeekdayName(indexFromMonday) {
  return WEEKDAY_NAMES[indexFromMonday] || '';
}

export function getWeekdayShort(indexFromMonday) {
  return WEEKDAY_SHORT[indexFromMonday] || '';
}

/** Monday 00:00 in local time for the week containing `date`. */
export function getWeekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const daysFromMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysFromMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toLocalIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Full Mon–Sun weeks that cover every day of `month` (0–11).
 * Days outside the month are included and marked isInMonth: false.
 */
export function getWeeksInMonth(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const rangeStart = getWeekStart(firstOfMonth);
  const lastWeekStart = getWeekStart(lastOfMonth);
  const today = startOfLocalDay(new Date());

  const weeks = [];
  const cursor = new Date(rangeStart);
  while (cursor.getTime() <= lastWeekStart.getTime()) {
    const weekStart = startOfLocalDay(cursor);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const days = [];
    for (let i = 0; i < 7; i += 1) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      date.setHours(0, 0, 0, 0);
      const y = date.getFullYear();
      const m = date.getMonth();
      days.push({
        date: new Date(date),
        weekdayName: WEEKDAY_NAMES[i],
        weekdayShort: WEEKDAY_SHORT[i],
        dayOfMonth: date.getDate(),
        monthName: MONTH_NAMES[m],
        year: y,
        isoDate: toLocalIsoDate(date),
        isInMonth: y === year && m === month,
        isToday: date.getTime() === today.getTime(),
      });
    }

    weeks.push({ weekStart, weekEnd, days });
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

export function filterEventsByDay(events, date) {
  const target = startOfLocalDay(date);
  const y = target.getFullYear();
  const m = target.getMonth();
  const day = target.getDate();
  return events.filter((e) => {
    const d = new Date(e.date);
    return d.getFullYear() === y && d.getMonth() === m && d.getDate() === day;
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
