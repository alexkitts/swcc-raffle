'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Suspense = require('../src/suspense.js');

const seeded = (seed) => {
  let s = seed + 1;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
};

const tickets = (n) => Array.from({ length: n }, (_, i) => i + 1);

test('drawOrder keeps every ticket exactly once', () => {
  const input = tickets(10);
  const out = Suspense.drawOrder(input, seeded(1));
  assert.strictEqual(out.length, 10);
  assert.deepStrictEqual(out.slice().sort((a, b) => a - b), input);
});

test('drawOrder does not mutate its input', () => {
  const input = tickets(6);
  const copy = input.slice();
  Suspense.drawOrder(input, seeded(2));
  assert.deepStrictEqual(input, copy);
});

test('drawOrder actually shuffles', () => {
  const input = tickets(20);
  let moved = 0;
  for (let seed = 0; seed < 20; seed++) {
    const out = Suspense.drawOrder(input, seeded(seed));
    if (out.some((n, i) => n !== input[i])) moved++;
  }
  assert.ok(moved >= 18, 'only ' + moved + ' of 20 draws changed the order');
});

test('an empty field yields no plan rather than throwing', () => {
  assert.strictEqual(Suspense.planRound([]), null);
  assert.strictEqual(Suspense.planRound(null), null);
});

// A fixed-length round is the whole point: the stage has to fit the evening
test('every round is four to eight balls, at every field size', () => {
  for (let n = 2; n <= 10; n++) {
    for (let seed = 0; seed < 60; seed++) {
      const plan = Suspense.planRound(tickets(n), { rng: seeded(seed) });
      assert.ok(plan.steps.length >= 4 && plan.steps.length <= 8,
        n + ' remaining, seed ' + seed + ': ' + plan.steps.length + ' balls');
      assert.strictEqual(plan.steps.length, plan.killBall);
    }
  }
});

// Five faces on the die, so ten rounds are far less likely to repeat a rhythm
test('all five round lengths actually occur', () => {
  const seen = new Set();
  for (let seed = 0; seed < 400; seed++) {
    seen.add(Suspense.planRound(tickets(7), { rng: seeded(seed) }).killBall);
  }
  assert.deepStrictEqual([...seen].sort(), [4, 5, 6, 7, 8]);
});

test('the die is even across its five faces', () => {
  const counts = new Map([4, 5, 6, 7, 8].map(k => [k, 0]));
  const rolls = 20000;
  for (let i = 0; i < rolls; i++) {
    const k = Suspense.planRound(tickets(6), { rng: Math.random }).killBall;
    counts.set(k, counts.get(k) + 1);
  }
  const expected = rolls / 5;
  for (const [ball, got] of counts) {
    const drift = Math.abs(got - expected) / expected;
    assert.ok(drift < 0.1,
      'ball ' + ball + ' came up ' + got + ' times, expected about ' + expected);
  }
});

test('only the last ball is the wicket', () => {
  for (let seed = 0; seed < 40; seed++) {
    const plan = Suspense.planRound(tickets(5), { rng: seeded(seed) });
    const kills = plan.steps.filter(s => s.kill);
    assert.strictEqual(kills.length, 1, 'seed ' + seed + ' had ' + kills.length + ' wickets');
    assert.strictEqual(plan.steps[plan.steps.length - 1].kill, true);
  }
});

test('the victim is whoever is standing on the ball that ends the round', () => {
  for (let n = 2; n <= 10; n++) {
    for (let seed = 0; seed < 40; seed++) {
      const plan = Suspense.planRound(tickets(n), { rng: seeded(seed) });
      assert.strictEqual(plan.victim, plan.order[(plan.killBall - 1) % n]);
      assert.strictEqual(plan.victim, plan.steps[plan.steps.length - 1].number);
    }
  }
});

test('the walk follows the drawn order and repeats it in sequence', () => {
  const plan = Suspense.planRound(tickets(3), { rng: seeded(9) });
  plan.steps.forEach((step, i) => {
    assert.strictEqual(step.number, plan.order[i % 3],
      'ball ' + (i + 1) + ' went to #' + step.number);
  });
});

// Nobody should face two extra deliveries while someone else waits
test('within a round the deliveries faced differ by at most one', () => {
  for (let n = 2; n <= 8; n++) {
    for (let seed = 0; seed < 40; seed++) {
      const plan = Suspense.planRound(tickets(n), { rng: seeded(seed) });
      const counts = new Map();
      plan.steps.forEach(s => counts.set(s.number, (counts.get(s.number) || 0) + 1));
      const faced = [...counts.values()];
      const spread = Math.max(...faced) - Math.min(...faced);
      assert.ok(spread <= 1,
        n + ' remaining, seed ' + seed + ': spread of ' + spread + ' deliveries');
    }
  }
});

