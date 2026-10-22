import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_USAGE_RULES,
  actionCost,
  addCost,
  allowanceFor,
  emptyUsage,
  normalizeRules,
  normalizeUsage,
  pointsFor,
  statusFor,
  ukDay,
  usagePointsOf,
} from './usageRules.js';

const rules = normalizeRules();

describe('usage rules maths', () => {
  it('weights reads, writes and deletes as 1, 3 and 1', () => {
    assert.equal(pointsFor({ reads: 4, writes: 3, deletes: 0 }, rules), 4 + 9);
    assert.equal(pointsFor({ reads: 0, writes: 0, deletes: 2 }, rules), 2);
  });

  it('charges the starting action table from the 20 Oct measurements', () => {
    const add = actionCost(rules, 'addEvent');
    assert.deepEqual(
      { reads: add.reads, writes: add.writes, points: add.points },
      { reads: 4, writes: 3, points: 13 },
    );
    const del = actionCost(rules, 'delete');
    assert.equal(del.deletes, 1);
    assert.equal(del.points, 4 + 6 + 1);
    assert.equal(actionCost(rules, 'wordLookup').points, 1);
    assert.equal(actionCost(rules, 'fullLoad').points, 1);
  });

  it('multiplies a batch by the number of items', () => {
    const ten = actionCost(rules, 'fullLoad', 10);
    assert.equal(ten.reads, 10);
    assert.equal(ten.points, 10);
    const bulk = actionCost(rules, 'bulkEdit', 3);
    assert.deepEqual(
      { reads: bulk.reads, writes: bulk.writes, points: bulk.points },
      { reads: 6, writes: 6, points: 24 },
    );
    assert.equal(actionCost(rules, 'fullLoad', 0).points, 0);
  });

  it('honours a per-action points override and the enabled flag', () => {
    const custom = normalizeRules({
      actions: {
        addEvent: { reads: 4, writes: 3, points: 50 },
        wordLookup: { reads: 1, enabled: false },
      },
    });
    assert.equal(actionCost(custom, 'addEvent').points, 50);
    assert.equal(actionCost(custom, 'wordLookup').enabled, false);
    // Actions the admin did not mention keep their defaults.
    assert.equal(actionCost(custom, 'delete').points, 11);
  });

  it('adds verified ad unlocks to the daily allowance', () => {
    assert.equal(allowanceFor(rules, 0), 500);
    assert.equal(allowanceFor(rules, 400), 900);
    assert.equal(allowanceFor(rules, -50), 500);
  });

  it('clamps junk from the admin editor instead of trusting it', () => {
    const junk = normalizeRules({
      dailyAllowance: -20,
      wW: 'lots',
      adUnlockPoints: '250',
      resetTz: '',
      actions: { addEvent: { reads: -1, writes: 'x' } },
    });
    assert.equal(junk.dailyAllowance, 500);
    assert.equal(junk.wW, 3);
    assert.equal(junk.adUnlockPoints, 250);
    assert.equal(junk.resetTz, 'Europe/London');
    assert.equal(junk.actions.addEvent.reads, 4);
    assert.equal(junk.actions.addEvent.writes, 3);
    assert.ok(junk.actions.fullLoad);
  });
});

describe('UK day and counters', () => {
  it('rolls over at midnight in London, not UTC', () => {
    // 23:30 UTC on 20 Oct is 00:30 BST on 21 Oct.
    assert.equal(ukDay(new Date('2026-10-20T23:30:00Z')), '2026-10-21');
    // 22:30 UTC is still 23:30 BST on 20 Oct.
    assert.equal(ukDay(new Date('2026-10-20T22:30:00Z')), '2026-10-20');
    // Winter: 00:30 UTC on 1 Jan is 00:30 GMT the same day.
    assert.equal(ukDay(new Date('2027-01-01T00:30:00Z')), '2027-01-01');
  });

  it('starts again from zero on a new day', () => {
    const yesterday = normalizeUsage(
      { date: '2026-10-19', reads: 900, writes: 80, deletes: 4 },
      '2026-10-20',
    );
    assert.deepEqual(yesterday, { date: '2026-10-20', reads: 0, writes: 0, deletes: 0 });
    const today = normalizeUsage(
      { date: '2026-10-20', reads: 12, writes: 3, deletes: 1 },
      '2026-10-20',
    );
    assert.deepEqual(today, { date: '2026-10-20', reads: 12, writes: 3, deletes: 1 });
  });

  it('adds costs and reports the over-limit state', () => {
    const start = emptyUsage('2026-10-20');
    const row = addCost(start, actionCost(rules, 'addEvent', 30));
    assert.equal(usagePointsOf(row, rules), 390);
    assert.equal(statusFor(row, rules).over, false);
    const nearly = addCost(row, actionCost(rules, 'addEvent', 9));
    assert.equal(usagePointsOf(nearly, rules), 507);
    const status = statusFor(nearly, rules);
    assert.equal(status.over, true);
    assert.equal(status.remaining, 0);
    // An ad unlock lifts the same counters back under the line.
    assert.equal(statusFor(nearly, rules, 200).over, false);
  });

  it('treats exactly reaching the allowance as over', () => {
    const row = { date: '2026-10-20', reads: 500, writes: 0, deletes: 0 };
    assert.equal(statusFor(row, rules).over, true);
  });

  it('defaults are the published starting rules', () => {
    assert.equal(DEFAULT_USAGE_RULES.dailyAllowance, 500);
    assert.equal(DEFAULT_USAGE_RULES.adUnlockPoints, 200);
    assert.equal(DEFAULT_USAGE_RULES.wR, 1);
    assert.equal(DEFAULT_USAGE_RULES.wW, 3);
    assert.equal(DEFAULT_USAGE_RULES.wD, 1);
    assert.equal(DEFAULT_USAGE_RULES.resetTz, 'Europe/London');
  });
});
