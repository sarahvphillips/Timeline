import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readsForSingleEdit, recentWindowStart, syncPlan } from './syncPlan.js';

describe('sync plan', () => {
  it('does not full-reload a cached list just because a week has passed', () => {
    const plan = syncPlan({
      remoteVersion: '10',
      savedVersion: '10',
      since: '2026-09-01T00:00:00.000Z',
      localCount: 2200,
    });
    assert.equal(plan.mode, 'local');
    assert.equal(plan.reads, 1);
  });

  it('a single edit is a delta, not a scan of the whole list', () => {
    const plan = syncPlan({
      remoteVersion: '11',
      savedVersion: '10',
      since: '2026-11-03T12:00:00.000Z',
      localCount: 2200,
    });
    assert.equal(plan.mode, 'delta');
    assert.deepEqual(readsForSingleEdit(), { syncDoc: 1, changedDocs: 1, total: 2 });
  });

  it('adopts a cache that has no cursor instead of downloading everything', () => {
    const plan = syncPlan({ remoteVersion: '11', localCount: 40 });
    assert.equal(plan.mode, 'adopt');
  });

  it('a new install still needs a download', () => {
    const plan = syncPlan({ remoteVersion: '11', localCount: 0 });
    assert.equal(plan.mode, 'full');
  });

  it('the recent window is the previous month', () => {
    assert.equal(recentWindowStart(new Date('2026-11-03T12:00:00Z')), '2026-10-01');
    assert.equal(recentWindowStart(new Date('2026-01-15T12:00:00Z')), '2025-12-01');
  });
});
