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


const IMG_REF_PREFIX = 'asref:';
const QUOTA_USER_MESSAGE =
  'Photo too large for browser storage — try a smaller image or use the phone app';

function imageStorageKey(eventId, field) {
  if (field === 'coverImageUri') return `@timeline_img_${eventId}_cover`;
  if (field === 'videoUri') return `@timeline_img_${eventId}_video`;
  if (field === 'audioUri') return `@timeline_img_${eventId}_audio`;
  return `@timeline_img_${eventId}`;
}

function isQuotaError(e) {
  if (!e) return false;
  const name = e.name || '';
  const msg = String(e.message || e || '');
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /quotaexceeded/i.test(msg) ||
    /exceeded the quota/i.test(msg) ||
    (/quota/i.test(msg) && /storage|setItem|localStorage/i.test(msg))
  );
}

/** data:/blob:/huge strings blow web localStorage when nested in the events JSON. */
function isHeavyImagePayload(uri) {
  if (!uri || typeof uri !== 'string') return false;
  if (uri.startsWith(IMG_REF_PREFIX)) return false;
  if (uri.startsWith('data:') || uri.startsWith('blob:')) return true;
  return uri.length > 2048;
}

async function removeImageKeysForEvents(events) {
  const keys = new Set();
  if (!Array.isArray(events)) return;
  for (const ev of events) {
    if (!ev) continue;
    if (ev.id) {
      keys.add(imageStorageKey(ev.id, 'imageUri'));
      keys.add(imageStorageKey(ev.id, 'coverImageUri'));
      keys.add(imageStorageKey(ev.id, 'videoUri'));
      keys.add(imageStorageKey(ev.id, 'audioUri'));
    }
    for (const field of ['imageUri', 'coverImageUri', 'videoUri', 'audioUri']) {
      const u = ev[field];
      if (typeof u === 'string' && u.startsWith(IMG_REF_PREFIX)) {
        keys.add(u.slice(IMG_REF_PREFIX.length));
      }
    }
  }
  const list = [...keys];
  if (list.length === 0) return;
  try {
    await AsyncStorage.multiRemove(list);
  } catch (e) {
    console.warn('removeImageKeysForEvents failed', e);
  }
}

/**
 * Move heavy image payloads out of the events list into @timeline_img_* keys.
 * Keeps a short asref: pointer in the event so the list JSON stays under quota.
 */
async function externalizeEventImages(events) {
  if (!Array.isArray(events)) return [];
  const out = [];
  const ops = [];
  for (const ev of events) {
    if (!ev) continue;
    if (!ev.id) {
      out.push(ev);
      continue;
    }
    const copy = { ...ev };
    for (const field of ['imageUri', 'coverImageUri', 'videoUri', 'audioUri']) {
      const uri = copy[field];
      if (!isHeavyImagePayload(uri)) continue;
      const key = imageStorageKey(ev.id, field);
      ops.push(AsyncStorage.setItem(key, uri));
      copy[field] = IMG_REF_PREFIX + key;
    }
    out.push(copy);
  }
  if (ops.length) await Promise.all(ops);
  return out;
}

