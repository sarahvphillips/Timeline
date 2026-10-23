import AsyncStorage from '@react-native-async-storage/async-storage';
import { getEvents } from './eventService';
import { eventKindLabel } from './eventLinkService';
import { getPeople } from './peopleService';
import { loadTodos } from './todoService';
import { loadSocial } from './socialService';
import { loadGames } from './gamesService';
import { loadYoutube } from './youtubeService';
import { loadSpotify } from './spotifyService';
import { loadWatched } from './watchedService';
import { getWordNumbers, getNumberSearchList } from './wordToIntService';
import { getSpans } from './dateSpanService';
import { formatFullDate, DATE_FORMAT_DMY, calendarParts } from './dateFormat';

const RESULT_CAP = 100;
const WHEEL_STORE = '@timeline_date_circle_v2';
const PAIR_STORE = '@timeline_date_circle_pairs_v1';

const SKIP_KEYS = new Set([
  'id',
  'ownerUid',
  'imageUri',
  'coverImageUri',
  'videoUri',
  'audioUri',
  'reminderId',
  'shareId',
  'photoSkip',
  'linkedEventIds',
  'deleted',
  'imageRotation',
  'coverImageRotation',
  'createdByUid',
  'inviteCode',
  'thumbnail',
  'date',
  'remindAt',
  'createdAt',
  'updatedAt',
  'addedAt',
  'doneAt',
  'birthday',
  'fromDate',
  'toDate',
  'focus',
]);

const KIND_NAMES = {
  word_to_int: 'Word to int',
  date_span: 'Days between',
  laundry: 'Wash',
  date_circle: 'Date circle',
  people: 'People',
  qr: 'QR',
  location: 'Place',
  bank: 'Bank',
  hobby: 'Hobby',
  manual: 'Event',
  email: 'Email',
  bot: 'Bot',
  photo: 'Photo',
  purchase: 'Purchase',
};

const SAMPLE_WHEEL = {
  ps: '1940-07-13',
  sp: '1986-11-14',
  dh: '1972-05-08',
  em: '1972-06-28',
  dt: '1989-06-05',
};

function dateBits(value) {
  const p = calendarParts(value);
  if (!p) return [];
  const dd = String(p.d).padStart(2, '0');
  const mm = String(p.m).padStart(2, '0');
  const y = String(p.y);
  return [`${dd}/${mm}/${y}`, `${mm}/${dd}/${y}`, `${y}-${mm}-${dd}`, `${dd}/${mm}`, `${mm}/${dd}`];
}

function pushText(parts, value, depth) {
  if (value == null || depth > 5) return;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return;
    if (/^(data:|file:|content:|blob:|ph:|assets-library:)/i.test(text)) return;
    if (/^https?:\/\//i.test(text)) {
      const rest = text.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
      if (rest) parts.push(rest.length > 300 ? rest.slice(0, 300) : rest);
      return;
    }
    parts.push(text.length > 8000 ? text.slice(0, 8000) : text);
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    parts.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => pushText(parts, item, depth + 1));
    return;
  }
  if (typeof value === 'object') {
    Object.keys(value).forEach((key) => {
      if (SKIP_KEYS.has(key)) return;
      pushText(parts, value[key], depth + 1);
    });
  }
}

function clockBit(value) {
  const text = String(value || '');
  if (!/T\d{2}:\d{2}/.test(text)) return '';
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
}

function dateBlob(dates) {
  const parts = [];
  (dates || []).forEach((value) => {
    dateBits(value).forEach((bit) => parts.push(bit));
    const clock = clockBit(value);
    if (clock) parts.push(clock);
  });
  return parts.join(' ');
}

function whenLabel(value, dateFormat) {
  const day = formatFullDate(value, dateFormat) || '';
  const clock = clockBit(value);
  if (day && clock) return `${day} ${clock}`;
  return day || clock || '';
}

function recordText(row) {
  const parts = [];
  pushText(parts, row, 0);
  return parts.join('\n');
}

