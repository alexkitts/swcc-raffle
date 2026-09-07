'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Rules = require('../src/rules.js');

const S = (dropSize) => ({ dropSize, finalStageAt: Rules.FINAL_STAGE_AT });

test('nextDrop returns 1 at or below the final stage threshold', () => {
  for (let r = 1; r <= 10; r++) {
    assert.strictEqual(Rules.nextDrop(r, S(10)), 1, 'remaining ' + r);
  }
});

test('nextDrop normalises a non-multiple down to the nearest lower multiple (R3)', () => {
  assert.strictEqual(Rules.nextDrop(127, S(10)), 7);   // 127 -> 120
  assert.strictEqual(Rules.nextDrop(143, S(10)), 3);   // 143 -> 140
  assert.strictEqual(Rules.nextDrop(127, S(20)), 7);   // 127 -> 120
  assert.strictEqual(Rules.nextDrop(237, S(25)), 12);  // 237 -> 225
});

test('nextDrop takes a full drop when already on a multiple', () => {
  assert.strictEqual(Rules.nextDrop(150, S(10)), 10);
  assert.strictEqual(Rules.nextDrop(240, S(20)), 20);
  assert.strictEqual(Rules.nextDrop(250, S(50)), 50);
});

test('nextDrop never overshoots the final stage (the D1 regression)', () => {
  // Old getEliminations took 20 here and landed on 5, skipping the auction; new rule takes the path 25 -> 20 -> 10
  assert.strictEqual(Rules.nextDrop(25, S(20)), 5);
  assert.strictEqual(Rules.nextDrop(20, S(20)), 10);   // clamped from 20 to the excess
  assert.strictEqual(Rules.nextDrop(27, S(20)), 7);    // 27 -> 20
  assert.strictEqual(Rules.nextDrop(15, S(10)), 5);    // 15 -> 10
  assert.strictEqual(Rules.nextDrop(11, S(10)), 1);    // 11 -> 10
});

test('every count 11..250 and every drop size lands exactly on 10', () => {
  for (const dropSize of Rules.DROP_SIZE_OPTIONS) {
    for (let n = 11; n <= Rules.MAX_TICKETS; n++) {
      let r = n;
      let rounds = 0;
      while (r > Rules.FINAL_STAGE_AT) {
        const d = Rules.nextDrop(r, S(dropSize));
        assert.ok(d >= 1, 'drop must be positive at ' + r);
        r -= d;
        assert.ok(r >= Rules.FINAL_STAGE_AT,
          'overshot: n=' + n + ' dropSize=' + dropSize + ' landed on ' + r);
        assert.ok(++rounds < 300, 'did not terminate for n=' + n);
      }
      assert.strictEqual(r, Rules.FINAL_STAGE_AT,
        'n=' + n + ' dropSize=' + dropSize + ' ended on ' + r);
    }
  }
});

test('last year\'s 187-ticket count reaches the auction', () => {
  let r = 187;
  const path = [187];
  while (r > Rules.FINAL_STAGE_AT) { r -= Rules.nextDrop(r, S(10)); path.push(r); }
  assert.strictEqual(r, 10);
  assert.ok(path.includes(10), 'path was ' + path.join(' -> '));
});

test('the bulk drop never exceeds the eligible targets when ticket #1 is protected', () => {
  for (const dropSize of Rules.DROP_SIZE_OPTIONS) {
    for (let r = 11; r <= Rules.MAX_TICKETS; r++) {
      const d = Rules.nextDrop(r, S(dropSize));
      assert.ok(d <= r - 1,
        'drop ' + d + ' exceeds ' + (r - 1) + ' eligible at remaining ' + r);
    }
  }
});

function makeState(count, phase, eliminatedNumbers) {
  const tickets = [];
  for (let n = 1; n <= count; n++) tickets.push({ number: n, name: 'Player ' + n });
  return {
    tickets,
    phase: phase || 'bulk',
    eliminated: (eliminatedNumbers || []).map(n => ({ number: n, name: 'Player ' + n }))
  };
}

test('isAuctionTicket identifies ticket 1 only', () => {
  assert.strictEqual(Rules.isAuctionTicket({ number: 1 }), true);
  assert.strictEqual(Rules.isAuctionTicket({ number: 2 }), false);
  assert.strictEqual(Rules.isAuctionTicket({ number: 100 }), false);
});

test('hasAuctionTicket detects whether ticket 1 was uploaded', () => {
  assert.strictEqual(Rules.hasAuctionTicket([{ number: 1 }, { number: 2 }]), true);
  assert.strictEqual(Rules.hasAuctionTicket([{ number: 2 }, { number: 3 }]), false);
  assert.strictEqual(Rules.hasAuctionTicket([]), false);
});

test('remainingTickets excludes everyone eliminated', () => {
  const state = makeState(5, 'bulk', [2, 4]);
  assert.deepStrictEqual(Rules.remainingTickets(state).map(t => t.number), [1, 3, 5]);
});

test('eligibleTargets protects ticket 1 during the bulk stage (R7)', () => {
  const state = makeState(20, 'bulk', []);
  const targets = Rules.eligibleTargets(state);
  assert.strictEqual(targets.includes(1), false);
  assert.strictEqual(targets.length, 19);
});

test('eligibleTargets includes ticket 1 from the final stage onward', () => {
  const state = makeState(10, 'final', []);
  const targets = Rules.eligibleTargets(state);
  assert.strictEqual(targets.includes(1), true);
  assert.strictEqual(targets.length, 10);
});

