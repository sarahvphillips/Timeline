const test = require('node:test');
const assert = require('node:assert/strict');
const { ukDay, nextMidnight } = require('../lib/ukTime');
const { pointsFor, allowanceCap, assessCharge, actionForMethod, DEFAULT_RULES } = require('../lib/allowance');
const { createRateLimiter } = require('../lib/rateLimit');
const { foldEvents, pageEvents, encodeCursor, decodeCursor } = require('../lib/recap');
const { dobToIso, publicProfile } = require('../lib/profile');
const { decideKeyCreate } = require('../lib/keys');
const { applyDelta, tombstone } = require('../lib/delta');
const { lookupKey, checkBatchSize, checkDailyWordBudget, classifyWords, WORD_BULK_CAP } = require('../lib/wordBatch');
const { commitBulk, commitDelete, rebuildEntries, packIndex, listReadCost, matchByNumber } = require('../lib/wordIndex');

test('uk day follows Europe/London, including BST', () => {
  assert.equal(ukDay(new Date('2026-06-15T23:30:00Z')), '2026-06-16');
  assert.equal(ukDay(new Date('2026-01-15T23:30:00Z')), '2026-01-15');
});

test('next midnight is in the future and lands on the next UK day', () => {
  const from = new Date('2026-10-26T21:00:00Z');
  const reset = nextMidnight(from);
  assert.ok(reset.retryAfter > 0);
  assert.ok(reset.retryAfter <= 26 * 3600);
  assert.equal(ukDay(new Date(reset.resetsAt)), '2026-10-27');
});

test('allowance points use the rules weights', () => {
  assert.equal(pointsFor('read', DEFAULT_RULES), 1);
  assert.equal(pointsFor('write', DEFAULT_RULES), 4 * 1 + 3 * 3);
  assert.equal(pointsFor('delete', DEFAULT_RULES), 4 + 6 + 1);
  assert.equal(pointsFor('write', { ...DEFAULT_RULES, actions: { write: { points: 2 } } }), 2);
  assert.equal(actionForMethod('DELETE'), 'delete');
  assert.equal(actionForMethod('GET'), 'read');
  assert.equal(actionForMethod('PATCH'), 'write');
});

test('per-user cap, ad unlocks, and premium', () => {
  assert.equal(allowanceCap(DEFAULT_RULES, {}, { adsUnlocked: 0 }), 500);
  assert.equal(allowanceCap(DEFAULT_RULES, { dailyAllowance: 40 }, {}), 40);
  assert.equal(allowanceCap(DEFAULT_RULES, {}, { adsUnlocked: 2 }), 500 + 400);
  assert.equal(allowanceCap(DEFAULT_RULES, { premium: true }, {}), Infinity);
  const blocked = assessCharge({ points: 500, cost: 1, cap: 500 });
  assert.equal(blocked.ok, false);
  const ok = assessCharge({ points: 10, cost: 13, cap: 500 });
  assert.equal(ok.ok, true);
  assert.equal(ok.used, 23);
});

test('rate limit returns retry-after and stays cheap against the store', async () => {
  let writes = 0;
  let reads = 0;
  const store = {
    async read() { reads += 1; return null; },
    async write() { writes += 1; },
  };
  let clock = 1_000_000;
  const limiter = createRateLimiter({ limit: 60, now: () => clock, store, flushEvery: 15 });
  for (let i = 0; i < 60; i += 1) {
    const hit = await limiter.hit('key-a');
    assert.equal(hit.ok, true);
  }
  const blocked = await limiter.hit('key-a');
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfter >= 1 && blocked.retryAfter <= 60);
  assert.equal(reads, 1);
  assert.ok(writes <= 12, `expected occasional flushes, got ${writes} writes`);
  assert.ok(writes < 60);
  clock += 61_000;
  const again = await limiter.hit('key-a');
  assert.equal(again.ok, true);
  assert.equal(again.count, 1);
});

test('shared store count is visible to a second instance', async () => {
  const docs = new Map();
  const store = {
    async read(key) { return docs.get(key) || null; },
    async write(key, data) { docs.set(key, data); },
  };
  const clock = 5_000_000;
  const a = createRateLimiter({ limit: 60, now: () => clock, store, flushEvery: 15 });
  const b = createRateLimiter({ limit: 60, now: () => clock, store, flushEvery: 15 });
  for (let i = 0; i < 15; i += 1) await a.hit('k');
  const hit = await b.hit('k');
  assert.ok(hit.count > 15);
});

