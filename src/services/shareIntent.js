/**
 * Parse Android share-sheet text (Gmail / text/plain / rfc822-like) into Add Event fields.
 */
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function firstNonEmptyLine(text) {
  const lines = String(text || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line && !/^(from|to|cc|bcc|date|sent|subject|mime-version|content-type):/i.test(line)) {
      return line;
    }
  }
  return '';
}

function parseFromHeader(text) {
  const header = String(text || '').match(/^\s*From:\s*(.+)$/im);
  if (header) {
    const raw = header[1].trim();
    const angled = raw.match(/<([^>]+)>/);
    return (angled ? angled[1] : raw).replace(/^"|"$/g, '').trim();
  }
  const top = String(text || '').slice(0, 800);
  if (/^(From|Subject|To|Date):/im.test(top)) {
    const email = top.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (email) return email[0];
  }
  return '';
}

function parseSubject(text) {
  const m = String(text || '').match(/^\s*Subject:\s*(.+)$/im);
  return m ? m[1].trim() : '';
}

function looksLikeDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime()) && d.getFullYear() >= 1990 && d.getFullYear() <= 2100;
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseObviousDate(text) {
  const src = String(text || '');

  const dateHdr = src.match(/^\s*Date:\s*(.+)$/im);
  if (dateHdr) {
    const d = new Date(dateHdr[1].trim());
    if (looksLikeDate(d)) return toISODate(d);
  }

  const iso = src.match(/\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`);
    if (looksLikeDate(d)) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const months =
    'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';
  const dmy = src.match(new RegExp(`\\b(\\d{1,2})\\s+(${months})\\s+(20\\d{2}|19\\d{2})\\b`, 'i'));
  if (dmy) {
    const d = new Date(`${dmy[1]} ${dmy[2]} ${dmy[3]}`);
    if (looksLikeDate(d)) return toISODate(d);
  }
  const mdy = src.match(new RegExp(`\\b(${months})\\s+(\\d{1,2}),?\\s+(20\\d{2}|19\\d{2})\\b`, 'i'));
  if (mdy) {
    const d = new Date(`${mdy[1]} ${mdy[2]} ${mdy[3]}`);
    if (looksLikeDate(d)) return toISODate(d);
  }

  return todayISO();
}

function parseBody(text, subject) {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return '';

  const parts = raw.split(/\n\n+/);
  if (parts.length > 1 && /^(From|Subject|To|Date|MIME-Version|Content-Type):/im.test(parts[0])) {
    return parts.slice(1).join('\n\n').trim();
  }

  const lines = raw.split('\n');
  if (subject && lines[0] && lines[0].trim() === subject) {
    return lines.slice(1).join('\n').trim();
  }

  return raw;
}

export function parseSharedEmail(shareIntent) {
  const metaTitle = (shareIntent && shareIntent.meta && shareIntent.meta.title) || '';
  const text = String(
    (shareIntent && (shareIntent.text || shareIntent.webUrl)) || ''
  ).replace(/\r\n/g, '\n');
  const combined = text || metaTitle;

  const emailFrom = parseFromHeader(combined);
  const headerSubject = parseSubject(combined);
  const title = (headerSubject || metaTitle || firstNonEmptyLine(combined) || 'Shared email').slice(0, 200);
  const date = parseObviousDate(combined);
  let description = parseBody(combined, headerSubject || title);
  if (description && description.trim() === title.trim()) {
    description = '';
  }

  return {
    title,
    description,
    emailFrom,
    date,
    source: 'email',
    fromEmail: true,
  };
}

export function isShareIntentAvailable() {
  try {
    const { Platform } = require('react-native');
    if (Platform.OS === 'web') return false;
  } catch (_) {
    return false;
  }
  // expo-share-intent@5.x is built for SDK 54; on 55+ it often throws
  // "undefined is not a function" at startup. Keep Share disabled until upgraded.
  try {
    const Constants = require('expo-constants').default;
    const sdk =
      Constants.expoConfig?.sdkVersion ||
      Constants.manifest?.sdkVersion ||
      Constants.manifest2?.extra?.expoClient?.sdkVersion ||
      '';
    const major = parseInt(String(sdk).split('.')[0], 10);
    if (Number.isFinite(major) && major >= 55) {
      return false;
    }
  } catch (_) {
    // If we cannot read SDK, still try the module check below.
  }
  try {
    const mod = require('expo-share-intent');
    return !!(mod && mod.ShareIntentModule && typeof mod.ShareIntentModule === 'object');
  } catch (_) {
    return false;
  }
}

export function buildShareLinking() {
  if (!isShareIntentAvailable()) return undefined;
  try {
    const { getStateFromPath } = require('@react-navigation/native');
    const LinkingExpo = require('expo-linking');
    const Constants = require('expo-constants').default;
    const { ShareIntentModule, getScheme, getShareExtensionKey } = require('expo-share-intent');

    const PREFIX = LinkingExpo.createURL('/');
    const scheme = getScheme?.() || Constants.expoConfig?.scheme || 'timelineapp';
    const packageName =
      Constants.expoConfig?.android?.package || Constants.expoConfig?.ios?.bundleIdentifier;

    return {
      prefixes: [`${scheme}://`, packageName ? `${packageName}://` : '', PREFIX].filter(Boolean),
      config: {
        screens: {
          Home: 'home',
          AddEvent: 'shareintent',
        },
      },
      getStateFromPath(path, config) {
        if (path && path.includes(`dataUrl=${getShareExtensionKey()}`)) {
          return { routes: [{ name: 'Home' }] };
        }
        return getStateFromPath(path, config);
      },
      subscribe(listener) {
        const onReceiveURL = ({ url }) => {
          if (url && url.includes(getShareExtensionKey())) {
            listener(`${scheme}://home`);
          } else {
            listener(url);
          }
        };
        const stateSub = ShareIntentModule?.addListener?.('onStateChange', (event) => {
          if (event?.value === 'pending') {
            listener(`${scheme}://home`);
          }
        });
        const valueSub = ShareIntentModule?.addListener?.('onChange', async () => {
          const url = await LinkingExpo.getLinkingURL?.();
          if (url) onReceiveURL({ url });
        });
        const urlSub = LinkingExpo.addEventListener('url', onReceiveURL);
        return () => {
          stateSub?.remove?.();
          valueSub?.remove?.();
          urlSub?.remove?.();
        };
      },
      async getInitialURL() {
        try {
          if (ShareIntentModule?.hasShareIntent?.(getShareExtensionKey())) {
            return `${scheme}://home`;
          }
        } catch (_) {}
        return LinkingExpo.getLinkingURL?.() || null;
      },
    };
  } catch (_) {
    return undefined;
  }
}

