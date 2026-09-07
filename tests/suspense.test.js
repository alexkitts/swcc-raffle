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

test('every round lands within a second of the target duration', () => {
  for (let n = 2; n <= 10; n++) {
    const order = Suspense.drawOrder(tickets(n), seeded(n));
    for (const victim of order) {
      const steps = Suspense.planSteps(order, order[0], victim);
      const total = steps.reduce((sum, s) => sum + s.ms, 0);
      assert.ok(Math.abs(total - Suspense.TARGET_MS) < 1000,
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

test('the tempo slows as the field shrinks', () => {
  const wide = Suspense.planSteps(tickets(10), 1, 6);
  const narrow = Suspense.planSteps(tickets(6), 1, 4);
  assert.ok(narrow[0].ms > wide[0].ms,
    'six left stepped at ' + narrow[0].ms + 'ms, ten left at ' + wide[0].ms + 'ms');
});

test('the last deliveries slow down towards the kill', () => {
  const order = tickets(10);
  const steps = Suspense.planSteps(order, 1, 8);
  const ms = steps.map(s => s.ms);
  assert.ok(ms.length >= 4);
  assert.ok(ms[ms.length - 1] > ms[ms.length - 2], 'the kill should linger longest');
  assert.ok(ms[ms.length - 2] > ms[ms.length - 3], 'the run-in should decelerate');
  assert.strictEqual(ms[0], ms[1], 'early deliveries should be evenly paced');
});

test('a shorter target still covers everyone, just faster', () => {
  const order = tickets(10);
  const quick = Suspense.planSteps(order, 1, 5, { targetMs: 8000 });
  const slow = Suspense.planSteps(order, 1, 5, { targetMs: 20000 });
  assert.strictEqual(new Set(quick.map(s => s.number)).size, 10);
  assert.ok(quick[0].ms < slow[0].ms, 'a shorter target should step faster');
  assert.strictEqual(quick[quick.length - 1].number, 5);
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
