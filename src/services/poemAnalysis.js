import { convertPhrase, findSavedPhrase, preferredNumber } from './wordToIntService';

const STOP = new Set(
  `a an the and or but if to of in on for with from at by as is it its this that these those was were be been being are i me my we our you your he she they them his her their not no nor so yet than then when while who what which whom whose into over after before about across after again against all also am among because been both can could did do does doing down during each few further had has have having here how into just more most other out own same should some such too under until up very was were what when where whether which while who why will would`.split(
    /\s+/
  )
);

export const POEM_INSIGHTS_COST = 4;
export const POEM_INSIGHTS_PERK = 'poemInsights';

export function isPoemEvent(event) {
  if (!event) return false;
  if (String(event.hobbyType || '').toLowerCase() === 'poetry') return true;
  if (event.source === 'hobby' && String(event.hobbyType || '').toLowerCase() === 'poetry') return true;
  const labels = Array.isArray(event.labels) ? event.labels.map((l) => String(l).toLowerCase()) : [];
  return labels.includes('poem') || labels.includes('poetry');
}

export function poemBody(event) {
  return String(event?.description || event?.poemText || event?.body || '').replace(/\r\n/g, '\n');
}

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
}

function linesOf(text) {
  return String(text || '')
    .split(/\n/)
    .map((line) => line.replace(/\s+$/g, ''))
    .filter((line) => line.trim().length);
}

export function analysePoem(event) {
  const title = String(event?.title || '').trim() || 'Untitled';
  const body = poemBody(event);
  const lines = linesOf(body);
  const words = body.trim() ? body.trim().split(/\s+/).filter(Boolean) : [];
  const chars = body.replace(/\s/g, '').length;
  const tokens = tokenize(`${title}\n${body}`);
  const titleNums = convertPhrase(title);
  const day = String(event?.date || '').slice(0, 10);
  return {
    id: event.id,
    event,
    title,
    body,
    date: day,
    year: day.slice(0, 4),
    month: day.slice(0, 7),
    collection: String(event?.collectionName || '').trim(),
    labels: Array.isArray(event.labels) ? event.labels.filter(Boolean) : [],
    lineCount: lines.length,
    wordCount: words.length,
    charCount: chars,
    avgLineWords: lines.length
      ? Math.round(
          (lines.reduce((sum, line) => sum + line.trim().split(/\s+/).filter(Boolean).length, 0) / lines.length) * 10
        ) / 10
      : 0,
    longestLine: lines.reduce((best, line) => (line.length > best.length ? line : best), ''),
    tokens,
    uniqueWords: new Set(tokens).size,
    titleOrdinal: titleNums.ordinal,
    titlePyth: titleNums.pythagorean,
    titleReverse: titleNums.reverse,
    titleReduced: titleNums.reducedOrdinal?.value,
    titleHash: titleNums.hashCode,
  };
}

