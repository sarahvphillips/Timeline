/**
 * Word to Int batch limits. A sheet is refused from its length alone,
 * before any word document is read.
 */

const WORD_BULK_CAP = 100;
const WORD_DAILY_READS = 20000;
const WORD_DAILY_WRITES = 20000;

function lookupKey(phrase) {
  return String(phrase || '').toLowerCase().replace(/[^a-z]/g, '');
}

function estimateWordOps(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return { reads: n, writes: n };
}

function checkBatchSize(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const ops = estimateWordOps(n);
  if (n > WORD_BULK_CAP) {
    return {
      ok: false,
      status: 400,
      code: 'batch_too_large',
      error: `At most ${WORD_BULK_CAP} words in one request. This one has ${n}, about ${ops.reads} reads and ${ops.writes} writes. Split the sheet into batches of ${WORD_BULK_CAP}. Nothing was read from the word list.`,
      estimatedReads: ops.reads,
      estimatedWrites: ops.writes,
      cap: WORD_BULK_CAP,
    };
  }
  return { ok: true, estimatedReads: ops.reads, estimatedWrites: ops.writes, cap: WORD_BULK_CAP };
}

function checkDailyWordBudget({ usedReads, usedWrites, reads, writes, caps }) {
  const readCap = caps && Number(caps.reads) > 0 ? Number(caps.reads) : WORD_DAILY_READS;
  const writeCap = caps && Number(caps.writes) > 0 ? Number(caps.writes) : WORD_DAILY_WRITES;
  const spentReads = Math.max(0, Number(usedReads) || 0);
  const spentWrites = Math.max(0, Number(usedWrites) || 0);
  const nextReads = spentReads + Math.max(0, Number(reads) || 0);
  const nextWrites = spentWrites + Math.max(0, Number(writes) || 0);
  if (nextReads > readCap || nextWrites > writeCap) {
    return {
      ok: false,
      status: 402,
      code: 'cost_limit',
      error: `This request would pass today's Word to Int budget (${readCap} reads and ${writeCap} writes). Nothing was read from the word list.`,
      usedReads: spentReads,
      usedWrites: spentWrites,
      estimatedReads: Math.max(0, Number(reads) || 0),
      estimatedWrites: Math.max(0, Number(writes) || 0),
      readCap,
      writeCap,
    };
  }
  return { ok: true, usedReads: nextReads, usedWrites: nextWrites, readCap, writeCap };
}

function classifyWords(items, shared) {
  const seen = new Set();
  const notesForAll = String((shared && shared.notes) || '').trim().slice(0, 5000);
  const preferredForAll = shared && shared.preferred != null ? shared.preferred : 'ordinal';
  const pending = [];
  const results = (items || []).map((item) => {
    const text = String(typeof item === 'string' ? item : (item && (item.text ?? item.phrase)) || '').trim();
    if (!text) return { text, status: 'error', error: 'text is required' };
    if (text.length > 500) return { text, status: 'error', error: 'text must be 500 characters or fewer' };
    const key = lookupKey(text);
    if (!key) return { text, status: 'error', error: 'text has no letters A-Z' };
    if (seen.has(key)) return { text, status: 'existing', key, duplicateInRequest: true };
    seen.add(key);
    const ownNotes = item && typeof item === 'object' ? item.notes : undefined;
    const notes = String(ownNotes == null || String(ownNotes).trim() === '' ? notesForAll : ownNotes).trim().slice(0, 5000);
    const preferred = item && typeof item === 'object' && item.preferred != null && item.preferred !== ''
      ? item.preferred
      : preferredForAll;
    const row = { text, status: 'pending', key, notes, preferred };
    pending.push(row);
    return row;
  });
  return { pending, results };
}

module.exports = {
  WORD_BULK_CAP,
  WORD_DAILY_READS,
  WORD_DAILY_WRITES,
  lookupKey,
  estimateWordOps,
  checkBatchSize,
  checkDailyWordBudget,
  classifyWords,
};
