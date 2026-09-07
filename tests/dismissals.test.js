'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Dismissals = require('../src/dismissals.js');

test('bulk dismissals come from the regular pool and may repeat', () => {
  const msg = Dismissals.pick('bulk', [], () => 0);
  assert.ok(Dismissals.REGULAR.includes(msg));
});

test('final dismissals come from the final pool', () => {
  const msg = Dismissals.pick('final', [], () => 0);
  assert.ok(Dismissals.FINAL.includes(msg));
});

test('final dismissals are not reused while unused ones remain', () => {
  const used = Dismissals.FINAL.slice(0, Dismissals.FINAL.length - 1);
  const msg = Dismissals.pick('final', used, () => 0);
  assert.strictEqual(msg, Dismissals.FINAL[Dismissals.FINAL.length - 1]);
});

test('final pool refills once every message has been used', () => {
  const used = Dismissals.FINAL.slice();
  const msg = Dismissals.pick('final', used, () => 0);
  assert.ok(Dismissals.FINAL.includes(msg));
});

test('drawing the whole final pool yields every message exactly once', () => {
  const used = [];
  for (let i = 0; i < Dismissals.FINAL.length; i++) {
    used.push(Dismissals.pick('final', used, () => 0));
  }
  assert.strictEqual(new Set(used).size, Dismissals.FINAL.length);
});

test('the pools are non-empty and immutable', () => {
  assert.ok(Dismissals.REGULAR.length > 0);
  assert.ok(Dismissals.FINAL.length > 0);
  assert.throws(() => Dismissals.REGULAR.push('x'));
});

test('every survival outcome has text and a ball path kind', () => {
  const kinds = new Set(['wide', 'defended', 'single', 'four', 'six']);
  assert.ok(Dismissals.SURVIVED.length >= 10);
  Dismissals.SURVIVED.forEach(o => {
    assert.ok(o.text && o.text.length > 0, 'missing text');
    assert.ok(kinds.has(o.kind), 'unknown kind: ' + o.kind);
  });
});

test('boundaries are rarer than defensive outcomes', () => {
  const count = (k) => Dismissals.SURVIVED.filter(o => o.kind === k).length;
  assert.ok(count('six') < count('wide'), 'sixes should be rarer than wides');
  assert.ok(count('six') <= count('four'), 'sixes should be no commoner than fours');
});

test('pickSurvival returns one of the pool', () => {
  for (let i = 0; i < 40; i++) {
    const o = Dismissals.pickSurvival();
    assert.ok(Dismissals.SURVIVED.includes(o));
  }
  assert.strictEqual(Dismissals.pickSurvival(() => 0), Dismissals.SURVIVED[0]);
});

test('the survival pool is immutable', () => {
  assert.throws(() => Dismissals.SURVIVED.push({ text: 'x', kind: 'wide' }));
});
