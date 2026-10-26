const test = require('node:test');
const assert = require('node:assert/strict');
const { ukDay, nextMidnight } = require('../lib/ukTime');
const { pointsFor, allowanceCap, assessCharge, actionForMethod, DEFAULT_RULES } = require('../lib/allowance');
const { createRateLimiter } = require('../lib/rateLimit');
const { foldEvents, pageEvents, encodeCursor, decodeCursor } = require('../lib/recap');
const { dobToIso, publicProfile } = require('../lib/profile');
const { decideKeyCreate } = require('../lib/keys');
const { applyDelta, tombstone } = require('../lib/delta');

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