test('eligibleTargets copes when ticket 1 was never uploaded', () => {
  const state = { tickets: [{ number: 5 }, { number: 6 }], phase: 'bulk', eliminated: [] };
  assert.deepStrictEqual(Rules.eligibleTargets(state), [5, 6]);
});

test('pickTargets returns the requested number of distinct candidates', () => {
  const chosen = Rules.pickTargets([1, 2, 3, 4, 5], 3);
  assert.strictEqual(chosen.length, 3);
  assert.strictEqual(new Set(chosen).size, 3);
  chosen.forEach(n => assert.ok([1, 2, 3, 4, 5].includes(n)));
});

test('pickTargets clamps to the number of candidates available', () => {
  assert.strictEqual(Rules.pickTargets([1, 2], 10).length, 2);
  assert.deepStrictEqual(Rules.pickTargets([], 5), []);
});

test('pickTargets does not mutate the candidate array', () => {
  const candidates = [1, 2, 3];
  Rules.pickTargets(candidates, 2);
  assert.deepStrictEqual(candidates, [1, 2, 3]);
});

test('pickTargets is deterministic with an injected rng', () => {
  const alwaysFirst = () => 0;
  assert.deepStrictEqual(Rules.pickTargets([7, 8, 9], 2, alwaysFirst), [7, 8]);
});

test('ticket 1 survives a full simulated bulk stage from 250, 187 and 127', () => {
  for (const count of [250, 187, 127]) {
    for (let seed = 0; seed < 40; seed++) {
      let rng = (() => { let s = seed + 1; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
      const state = makeState(count, 'bulk', []);
      const settings = { dropSize: 10, finalStageAt: Rules.FINAL_STAGE_AT };
      while (Rules.remainingTickets(state).length > Rules.FINAL_STAGE_AT) {
        const drop = Rules.nextDrop(Rules.remainingTickets(state).length, settings);
        const picked = Rules.pickTargets(Rules.eligibleTargets(state), drop, rng);
        assert.strictEqual(picked.length, drop, 'clamped unexpectedly at count ' + count);
        picked.forEach(n => state.eliminated.push({ number: n, name: 'Player ' + n }));
      }
      const survivors = Rules.remainingTickets(state).map(t => t.number);
      assert.strictEqual(survivors.length, 10);
      assert.ok(survivors.includes(1), 'ticket 1 eliminated (count ' + count + ', seed ' + seed + ')');
    }
  }
});

const O = (over) => Object.assign(
  { finalStageAt: 10, hasAuctionTicket: true, auctionResolved: false }, over || {}
);

test('loading more than the final stage starts the bulk stage', () => {
  assert.strictEqual(Rules.nextPhase('awaiting-csv', 187, O()), 'bulk');
  assert.strictEqual(Rules.nextPhase('awaiting-csv', 11, O()), 'bulk');
});

test('loading at or below the final stage skips straight to final', () => {
  assert.strictEqual(Rules.nextPhase('awaiting-csv', 10, O()), 'final');
  assert.strictEqual(Rules.nextPhase('awaiting-csv', 5, O()), 'final');
});

test('loading a single ticket is won immediately, with no ball bowled', () => {
  assert.strictEqual(Rules.nextPhase('awaiting-csv', 1, O()), 'won');
});

test('loading nothing stays in awaiting-csv', () => {
  assert.strictEqual(Rules.nextPhase('awaiting-csv', 0, O()), 'awaiting-csv');
});

test('bulk continues while above the final stage', () => {
  assert.strictEqual(Rules.nextPhase('bulk', 20, O()), 'bulk');
  assert.strictEqual(Rules.nextPhase('bulk', 11, O()), 'bulk');
});

test('bulk reaching the final stage goes to auction when ticket 1 exists', () => {
  assert.strictEqual(Rules.nextPhase('bulk', 10, O()), 'auction');
});

test('bulk reaching the final stage skips auction when ticket 1 was never uploaded', () => {
  assert.strictEqual(Rules.nextPhase('bulk', 10, O({ hasAuctionTicket: false })), 'final');
});

test('auction holds until resolved, then goes to final', () => {
  assert.strictEqual(Rules.nextPhase('auction', 10, O()), 'auction');
  assert.strictEqual(Rules.nextPhase('auction', 10, O({ auctionResolved: true })), 'final');
});

test('final becomes won at one remaining', () => {
  assert.strictEqual(Rules.nextPhase('final', 2, O({ auctionResolved: true })), 'final');
  assert.strictEqual(Rules.nextPhase('final', 1, O({ auctionResolved: true })), 'won');
});

test('won is terminal', () => {
  assert.strictEqual(Rules.nextPhase('won', 1, O({ auctionResolved: true })), 'won');
});

test('a full run from 187 visits bulk, auction, final and won in order', () => {
  const settings = { dropSize: 10, finalStageAt: 10 };
  const seen = [];
  let phase = 'awaiting-csv';
  let remaining = 187;
  let auctionResolved = false;

  phase = Rules.nextPhase(phase, remaining, O({ auctionResolved }));
  seen.push(phase);

  for (let guard = 0; guard < 400 && phase !== 'won'; guard++) {
    if (phase === 'auction') { auctionResolved = true; }
    else { remaining -= Rules.nextDrop(remaining, settings); }
    const next = Rules.nextPhase(phase, remaining, O({ auctionResolved }));
    if (next !== phase) seen.push(next);
    phase = next;
  }

  assert.deepStrictEqual(seen, ['bulk', 'auction', 'final', 'won']);
  assert.strictEqual(remaining, 1);
});
