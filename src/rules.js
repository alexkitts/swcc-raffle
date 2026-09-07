'use strict';

const Rules = (function () {
  const AUCTION_TICKET_NUMBER = 1;
  const MAX_TICKETS = 250;
  const FINAL_STAGE_AT = 10;
  // One at a time is allowed, for drawing out the last stretch by hand
  const DROP_SIZE_OPTIONS = Object.freeze([1, 5, 10, 20, 25, 50]);
  const DEFAULT_SETTINGS = Object.freeze({
    dropSize: 10,
    finalStageAt: FINAL_STAGE_AT,
    ballMs: 800,
    interBallMs: 200
  });

  // Drops to the nearest lower multiple of dropSize (R3), clamped so we never overshoot finalStageAt (D1)
  function nextDrop(remaining, settings) {
    const dropSize = settings.dropSize;
    const finalStageAt = settings.finalStageAt;
    if (remaining <= finalStageAt) return 1;
    const excess = remaining - finalStageAt;
    return Math.min(remaining % dropSize || dropSize, excess);
  }

  function isAuctionTicket(ticket) {
    return ticket.number === AUCTION_TICKET_NUMBER;
  }

  function hasAuctionTicket(tickets) {
    return tickets.some(isAuctionTicket);
  }

  function remainingTickets(state) {
    const out = new Set(state.eliminated.map(e => e.number));
    return state.tickets.filter(t => !out.has(t.number));
  }

  // Ticket #1 is off limits until the final stage, which carries it through to the auction (R7)
  function eligibleTargets(state) {
    const protectOne = state.phase === 'bulk';
    return remainingTickets(state)
      .filter(t => !(protectOne && isAuctionTicket(t)))
      .map(t => t.number);
  }

  function pickTargets(candidates, count, rng) {
    const random = rng || Math.random;
    const pool = candidates.slice();
    const chosen = [];
    const wanted = Math.min(count, pool.length);
    for (let i = 0; i < wanted; i++) {
      chosen.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    }
    return chosen;
  }

  // The only place a phase is decided; evaluated at round boundaries and on load, never mid-round (fixes D9)
  function nextPhase(current, remaining, opts) {
    if (current === 'awaiting-csv' && remaining === 0) return 'awaiting-csv';
    if (remaining <= 1) return 'won';

    if (current === 'awaiting-csv') {
      return remaining > opts.finalStageAt ? 'bulk' : 'final';
    }
    if (current === 'bulk') {
      if (remaining > opts.finalStageAt) return 'bulk';
      return (opts.hasAuctionTicket && !opts.auctionResolved) ? 'auction' : 'final';
    }
    if (current === 'auction') {
      return opts.auctionResolved ? 'final' : 'auction';
    }
    return current;
  }

  return {
    AUCTION_TICKET_NUMBER,
    MAX_TICKETS,
    FINAL_STAGE_AT,
    DROP_SIZE_OPTIONS,
    DEFAULT_SETTINGS,
    nextDrop,
    isAuctionTicket,
    hasAuctionTicket,
    remainingTickets,
    eligibleTargets,
    pickTargets,
    nextPhase
  };
})();

if (typeof module !== 'undefined') module.exports = Rules;
