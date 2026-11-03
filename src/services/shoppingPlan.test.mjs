import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  pastRecipeCards,
  clearShoppingList,
  restoreArchive,
  handoffPayload,
} from './shoppingPlan.js';

describe('shopping plan', () => {
  it('keeps the newest copy of a repeated recipe and does not edit the event', () => {
    const events = [
      { id: 'old', source: 'food', recipeName: 'Lemon chicken', title: 'Lemon chicken', foodItems: 'Chicken\nLemon', date: '2026-01-01' },
      { id: 'new', source: 'food', recipeName: 'lemon  chicken', title: 'lemon chicken', foodItems: 'Chicken\nLemon\nRice', date: '2026-10-02' },
      { id: 'note', source: 'manual', title: 'Dentist', date: '2026-11-01' },
    ];
    const cards = pastRecipeCards(events);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].eventId, 'new');
    assert.match(cards[0].items, /Rice/);
    assert.equal(events[0].foodItems, 'Chicken\nLemon');
  });

  it('clears the list, keeps an archive, and leaves events alone', () => {
    const events = [{ id: 'e1' }];
    const state = { hidden: [], extras: [{ id: 'card-1' }], selected: ['food-e1'], got: { a: true }, archives: [] };
    const next = clearShoppingList(state, [{ id: 'food-e1' }, { id: 'card-1' }], new Date('2026-11-03T12:00:00Z'));
    assert.deepEqual(events, [{ id: 'e1' }]);
    assert.equal(next.extras.length, 0);
    assert.equal(next.selected.length, 0);
    assert.equal(next.archives.length, 1);
    assert.match(next.archives[0].label, /Week of/);
    assert.equal(next.archives[0].snapshot.selected[0], 'food-e1');
    const back = restoreArchive(next, next.archives[0].id);
    assert.deepEqual(back.selected, ['food-e1']);
    assert.equal(back.archives.length, 0);
  });

  it('refuses an order without a cap, a shop, and a tick', () => {
    assert.throws(() => handoffPayload({ mode: 'order', capPounds: 0, allowedShops: ['Tesco'], optedIn: true, lines: [] }), /cap/);
    assert.throws(() => handoffPayload({ mode: 'order', capPounds: 20, allowedShops: [], optedIn: true, lines: [] }), /shop/);
    assert.throws(() => handoffPayload({ mode: 'order', capPounds: 20, allowedShops: ['Tesco'], optedIn: false, lines: [] }), /Tick/);
    const ok = handoffPayload({
      mode: 'all',
      shop: 'tesco',
      lines: [{ name: 'Rice', qty: '150g', mealName: 'Lemon chicken', dropped: false }],
    });
    assert.equal(ok.paysInApp, false);
    assert.equal(ok.items.length, 1);
    assert.equal(ok.optedIn, false);
  });
});
