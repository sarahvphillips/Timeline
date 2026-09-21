export const PLACE_PRESETS = [
  { name: 'Home', address: 'Saved place' },
  { name: 'Internet', address: 'Not a physical place' },
  { name: 'Local high street', address: 'Town centre' },
  { name: 'Railway station', address: 'Station approach' },
  { name: 'Supermarket', address: 'Retail park' },
];

export function isMapsUrl(raw) {
  const text = String(raw || '');
  return /google\.[^\s/]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(text);
}

export function parseMapsLink(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const looksLikeMaps = isMapsUrl(text) || /^https?:\/\//i.test(text);
  if (!looksLikeMaps) return null;
  try {
    const u = new URL(text);
    const q = u.searchParams.get('q') || u.searchParams.get('query');
    if (q) {
      return {
        name: decodeURIComponent(String(q).replace(/\+/g, ' ')).trim(),
        url: text,
        fromGoogle: true,
      };
    }
    const place = u.pathname.match(/\/place\/([^/@]+)/);
    if (place) {
      const name = decodeURIComponent(place[1].replace(/\+/g, ' ')).replace(/@.*$/, '').trim();
      return { name, url: text, fromGoogle: true };
    }
  } catch {
    /* not a URL */
  }
  if (isMapsUrl(text)) return { name: '', url: text, fromGoogle: true };
  return null;
}

export function mapsSearchUrl(name) {
  const q = encodeURIComponent(String(name || '').trim());
  return q ? `https://www.google.com/maps/search/?api=1&query=${q}` : '';
}
