'use strict';

const Suspense = (function () {
  const PREFERRED_STEP_MS = 1800;
  const TARGET_MS = 20000;
  const MIN_STEP_MS = 700;
  const MAX_STEP_MS = 3200;

  // Multipliers for the last deliveries, so the spotlight slows into the kill
  const DECEL = Object.freeze([1.35, 1.8, 2.4]);

  // What the decel multipliers add on top of a flat run, in step-lengths
  const DECEL_EXTRA = DECEL.reduce((sum, f) => sum + (f - 1), 0);

  function drawOrder(numbers, rng) {
    const random = rng || Math.random;
    const out = numbers.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const swap = out[i];
      out[i] = out[j];
      out[j] = swap;
    }
    return out;
  }

  // Whole laps plus the offset to the victim, which is what keeps deliveries faced equal to within one
  function planSteps(order, litNumber, victim, opts) {
    const n = order.length;
    if (!n) return [];

    const victimIndex = order.indexOf(victim);
    if (victimIndex === -1) return [];

    const settings = opts || {};
    const targetMs = settings.targetMs > 0 ? settings.targetMs : TARGET_MS;

    const litIndex = order.indexOf(litNumber);
    const offset = ((victimIndex - litIndex - 1 + n * 2) % n) + 1;

    // At least one whole lap, so nobody sits out a round while someone else faces several
    const nominal = targetMs / PREFERRED_STEP_MS;
    const laps = Math.max(1, Math.round((nominal - offset) / n));
    const total = laps * n + offset;

    // Derive the step length from the target, so each round lands near the same duration
    const raw = targetMs / (total + DECEL_EXTRA);
    const stepMs = Math.min(MAX_STEP_MS, Math.max(MIN_STEP_MS, raw));

    const steps = [];
    for (let i = 0; i < total; i++) {
      const fromEnd = total - 1 - i;
      const factor = fromEnd < DECEL.length ? DECEL[DECEL.length - 1 - fromEnd] : 1;
      steps.push({
        number: order[(litIndex + 1 + i) % n],
        ms: Math.round(stepMs * factor),
        kill: i === total - 1
      });
    }
    return steps;
  }

  // The victim leaves the order, so the walk resumes from the survivor before them
  function litAfterKill(order, victim) {
    const n = order.length;
    const i = order.indexOf(victim);
    if (!n || i === -1) return null;
    return order[(i - 1 + n) % n];
  }

  return { PREFERRED_STEP_MS, TARGET_MS, drawOrder, planSteps, litAfterKill };
})();

if (typeof module !== 'undefined') module.exports = Suspense;
