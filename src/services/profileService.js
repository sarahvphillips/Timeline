import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { loadThemePrefs, writeThemePrefsLocalOnly } from '../theme';

const LEGACY_PROFILE_KEY = '@timeline_profile';
const LEGACY_LABELS_KEY = '@timeline_labels';
const LEGACY_POEM_CATS_KEY = '@timeline_poem_categories';

function profileKey(uid) {
  return uid ? `@timeline_profile_${uid}` : '@timeline_profile_guest';
}
function labelsKey(uid) {
  return uid ? `@timeline_labels_${uid}` : '@timeline_labels_guest';
}
function poemCatsKey(uid) {
  return uid ? `@timeline_poem_categories_${uid}` : '@timeline_poem_categories_guest';
}
function profilePhotoKey(uid) {
  return uid ? `@profile_photo_${uid}` : '@profile_photo_guest';
}

const LEGACY_PROFILE_PHOTO_KEY = '@profile_photo';
const LAST_UID_KEY = '@timeline_last_uid';

async function migrateLegacySettingsOnce(uid) {
  if (!uid) return;
  // Only migrate legacy settings into the last-logged-in uid — never into a
  // different/new empty account (same cross-account bleed pattern as events).
  const lastUid = await AsyncStorage.getItem(LAST_UID_KEY);
  if (lastUid !== uid) {
    console.warn(
      'Skipping legacy settings migration for',
      uid,
      '(last_uid=',
      lastUid,
      ') — not adopting foreign cache',
    );
    return;
  }
  const pairs = [
    [LEGACY_PROFILE_KEY, profileKey(uid)],
    [LEGACY_LABELS_KEY, labelsKey(uid)],
    [LEGACY_POEM_CATS_KEY, poemCatsKey(uid)],
    [LEGACY_PROFILE_PHOTO_KEY, profilePhotoKey(uid)],
  ];
  for (const [legacy, scoped] of pairs) {
    try {
      const existing = await AsyncStorage.getItem(scoped);
      if (existing != null) continue;
      const raw = await AsyncStorage.getItem(legacy);
      if (raw == null) continue;
      await AsyncStorage.setItem(scoped, raw);
      await AsyncStorage.removeItem(legacy);
      console.warn('Migrated legacy', legacy, 'into', scoped);
    } catch (e) {
      console.warn('Legacy settings migration skipped for', legacy, e);
    }
  }
}

export const DEFAULT_LABELS = [
  'AI', 'Cars', 'Crafting', 'Family', 'Figaro', 'Greek', 'Life problems',
  'Love', 'Mafia', 'Money', 'Nature', 'Norse', 'Programming',
  'Songs and Celebrity', 'Space', 'Work', 'WoW',
];

export const DEFAULT_POEM_CATEGORIES = [
  'Lyric', 'Free verse', 'Sonnet', 'Song', 'Spoken word', 'Other',
];

function getUid() {
  return auth.currentUser?.uid || null;
}

function settingsDoc(uid, docId) {
  return doc(db, 'users', uid, 'settings', docId);
}

/** Strip undefined (Firestore rejects it). */
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

async function pushSettingsDoc(docId, payload) {
  const uid = getUid();
  if (!uid) return;
  await setDoc(settingsDoc(uid, docId), stripUndefined(payload));
}

