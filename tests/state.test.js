'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Rules = require('../src/rules.js');
const Store = require('../src/state.js');

function ticketsFor(count) {
  const out = [];
  for (let n = 1; n <= count; n++) out.push({ number: n, name: 'Player ' + n });
  return out;
}
function summaryFor(count) {
  return { total: count, skipped: 0, warnings: [] };
}
function load(count) {
  Store.reset();
  Store.loadTickets(ticketsFor(count), summaryFor(count));
}

test('a fresh store awaits a CSV', () => {
  Store.reset();
  assert.strictEqual(Store.get().phase, 'awaiting-csv');
  assert.strictEqual(Store.remaining(), 0);
  assert.strictEqual(Store.winner(), null);
});

test('loading tickets enters the bulk stage and sets the counts', () => {
  load(187);
  assert.strictEqual(Store.get().phase, 'bulk');
  assert.strictEqual(Store.remaining(), 187);
  assert.strictEqual(Store.stageTotal(), 187);
  assert.strictEqual(Store.wicketsThisStage(), 0);
});

test('nextDrop reflects the configured drop size', () => {
  load(127);
  assert.strictEqual(Store.nextDrop(), 7);
  Store.setDropSize(20);
  assert.strictEqual(Store.nextDrop(), 7);
  load(120);
  Store.setDropSize(20);
  assert.strictEqual(Store.nextDrop(), 20);
});

test('setDropSize rejects a value outside the allowed options', () => {
  load(100);
  Store.setDropSize(7);
  assert.strictEqual(Store.get().settings.dropSize, 10);
  Store.setDropSize(25);
  assert.strictEqual(Store.get().settings.dropSize, 25);
});

test('eliminate records the ticket, a dismissal and the stage', () => {
  load(20);
  Store.beginRound([5]);
  Store.eliminate(5);
  const entry = Store.get().eliminated[0];
  assert.strictEqual(entry.number, 5);
  assert.strictEqual(entry.name, 'Player 5');
  assert.strictEqual(entry.stage, 'bulk');
  assert.strictEqual(typeof entry.dismissal, 'string');
  assert.ok(entry.dismissal.length > 0);
  assert.strictEqual(Store.remaining(), 19);
  assert.strictEqual(Store.wicketsThisStage(), 1);
});

test('eliminate advances the in-flight round counter', () => {
  load(20);
  Store.beginRound([5, 6, 7]);
  assert.strictEqual(Store.get().round.thrown, 0);
  Store.eliminate(5);
  assert.strictEqual(Store.get().round.thrown, 1);
});

test('eliminating an already-eliminated ticket is ignored', () => {
  load(20);
  Store.beginRound([5]);
  Store.eliminate(5);
  Store.eliminate(5);
  assert.strictEqual(Store.get().eliminated.length, 1);
});

test('endRound clears the round and moves bulk to auction at the final stage', () => {
  load(11);
  Store.beginRound([2]);
  Store.eliminate(2);
  Store.endRound();
  assert.strictEqual(Store.get().round, null);
  assert.strictEqual(Store.get().phase, 'auction');
});

test('endRound skips the auction when ticket 1 was never uploaded', () => {
  Store.reset();
  const tickets = ticketsFor(11).filter(t => t.number !== 1);
  tickets.push({ number: 999, name: 'Extra' });
  Store.loadTickets(tickets, summaryFor(tickets.length));
  Store.beginRound([2]);
  Store.eliminate(2);
  Store.endRound();
  assert.strictEqual(Store.get().phase, 'final');
});

test('resolveAuction renames ticket 1 and advances to final', () => {
  load(11);
  Store.beginRound([2]);
  Store.eliminate(2);
  Store.endRound();
  Store.resolveAuction('  Dave Harker  ');
  assert.strictEqual(Store.get().phase, 'final');
  assert.strictEqual(Store.get().auctionResolved, true);
  const one = Store.get().tickets.find(t => t.number === 1);
  assert.strictEqual(one.name, 'Dave Harker');
});

test('skipAuction advances without renaming ticket 1', () => {
  load(11);
  Store.beginRound([2]);
  Store.eliminate(2);
  Store.endRound();
  Store.skipAuction();
  assert.strictEqual(Store.get().phase, 'final');
  assert.strictEqual(Store.get().tickets.find(t => t.number === 1).name, 'Player 1');
});

test('the final stage counts wickets and total from the stage, not the whole draw', () => {
  load(11);
  Store.beginRound([2]); Store.eliminate(2); Store.endRound();
  Store.skipAuction();
  assert.strictEqual(Store.wicketsThisStage(), 0);
  assert.strictEqual(Store.stageTotal(), 10);
  Store.beginRound([3]); Store.eliminate(3); Store.endRound();
  assert.strictEqual(Store.wicketsThisStage(), 1);
});

test('stageTotal never claims 10 for a draw smaller than that', () => {
  load(6);
  assert.strictEqual(Store.get().phase, 'final');
  assert.strictEqual(Store.stageTotal(), 6);
});

test('a single-ticket draw is won on load', () => {
  load(1);
  assert.strictEqual(Store.get().phase, 'won');
  assert.deepStrictEqual(Store.winner(), { number: 1, name: 'Player 1' });
});