test('two left alternate ball for ball', () => {
  for (let seed = 0; seed < 30; seed++) {
    const plan = Suspense.planRound([4, 9], { rng: seeded(seed) });
    plan.steps.forEach((step, i) => {
      if (i === 0) return;
      assert.notStrictEqual(step.number, plan.steps[i - 1].number,
        'the same player faced two in a row at ball ' + (i + 1));
    });
    const faced = plan.steps.filter(s => s.number === 4).length;
    assert.ok(faced >= 2 && faced <= 4, 'one of two players faced ' + faced + ' balls');
  }
});

test('three left share the balls out, one to three each', () => {
  for (let seed = 0; seed < 30; seed++) {
    const plan = Suspense.planRound([1, 2, 3], { rng: seeded(seed) });
    for (const n of [1, 2, 3]) {
      const faced = plan.steps.filter(s => s.number === n).length;
      assert.ok(faced >= 1 && faced <= 3, '#' + n + ' faced ' + faced + ' balls');
    }
  }
});

// The order is redrawn every round, so who goes first is not inherited from the last one
test('consecutive rounds do not reuse the same order', () => {
  let differed = 0;
  for (let seed = 0; seed < 40; seed++) {
    const rng = seeded(seed);
    const a = Suspense.planRound(tickets(8), { rng: rng });
    const b = Suspense.planRound(tickets(8), { rng: rng });
    if (a.order.some((n, i) => n !== b.order[i])) differed++;
  }
  assert.ok(differed >= 38, 'only ' + differed + ' of 40 round pairs drew a different order');
});

// Uniform victim choice is the fairness guarantee, and it must survive the fixed kill ball
test('every player is equally likely to be the one out', () => {
  for (const n of [2, 3, 5, 10]) {
    const counts = new Map(tickets(n).map(t => [t, 0]));
    const rounds = 12000;
    for (let i = 0; i < rounds; i++) {
      const plan = Suspense.planRound(tickets(n), { rng: Math.random });
      counts.set(plan.victim, counts.get(plan.victim) + 1);
    }
    const expected = rounds / n;
    for (const [number, got] of counts) {
      const drift = Math.abs(got - expected) / expected;
      assert.ok(drift < 0.15,
        n + ' remaining: #' + number + ' went out ' + got + ' times, expected about ' +
        Math.round(expected) + ' (' + Math.round(drift * 100) + '% off)');
    }
  }
});

test('the first ball of a round is not always the same player', () => {
  const firsts = new Set();
  for (let seed = 0; seed < 60; seed++) {
    firsts.add(Suspense.planRound(tickets(6), { rng: seeded(seed) }).steps[0].number);
  }
  assert.ok(firsts.size >= 5, 'only ' + firsts.size + ' different players ever faced ball one');
});

// Timing lives in one shared table, so no delivery can be paced differently from another
test('every delivery is paced from the same timing table', () => {
  const plan = Suspense.planRound(tickets(9), { rng: seeded(3) });
  assert.ok(plan.steps.every(s => !('ms' in s)), 'a step carried its own duration');
  const t = Suspense.TIMING;
  for (const phase of ['presentMs', 'holdMs', 'ballMs', 'dwellMs', 'returnMs']) {
    assert.ok(t[phase] > 0, phase + ' is not a positive duration');
  }
  assert.ok(Object.isFrozen(t), 'the timing table should be frozen');
});

test('the name is presented and held before the ball, and returns quickly', () => {
  const t = Suspense.TIMING;
  assert.ok(t.presentMs >= 1500, 'the present should be a slow glide, got ' + t.presentMs);
  assert.ok(t.holdMs >= 2000, 'the hold should give the room time, got ' + t.holdMs);
  assert.ok(t.returnMs < t.presentMs, 'the return should be faster than the present');
  assert.ok(t.ballMs < t.holdMs, 'the ball should be quicker than the wait for it');
});

test('the kill ball window is honoured when overridden', () => {
  for (let seed = 0; seed < 30; seed++) {
    const plan = Suspense.planRound(tickets(4), {
      rng: seeded(seed), minKillBall: 3, maxKillBall: 3
    });
    assert.strictEqual(plan.killBall, 3);
    assert.strictEqual(plan.steps.length, 3);
  }
});