function countMap(list) {
  const map = new Map();
  list.forEach((item) => {
    if (!item) return;
    map.set(item, (map.get(item) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

export function analysePoems(events, wordList = []) {
  const poems = (events || []).filter(isPoemEvent).map(analysePoem);
  poems.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const words = [];
  poems.forEach((poem) => words.push(...poem.tokens));
  const wordFreq = countMap(words);
  const titleFreq = countMap(poems.flatMap((poem) => tokenize(poem.title)));
  const collections = countMap(poems.map((poem) => poem.collection).filter(Boolean));
  const labels = countMap(poems.flatMap((poem) => poem.labels.map(String)));
  const months = countMap(poems.map((poem) => poem.month).filter(Boolean));
  const byOrdinal = {};
  poems.forEach((poem) => {
    const n = poem.titleOrdinal;
    if (!n) return;
    if (!byOrdinal[n]) byOrdinal[n] = [];
    byOrdinal[n].push(poem);
  });
  const sharedOrdinals = Object.keys(byOrdinal)
    .map((n) => ({ number: Number(n), poems: byOrdinal[n] }))
    .filter((row) => row.poems.length > 1)
    .sort((a, b) => b.poems.length - a.poems.length || a.number - b.number);
  const withSaved = poems.map((poem) => {
    const hit = findSavedPhrase(wordList, poem.title);
    return hit
      ? { ...poem, savedWord: hit.phrase, savedNumber: preferredNumber(hit) }
      : poem;
  });
  const totals = {
    poems: poems.length,
    words: poems.reduce((sum, p) => sum + p.wordCount, 0),
    chars: poems.reduce((sum, p) => sum + p.charCount, 0),
    lines: poems.reduce((sum, p) => sum + p.lineCount, 0),
    uniqueWords: new Set(words).size,
  };
  totals.avgWords = poems.length ? Math.round(totals.words / poems.length) : 0;
  totals.avgLines = poems.length ? Math.round((totals.lines / poems.length) * 10) / 10 : 0;
  const longest = [...poems].sort((a, b) => b.wordCount - a.wordCount)[0] || null;
  const shortest = [...poems].filter((p) => p.wordCount).sort((a, b) => a.wordCount - b.wordCount)[0] || null;
  const first = [...poems].sort((a, b) => String(a.date).localeCompare(String(b.date)))[0] || null;
  const last = poems[0] || null;
  return {
    poems: withSaved,
    wordFreq,
    titleFreq,
    collections,
    labels,
    months,
    sharedOrdinals,
    totals,
    longest,
    shortest,
    first,
    last,
  };
}

export function wordCountBucket(n) {
  const count = Number(n) || 0;
  if (count <= 20) return '1–20 words';
  if (count <= 50) return '21–50 words';
  if (count <= 100) return '51–100 words';
  return '100+ words';
}

export function lineCountBucket(n) {
  const count = Number(n) || 0;
  if (count <= 4) return '1–4 lines';
  if (count <= 8) return '5–8 lines';
  if (count <= 16) return '9–16 lines';
  return '17+ lines';
}

function tagSafe(value) {
  return String(value || '')
    .replace(/^#/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function poemsToGraphEntries(events) {
  const analysed = (events || []).filter(isPoemEvent).map(analysePoem);
  const freq = new Map();
  analysed.forEach((poem) => {
    poem.tokens.forEach((word) => freq.set(word, (freq.get(word) || 0) + 1));
  });
  const echoed = [...freq.entries()]
    .filter((row) => row[1] >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 40);
  const echoSet = new Set(echoed.map((row) => row[0]));

  const entries = analysed.map((poem) => {
    const tags = [];
    const collectionTag = tagSafe(poem.collection);
    if (collectionTag) tags.push(collectionTag);
    poem.labels.forEach((label) => {
      const t = tagSafe(label);
      if (t) tags.push(t);
    });
    if (poem.year) tags.push(`y${poem.year}`);
    if (poem.month) tags.push(`m${poem.month.replace('-', '_')}`);
    poem.tokens.forEach((word) => {
      if (echoSet.has(word)) tags.push(`echo_${word}`);
    });
    const excerpt = String(poem.body || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(' / ');
    return {
      id: `poem:${poem.id}`,
      phrase: poem.title,
      ordinal: poem.titleOrdinal,
      pythagorean: poem.titlePyth,
      reverse: poem.titleReverse,
      reduced: poem.titleReduced,
      notes: tags.map((t) => `#${t}`).join(' '),
      poemId: poem.id,
      event: poem.event,
      kind: 'poem',
      month: poem.month,
      year: poem.year,
      date: poem.date,
      collection: poem.collection,
      lineCount: poem.lineCount,
      wordCount: poem.wordCount,
      lineBucket: lineCountBucket(poem.lineCount),
      wordBucket: wordCountBucket(poem.wordCount),
      excerpt,
      tokens: poem.tokens,
      echoWords: poem.tokens.filter((word) => echoSet.has(word)),
    };
  });

  echoed.forEach(([word, count]) => {
    const nums = convertPhrase(word);
    const used = analysed.filter((poem) => poem.tokens.includes(word));
    entries.push({
      id: `word:${word}`,
      phrase: word,
      ordinal: nums.ordinal,
      pythagorean: nums.pythagorean,
      reverse: nums.reverse,
      reduced: nums.reducedOrdinal?.value,
      notes: '#echo #word',
      count,
      kind: 'word',
      echoWord: word,
      usedIn: used.map((poem) => poem.title),
      usedIds: used.map((poem) => poem.id),
    });
  });
  return entries;
}

export function poemPatternGraph(report, { maxWords = 18 } = {}) {
  const nodes = [];
  const edges = [];
  if (!report?.poems?.length) return { nodes, edges };
  const words = report.wordFreq.slice(0, maxWords);
  words.forEach(([word, count]) => {
    nodes.push({
      id: `w:${word}`,
      kind: 'word',
      label: word,
      count,
    });
  });
  const wordSet = new Set(words.map((row) => row[0]));
  const poems = report.poems.slice(0, 24);
  poems.forEach((poem) => {
    nodes.push({
      id: `p:${poem.id}`,
      kind: 'poem',
      label: poem.title,
      count: poem.wordCount,
      poem,
    });
    const used = new Set();
    poem.tokens.forEach((token) => {
      if (!wordSet.has(token) || used.has(token)) return;
      used.add(token);
      edges.push({ a: `p:${poem.id}`, b: `w:${token}` });
    });
  });
  (report.sharedOrdinals || []).forEach((row) => {
    const ids = row.poems.map((p) => `p:${p.id}`).filter((id) => poems.some((p) => `p:${p.id}` === id));
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        edges.push({ a: ids[i], b: ids[j], kind: 'number' });
      }
    }
  });
  return { nodes, edges };
}
