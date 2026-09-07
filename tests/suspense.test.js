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
  const order = Suspense.drawOrder(tickets(10), seeded(3));
  assert.strictEqual(order.length, 10);
  assert.deepStrictEqual(order.slice().sort((a, b) => a - b), tickets(10));
});

test('drawOrder does not mutate its input', () => {
  const input = tickets(10);
  Suspense.drawOrder(input, seeded(1));
  assert.deepStrictEqual(input, tickets(10));
});

test('drawOrder actually shuffles', () => {
  let differed = 0;
  for (let seed = 0; seed < 20; seed++) {
    const order = Suspense.drawOrder(tickets(10), seeded(seed));
    if (order.join() !== tickets(10).join()) differed++;
  }
  assert.ok(differed >= 18, 'only ' + differed + ' of 20 seeds produced a different order');
});

test('the plan always ends on the chosen victim', () => {
  const order = [7, 2, 9, 4, 1, 6, 3, 8, 5, 10];
  for (const victim of order) {
    for (const start of [null, 7, 1, 10]) {
      const steps = Suspense.planSteps(order, start, victim);
      assert.ok(steps.length > 0, 'no steps for victim ' + victim);
      assert.strictEqual(steps[steps.length - 1].number, victim, 'victim ' + victim + ' start ' + start);
      assert.strictEqual(steps[steps.length - 1].kill, true);
    }
  }
});

test('only the last step is the kill', () => {
  const order = [7, 2, 9, 4, 1];
  const steps = Suspense.planSteps(order, null, 9);
  assert.strictEqual(steps.filter(s => s.kill).length, 1);
});

test('every ticket faces within one delivery of every other', () => {
  for (let n = 2; n <= 10; n++) {
    const order = Suspense.drawOrder(tickets(n), seeded(n));
    for (const victim of order) {
      const steps = Suspense.planSteps(order, order[0], victim);
      const faced = new Map(order.map(x => [x, 0]));
      steps.forEach(s => faced.set(s.number, faced.get(s.number) + 1));
      const counts = [...faced.values()];
      const spread = Math.max(...counts) - Math.min(...counts);
      assert.ok(spread <= 1, n + ' remaining, victim ' + victim + ': spread was ' + spread);
    }
  }
});

test('the spotlight walks the drawn order and never jumps', () => {
  const order = [7, 2, 9, 4, 1, 6];
  const steps = Suspense.planSteps(order, 7, 4);
  steps.forEach((step, i) => {
    const expected = order[(order.indexOf(7) + 1 + i) % order.length];
    assert.strictEqual(step.number, expected, 'step ' + i);
  });
});

test('the first step never repeats the ticket already lit', () => {
  const order = [7, 2, 9, 4, 1];
  for (const victim of order) {
    const steps = Suspense.planSteps(order, 7, victim);
    assert.notStrictEqual(steps[0].number, 7, 'victim ' + victim + ' started on the lit ticket');
  }
});

// Full coverage plus a readable ball means the length varies with where the victim sits in the cycle
// With a uniform tempo the length is just the delivery count, so the band follows from the constants
test('every round runs between twenty-nine and forty-eight seconds', () => {
  const floor = Suspense.MIN_DELIVERIES * Suspense.BASE_STEP_MS;
  const ceiling = Suspense.MAX_DELIVERIES * Suspense.BASE_STEP_MS;
  for (let n = 2; n <= 10; n++) {
    const order = Suspense.drawOrder(tickets(n), seeded(n));
    for (const victim of order) {
      const steps = Suspense.planSteps(order, order[0], victim);
      const total = steps.reduce((sum, s) => sum + s.ms, 0);
      assert.ok(total >= floor && total <= ceiling,
        n + ' remaining, victim ' + victim + ': ' + (total / 1000).toFixed(1) + 's');
    }
  }
});

test('nobody sits out a round, however small the field', () => {
  for (let n = 2; n <= 10; n++) {
    const order = Suspense.drawOrder(tickets(n), seeded(n));
    for (const victim of order) {
      const steps = Suspense.planSteps(order, order[0], victim);
      const faced = new Set(steps.map(s => s.number));
      assert.strictEqual(faced.size, n,
        n + ' remaining, victim ' + victim + ': only ' + faced.size + ' faced a delivery');
    }
  }
});

// The pause between deliveries is held long enough to read, which the floor now guarantees at every size
test('the base tempo never drops below the readable floor', () => {
  for (let n = 2; n <= 10; n++) {
    const order = Suspense.drawOrder(tickets(n), seeded(n));
    for (const victim of order) {
      const steps = Suspense.planSteps(order, order[0], victim);
      assert.ok(steps[0].ms >= 1900,
        n + ' remaining stepped at ' + steps[0].ms + 'ms');
    }
  }
});

// A slower run-in was a tell: the operator could hear the wicket coming two deliveries out
test('the tempo is uniform, so the run-in never announces the kill', () => {
  const order = tickets(10);
  const steps = Suspense.planSteps(order, 1, 8);
  assert.ok(steps.length >= 4);
  const paces = new Set(steps.map(s => s.ms));
  assert.strictEqual(paces.size, 1, 'the tempo varied: ' + [...paces].join(','));
});

