import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from './services/firebase';

export const LEGACY_THEME_MODE_KEY = '@timeline_theme_mode';
export const LEGACY_THEME_PALETTE_KEY = '@timeline_theme_palette';
/** @deprecated Use themeModeKey(uid) — kept for any external imports. */
export const THEME_MODE_KEY = LEGACY_THEME_MODE_KEY;
/** @deprecated Use themePaletteKey(uid) */
export const THEME_PALETTE_KEY = LEGACY_THEME_PALETTE_KEY;

export function themeModeKey(uid) {
  return uid ? `@timeline_theme_mode_${uid}` : '@timeline_theme_mode_guest';
}
export function themePaletteKey(uid) {
  return uid ? `@timeline_theme_palette_${uid}` : '@timeline_theme_palette_guest';
}

async function migrateLegacyThemeOnce(uid) {
  if (!uid) return;
  const pairs = [
    [LEGACY_THEME_MODE_KEY, themeModeKey(uid)],
    [LEGACY_THEME_PALETTE_KEY, themePaletteKey(uid)],
  ];
  for (const [legacy, scoped] of pairs) {
    try {
      const existing = await AsyncStorage.getItem(scoped);
      if (existing != null) continue;
      const raw = await AsyncStorage.getItem(legacy);
      if (raw == null) continue;
      await AsyncStorage.setItem(scoped, raw);
      await AsyncStorage.removeItem(legacy);
      console.warn('Migrated legacy theme key', legacy, 'into', scoped);
    } catch (e) {
      console.warn('Legacy theme migration skipped', e);
    }
  }
}

function currentUid() {
  return auth.currentUser?.uid || null;
}

export const MODES = [
  { id: 'system', label: 'Match device' },
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
];

export const PALETTES = [
  { id: 'slate', label: 'Slate / cyan' },
  { id: 'teal', label: 'Teal' },
  { id: 'purple', label: 'Purple' },
  { id: 'rose', label: 'Rose' },
  { id: 'amber', label: 'Amber' },
  { id: 'contrast', label: 'High contrast' },
];

const DARK = {
  slate: {
    bg: '#0f1024', card: '#1a1b36', cardBorder: '#2e2f55', text: '#f8fafc',
    muted: '#a5b4fc', faint: '#94a3b8', blue: '#3b82f6', blueSoft: '#60a5fa',
    accent: '#22d3ee', spine: '#7c3aed', danger: '#f87171', headerBg: '#0f1024', headerText: '#f8fafc',
  },
  teal: {
    bg: '#071614', card: '#0f2a26', cardBorder: '#1d4a44', text: '#ecfdf8',
    muted: '#99f6e4', faint: '#94a3b8', blue: '#0d9488', blueSoft: '#5eead4',
    accent: '#2dd4bf', spine: '#14b8a6', danger: '#f87171', headerBg: '#071614', headerText: '#ecfdf8',
  },
  purple: {
    bg: '#140e24', card: '#24183d', cardBorder: '#3b2a63', text: '#f5f3ff',
    muted: '#c4b5fd', faint: '#a78bfa', blue: '#7c3aed', blueSoft: '#a78bfa',
    accent: '#c4b5fd', spine: '#8b5cf6', danger: '#f87171', headerBg: '#140e24', headerText: '#f5f3ff',
  },
  rose: {
    bg: '#1c1014', card: '#2a161c', cardBorder: '#4a2430', text: '#fff1f2',
    muted: '#fda4af', faint: '#fb7185', blue: '#e11d48', blueSoft: '#fb7185',
    accent: '#fb7185', spine: '#f43f5e', danger: '#fb7185', headerBg: '#1c1014', headerText: '#fff1f2',
  },
  amber: {
    bg: '#1a1408', card: '#2a2110', cardBorder: '#4a3b1a', text: '#fffbeb',
    muted: '#fcd34d', faint: '#fbbf24', blue: '#d97706', blueSoft: '#fbbf24',
    accent: '#f59e0b', spine: '#f59e0b', danger: '#f87171', headerBg: '#1a1408', headerText: '#fffbeb',
  },
  contrast: {
    bg: '#000000', card: '#111111', cardBorder: '#ffffff', text: '#ffffff',
    muted: '#ffff00', faint: '#00ffff', blue: '#ffff00', blueSoft: '#ffff66',
    accent: '#00ffff', spine: '#ffff00', danger: '#ff4d4d', headerBg: '#000000', headerText: '#ffffff',
  },
};

