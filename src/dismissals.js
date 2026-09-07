'use strict';

const Dismissals = (function () {
  const REGULAR = Object.freeze([
    'Bowled!',
    'Caught!',
    'LBW!',
    'Run Out!',
    'Stumped!',
    'Golden Duck!',
    'Duck!',
    'Diamond Duck!',
    'Caught Behind!',
    'Chopped On!',
    'Bounced Out!'
  ]);

  const FINAL = Object.freeze([
    'Retired Hurt!',
    "Caught at Gully: Adamant it's a Bump Ball!",
    'Level 3 Offence: Swearing at the Umpire!',
    'Run Out: Deflected by the Bowler (Non Striker)!',
    'Bowled: Left a Straight One!',
    'Hit Wicket: Cutting the Off Spinner!',
    "LBW: You've Middled It!",
    'Mankad by the Bowler!',
    'Stumped Off a Wide!'
  ]);

  // Regular messages repeat freely; final-stage messages are consumed so each is heard once, refilling only if the pool runs dry.
  function pick(stage, used, rng) {
    const random = rng || Math.random;
    if (stage !== 'final') {
      return REGULAR[Math.floor(random() * REGULAR.length)];
    }
    const seen = used || [];
    let pool = FINAL.filter(msg => seen.indexOf(msg) === -1);
    if (!pool.length) pool = FINAL.slice();
    return pool[Math.floor(random() * pool.length)];
  }

  return { REGULAR, FINAL, pick };
})();

if (typeof module !== 'undefined') module.exports = Dismissals;
