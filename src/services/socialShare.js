import { Platform, Share, Linking } from 'react-native';
import { copyTextToClipboard } from './shareService';

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

export async function openXCompose(message) {
  const text = encodeURIComponent(String(message || '').trim());
  const app = `twitter://post?message=${text}`;
  const web = `https://x.com/intent/tweet?text=${text}`;
  try {
    const can = await Linking.canOpenURL('twitter://post');
    if (can) {
      await Linking.openURL(app);
      return;
    }
  } catch (_) {}
  await Linking.openURL(web);
}

export async function openEmailCompose(title, message) {
  const subject = encodeURIComponent(String(title || 'Timeline'));
  const body = encodeURIComponent(String(message || ''));
  await Linking.openURL(`mailto:?subject=${subject}&body=${body}`);
}