test('year recap pages past a single page and skips tombstones', () => {
  const events = [];
  for (let i = 0; i < 250; i += 1) {
    const day = String((i % 28) + 1).padStart(2, '0');
    const month = String((i % 12) + 1).padStart(2, '0');
    events.push({
      id: `e${String(i).padStart(4, '0')}`,
      title: `Event ${i}`,
      date: `2026-${month}-${day}T12:00:00.000Z`,
      source: i % 10 === 0 ? 'food' : 'manual',
      hobbyType: i % 15 === 0 ? 'poetry' : '',
    });
  }
  events.push({ id: 'gone', title: 'Removed', date: '2026-05-01', deleted: true, source: 'manual' });
  const pages = pageEvents(events, { pageSize: 50 });
  assert.ok(pages.length > 1);
  const flat = pages.flat();
  assert.equal(flat.length, events.length);
  const recap = foldEvents(2026, flat, new Date('2026-10-26T12:00:00Z'));
  assert.equal(recap.title, 'My 2026 so far');
  assert.equal(recap.count, 250);
  assert.equal(recap.highlights.length, 12);
  const monthTotal = recap.byMonth.reduce((sum, m) => sum + m.count, 0);
  assert.equal(monthTotal, 250);
  assert.ok(recap.byKind.poem > 0);
  assert.equal(foldEvents(2024, [], new Date('2026-01-01')).title, 'My 2024');
});

test('cursor round trip', () => {
  const raw = encodeCursor('2026-04-01T00:00:00.000Z', 'abc123');
  assert.deepEqual(decodeCursor(raw), { date: '2026-04-01T00:00:00.000Z', id: 'abc123' });
  assert.equal(decodeCursor('nope'), null);
});

test('profile read model hides everything except the four fields', () => {
  const view = publicProfile({
    displayName: 'Sarah',
    dateOfBirth: '02/11/1990',
    handle: 'Sarah_P',
    email: 'secret@example.com',
    photo: 'nope',
  });
  assert.deepEqual(view, {
    displayName: 'Sarah',
    dateOfBirth: '02/11/1990',
    dateOfBirthIso: '1990-11-02',
    username: 'sarah_p',
  });
  assert.equal(dobToIso('1990-02-31'), null);
  assert.equal(dobToIso(''), null);
});

test('one active grok key', () => {
  assert.equal(decideKeyCreate({ activeCount: 0 }).ok, true);
  const blocked = decideKeyCreate({ activeCount: 1 });
  assert.equal(blocked.status, 409);
  const replaced = decideKeyCreate({ activeCount: 2, replace: true });
  assert.equal(replaced.ok, true);
  assert.equal(replaced.revokeExisting, true);
  assert.equal(decideKeyCreate({ botType: 'other' }).status, 400);
});

test('delta drops tombstones and keeps edits', () => {
  const now = '2026-10-26T12:00:00.000Z';
  const base = { a: { id: 'a', title: 'A' }, b: { id: 'b', title: 'B' } };
  const next = applyDelta(base, [
    { id: 'b', title: 'B2' },
    tombstone({ id: 'a', title: 'A', ownerUid: 'u' }, now),
    { id: 'c', title: 'C' },
  ]);
  assert.equal(next.a, undefined);
  assert.equal(next.b.title, 'B2');
  assert.equal(next.c.title, 'C');
});

test('a 2080 word sheet is refused before any read', () => {
  const tooBig = checkBatchSize(2080);
  assert.equal(tooBig.ok, false);
  assert.equal(tooBig.code, 'batch_too_large');
  assert.equal(tooBig.estimatedReads, 1);
  assert.equal(tooBig.estimatedWrites, 2081);
  assert.equal(checkBatchSize(WORD_BULK_CAP).ok, true);
  assert.equal(checkBatchSize(WORD_BULK_CAP).estimatedReads, 1);
  assert.equal(checkBatchSize(WORD_BULK_CAP + 1).ok, false);
  assert.equal(lookupKey('Hello   World'), 'hello world');
});

