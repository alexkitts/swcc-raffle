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
