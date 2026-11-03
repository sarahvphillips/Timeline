import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { graphStatus } from './peopleDateGraph.js';

describe('people and dates graph', () => {
  it('says there are no people, and that events are not used', () => {
    const out = graphStatus({ peopleOn: true, spansOn: false, people: [], spans: [] });
    assert.equal(out.showGraph, false);
    assert.match(out.lines[0], /No people saved yet/);
    assert.match(out.lines[0], /Timeline events are not drawn here/);
    assert.match(out.lines[1], /Days between is off/);
  });

  it('shows people who have no birthday, and says no month is drawn', () => {
    const out = graphStatus({
      peopleOn: true,
      spansOn: false,
      people: [{ id: 'a', name: 'Ada' }],
      spans: [],
    });
    assert.equal(out.showGraph, true);
    assert.equal(out.birthdayCount, 0);
    assert.match(out.lines[0], /none have a birthday/);
  });

  it('draws when a birthday is saved', () => {
    const out = graphStatus({
      peopleOn: true,
      spansOn: true,
      people: [{ id: 'a', name: 'Ada', birthday: '1990-04-01' }],
      spans: [{ id: 's', totalDays: 12 }],
    });
    assert.equal(out.showGraph, true);
    assert.equal(out.lines.length, 0);
  });

  it('says Days between is empty when that set is on', () => {
    const out = graphStatus({
      peopleOn: false,
      spansOn: true,
      people: [{ id: 'a', name: 'Ada', birthday: '1990-04-01' }],
      spans: [],
    });
    assert.equal(out.showGraph, false);
    assert.match(out.lines[0], /No Days between saved yet/);
  });
});