test('the last survivor becomes the winner', () => {
  load(3);
  Store.beginRound([2]); Store.eliminate(2); Store.endRound();
  Store.beginRound([3]); Store.eliminate(3); Store.endRound();
  assert.strictEqual(Store.get().phase, 'won');
  assert.deepStrictEqual(Store.winner(), { number: 1, name: 'Player 1' });
});

test('final-stage dismissals are recorded so they are not repeated', () => {
  load(12);
  Store.beginRound([2, 3]);
  Store.eliminate(2);
  Store.eliminate(3);
  Store.endRound();
  assert.strictEqual(Store.get().phase, 'auction');
  Store.skipAuction();
  assert.strictEqual(Store.get().phase, 'final');
  Store.beginRound([4]);
  Store.eliminate(4);
  Store.endRound();
  assert.strictEqual(Store.get().usedFinalDismissals.length, 1);
});

test('subscribers are notified on every mutation', () => {
  Store.reset();
  let calls = 0;
  Store.subscribe(() => { calls++; });
  load(20);
  const afterLoad = calls;
  assert.ok(afterLoad > 0);
  Store.beginRound([5]);
  Store.eliminate(5);
  assert.ok(calls > afterLoad);
});

test('loading a new CSV clears all prior progress', () => {
  load(20);
  Store.beginRound([5]); Store.eliminate(5); Store.endRound();
  load(30);
  const s = Store.get();
  assert.deepStrictEqual(s.eliminated, []);
  assert.strictEqual(s.round, null);
  assert.strictEqual(s.auctionResolved, false);
  assert.deepStrictEqual(s.usedFinalDismissals, []);
  assert.strictEqual(s.phase, 'bulk');
  assert.strictEqual(Store.remaining(), 30);
});

test('hydrate restores a saved state', () => {
  load(20);
  Store.beginRound([5]); Store.eliminate(5); Store.endRound();
  const saved = JSON.parse(JSON.stringify(Store.get()));
  Store.reset();
  assert.strictEqual(Store.hydrate(saved), true);
  assert.strictEqual(Store.remaining(), 19);
  assert.strictEqual(Store.get().eliminated.length, 1);
});

test('hydrate discards a save from a different schema version', () => {
  load(20);
  const saved = JSON.parse(JSON.stringify(Store.get()));
  saved.schemaVersion = 99;
  Store.reset();
  assert.strictEqual(Store.hydrate(saved), false);
  assert.strictEqual(Store.get().phase, 'awaiting-csv');
});

test('hydrate discards an interrupted round but keeps the eliminations', () => {
  load(20);
  Store.beginRound([5, 6, 7]);
  Store.eliminate(5);
  const saved = JSON.parse(JSON.stringify(Store.get()));
  assert.notStrictEqual(saved.round, null);
  Store.reset();
  Store.hydrate(saved);
  assert.strictEqual(Store.get().round, null);
  assert.strictEqual(Store.remaining(), 19);
});

test('hydrate rejects junk', () => {
  Store.reset();
  assert.strictEqual(Store.hydrate(null), false);
  assert.strictEqual(Store.hydrate({}), false);
  assert.strictEqual(Store.hydrate({ schemaVersion: 1 }), false);
});

test('hydrate re-evaluates phase rather than trusting the saved value', () => {
  load(2);
  Store.beginRound([2]); Store.eliminate(2); Store.endRound();
  assert.strictEqual(Store.get().phase, 'won');
  const saved = JSON.parse(JSON.stringify(Store.get()));
  saved.phase = 'final';   // a stale save captured between eliminate and endRound
  Store.reset();
  Store.hydrate(saved);
  assert.strictEqual(Store.get().phase, 'won');
});

test('generation increments on reset, loadTickets and hydrate', () => {
  Store.reset();
  const g0 = Store.generation();
  load(20);
  const g1 = Store.generation();
  assert.ok(g1 > g0);

  Store.reset();
  const g2 = Store.generation();
  assert.ok(g2 > g1);

  load(20);
  Store.beginRound([5]); Store.eliminate(5); Store.endRound();
  const saved = JSON.parse(JSON.stringify(Store.get()));
  const g3 = Store.generation();
  Store.hydrate(saved);
  const g4 = Store.generation();
  assert.ok(g4 > g3);
});

test('eliminate refuses a number outside the live round\'s targets', () => {
  load(20);
  Store.beginRound([5, 6]);
  Store.eliminate(7);
  assert.strictEqual(Store.get().eliminated.length, 0);
  assert.strictEqual(Store.get().round.thrown, 0);
});

test('resolveAuction is a no-op outside the auction phase', () => {
  load(20);
  assert.strictEqual(Store.get().phase, 'bulk');
  Store.resolveAuction('Someone Else');
  assert.strictEqual(Store.get().phase, 'bulk');
  assert.strictEqual(Store.get().auctionResolved, false);
  assert.strictEqual(Store.get().tickets.find(t => t.number === 1).name, 'Player 1');
});

test('skipAuction is a no-op outside the auction phase', () => {
  load(20);
  assert.strictEqual(Store.get().phase, 'bulk');
  Store.skipAuction();
  assert.strictEqual(Store.get().phase, 'bulk');
  assert.strictEqual(Store.get().auctionResolved, false);
});