export async function getProfile() {
  const uid = getUid();
  try {
    if (uid) await migrateLegacySettingsOnce(uid);
    const raw = await AsyncStorage.getItem(profileKey(uid));
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
  const uid = getUid();
  const next = {
    displayName: String(profile.displayName || '').trim(),
    dateOfBirth: String(profile.dateOfBirth || '').trim(),
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(profileKey(uid), JSON.stringify(next));
  if (uid) {
    try {
      await pushSettingsDoc('profile', next);
    } catch (e) {
      console.warn('Could not sync profile to the cloud. Saved on this device.', e);
    }
  }
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
  const uid = getUid();
  if (uid) await migrateLegacySettingsOnce(uid);
  return loadList(labelsKey(uid), DEFAULT_LABELS);
}

export async function saveLabels(list) {
  const uid = getUid();
  const next = [...new Set((list || []).map((s) => String(s).trim()).filter(Boolean))];
  await AsyncStorage.setItem(labelsKey(uid), JSON.stringify(next));
  if (uid) {
    try {
      await pushSettingsDoc('labels', {
        items: next,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Could not sync labels to the cloud. Saved on this device.', e);
    }
  }
  return next;
}

export async function getPoemCategories() {
  const uid = getUid();
  if (uid) await migrateLegacySettingsOnce(uid);
  return loadList(poemCatsKey(uid), DEFAULT_POEM_CATEGORIES);
}

export async function savePoemCategories(list) {
  const uid = getUid();
  const next = [...new Set((list || []).map((s) => String(s).trim()).filter(Boolean))];
  await AsyncStorage.setItem(poemCatsKey(uid), JSON.stringify(next));
  if (uid) {
    try {
      await pushSettingsDoc('poemCategories', {
        items: next,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Could not sync poem categories to the cloud. Saved on this device.', e);
    }
  }
  return next;
}

async function syncProfileFromCloud(uid, local) {
  const snap = await getDoc(settingsDoc(uid, 'profile'));
  if (!snap.exists()) {
    if (local.displayName || local.dateOfBirth) {
      await setDoc(
        settingsDoc(uid, 'profile'),
        stripUndefined({
          ...local,
          updatedAt: local.updatedAt || new Date().toISOString(),
        }),
      );
    }
    return local;
  }
  const data = snap.data() || {};
  const cloud = {
    displayName: data.displayName || '',
    dateOfBirth: data.dateOfBirth || '',
    updatedAt: toIso(data.updatedAt) || new Date().toISOString(),
  };
  await AsyncStorage.setItem(profileKey(uid), JSON.stringify(cloud));
  return cloud;
}

async function syncListFromCloud(uid, docId, storageKey, localList) {
  const snap = await getDoc(settingsDoc(uid, docId));
  if (!snap.exists()) {
    if (localList.length > 0) {
      await setDoc(
        settingsDoc(uid, docId),
        stripUndefined({
          items: localList,
          updatedAt: new Date().toISOString(),
        }),
      );
      await AsyncStorage.setItem(storageKey, JSON.stringify(localList));
    }
    return localList;
  }
  const data = snap.data() || {};
  const items = Array.isArray(data.items) ? data.items : [];
  if (items.length === 0) {
    if (localList.length > 0) {
      await setDoc(
        settingsDoc(uid, docId),
        stripUndefined({
          items: localList,
          updatedAt: new Date().toISOString(),
        }),
      );
      await AsyncStorage.setItem(storageKey, JSON.stringify(localList));
      return localList;
    }
    return localList;
  }
  // Cloud wins
  await AsyncStorage.setItem(storageKey, JSON.stringify(items));
  return items;
}

async function syncThemeFromCloud(uid) {
  const local = await loadThemePrefs();
  const snap = await getDoc(settingsDoc(uid, 'theme'));
  if (!snap.exists()) {
    if (local.mode || local.palette) {
      await setDoc(
        settingsDoc(uid, 'theme'),
        stripUndefined({
          mode: local.mode,
          palette: local.palette,
          updatedAt: new Date().toISOString(),
        }),
      );
    }
    return local;
  }
  const data = snap.data() || {};
  const cloudMode = data.mode;
  const cloudPalette = data.palette;
  if (!cloudMode && !cloudPalette) {
    await setDoc(
      settingsDoc(uid, 'theme'),
      stripUndefined({
        mode: local.mode,
        palette: local.palette,
        updatedAt: new Date().toISOString(),
      }),
    );
    return local;
  }
  // Cloud wins — write local only (do not re-upload)
  return writeThemePrefsLocalOnly({
    mode: cloudMode || local.mode,
    palette: cloudPalette || local.palette,
  });
}

/**
 * Pull settings (profile, labels, poem categories, theme) from Firestore
 * into the local cache. Cloud wins when a doc has data; if cloud is empty
 * and local has data, upload local. Failures keep the cache.
 */

export async function getProfilePhotoUri(uid = getUid()) {
  try {
    if (uid) await migrateLegacySettingsOnce(uid);
    return (await AsyncStorage.getItem(profilePhotoKey(uid))) || null;
  } catch (_) {
    return null;
  }
}

export async function saveProfilePhotoUri(uri, uid = getUid()) {
  if (!uri) {
    await AsyncStorage.removeItem(profilePhotoKey(uid));
    return null;
  }
  if (uid) await migrateLegacySettingsOnce(uid);
  await AsyncStorage.setItem(profilePhotoKey(uid), uri);
  return uri;
}

/** Clear only this uid's local profile photo (not other accounts). */
export async function clearLocalProfilePhotoForUid(uid) {
  if (!uid) return;
  await AsyncStorage.removeItem(profilePhotoKey(uid));
}

export async function syncSettingsFromCloud(uid) {
  if (!uid) {
    return {
      profile: await getProfile(),
      labels: await getLabels(),
      poemCategories: await getPoemCategories(),
      theme: await loadThemePrefs(),
    };
  }

  await migrateLegacySettingsOnce(uid);

  let profile = await getProfile();
  let labels = await getLabels();
  let poemCategories = await getPoemCategories();
  let theme = await loadThemePrefs();

  // Read raw profile to preserve updatedAt for upload-if-empty
  try {
    const raw = await AsyncStorage.getItem(profileKey(uid));
    if (raw) {
      const parsed = JSON.parse(raw);
      profile = {
        displayName: parsed.displayName || '',
        dateOfBirth: parsed.dateOfBirth || '',
        updatedAt: parsed.updatedAt,
      };
    }
  } catch (_) {}

  try {
    profile = await syncProfileFromCloud(uid, profile);
  } catch (e) {
    console.warn('Could not sync profile from the cloud. Using local.', e);
  }

  try {
    labels = await syncListFromCloud(uid, 'labels', labelsKey(uid), labels);
  } catch (e) {
    console.warn('Could not sync labels from the cloud. Using local.', e);
  }

  try {
    poemCategories = await syncListFromCloud(
      uid,
      'poemCategories',
      poemCatsKey(uid),
      poemCategories,
    );
  } catch (e) {
    console.warn('Could not sync poem categories from the cloud. Using local.', e);
  }

  try {
    theme = await syncThemeFromCloud(uid);
  } catch (e) {
    console.warn('Could not sync theme from the cloud. Using local.', e);
  }

  return { profile, labels, poemCategories, theme };
}