/** Resolve asref: pointers back to real URIs for UI / in-memory use. */
async function hydrateEventImages(events) {
  if (!Array.isArray(events)) return [];
  const out = [];
  for (const ev of events) {
    if (!ev) continue;
    const copy = { ...ev };
    for (const field of ['imageUri', 'coverImageUri', 'videoUri', 'audioUri']) {
      const uri = copy[field];
      if (typeof uri !== 'string' || !uri.startsWith(IMG_REF_PREFIX)) continue;
      const key = uri.slice(IMG_REF_PREFIX.length);
      try {
        const data = await AsyncStorage.getItem(key);
        if (data) copy[field] = data;
      } catch (e) {
        console.warn('hydrateEventImages failed', key, e);
      }
    }
    out.push(copy);
  }
  return out;
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
  try {
    const raw = await AsyncStorage.getItem(eventsStorageKey(uid));
    let events = [];
    try {
      events = raw ? JSON.parse(raw) : [];
    } catch (_) {
      events = [];
    }
    await removeImageKeysForEvents(Array.isArray(events) ? events : []);
  } catch (e) {
    console.warn('clearLocalEventsForUid: image cleanup skipped', e);
  }
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
 *   source: 'manual' | 'email' | 'hobby' | 'food' | 'laundry' | 'shared' | ...,
 *   isShared?: boolean,
 *   shareId?: string,
 *   sharedFrom?: string,       // inviter uid
 *   sharedFromEmail?: string,  // inviter email (persisted on accept)
 *   nextAction: 'none' | 'ask_grok_reply' | 'follow_up' | 'done',
 *   emailFrom?: string,
 *   hobbyType?: 'poetry' | 'singing' | 'music' | 'reading' | 'other',
 *   foodStatus?: 'planned' | 'eaten',  // food source only
 *   foodItems?: string,       // free-text items for food entries
 *   washStatus?: 'loaded' | 'running' | 'done' | 'drying' | 'put_away',
 *   washItems?: string,
 *   washNote?: string,
 *   washSetting?: string,
 *   washTumble?: 'yes' | 'hang' | 'some' | 'later',
 *   washSang?: boolean,
 *   washSangAt?: string,
 *   washSongNote?: string,
 *   washCodes?: { code: string, time: string, note?: string }[],
 *   videoUri?: string,        // local-only video (never Firestore)
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
  ['imageUri', 'coverImageUri', 'videoUri', 'audioUri'].forEach((key) => {
    if (isLocalOnlyImageUri(payload[key])) {
      delete payload[key];
    }
  });
  if (payload.source === 'laundry') {
    delete payload.imageUri;
    delete payload.coverImageUri;
    delete payload.videoUri;
  }
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
  try {
    const slim = await externalizeEventImages(events);
    await AsyncStorage.setItem(eventsStorageKey(uid), JSON.stringify(slim));
  } catch (e) {
    if (isQuotaError(e)) {
      const err = new Error(QUOTA_USER_MESSAGE);
      err.code = 'QUOTA_EXCEEDED';
      err.cause = e;
      throw err;
    }
    throw e;
  }
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
    const list = Array.isArray(events) ? events : [];
    const hydrated = await hydrateEventImages(list);
    return sortEvents(hydrated);
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
      if (!ev?.id) return;
      const prev = byId[ev.id];
      // Cloud strips local-only photo URIs (no Firebase Storage yet) — keep device photos.
      byId[ev.id] = {
        ...ev,
        imageUri: ev.imageUri || (prev && prev.imageUri) || undefined,
        coverImageUri: ev.coverImageUri || (prev && prev.coverImageUri) || undefined,
        videoUri: ev.videoUri || (prev && prev.videoUri) || undefined,
        audioUri: ev.audioUri || (prev && prev.audioUri) || undefined,
        audioName: ev.audioName || (prev && prev.audioName) || undefined,
      };
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
  // Local-first: never block/fail a save on cloud sync.
  let events = [];
  try {
    if (uid) {
      try {
        await migrateLegacyEventsOnce(uid);
      } catch (_) {}
      const local = await readLocalEvents(uid);
      events = local.filter((ev) => eventVisibleForUid(ev, uid));
    } else {
      events = await readLocalEvents(null);
    }
  } catch (e) {
    console.warn('saveEvent: failed to read local cache, starting empty', e);
    events = [];
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
  const removed = events.filter((e) => e.id === id);
  const filtered = events.filter((e) => e.id !== id);
  await removeImageKeysForEvents(removed);
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
  { id: 'household', label: 'Household', color: '#38bdf8' },
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
  { id: 'ask_grok_reply', label: 'Ask Grok' },
  { id: 'follow_up', label: 'Follow up later' },
  { id: 'done', label: 'Done / Archive' },
];

export function slugCategoryId(label) {
  const s = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return s || `cat_${Date.now()}`;
}

export const CATEGORY_COLOR_CYCLE = [
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#22c55e',
  '#f59e0b',
  '#38bdf8',
  '#06b6d4',
  '#f97316',
  '#14b8a6',
  '#e879f9',
];

export function getCategoryColor(categoryId, extras = []) {
  const cat = [...CATEGORIES, ...(extras || [])].find((c) => c.id === categoryId);
  return cat ? cat.color : '#64748b';
}

export function extraTimelineFilters(categories) {
  const builtIn = new Set(CATEGORIES.map((c) => c.id));
  return (categories || [])
    .filter((c) => c && c.id && !builtIn.has(c.id))
    .map((c) => ({
      id: `cat:${c.id}`,
      label: c.label || c.id,
      color: c.color || '#64748b',
      itemView: true,
    }));
}

export function timelineFiltersFor(categories) {
  return [...TIMELINE_FILTERS, ...extraTimelineFilters(categories)];
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

/** Fixed bubble colours matching year-overview mock (purple poem, blue event, teal email/QR). */
export const YEAR_BUBBLE_KIND_COLORS = {
  email: '#14b8a6',
  qr: '#14b8a6',
  poem: '#8b5cf6',
  food: '#f59e0b',
  household: '#38bdf8',
  family: '#a855f7',
  event: '#3b82f6',
  youtube: '#f87171',
  spotify: '#1db954',
  game: '#818cf8',
  social: '#38bdf8',
  sms: '#22c55e',
  call: '#fb923c',
  bank: '#22d3ee',
  watched: '#f472b6',
  location: '#2dd4bf',
  life: '#e879f9',
};

const YEAR_BUBBLE_KIND_ORDER = [
  'poem',
  'event',
  'email',
  'qr',
  'family',
  'food',
  'household',
  'youtube',
  'spotify',
  'game',
  'social',
  'sms',
  'call',
  'bank',
  'watched',
  'location',
  'life',
];

/**
 * Classify one event into a year-overview bubble kind.
 * Priority: email → QR → poem → food → family → category (personal → Event).
 */
export function classifyYearBubbleKind(event) {
  const source = String(event?.source || '').toLowerCase();
  const hobbyType = String(event?.hobbyType || '').toLowerCase();
  const category = String(event?.category || '').toLowerCase();
  const title = String(event?.title || '');
  const hasQr =
    source === 'qr' ||
    !!event?.qrLink ||
    /\bqr\b/i.test(title) ||
    /invite.*scan|scan.*invite/i.test(String(event?.description || ''));

  if (source === 'email') {
    return {
      kind: 'email',
      label: 'Email',
      color: YEAR_BUBBLE_KIND_COLORS.email,
      filter: { source: 'email' },
    };
  }
  if (hasQr) {
    return {
      kind: 'qr',
      label: 'QR',
      color: YEAR_BUBBLE_KIND_COLORS.qr,
      filter: { source: 'qr' },
    };
  }
  if (hobbyType === 'poetry' || (source === 'hobby' && hobbyType === 'poetry')) {
    return {
      kind: 'poem',
      label: 'Poem',
      color: YEAR_BUBBLE_KIND_COLORS.poem,
      filter: { hobbyType: 'poetry' },
    };
  }
  if (source === 'food') {
    return {
      kind: 'food',
      label: 'Food',
      color: YEAR_BUBBLE_KIND_COLORS.food,
      filter: { source: 'food' },
    };
  }
  if (source === 'watched' || event?.watchKind || hobbyType === 'watching') {
    return {
      kind: 'watched',
      label: event?.watchKind || 'Watched',
      color: YEAR_BUBBLE_KIND_COLORS.watched,
      filter: { source: 'watched' },
    };
  }
  if (source === 'youtube' || category === 'youtube') {
    return {
      kind: 'youtube',
      label: 'YouTube',
      color: YEAR_BUBBLE_KIND_COLORS.youtube,
      filter: { source: 'youtube' },
    };
  }
  if (source === 'spotify') {
    return {
      kind: 'spotify',
      label: 'Spotify',
      color: YEAR_BUBBLE_KIND_COLORS.spotify,
      filter: { source: 'spotify' },
    };
  }
  if (source === 'game') {
    return {
      kind: 'game',
      label: 'Games',
      color: YEAR_BUBBLE_KIND_COLORS.game,
      filter: { source: 'game' },
    };
  }
  if (source === 'social') {
    return {
      kind: 'social',
      label: 'Social',
      color: YEAR_BUBBLE_KIND_COLORS.social,
      filter: { source: 'social' },
    };
  }
  if (source === 'sms') {
    return {
      kind: 'sms',
      label: 'SMS',
      color: YEAR_BUBBLE_KIND_COLORS.sms,
      filter: { source: 'sms' },
    };
  }
  if (source === 'call') {
    return {
      kind: 'call',
      label: 'Call',
      color: YEAR_BUBBLE_KIND_COLORS.call,
      filter: { source: 'call' },
    };
  }
  if (source === 'location') {
    return {
      kind: 'location',
      label: 'Places',
      color: YEAR_BUBBLE_KIND_COLORS.location,
      filter: { source: 'location' },
    };
  }
  if (source === 'life') {
    return {
      kind: 'life',
      label: event?.lifeKind === 'birthday' ? 'Birthday' : 'Life',
      color: YEAR_BUBBLE_KIND_COLORS.life,
      filter: { source: 'life' },
    };
  }
  if (source === 'bank' || category === 'banking') {
    return {
      kind: 'bank',
      label: event?.bankKind || 'Banking',
      color: YEAR_BUBBLE_KIND_COLORS.bank,
      filter: { source: 'bank' },
    };
  }
  if (source === 'laundry' || category === 'household') {
    return {
      kind: 'household',
      label: 'Household',
      color: YEAR_BUBBLE_KIND_COLORS.household,
      filter: { category: 'household' },
    };
  }
  if (category === 'family') {
    return {
      kind: 'family',
      label: 'Family',
      color: YEAR_BUBBLE_KIND_COLORS.family,
      filter: { category: 'family' },
    };
  }

  // Remaining: group by CATEGORIES (personal shown as "Event" to match mock).
  if (category === 'personal' || (!category && (source === 'manual' || !source))) {
    return {
      kind: 'event',
      label: 'Event',
      color: YEAR_BUBBLE_KIND_COLORS.event,
      filter: { category: category || 'personal', source: source || 'manual' },
    };
  }

  if (source === 'hobby' && hobbyType) {
    const hobbyLabel = getHobbyTypeLabel(hobbyType) || 'Hobby';
    return {
      kind: `hobby:${hobbyType}`,
      label: hobbyLabel,
      color: getCategoryColor('hobby'),
      filter: { source: 'hobby', hobbyType },
    };
  }

  const cat = CATEGORIES.find((c) => c.id === category);
  if (cat) {
    return {
      kind: `category:${cat.id}`,
      label: cat.label,
      color: cat.color,
      filter: { category: cat.id },
    };
  }

  return {
    kind: 'event',
    label: 'Event',
    color: YEAR_BUBBLE_KIND_COLORS.event,
    filter: { category: category || 'other' },
  };
}

/**
 * Per-year bubble summaries for YearOverviewScreen.
 * Empty years still appear (spine labels) with bubbles: [].
 * Only kinds with count > 0 are included in bubbles.
 */
export function getYearBubbleSummaries(events) {
  const byYear = getEventsByYear(events || []);
  const years = Object.keys(byYear).map(Number);
  const current = new Date().getFullYear();
  for (let y = current - 3; y <= current + 1; y += 1) {
    if (!years.includes(y)) years.push(y);
  }
  // Chronological ascending: oldest/past at top, furthest-future at bottom.
  years.sort((a, b) => a - b);

  return years.map((year) => {
    const list = byYear[year] || [];
    const buckets = {};
    list.forEach((event) => {
      const meta = classifyYearBubbleKind(event);
      if (!buckets[meta.kind]) {
        buckets[meta.kind] = {
          kind: meta.kind,
          label: meta.label,
          color: meta.color,
          filter: meta.filter,
          count: 0,
        };
      }
      buckets[meta.kind].count += 1;
    });

    const bubbles = Object.values(buckets)
      .filter((b) => b.count > 0)
      .sort((a, b) => {
        const ai = YEAR_BUBBLE_KIND_ORDER.indexOf(a.kind);
        const bi = YEAR_BUBBLE_KIND_ORDER.indexOf(b.kind);
        const ao = ai === -1 ? 100 : ai;
        const bo = bi === -1 ? 100 : bi;
        if (ao !== bo) return ao - bo;
        return b.count - a.count || a.label.localeCompare(b.label);
      });

    return {
      year,
      count: list.length,
      bubbles,
    };
  });
}

/**
 * Whether an event belongs to a year-overview bubble filter.
 * Prefer matching classifyYearBubbleKind(...).kind when filter.kind is set so
 * classification priority (email → QR → poem → …) stays consistent with bubbles.
 * Otherwise match filter.source / category / hobbyType against the event's
 * classified meta.filter fields.
 */
export function eventMatchesBubbleFilter(event, filter) {
  if (!filter) return true;
  const meta = classifyYearBubbleKind(event);
  if (filter.kind) {
    return meta.kind === filter.kind;
  }
  const keys = ['source', 'category', 'hobbyType'];
  const specified = keys.filter((k) => filter[k] != null && filter[k] !== '');
  if (specified.length === 0) return true;
  return specified.every((k) => {
    const want = String(filter[k]).toLowerCase();
    const got = String(meta.filter?.[k] || '').toLowerCase();
    return got === want;
  });
}

const PREVIEW_MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Up to `limit` chronological blurbs (title + short date) for a year bubble preview sheet.
 */
export function getYearBubblePreviewBlurbs(events, year, filter, limit = 6) {
  const matched = (events || [])
    .filter((e) => {
      const d = new Date(e.date);
      if (Number.isNaN(d.getTime()) || d.getFullYear() !== year) return false;
      return eventMatchesBubbleFilter(e, filter);
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return matched.slice(0, Math.max(0, limit)).map((e) => {
    const d = new Date(e.date);
    return {
      id: e.id,
      event: e,
      title: e.title || 'Untitled',
      dateLabel: String(d.getDate()) + ' ' + PREVIEW_MONTH_SHORT[d.getMonth()],
      labels: Array.isArray(e.labels) ? e.labels : [],
      imageUri: e.imageUri || '',
    };
  });
}

export function getMonthSummaries(events, year, filter) {
  // Months stay index-ascending (Jan→Dec): earlier months higher, later/future lower.
  // Optional filter (bubble filter / kind) narrows counts + category dots.
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
      if (filter && !eventMatchesBubbleFilter(e, filter)) return;
      const bucket = months[d.getMonth()];
      bucket.count += 1;
      const color = getCategoryColor(e.category);
      if (!bucket.categories.includes(color)) bucket.categories.push(color);
    }
  });
  return months;
}

function sortKindBubbles(buckets) {
  return Object.values(buckets)
    .filter((b) => b.count > 0)
    .sort((a, b) => {
      const ai = YEAR_BUBBLE_KIND_ORDER.indexOf(a.kind);
      const bi = YEAR_BUBBLE_KIND_ORDER.indexOf(b.kind);
      const ao = ai === -1 ? 100 : ai;
      const bo = bi === -1 ? 100 : bi;
      if (ao !== bo) return ao - bo;
      return b.count - a.count || a.label.localeCompare(b.label);
    });
}

/**
 * Per-month kind-bubbles for MonthOverviewScreen — same classification as years.
 * Always returns Jan–Dec for `year`. Empty months have bubbles: [].
 */
export function getMonthBubbleSummaries(events, year, filter) {
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i,
    letter: MONTH_LETTERS[i],
    name: MONTH_NAMES[i],
    short: PREVIEW_MONTH_SHORT[i],
    count: 0,
    bubbles: [],
  }));
  const bucketsByMonth = Array.from({ length: 12 }, () => ({}));
  (events || []).forEach((event) => {
    const d = new Date(event.date);
    if (Number.isNaN(d.getTime()) || d.getFullYear() !== year) return;
    if (filter && !eventMatchesBubbleFilter(event, filter)) return;
    const m = d.getMonth();
    months[m].count += 1;
    const meta = classifyYearBubbleKind(event);
    const buckets = bucketsByMonth[m];
    if (!buckets[meta.kind]) {
      buckets[meta.kind] = {
        kind: meta.kind,
        label: meta.label,
        color: meta.color,
        filter: meta.filter,
        count: 0,
      };
    }
    buckets[meta.kind].count += 1;
  });
  return months.map((row, i) => ({
    ...row,
    bubbles: sortKindBubbles(bucketsByMonth[i]),
  }));
}

