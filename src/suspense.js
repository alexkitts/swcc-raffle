'use strict';

const Suspense = (function () {
  const BASE_STEP_MS = 1900;

  // How many deliveries a wicket takes, drawn at random so the count is never predictable
  const MIN_DELIVERIES = 15;
  const MAX_DELIVERIES = 25;

  // Multipliers for the last deliveries, so the spotlight slows into the kill
  const DECEL = Object.freeze([1.35, 1.8, 2.4]);


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
    const random = settings.rng || Math.random;
    const stepMs = settings.stepMs > 0 ? settings.stepMs : BASE_STEP_MS;
    const minDeliveries = settings.minDeliveries > 0 ? settings.minDeliveries : MIN_DELIVERIES;
    const maxDeliveries = settings.maxDeliveries > 0 ? settings.maxDeliveries : MAX_DELIVERIES;

    const litIndex = order.indexOf(litNumber);
    const offset = ((victimIndex - litIndex - 1 + n * 2) % n) + 1;

    // Only totals that both land on the victim and cover whole laps are valid
    const candidates = [];
    for (let laps = 1; offset + laps * n <= maxDeliveries; laps++) {
      const total = offset + laps * n;
      if (total >= minDeliveries) candidates.push(total);
    }

    const total = candidates.length
      ? candidates[Math.floor(random() * candidates.length)]
      : offset + n;

    const steps = [];
    for (let i = 0; i < total; i++) {
      const fromEnd = total - 1 - i;
      const factor = fromEnd < DECEL.length ? DECEL[DECEL.length - 1 - fromEnd] : 1;
      steps.push({
        number: order[(litIndex + 1 + i) % n],
        ms: Math.round(stepMs * factor),
        baseMs: Math.round(stepMs),
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

  return { BASE_STEP_MS, MIN_DELIVERIES, MAX_DELIVERIES, drawOrder, planSteps, litAfterKill };
})();

if (typeof module !== 'undefined') module.exports = Suspense;
