import { parseInviteCodeFromScan } from '../utils/inviteCode';

function unfold(text) {
  return String(text || '').replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

function icalField(block, key) {
  const match = unfold(block).match(new RegExp(`^${key}(?:;[^:\\n]*)?:(.*)$`, 'im'));
  if (!match) return '';
  return match[1].replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').trim();
}

function isoFromCompact(value) {
  const match = String(value || '').match(/(\d{4})(\d{2})(\d{2})/);
  if (!match) return '';
  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '' : iso;
}

function isoFromLoose(value) {
  const text = String(value || '');
  const compact = isoFromCompact(text);
  if (compact && /^\d{8}/.test(text.replace(/\D/g, '').slice(0, 8)) && !text.includes('-')) return compact;
  const dashed = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!dashed) return compact;
  const iso = `${dashed[1]}-${dashed[2]}-${dashed[3]}`;
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '' : iso;
}

function decodeBasic(value) {
  return String(value || '')
    .replace(/&/g, '&')
    .replace(/"/g, '"')
    .replace(/&#39;|'/g, "'")
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleFromUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const last = decodeURIComponent(parts[parts.length - 1] || '');
    const words = last
      .replace(/\.[a-z0-9]{2,4}$/i, '')
      .replace(/[-_+]+/g, ' ')
      .replace(/\b\d{5,}\b/g, '')
      .trim();
    if (words.length >= 3) {
      return words.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
    }
    return parsed.hostname.replace(/^www\./, '');
  } catch (_) {
    return 'Poster event';
  }
}

function firstUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return '';
  return match[0].replace(/[),.;]+$/, '');
}

function looksLikeTimelineInvite(raw) {
  const text = String(raw || '').trim();
  if (/timelineapp:\/\/(?:\/)?(?:share|join)\//i.test(text)) return true;
  if (/https?:\/\/[^\s]+\/(?:share|join)\/[A-Za-z0-9]+/i.test(text)) return true;
  if (!/^https?:/i.test(text) && /^[A-Za-z0-9]{4,12}$/.test(text)) return true;
  return false;
}

function metaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
    'i',
  );
  const match = String(html || '').match(pattern);
  return decodeBasic(match?.[1] || match?.[2] || '');
}

export function parsePosterQr(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  if (looksLikeTimelineInvite(text)) {
    const code = parseInviteCodeFromScan(text);
    if (code && !String(code).startsWith('profile:')) {
      return { kind: 'invite', code };
    }
  }
  if (/timelineapp:\/\/(?:\/)?profile\//i.test(text)) {
    return { kind: 'profile' };
  }

  if (/BEGIN:VEVENT/i.test(text)) {
    const url = icalField(text, 'URL') || firstUrl(text);
    const start = isoFromLoose(icalField(text, 'DTSTART'));
    const title = icalField(text, 'SUMMARY') || titleFromUrl(url) || 'Poster event';
    const location = icalField(text, 'LOCATION');
    const detail = icalField(text, 'DESCRIPTION');
    const lines = [detail, url].filter(Boolean);
    return {
      kind: 'event',
      title: title.slice(0, 140),
      date: start,
      location: location.slice(0, 140),
      url,
      description: lines.join('\n\n').slice(0, 2000),
    };
  }

  const url = firstUrl(text);
  if (url) {
    const extra = text.replace(url, '').trim();
    return {
      kind: 'event',
      title: (extra && extra.length < 80 ? extra : titleFromUrl(url)).slice(0, 140),
      date: isoFromLoose(url) || isoFromLoose(text),
      location: '',
      url,
      description: url,
    };
  }

  return {
    kind: 'event',
    title: text.slice(0, 80),
    date: isoFromLoose(text),
    location: '',
    url: '',
    description: text.slice(0, 2000),
  };
}

export async function enrichPosterDraft(draft) {
  if (!draft || draft.kind !== 'event' || !draft.url) return draft;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), 6000);
  try {
    const response = await fetch(draft.url, controller ? { signal: controller.signal } : undefined);
    if (!response.ok) return draft;
    const html = await response.text();
    const pageTitle = metaContent(html, 'og:title') || decodeBasic((html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]);
    const pageAbout = metaContent(html, 'og:description') || metaContent(html, 'description');
    const start = isoFromLoose(
      (html.match(/"startDate"\s*:\s*"([^"]+)"/i) || [])[1] ||
        metaContent(html, 'article:published_time') ||
        '',
    );
    const place = decodeBasic((html.match(/"(?:addressLocality|name)"\s*:\s*"([^"]+)"/i) || [])[1] || '');
    return {
      ...draft,
      title: pageTitle ? pageTitle.slice(0, 140) : draft.title,
      date: start || draft.date,
      location: draft.location || (place && place.length < 80 ? place : ''),
      description: [pageAbout, draft.url].filter(Boolean).join('\n\n').slice(0, 2000),
    };
  } catch (_) {
    return draft;
  } finally {
    clearTimeout(timer);
  }
}
