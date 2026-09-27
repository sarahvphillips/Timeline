import { Platform, Share, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { copyTextToClipboard } from './shareService';

export const SHARE_FOOTER = 'Shared with Timeline';

export function defaultShareCaption(event) {
  if (!event) return '';
  if (event.shareCaption) return String(event.shareCaption);
  const title = String(event.title || 'Untitled').trim();
  const body = String(event.description || '').trim();
  const lines = body
    ? body
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 8)
        .join('\n')
    : '';
  const tags = Array.isArray(event.labels)
    ? event.labels
        .map((l) => String(l || '').trim())
        .filter(Boolean)
        .slice(0, 4)
        .map((l) => (l.startsWith('#') ? l : `#${l.replace(/\s+/g, '')}`))
        .join(' ')
    : '';
  return [title, lines, tags].filter(Boolean).join('\n\n');
}

export function withShareFooter(text) {
  const raw = String(text || '').trim();
  if (/shared with timeline|posted with timeline/i.test(raw)) return raw;
  return raw ? `${raw}\n\n${SHARE_FOOTER}` : SHARE_FOOTER;
}

export function eventShareImage(event) {
  return event?.coverImageUri || event?.imageUri || '';
}

export async function shareTextAndImage({ title, message, imageUri }) {
  const text = String(message || '').trim();
  if (imageUri) {
    try {
      const Sharing = require('expo-sharing');
      if (Sharing && (await Sharing.isAvailableAsync())) {
        if (text) await copyTextToClipboard(text);
        await Sharing.shareAsync(imageUri, {
          dialogTitle: title || 'Share',
          mimeType: 'image/jpeg',
          UTI: 'public.image',
        });
        return 'sheet';
      }
    } catch (e) {
      if (e?.message && /share.*cancel/i.test(e.message)) return 'cancelled';
    }
  }
  try {
    await Share.share(
      Platform.OS === 'ios'
        ? { message: text }
        : { message: text, title: title || 'Share' },
    );
    return 'sheet';
  } catch (e) {
    if (e?.message && /share.*cancel/i.test(e.message)) return 'cancelled';
    throw e;
  }
}

function tweetUrlText(message) {
  const raw = String(message || '').trim();
  if (raw.length <= 900) return raw;
  return `${raw.slice(0, 880)}…`;
}

async function contentUriForShare(imageUri) {
  if (!imageUri) return '';
  if (/^content:\/\//i.test(imageUri)) return imageUri;
  try {
    return await FileSystem.getContentUriAsync(imageUri);
  } catch (_) {
    return imageUri;
  }
}

async function sendToXApp(message, imageUri) {
  if (Platform.OS !== 'android') return false;
  let IntentLauncher;
  try {
    IntentLauncher = require('expo-intent-launcher');
  } catch (_) {
    return false;
  }
  const extra = { 'android.intent.extra.TEXT': String(message || '') };
  const params = {
    extra,
    flags: 1,
    packageName: 'com.twitter.android',
  };
  if (imageUri) {
    params.type = 'image/jpeg';
    extra['android.intent.extra.STREAM'] = await contentUriForShare(imageUri);
  } else {
    params.type = 'text/plain';
  }
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.SEND', params);
    return true;
  } catch (_) {
    return false;
  }
}

export async function openXCompose(message, imageUri) {
  const text = String(message || '').trim();
  if (text) await copyTextToClipboard(text);

  if (await sendToXApp(text, imageUri)) return 'x-app';

  const encoded = encodeURIComponent(tweetUrlText(text));
  const urls = [
    `twitter://post?text=${encoded}`,
    `twitter://post?message=${encoded}`,
    `https://twitter.com/intent/tweet?text=${encoded}`,
    `https://x.com/intent/tweet?text=${encoded}`,
    `https://x.com/compose/post?text=${encoded}`,
  ];
  let lastError = null;
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return imageUri ? 'x-text-only' : 'x-web';
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('Could not open X');
}

export async function openEmailCompose(title, message, imageUri) {
  const subject = String(title || 'Timeline');
  const body = String(message || '');
  if (imageUri && Platform.OS === 'android') {
    try {
      const IntentLauncher = require('expo-intent-launcher');
      const stream = await contentUriForShare(imageUri);
      await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
        type: 'image/jpeg',
        extra: {
          'android.intent.extra.SUBJECT': subject,
          'android.intent.extra.TEXT': body,
          'android.intent.extra.STREAM': stream,
        },
        flags: 1,
      });
      return 'intent';
    } catch (_) {}
  }
  if (imageUri) {
    return shareTextAndImage({ title: subject, message: body, imageUri });
  }
  await Linking.openURL(
    `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  );
  return 'mailto';
}