function isImageShareFile(file) {
  if (!file) return false;
  const mime = String(file.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const name = String(file.fileName || file.path || '');
  return /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(name);
}

function stripExtension(name) {
  return String(name || '').replace(/\.[a-zA-Z0-9]+$/, '').trim();
}

/**
 * Parse a share-sheet payload: images (Camera / Gallery / Google Photos / Files)
 * become an Add Event with imageUri; text/email stays on the existing path.
 */
export async function parseSharedContent(shareIntent) {
  const files = Array.isArray(shareIntent && shareIntent.files) ? shareIntent.files : [];
  const imageFile =
    files.find(isImageShareFile) ||
    ((shareIntent && shareIntent.type === 'media') ? files[0] : null) ||
    null;

  if (imageFile && imageFile.path) {
    const { persistPickedImage } = require('./imagePicker');
    let persisted = null;
    try {
      persisted = await persistPickedImage(imageFile.path, imageFile.fileName);
    } catch (e) {
      console.warn('Could not persist shared image', e);
    }
    const filename = (persisted && persisted.filename) || imageFile.fileName || 'photo';
    const titleFromMeta = shareIntent && shareIntent.meta && shareIntent.meta.title;
    const title = String(titleFromMeta || stripExtension(filename) || 'Shared photo').slice(0, 200);
    const extraText = String((shareIntent && (shareIntent.text || shareIntent.webUrl)) || '').trim();
    return {
      title,
      description: extraText,
      date: todayISO(),
      source: 'share',
      fromEmail: false,
      imageUri: (persisted && persisted.uri) || imageFile.path,
      photoNote: extraText ? undefined : filename,
    };
  }

  return parseSharedEmail(shareIntent);
}
