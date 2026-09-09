'use strict';

const Suspense = (function () {
  // Each phase of a hand-bowled delivery, in order; the gap between deliveries is the operator's next click
  // Measured in the browser: the arm is at full stretch from 2.124s to 2.207s, so aim mid-window
  const BOWLER_RELEASE_MS = 2165;

  const TIMING = Object.freeze({
    presentMs: 2000,
    holdMs: 2500,
    ballMs: 650,
    dwellMs: 900,
    returnMs: 180
  });

  // The wicket falls on one of these balls, rolled fresh each round: a predictable length, unpredictable ball
  const MIN_KILL_BALL = 4;
  const MAX_KILL_BALL = 8;

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

  // Both the order and the ball that ends it are drawn fresh, so neither carries over between rounds
  function planRound(numbers, opts) {
    if (!numbers || !numbers.length) return null;

    const settings = opts || {};
    const random = settings.rng || Math.random;
    const minBall = settings.minKillBall > 0 ? settings.minKillBall : MIN_KILL_BALL;
    const maxBall = settings.maxKillBall >= minBall ? settings.maxKillBall : MAX_KILL_BALL;
    const span = Math.max(1, maxBall - minBall + 1);

    const order = drawOrder(numbers, random);
    const killBall = minBall + Math.floor(random() * span);

    // The walk repeats the order until the chosen ball, which is the one that takes the wicket
    const steps = [];
    for (let i = 0; i < killBall; i++) {
      steps.push({
        number: order[i % order.length],
        kill: i === killBall - 1
      });
    }

    return {
      order: order,
      killBall: killBall,
      victim: steps[steps.length - 1].number,
      steps: steps
    };
  }

  return { TIMING, BOWLER_RELEASE_MS, MIN_KILL_BALL, MAX_KILL_BALL, drawOrder, planRound };
})();

if (typeof module !== 'undefined') module.exports = Suspense;