function kindForEvent(event) {
  const raw = String(eventKindLabel(event) || 'Event');
  if (KIND_NAMES[raw]) return KIND_NAMES[raw];
  if (raw.includes('_')) {
    return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function isSampleWheel(person) {
  if (!person || person.id == null) return false;
  return SAMPLE_WHEEL[String(person.id)] && SAMPLE_WHEEL[String(person.id)] === String(person.date || '').slice(0, 10);
}

async function safe(work, fallback) {
  try {
    const value = await work();
    return value == null ? fallback : value;
  } catch (e) {
    console.warn('Search source skipped', e?.message || e);
    return fallback;
  }
}

function parseJsonList(raw, key) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (key) return Array.isArray(parsed?.[key]) ? parsed[key] : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadSearchCorpus() {
  const [
    events,
    people,
    todos,
    social,
    games,
    youtube,
    spotify,
    watched,
    words,
    spans,
    searches,
    wheelRaw,
    pairsRaw,
  ] = await Promise.all([
    safe(() => getEvents(), []),
    safe(() => getPeople(), []),
    safe(() => loadTodos(), []),
    safe(() => loadSocial(), []),
    safe(() => loadGames(), []),
    safe(() => loadYoutube(), []),
    safe(() => loadSpotify(), []),
    safe(() => loadWatched(), []),
    safe(() => getWordNumbers(), []),
    safe(() => getSpans(), []),
    safe(() => getNumberSearchList(), []),
    safe(() => AsyncStorage.getItem(WHEEL_STORE), null),
    safe(() => AsyncStorage.getItem(PAIR_STORE), null),
  ]);
  return {
    events: Array.isArray(events) ? events : [],
    people: Array.isArray(people) ? people : [],
    todos: Array.isArray(todos) ? todos : [],
    social: Array.isArray(social) ? social : [],
    games: Array.isArray(games) ? games : [],
    youtube: Array.isArray(youtube) ? youtube : [],
    spotify: Array.isArray(spotify) ? spotify : [],
    watched: Array.isArray(watched) ? watched : [],
    words: Array.isArray(words) ? words : [],
    spans: Array.isArray(spans) ? spans : [],
    searches: Array.isArray(searches) ? searches : [],
    wheel: parseJsonList(wheelRaw, 'people'),
    pairs: parseJsonList(pairsRaw),
  };
}

function buildRecords(corpus, dateFormat) {
  const events = corpus?.events || [];
  const eventIds = new Set(events.map((event) => (event?.id != null ? String(event.id) : '')).filter(Boolean));
  const wordOnTimeline = new Set(
    events.map((event) => (event?.wordNumberId != null ? String(event.wordNumberId) : '')).filter(Boolean)
  );
  const spanTitles = new Set(
    events
      .filter((event) => event?.source === 'date_span')
      .map((event) => String(event.title || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const records = [];

  events.forEach((event) => {
    if (!event || event.deleted) return;
    const { title, ...rest } = event;
    const name = String(title || '').trim() || 'Untitled';
    records.push({
      key: `event:${event.id || name}`,
      kind: kindForEvent(event),
      title: name,
      text: recordText(rest),
      dates: dateBlob([event.date, event.remindAt]),
      when: whenLabel(event.date, dateFormat),
      date: event.date || event.updatedAt || '',
      open: event.id ? { screen: 'EventView', params: { eventId: String(event.id) } } : null,
    });
  });

  (corpus.people || []).forEach((person) => {
    if (!person) return;
    const name = String(person.name || '').trim();
    if (!name) return;
    records.push({
      key: `person:${person.id || name}`,
      kind: 'Person',
      title: name,
      text: recordText(person),
      dates: dateBlob([person.birthday]),
      when: whenLabel(person.birthday, dateFormat),
      date: person.updatedAt || person.createdAt || person.birthday || '',
      open: { screen: 'People', params: { personId: person.id ? String(person.id) : '' } },
    });
  });

  (corpus.todos || []).forEach((todo) => {
    if (!todo || !String(todo.title || '').trim()) return;
    if (todo.eventId && eventIds.has(String(todo.eventId))) return;
    records.push({
      key: `todo:${todo.id}`,
      kind: todo.doneAt ? 'To do · done' : 'To do',
      title: String(todo.title).trim(),
      text: recordText(todo),
      dates: dateBlob([todo.date]),
      when: whenLabel(todo.date, dateFormat),
      date: todo.date || todo.createdAt || '',
      open: todo.eventId
        ? { screen: 'EventView', params: { eventId: String(todo.eventId) } }
        : { screen: 'TodoList', params: {} },
    });
  });

  const lists = [
    ['social', corpus.social, 'Social', 'Social'],
    ['game', corpus.games, 'Game', 'Games'],
    ['youtube', corpus.youtube, 'YouTube', 'YouTube'],
    ['spotify', corpus.spotify, 'Spotify', 'Spotify'],
    ['watched', corpus.watched, 'Watched', 'AddWatched'],
  ];
  lists.forEach(([prefix, rows, kind, screen]) => {
    (rows || []).forEach((row) => {
      if (!row) return;
      if (row.id != null && eventIds.has(String(row.id))) return;
      const name = String(row.title || row.name || row.url || '').trim();
      if (!name) return;
      records.push({
        key: `${prefix}:${row.id || name}`,
        kind,
        title: name,
        text: recordText(row),
        dates: dateBlob([row.date]),
        when: whenLabel(row.date, dateFormat),
        date: row.date || row.createdAt || '',
        open: { screen, params: {} },
      });
    });
  });

  (corpus.words || []).forEach((word) => {
    if (!word || !String(word.phrase || '').trim()) return;
    if (word.id != null && wordOnTimeline.has(String(word.id))) return;
    records.push({
      key: `word:${word.id || word.phrase}`,
      kind: 'Word to int',
      title: String(word.phrase).trim(),
      text: recordText(word),
      dates: '',
      when: '',
      date: word.createdAt || '',
      open: {
        screen: 'WordToInt',
        params: {
          phrase: String(word.phrase).trim(),
          notes: word.notes || '',
          preferred: word.preferred || '',
          t: String(word.id || word.phrase),
        },
      },
    });
  });

  (corpus.spans || []).forEach((span) => {
    if (!span) return;
    const name = String(span.title || '').trim() || [span.fromDate, span.toDate].filter(Boolean).join(' to ');
    if (!name) return;
    if (spanTitles.has(name.toLowerCase())) return;
    records.push({
      key: `span:${span.id || name}`,
      kind: 'Days between',
      title: name,
      text: recordText(span),
      dates: dateBlob([span.fromDate, span.toDate]),
      when: whenLabel(span.toDate || span.fromDate, dateFormat),
      date: span.updatedAt || span.createdAt || span.toDate || '',
      open: { screen: 'DateSpan', params: {} },
    });
  });

  (corpus.searches || []).forEach((row) => {
    if (!row) return;
    const name = String(row.phrase || row.number || '').trim();
    if (!name) return;
    records.push({
      key: `looking:${row.id || name}`,
      kind: 'Looking for',
      title: name,
      text: recordText(row),
      dates: '',
      when: '',
      date: row.addedAt || '',
      open: row.phrase
        ? { screen: 'WordToInt', params: { phrase: String(row.phrase).trim(), t: String(row.id || row.phrase) } }
        : { screen: 'WordToInt', params: {} },
    });
  });

  (corpus.wheel || []).forEach((person) => {
    if (!person || isSampleWheel(person)) return;
    const name = String(person.initials || person.name || '').trim();
    if (!name) return;
    records.push({
      key: `wheel:${person.id || name}`,
      kind: 'Date circle',
      title: name,
      text: recordText(person),
      dates: dateBlob([person.date]),
      when: whenLabel(person.date, dateFormat),
      date: person.date || '',
      open: { screen: 'DateCircle', params: {} },
    });
  });

  (corpus.pairs || []).forEach((pair) => {
    if (!pair) return;
    const name = [pair.aInitials, pair.bInitials].filter(Boolean).join(' · ');
    if (!name) return;
    records.push({
      key: `gap:${pair.id || name}`,
      kind: 'Birthday gap',
      title: name,
      text: recordText(pair),
      dates: dateBlob([pair.aDate, pair.bDate, pair.focus]),
      when: whenLabel(pair.focus || pair.aDate, dateFormat),
      date: pair.focus || pair.aDate || '',
      open: { screen: 'DateCircle', params: {} },
    });
  });

  return records.map((rec) => ({
    ...rec,
    dates: rec.dates || '',
    kindText: rec.kind && rec.kind !== 'Event' ? rec.kind : '',
  }));
}

function snippetAround(text, parts) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const lower = flat.toLowerCase();
  let at = -1;
  parts.forEach((part) => {
    const found = lower.indexOf(part);
    if (found >= 0 && (at < 0 || found < at)) at = found;
  });
  if (at < 0) return flat.slice(0, 140);
  const start = Math.max(0, at - 36);
  const end = Math.min(flat.length, at + 90);
  let slice = flat.slice(start, end).trim();
  if (start > 0) slice = `…${slice}`;
  if (end < flat.length) slice = `${slice}…`;
  return slice;
}

function rankTitle(title, parts, phrase) {
  const name = String(title || '').toLowerCase();
  if (phrase && name === phrase) return 0;
  if (phrase && name.startsWith(phrase)) return 1;
  if (parts.every((part) => name.includes(part))) return 2;
  return 3;
}

export function prepareSearch(corpus, dateFormat = DATE_FORMAT_DMY) {
  return buildRecords(corpus, dateFormat);
}

export function searchPrepared(records, rawQuery) {
  const query = String(rawQuery || '').replace(/\s+/g, ' ').trim();
  const parts = query.toLowerCase().split(' ').filter(Boolean);
  if (query.length < 2 || !parts.length) return { hits: [], total: 0, tooShort: query.length === 1 };
  const hits = [];
  (records || []).forEach((rec) => {
    const titleLow = rec.title.toLowerCase();
    const textLow = rec.text.toLowerCase();
    const datesLow = String(rec.dates || '').toLowerCase();
    const kindLow = String(rec.kindText || '').toLowerCase();
    const hay = `${titleLow}\n${textLow}\n${datesLow}\n${kindLow}`;
    if (!parts.every((part) => hay.includes(part))) return;
    const bodyAdds = parts.some((part) => textLow.includes(part) && !titleLow.includes(part));
    let snippet = bodyAdds ? snippetAround(rec.text, parts) : '';
    const bare = snippet.replace(/^…/, '').replace(/…$/, '').trim().toLowerCase();
    if (!snippet || bare === titleLow || bare === String(rec.kind || '').toLowerCase()) snippet = '';
    hits.push({
      key: rec.key,
      kind: rec.kind,
      title: rec.title,
      snippet: snippet && snippet.toLowerCase() !== titleLow ? snippet : '',
      when: rec.when || '',
      open: rec.open,
      rank: rankTitle(rec.title, parts, query.toLowerCase()),
      date: rec.date || '',
    });
  });
  hits.sort((a, b) => a.rank - b.rank || String(b.date).localeCompare(String(a.date)) || a.title.localeCompare(b.title));
  return { hits: hits.slice(0, RESULT_CAP), total: hits.length, tooShort: false };
}