test('word budget stops an oversized day and bulk results stay per word', () => {
  const blocked = checkDailyWordBudget({ usedReads: 19950, usedWrites: 0, reads: 100, writes: 100 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'cost_limit');
  assert.equal(blocked.usedReads, 19950);
  const ok = checkDailyWordBudget({ usedReads: 100, usedWrites: 100, reads: 50, writes: 50 });
  assert.equal(ok.ok, true);
  assert.equal(ok.usedReads, 150);
  const { pending, results } = classifyWords(['Alpha', '  ALPHA  ', '', { text: 'Beta', notes: 'own' }], { notes: 'shared' });
  assert.equal(pending.length, 2);
  assert.equal(results[0].status, 'pending');
  assert.equal(results[0].notes, 'shared');
  assert.equal(results[1].status, 'existing');
  assert.equal(results[1].duplicateInRequest, true);
  assert.equal(results[1].key, 'alpha');
  assert.equal(results[2].status, 'error');
  assert.equal(results[3].notes, 'own');
  assert.equal(results[3].key, 'beta');
});

function countingTx(initial) {
  const ops = { reads: 0, writes: 0 };
  let index = initial || null;
  const words = [];
  return {
    ops,
    words,
    get index() { return index; },
    async get(ref) {
      ops.reads += 1;
      if (ref && ref.kind === 'word') {
        return { exists: false, data: () => null };
      }
      return { exists: !!index, data: () => index };
    },
    set(ref, data) {
      ops.writes += 1;
      if (ref && ref.kind === 'index') index = data;
      else words.push({ id: ref && ref.id, data });
    },
  };
}

function seeded(entries) {
  return packIndex(new Map(entries), '2026-10-28T12:00:00.000Z');
}

test('a bulk commit reads the index once', async () => {
  const make = (n) => Array.from({ length: n }, (_, i) => ({
    key: `word ${i}`,
    text: `Word ${i}`,
    notes: '',
    preferred: 'ordinal',
  }));
  const makeWord = (row, seq) => ({ id: `id-${seq}`, phrase: row.text, lookupKey: row.key });
  for (const size of [100, 499]) {
    const tx = countingTx(seeded([]));
    const out = await commitBulk(tx, {
      indexRef: { kind: 'index' },
      wordRefFor: (id) => ({ kind: 'word', id }),
      pending: make(size),
      now: '2026-10-28T12:00:00.000Z',
      makeWord,
    });
    assert.equal(out.ok, true);
    assert.equal(out.reads, 1);
    assert.equal(tx.ops.reads, 1);
    assert.equal(out.writes, size + 1);
    assert.equal(tx.ops.writes, size + 1);
    assert.equal(tx.words.length, size);
    assert.equal(tx.index.count, size);
  }
});

test('duplicates are skipped without word writes', async () => {
  const tx = countingTx(seeded([['alpha', 'old-id'], ['beta', 'beta-id']]));
  const out = await commitBulk(tx, {
    indexRef: { kind: 'index' },
    wordRefFor: (id) => ({ kind: 'word', id }),
    pending: [
      { key: 'alpha', text: 'Alpha' },
      { key: 'gamma', text: 'Gamma' },
    ],
    now: '2026-10-28T12:00:00.000Z',
    makeWord: (row, seq) => ({ id: `new-${seq}`, phrase: row.text, lookupKey: row.key }),
  });
  assert.equal(out.reads, 1);
  assert.equal(out.writes, 2);
  assert.equal(tx.words.length, 1);
  assert.equal(tx.words[0].data.lookupKey, 'gamma');
  assert.equal(out.byKey.get('alpha').status, 'existing');
  assert.equal(out.byKey.get('alpha').id, 'old-id');
});

test('delete removes the key and rebuild matches the kept words', async () => {
  const tx = countingTx(seeded([['alpha', 'a1'], ['beta', 'b1']]));
  const removed = await commitDelete(tx, {
    indexRef: { kind: 'index' },
    wordRef: { kind: 'word', id: 'a1' },
    id: 'a1',
    phrase: 'Alpha',
    now: '2026-10-28T12:00:00.000Z',
    ownerUid: 'u',
  });
  assert.equal(removed.reads, 1);
  assert.equal(removed.writes, 2);
  assert.equal(removed.removedKey, 'alpha');
  assert.equal(tx.index.count, 1);
  assert.equal(tx.index.entries[0].k, 'beta');
  const rebuilt = rebuildEntries([
    { id: 'b1', phrase: 'Beta', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'a1', phrase: 'Alpha', deleted: true, createdAt: '2026-01-02T00:00:00.000Z' },
    { id: 'b2', phrase: '  beta ', createdAt: '2026-02-01T00:00:00.000Z' },
  ], '2026-10-28T12:00:00.000Z');
  assert.equal(rebuilt.ok, true);
  assert.equal(rebuilt.count, 1);
  assert.equal(rebuilt.indexDoc.entries[0].id, 'b1');
});

test('a list page of 2177 words reads one page, and a number lookup reads the index once', () => {
  assert.equal(listReadCost(2177, 50).reads, 50);
  assert.equal(listReadCost(2177, 50).writes, 0);
  const entries = [{ k: 'a', id: 'one' }];
  for (let i = 0; i < 2176; i += 1) entries.push({ k: `word ${i}`, id: `id-${i}` });
  const found = matchByNumber(entries, 1, (key) => {
    let sum = 0;
    for (const ch of key) {
      const code = ch.charCodeAt(0);
      if (code >= 97 && code <= 122) sum += code - 96;
    }
    return sum;
  });
  assert.equal(found.reads, 1);
  assert.equal(found.writes, 0);
  assert.equal(found.matches.length, 1);
  assert.equal(found.matches[0].id, 'one');
  assert.equal(found.matches[0].key, 'a');
});