export function getMonthBubblePreviewBlurbs(events, year, month, filter, limit = 6) {
  const matched = (events || [])
    .filter((e) => {
      const d = new Date(e.date);
      if (Number.isNaN(d.getTime()) || d.getFullYear() !== year || d.getMonth() !== month) {
        return false;
      }
      return eventMatchesBubbleFilter(e, filter);
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return matched.slice(0, Math.max(0, limit)).map((e) => {
    const d = new Date(e.date);
    return {
      id: e.id,
      event: e,
      title: e.title || 'Untitled',
      dateLabel: String(d.getDate()) + ' ' + PREVIEW_MONTH_SHORT[d.getMonth()],
      labels: Array.isArray(e.labels) ? e.labels : [],
      imageUri: e.imageUri || '',
    };
  });
}

function eventOnLocalDay(event, date) {
  const d = new Date(event.date);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === date.getFullYear() &&
    d.getMonth() === date.getMonth() &&
    d.getDate() === date.getDate()
  );
}

export function getDayBubbleSummaries(events, date, filter) {
  const buckets = {};
  (events || []).forEach((event) => {
    if (!eventOnLocalDay(event, date)) return;
    if (filter && !eventMatchesBubbleFilter(event, filter)) return;
    const meta = classifyYearBubbleKind(event);
    if (!buckets[meta.kind]) {
      buckets[meta.kind] = {
        kind: meta.kind,
        label: meta.label,
        color: meta.color,
        filter: meta.filter,
        count: 0,
      };
    }
    buckets[meta.kind].count += 1;
  });
  return sortKindBubbles(buckets);
}

export function getDayBubblePreviewBlurbs(events, date, filter, limit = 6) {
  const matched = (events || [])
    .filter((e) => eventOnLocalDay(e, date) && eventMatchesBubbleFilter(e, filter))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  return matched.slice(0, Math.max(0, limit)).map((e) => {
    const d = new Date(e.date);
    return {
      id: e.id,
      event: e,
      title: e.title || 'Untitled',
      dateLabel: String(d.getDate()) + ' ' + PREVIEW_MONTH_SHORT[d.getMonth()],
      labels: Array.isArray(e.labels) ? e.labels : [],
      imageUri: e.imageUri || '',
    };
  });
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

function filled(value) {
  const text = String(value || '').trim();
  return text || '';
}

function promptKind(event) {
  const source = String(event?.source || '').toLowerCase();
  const hobby = String(event?.hobbyType || '').toLowerCase();
  if (source === 'email' || event?.emailFrom) return 'email';
  if (source === 'sms') return 'sms';
  if (source === 'call') return 'call';
  if (hobby === 'poetry') return 'poem';
  if (hobby === 'singing' || hobby === 'music') return 'singing';
  if (source === 'food') return 'food';
  if (source === 'laundry') return 'wash';
  if (source === 'bank' || source === 'purchase') return 'purchase';
  if (source === 'watched' || event?.watchKind) return 'watched';
  if (source === 'youtube') return 'youtube';
  if (source === 'spotify') return 'spotify';
  if (source === 'game') return 'game';
  if (source === 'social') return 'social';
  if (source === 'location') return 'place';
  if (source === 'life') return 'life';
  if (source === 'qr') return 'qr';
  return 'note';
}

const GROK_ASK = {
  email: {
    open: 'Please draft a reply to this email.',
    close: 'Write a clear, polite draft reply I can copy and send.',
    block: 'Original email text',
  },
  sms: {
    open: 'Please draft a reply to this text message. It is not an email.',
    close: 'Write a short reply I can copy and send.',
    block: 'Message',
  },
  call: {
    open: 'Please draft a short follow-up after this phone call. It is not an email.',
    close: 'Write a short message I could send, and a one-line note I can keep.',
    block: 'Call note',
  },
  poem: {
    open: 'This is a poem on my timeline, not an email. Do not rewrite the whole poem unless I ask.',
    close: 'Suggest a title if it needs one, a private note to myself, or a careful next line.',
    block: 'Poem',
  },
  singing: {
    open: 'This is a singing or music note, not an email.',
    close: 'Write a short caption or a note I can keep with the recording.',
    block: 'Note',
  },
  food: {
    open: 'This is a food note, not an email.',
    close: 'Write a short note about this meal I can keep on the timeline.',
    block: 'Note',
  },
  wash: {
    open: 'This is a household wash note, not an email.',
    close: 'Write a short note I can keep with this wash load.',
    block: 'Note',
  },
  purchase: {
    open: 'This is a purchase or banking note I typed. It is not an email, and it is not a request to log in anywhere.',
    close: 'Write a short note I can keep, or a polite question I could send about this purchase.',
    block: 'Details',
  },
  watched: {
    open: 'This is something I watched, not an email.',
    close: 'Write a short note I can keep about it.',
    block: 'Note',
  },
  youtube: {
    open: 'This is a YouTube item on my timeline, not an email.',
    close: 'Write a short note or description I can keep with this video.',
    block: 'Note',
  },
  spotify: {
    open: 'This is a Spotify item on my timeline, not an email.',
    close: 'Write a short note I can keep about this track or playlist.',
    block: 'Note',
  },
  game: {
    open: 'This is a game I logged, not an email.',
    close: 'Write a short note I can keep about this session.',
    block: 'Note',
  },
  social: {
    open: 'This is a social media note, not an email.',
    close: 'Write a short post I could share, and say that it is a post. Also offer a private note if a post is the wrong shape.',
    block: 'Note',
  },
  place: {
    open: 'This is a place on my timeline, not an email.',
    close: 'Write a short note I can keep about this place.',
    block: 'Note',
  },
  life: {
    open: 'This is a life event on my timeline, not an email.',
    close: 'Write a short note to myself about it.',
    block: 'Note',
  },
  qr: {
    open: 'This is a link I saved, not an email.',
    close: 'Write a short message I can send with this link.',
    block: 'Note',
  },
  note: {
    open: 'This is a timeline note, not an email.',
    close: 'Write a short note I can keep with it. If it needs a reply, draft that instead and say so.',
    block: 'Note',
  },
};

/** Prompt the user can paste into Grok. Wording follows the event type. */
export function buildGrokReplyPrompt(event) {
  const kind = promptKind(event || {});
  const ask = GROK_ASK[kind] || GROK_ASK.note;
  const parts = [ask.open, ''];
  const title = filled(event?.title) || 'Untitled';
  parts.push(`Title: ${title}`);
  if (kind === 'email') parts[parts.length - 1] = `Subject: ${title}`;
  const from = filled(event?.emailFrom);
  if (from) parts.push(`From: ${from}`);
  const contact = filled(event?.smsContact);
  if (contact) parts.push(`Contact: ${contact}`);
  const number = filled(event?.smsNumber);
  if (number) parts.push(`Number: ${number}`);
  const direction = filled(event?.smsDirection || event?.callDirection);
  if (direction) parts.push(`Direction: ${direction}`);
  if (event?.callMinutes != null || event?.callSeconds != null) {
    const mins = Number(event.callMinutes) || 0;
    const secs = Number(event.callSeconds) || 0;
    if (mins || secs) parts.push(`Length: ${mins}m ${secs}s`);
  }
  if (event?.date) parts.push(`Date: ${new Date(event.date).toLocaleString()}`);
  const category = filled(event?.category);
  if (category && kind !== 'email') parts.push(`Category: ${category}`);
  const place = filled(event?.location || event?.placeName || event?.smsLocation);
  if (place) parts.push(`Place: ${place}`);
  const link = filled(event?.qrLink || event?.url);
  if (link) parts.push(`Link: ${link}`);
  const labels = Array.isArray(event?.labels) ? event.labels.map((l) => filled(l)).filter(Boolean) : [];
  if (labels.length) parts.push(`Labels: ${labels.join(', ')}`);
  parts.push('');
  const body = filled(event?.description || event?.smsBody);
  if (body) {
    parts.push(`--- ${ask.block} ---`);
    parts.push(body);
    parts.push('--- End ---');
  } else {
    parts.push('(No extra text was saved with this item.)');
  }
  parts.push('');
  parts.push(ask.close);
  return parts.join('\n');
}

function writtenDay(event) {
  if (!event?.date) return '';
  const d = new Date(event.date);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function isPoemEvent(event) {
  return String(event?.hobbyType || '').toLowerCase() === 'poetry';
}

/** Image card prompt. Same shape as the poem cards already in use: title, poem, written date. */
export function buildGrokPoemCardPrompt(event) {
  const title = filled(event?.title) || 'Untitled';
  const day = writtenDay(event);
  const book = filled(event?.collectionName);
  const body = filled(event?.description);
  const parts = [
    'Create an image card for this poem, like the poem cards I already use.',
    'Show the title, then the poem with every line break kept, then the written date at the bottom.',
    'Do not change, shorten, or add to the poem.',
    'Do not use today\'s date. Use the written date below.',
    'A quiet card, dark background, words easy to read. No extra slogan.',
    '',
    `Title: ${title}`,
  ];
  if (book) parts.push(`Book: ${book}`);
  if (day) parts.push(`Written date: ${day}`);
  parts.push('');
  if (body) {
    parts.push('--- Poem ---');
    parts.push(body);
    parts.push('--- End ---');
  } else {
    parts.push('(No poem text was saved. Do not invent a poem.)');
  }
  parts.push('');
  parts.push('Make the image card now.');
  return parts.join('\n');
}

export const WASH_STATUSES = [
  { id: 'loaded', label: 'Loaded' },
  { id: 'running', label: 'Running' },
  { id: 'done', label: 'Done' },
  { id: 'drying', label: 'Drying' },
  { id: 'put_away', label: 'Put away' },
];

export const WASH_TUMBLE = [
  { id: 'yes', label: 'Tumble dry' },
  { id: 'hang', label: 'Hang' },
  { id: 'some', label: 'Some of each' },
  { id: 'later', label: 'Later' },
];

export function isLaundryEvent(event) {
  return String(event?.source || '').toLowerCase() === 'laundry';
}

export function washStatusLabel(id) {
  const row = WASH_STATUSES.find((s) => s.id === id);
  return row ? row.label : '';
}

export function washTumbleLabel(id) {
  const row = WASH_TUMBLE.find((s) => s.id === id);
  return row ? row.label : '';
}

export function getLatestWash(events) {
  const list = (events || []).filter(isLaundryEvent);
  list.sort((a, b) => {
    const ta = new Date(a.updatedAt || a.date || 0).getTime();
    const tb = new Date(b.updatedAt || b.date || 0).getTime();
    return tb - ta;
  });
  return list[0] || null;
}

export function buildWashTitle(washStatus, washItems, washSetting) {
  const status = washStatusLabel(washStatus) || 'Wash';
  const items = String(washItems || '').trim().replace(/\s+/g, ' ');
  const setting = String(washSetting || '').trim();
  const bit = items || setting;
  if (!bit) return `Wash · ${status}`;
  const short = bit.length > 42 ? bit.slice(0, 39).trim() + '…' : bit;
  return `Wash: ${short} · ${status}`;
}

export const TIMELINE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'poems', label: 'Poems', color: '#8b5cf6', itemView: true },
  { id: 'singing', label: 'Singing', color: '#c4b5fd', itemView: true },
  { id: 'games', label: 'Games', color: '#818cf8', itemView: true },
  { id: 'social', label: 'Social', color: '#38bdf8', itemView: true },
  { id: 'sms', label: 'SMS', color: '#22c55e', itemView: true },
  { id: 'call', label: 'Calls', color: '#fb923c', itemView: true },
  { id: 'email', label: 'Email', color: '#14b8a6', itemView: true },
  { id: 'youtube', label: 'YouTube', color: '#f87171', itemView: true },
  { id: 'spotify', label: 'Spotify', color: '#1db954', itemView: true },
  { id: 'watched', label: 'TV & films', color: '#f472b6', itemView: true },
  { id: 'food', label: 'Food', color: '#f59e0b', itemView: true },
  { id: 'laundry', label: 'Wash', color: '#38bdf8', itemView: true },
  { id: 'location', label: 'Places', color: '#2dd4bf', itemView: true },
  { id: 'life', label: 'Life', color: '#e879f9', itemView: true },
  { id: 'bank', label: 'Banking', color: '#22d3ee', itemView: true },
  ...CATEGORIES.map((c) => ({
    id: `cat:${c.id}`,
    label: c.label,
    color: c.color,
    itemView: true,
  })),
];

export function eventMatchesTimelineFilter(event, filterId) {
  if (!filterId || filterId === 'all') return true;
  const source = String(event?.source || '').toLowerCase();
  const hobby = String(event?.hobbyType || '').toLowerCase();
  const category = String(event?.category || '').toLowerCase();
  if (filterId === 'poems') return hobby === 'poetry' || source === 'poem';
  if (filterId === 'singing') return hobby === 'singing' || hobby === 'music';
  if (filterId === 'games') return source === 'game';
  if (filterId === 'social') return source === 'social';
  if (filterId === 'sms') return source === 'sms';
  if (filterId === 'call') return source === 'call';
  if (filterId === 'email') return source === 'email';
  if (filterId === 'youtube') return source === 'youtube';
  if (filterId === 'spotify') return source === 'spotify';
  if (filterId === 'watched') {
    return source === 'watched' || hobby === 'watching' || !!event?.watchKind;
  }
  if (filterId === 'food') return source === 'food';
  if (filterId === 'laundry') return source === 'laundry';
  if (filterId === 'location') return source === 'location' || Boolean(event?.placeName);
  if (filterId === 'life') return source === 'life' || Boolean(event?.lifeKind);
  if (filterId === 'bank') return source === 'bank' || category === 'banking';
  if (filterId.startsWith('cat:')) return category === filterId.slice(4);
  return true;
}

function shortBubbleTitle(title) {
  const t = String(title || 'Untitled').trim() || 'Untitled';
  return t.length > 16 ? `${t.slice(0, 15)}…` : t;
}

/** One bubble per matching event, grouped by year — all poems (etc.) on one spine. */
export function getItemBubblesByYear(events, filterId) {
  const matched = (events || [])
    .filter((e) => eventMatchesTimelineFilter(e, filterId))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const byYear = {};
  matched.forEach((event) => {
    const d = new Date(event.date);
    if (Number.isNaN(d.getTime())) return;
    const year = d.getFullYear();
    if (!byYear[year]) byYear[year] = [];
    const meta = classifyYearBubbleKind(event);
    byYear[year].push({
      kind: `item:${event.id}`,
      label: shortBubbleTitle(event.title),
      color: meta.color,
      count: String(d.getDate()),
      filter: { eventId: event.id },
      event,
    });
  });
  return Object.keys(byYear)
    .map(Number)
    .sort((a, b) => a - b)
    .map((year) => ({ year, bubbles: byYear[year] }));
}