test('a victim outside the order yields no plan rather than throwing', () => {
  assert.deepStrictEqual(Suspense.planSteps([1, 2, 3], 1, 99), []);
  assert.deepStrictEqual(Suspense.planSteps([], null, 1), []);
});

test('two remaining pass the spotlight back and forth several times', () => {
  const steps = Suspense.planSteps([4, 9], 4, 9);
  assert.ok(steps.length >= 9, 'only ' + steps.length + ' deliveries for a head to head');
  assert.strictEqual(steps[steps.length - 1].number, 9);
  const faced = steps.filter(s => s.number === 4).length;
  assert.ok(faced >= 4, 'the survivor only faced ' + faced + ' deliveries');
});

test('after a wicket the walk resumes from the survivor before the victim', () => {
  const order = [7, 2, 9, 4, 1];
  assert.strictEqual(Suspense.litAfterKill(order, 9), 2);
  assert.strictEqual(Suspense.litAfterKill(order, 7), 1);
});

test('each round picks up where the last one stopped', () => {
  let order = Suspense.drawOrder(tickets(10), seeded(11));
  let lit = order[0];

  while (order.length > 2) {
    const victim = order[(order.indexOf(lit) + 3) % order.length];
    Suspense.planSteps(order, lit, victim);
    lit = Suspense.litAfterKill(order, victim);
    order = order.filter(n => n !== victim);

    assert.ok(order.includes(lit), 'resumed from #' + lit + ', which is no longer in the field');

    const next = Suspense.planSteps(order, lit, order[0]);
    const expected = order[(order.indexOf(lit) + 1) % order.length];
    assert.strictEqual(next[0].number, expected,
      'the next round should start at #' + expected + ', not #' + next[0].number);
  }
});

test('litAfterKill copes with a victim that is not in the order', () => {
  assert.strictEqual(Suspense.litAfterKill([1, 2, 3], 99), null);
  assert.strictEqual(Suspense.litAfterKill([], 1), null);
});

test('the ball flight is the same on every delivery, including the wicket', () => {
  const steps = Suspense.planSteps(tickets(10), 1, 8);
  const durations = new Set(steps.map(s => s.ms));
  assert.strictEqual(durations.size, 1, 'the step duration varied: ' + [...durations].join(','));
  assert.strictEqual(steps[steps.length - 1].ms, steps[0].ms,
    'the wicket delivery must not be paced differently from the rest');
});

test('the base step is never so short that a readable ball will not fit', () => {
  for (let n = 2; n <= 10; n++) {
    const order = Suspense.drawOrder(tickets(n), seeded(n));
    for (const victim of order) {
      const steps = Suspense.planSteps(order, order[0], victim);
      assert.ok(steps[0].ms >= 1900, n + ' remaining gave a base step of ' + steps[0].ms + 'ms');
    }
  }
});

// Valid counts are offset + laps * n, so the spread comes from which victim is drawn each round
test('the delivery count varies widely from round to round', () => {
  const order = Suspense.drawOrder(tickets(10), seeded(4));
  const seen = new Set();
  for (const victim of order) {
    for (let s = 0; s < 20; s++) {
      const steps = Suspense.planSteps(order, order[0], victim, { rng: seeded(s) });
      seen.add(steps.length);
      assert.strictEqual(steps[steps.length - 1].number, victim, 'must still end on the victim');
    }
  }
  assert.ok(seen.size >= 6, 'only ' + seen.size + ' distinct counts across ten victims: ' + [...seen].sort((a, b) => a - b).join(','));
  [...seen].forEach(c => {
    assert.ok(c >= Suspense.MIN_DELIVERIES && c <= Suspense.MAX_DELIVERIES,
      c + ' deliveries falls outside the band');
  });
});

test('every count in the band is reachable across field sizes', () => {
  const seen = new Set();
  for (let n = 2; n <= 10; n++) {
    const order = Suspense.drawOrder(tickets(n), seeded(n));
    for (const victim of order) {
      for (let s = 0; s < 30; s++) {
        seen.add(Suspense.planSteps(order, order[0], victim, { rng: seeded(s * 7 + n) }).length);
      }
    }
  }
  for (let c = Suspense.MIN_DELIVERIES; c <= Suspense.MAX_DELIVERIES; c++) {
    assert.ok(seen.has(c), c + ' deliveries never came up');
  }
});

test('the count band is honoured at every field size', () => {
  for (let n = 2; n <= 10; n++) {
    const order = Suspense.drawOrder(tickets(n), seeded(n));
    for (const victim of order) {
      const steps = Suspense.planSteps(order, order[0], victim);
      assert.ok(steps.length >= Suspense.MIN_DELIVERIES && steps.length <= Suspense.MAX_DELIVERIES,
        n + ' remaining gave ' + steps.length + ' deliveries');
    }
  }
});
