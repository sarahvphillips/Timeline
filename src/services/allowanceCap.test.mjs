import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allowanceCap } from './allowanceCap.js';

describe('allowance cap', () => {
  it('uses the global cap', () => {
    const out = allowanceCap({ rules: { dailyAllowance: 500 } });
    assert.equal(out.cap, 500);
    assert.equal(out.exempt, false);
    assert.equal(out.testing, false);
  });

  it('a per-user number replaces the global cap and ads still add', () => {
    const out = allowanceCap({
      rules: { dailyAllowance: 500 },
      entitlements: { dailyAllowance: 5000 },
      adsUnlocked: 1,
      adUnlockPoints: 200,
    });
    assert.equal(out.cap, 5200);
    assert.equal(out.testing, true);
  });

  it('exempt means no cap', () => {
    const out = allowanceCap({
      rules: { dailyAllowance: 500 },
      entitlements: { allowanceExempt: true, dailyAllowance: 50 },
    });
    assert.equal(out.cap, Infinity);
    assert.equal(out.exempt, true);
  });

  it('zero or a blank override falls back to the global cap', () => {
    const out = allowanceCap({
      rules: { dailyAllowance: 500 },
      entitlements: { dailyAllowance: 0 },
    });
    assert.equal(out.cap, 500);
    assert.equal(out.testing, false);
  });
});