const LIGHT = {
  slate: {
    bg: '#f1f5f9', card: '#ffffff', cardBorder: '#cbd5e1', text: '#0f172a',
    muted: '#334155', faint: '#64748b', blue: '#2563eb', blueSoft: '#3b82f6',
    accent: '#0891b2', spine: '#7c3aed', danger: '#dc2626', headerBg: '#ffffff', headerText: '#0f172a',
  },
  teal: {
    bg: '#f0fdfa', card: '#ffffff', cardBorder: '#99f6e4', text: '#134e4a',
    muted: '#0f766e', faint: '#0d9488', blue: '#0d9488', blueSoft: '#14b8a6',
    accent: '#0f766e', spine: '#0d9488', danger: '#dc2626', headerBg: '#ffffff', headerText: '#134e4a',
  },
  purple: {
    bg: '#f5f3ff', card: '#ffffff', cardBorder: '#ddd6fe', text: '#2e1065',
    muted: '#5b21b6', faint: '#7c3aed', blue: '#7c3aed', blueSoft: '#8b5cf6',
    accent: '#6d28d9', spine: '#7c3aed', danger: '#dc2626', headerBg: '#ffffff', headerText: '#2e1065',
  },
  rose: {
    bg: '#fff1f2', card: '#ffffff', cardBorder: '#fecdd3', text: '#4c0519',
    muted: '#9f1239', faint: '#e11d48', blue: '#e11d48', blueSoft: '#f43f5e',
    accent: '#be123c', spine: '#e11d48', danger: '#be123c', headerBg: '#ffffff', headerText: '#4c0519',
  },
  amber: {
    bg: '#fffbeb', card: '#ffffff', cardBorder: '#fde68a', text: '#451a03',
    muted: '#92400e', faint: '#d97706', blue: '#d97706', blueSoft: '#f59e0b',
    accent: '#b45309', spine: '#d97706', danger: '#dc2626', headerBg: '#ffffff', headerText: '#451a03',
  },
  contrast: {
    bg: '#ffffff', card: '#ffffff', cardBorder: '#000000', text: '#000000',
    muted: '#000000', faint: '#111111', blue: '#000000', blueSoft: '#111111',
    accent: '#0000aa', spine: '#000000', danger: '#aa0000', headerBg: '#ffffff', headerText: '#000000',
  },
};

const themePrefsListeners = new Set();

export function onThemePrefsChanged(listener) {
  themePrefsListeners.add(listener);
  return () => themePrefsListeners.delete(listener);
}

function notifyThemePrefs(prefs) {
  themePrefsListeners.forEach((listener) => {
    try {
      listener(prefs);
    } catch (_) {}
  });
}

function normalizePrefs({ mode, palette }) {
  return {
    mode: MODES.some((m) => m.id === mode) ? mode : 'system',
    palette: PALETTES.some((p) => p.id === palette) ? palette : 'slate',
  };
}

export function resolvedScheme(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  const sys = Appearance.getColorScheme();
  return sys === 'light' ? 'light' : 'dark';
}

export function getColors(mode = 'system', paletteId = 'slate') {
  const scheme = resolvedScheme(mode);
  const set = scheme === 'light' ? LIGHT : DARK;
  return set[paletteId] || set.slate;
}

export const theme = getColors('dark', 'purple');

export async function loadThemePrefs(uid = currentUid()) {
  try {
    if (uid) await migrateLegacyThemeOnce(uid);
    const [mode, palette] = await Promise.all([
      AsyncStorage.getItem(themeModeKey(uid)),
      AsyncStorage.getItem(themePaletteKey(uid)),
    ]);
    return normalizePrefs({ mode, palette });
  } catch {
    return { mode: 'system', palette: 'slate' };
  }
}

/** Write theme prefs locally only (used when applying cloud → local). */
export async function writeThemePrefsLocalOnly({ mode, palette }, uid = currentUid()) {
  const next = normalizePrefs({ mode, palette });
  await AsyncStorage.multiSet([
    [themeModeKey(uid), next.mode],
    [themePaletteKey(uid), next.palette],
  ]);
  notifyThemePrefs(next);
  return next;
}

async function pushThemeToCloud(prefs) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await setDoc(doc(db, 'users', uid, 'settings', 'theme'), {
    mode: prefs.mode,
    palette: prefs.palette,
    updatedAt: new Date().toISOString(),
  });
}

export async function saveThemePrefs({ mode, palette }) {
  const next = await writeThemePrefsLocalOnly({ mode, palette });
  if (auth.currentUser?.uid) {
    try {
      await pushThemeToCloud(next);
    } catch (e) {
      console.warn('Could not sync theme to the cloud. Saved on this device.', e);
    }
  }
  return next;
}
