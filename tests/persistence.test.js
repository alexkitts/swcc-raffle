'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Persistence = require('../src/persistence.js');

function fakeStorage(opts) {
  const failWrites = opts && opts.failWrites;
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => {
      if (failWrites) throw new Error('QuotaExceededError');
      data.set(k, String(v));
    },
    removeItem: (k) => { data.delete(k); },
    _data: data
  };
}

const sampleState = () => ({
  schemaVersion: 1,
  tickets: [{ number: 1, name: 'Auction' }, { number: 2, name: 'Kyle Mitchell' }],
  eliminated: [{ number: 2, name: 'Kyle Mitchell', dismissal: 'Bowled!', stage: 'bulk', at: 1 }],
  phase: 'bulk',
  settings: { dropSize: 10, finalStageAt: 10, ballMs: 800, interBallMs: 200 },
  round: null,
  usedFinalDismissals: [],
  auctionResolved: false,
  loadSummary: { total: 2, skipped: 0, warnings: [] }
});

test('isAvailable is true for a working storage', () => {
  assert.strictEqual(Persistence.isAvailable(fakeStorage()), true);
});

test('isAvailable is false when writes throw, and leaves no probe behind', () => {
  const s = fakeStorage({ failWrites: true });
  assert.strictEqual(Persistence.isAvailable(s), false);
  assert.strictEqual(s._data.size, 0);
});

test('isAvailable is false when there is no storage at all', () => {
  assert.strictEqual(Persistence.isAvailable(null), false);
  assert.strictEqual(Persistence.isAvailable(undefined), false);
});

test('the availability probe cleans up after itself', () => {
  const s = fakeStorage();
  Persistence.isAvailable(s);
  assert.strictEqual(s._data.size, 0);
});

test('save then load round-trips the state exactly', () => {
  const s = fakeStorage();
  const state = sampleState();
  assert.strictEqual(Persistence.save(state, s), true);
  assert.deepStrictEqual(Persistence.load(s), state);
});

test('save reports failure instead of throwing when storage is unavailable', () => {
  assert.strictEqual(Persistence.save(sampleState(), fakeStorage({ failWrites: true })), false);
  assert.strictEqual(Persistence.save(sampleState(), null), false);
});

test('load returns null when nothing is stored', () => {
  assert.strictEqual(Persistence.load(fakeStorage()), null);
  assert.strictEqual(Persistence.load(null), null);
});

test('load returns null for corrupt JSON rather than throwing', () => {
  const s = fakeStorage();
  s.setItem(Persistence.KEY, '{not json');
  assert.strictEqual(Persistence.load(s), null);
});

test('clear removes the saved draw', () => {
  const s = fakeStorage();
  Persistence.save(sampleState(), s);
  Persistence.clear(s);
  assert.strictEqual(Persistence.load(s), null);
});

test('a draw in progress is resumable', () => {
  assert.strictEqual(Persistence.isResumable(sampleState()), true);
});

test('an unstarted or finished draw is not resumable', () => {
  const awaiting = Object.assign(sampleState(), { phase: 'awaiting-csv', eliminated: [] });
  assert.strictEqual(Persistence.isResumable(awaiting), false);

  const won = Object.assign(sampleState(), { phase: 'won' });
  assert.strictEqual(Persistence.isResumable(won), false);

  assert.strictEqual(Persistence.isResumable(null), false);
});

test('a loaded draw with no eliminations yet is still resumable', () => {
  const fresh = Object.assign(sampleState(), { eliminated: [] });
  assert.strictEqual(Persistence.isResumable(fresh), true);
});

test('toJson and fromJson round-trip for the manual export fallback', () => {
  const state = sampleState();
  const text = Persistence.toJson(state);
  assert.strictEqual(typeof text, 'string');
  assert.deepStrictEqual(Persistence.fromJson(text), state);
});

test('fromJson returns null for junk instead of throwing', () => {
  assert.strictEqual(Persistence.fromJson('not json'), null);
  assert.strictEqual(Persistence.fromJson(''), null);
  assert.strictEqual(Persistence.fromJson('[1,2,3]'), null);
});

test('toJson returns null rather than throwing on an unserialisable state', () => {
  const circular = { schemaVersion: 1 };
  circular.self = circular;
  assert.strictEqual(Persistence.toJson(circular), null);
});
