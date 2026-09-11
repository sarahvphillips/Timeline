import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OWNER_EMAIL,
  roleOf,
  isStaff,
  isBlocked,
  canUseFeature,
  canSeeHomeAddEvent,
  canSeeHomeAdmin,
} from './adminAccess.js';

function base(overrides = {}) {
  return {
    signedInEmail: OWNER_EMAIL,
    admins: [],
    gates: {
      banking: 'everyone',
      purchases: 'everyone',
      deliveryPerk: 'admin',
    },
    blocked: [],
    ...overrides,
  };
}

describe('admin role / feature gates', () => {
  it('owner, admin, and ordinary users all see Home Add event', () => {
    const state = base({ admins: ['pal@example.com'] });
    assert.equal(canSeeHomeAddEvent(OWNER_EMAIL, state), true);
    assert.equal(canSeeHomeAddEvent('pal@example.com', state), true);
    assert.equal(canSeeHomeAddEvent('friend@example.com', state), true);
  });

  it('becoming admin never removes Add event (admin is additive)', () => {
    const before = base();
    assert.equal(canSeeHomeAddEvent('pal@example.com', before), true);
    assert.equal(canSeeHomeAdmin('pal@example.com', before), false);

    const after = base({ admins: ['pal@example.com'] });
    assert.equal(roleOf('pal@example.com', after), 'admin');
    assert.equal(canSeeHomeAddEvent('pal@example.com', after), true);
    assert.equal(canSeeHomeAdmin('pal@example.com', after), true);
  });

  it('Admin button stays staff-only', () => {
    const state = base({ admins: ['pal@example.com'] });
    assert.equal(canSeeHomeAdmin(OWNER_EMAIL, state), true);
    assert.equal(canSeeHomeAdmin('pal@example.com', state), true);
    assert.equal(canSeeHomeAdmin('friend@example.com', state), false);
  });

  it('blocked users lose Add event and Admin; owner cannot be blocked via helper', () => {
    const state = base({ admins: ['pal@example.com'], blocked: ['pal@example.com', OWNER_EMAIL] });
    assert.equal(isBlocked('pal@example.com', state), true);
    assert.equal(canSeeHomeAddEvent('pal@example.com', state), false);
    assert.equal(canSeeHomeAdmin('pal@example.com', state), false);
    assert.equal(isBlocked(OWNER_EMAIL, state), false);
    assert.equal(canSeeHomeAddEvent(OWNER_EMAIL, state), true);
  });

  it('canUseFeature: everyone gate stays true after grant; admin gate becomes true', () => {
    const before = base({ gates: { purchases: 'everyone', deliveryPerk: 'admin' } });
    assert.equal(canUseFeature('purchases', before, 'pal@example.com'), true);
    assert.equal(canUseFeature('deliveryPerk', before, 'pal@example.com'), false);

    const after = base({
      admins: ['pal@example.com'],
      gates: { purchases: 'everyone', deliveryPerk: 'admin' },
    });
    assert.equal(canUseFeature('purchases', after, 'pal@example.com'), true);
    assert.equal(canUseFeature('deliveryPerk', after, 'pal@example.com'), true);
    assert.equal(isStaff(roleOf('pal@example.com', after)), true);
  });
});
