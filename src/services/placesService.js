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

export function mapsCoordUrl(lat, lng) {
  if (lat == null || lng == null) return '';
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function formatAddress(geo) {
  if (!geo) return '';
  const parts = [geo.streetNumber, geo.street, geo.district, geo.city, geo.postalCode, geo.country];
  return parts.filter(Boolean).join(', ');
}

function formatName(geo) {
  if (!geo) return '';
  return geo.name || geo.street || geo.district || geo.city || 'Current location';
}

async function reverseNative(Location, latitude, longitude) {
  try {
    const list = await Location.reverseGeocodeAsync({ latitude, longitude });
    return list?.[0] || null;
  } catch {
    return null;
  }
}

function fromBrowserGeolocation() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('GPS is not available here.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => {
        const e = new Error(err?.message || 'Could not read GPS.');
        e.code = err?.code === 1 ? 'denied' : 'gps';
        reject(e);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 },
    );
  });
}

export async function getCurrentPlace() {
  let latitude;
  let longitude;
  let geo = null;
  try {
    // eslint-disable-next-line global-require
    const Location = require('expo-location');
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      const err = new Error('Location permission was not granted.');
      err.code = 'denied';
      throw err;
    }
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy?.Balanced || 3,
    });
    latitude = pos.coords.latitude;
    longitude = pos.coords.longitude;
    geo = await reverseNative(Location, latitude, longitude);
  } catch (e) {
    if (e?.code === 'denied') throw e;
    const pos = await fromBrowserGeolocation();
    latitude = pos.latitude;
    longitude = pos.longitude;
  }

  const name = formatName(geo) || 'Current location';
  const address = formatAddress(geo) || `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`;
  return {
    name,
    address,
    latitude,
    longitude,
    url: mapsCoordUrl(latitude, longitude),
    fromGps: true,
  };
}
