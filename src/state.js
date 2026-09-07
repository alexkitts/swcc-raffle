'use strict';

const Store = (function () {
  const SCHEMA_VERSION = 1;

  const RulesRef = typeof require !== 'undefined' ? require('./rules.js') : Rules;
  const DismissalsRef = typeof require !== 'undefined' ? require('./dismissals.js') : Dismissals;

  let state = blank();
  const listeners = [];
  let gen = 0;

  function blank() {
    return {
      schemaVersion: SCHEMA_VERSION,
      tickets: [],
      eliminated: [],
      phase: 'awaiting-csv',
      settings: Object.assign({}, RulesRef.DEFAULT_SETTINGS),
      round: null,
      usedFinalDismissals: [],
      auctionResolved: false,
      loadSummary: null,
      finalOrder: [],
      spotlight: null
    };
  }

  function get() { return state; }
  function generation() { return gen; }
  function subscribe(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(fn => fn(state)); }

  // ---- derived, never stored ----

  function remainingTickets() { return RulesRef.remainingTickets(state); }
  function remaining() { return remainingTickets().length; }

  function inFinalStage() {
    return state.phase === 'final' || state.phase === 'won';
  }

  function wicketsThisStage() {
    const stage = inFinalStage() ? 'final' : 'bulk';
    return state.eliminated.filter(e => e.stage === stage).length;
  }

  function stageTotal() {
    if (!inFinalStage()) return state.tickets.length;
    return Math.min(state.settings.finalStageAt, state.tickets.length);
  }

  function nextDrop() { return RulesRef.nextDrop(remaining(), state.settings); }

  function winner() {
    const left = remainingTickets();
    return (state.phase === 'won' && left.length === 1) ? left[0] : null;
  }

  function transitionOpts() {
    return {
      finalStageAt: state.settings.finalStageAt,
      hasAuctionTicket: RulesRef.hasAuctionTicket(state.tickets),
      auctionResolved: state.auctionResolved
    };
  }

  function advancePhase() {
    state.phase = RulesRef.nextPhase(state.phase, remaining(), transitionOpts());
  }

  // ---- mutations ----

  function reset() { state = blank(); gen++; emit(); }

  function loadTickets(tickets, summary) {
    state = blank();
    state.tickets = tickets.map(t => ({ number: t.number, name: t.name }));
    state.loadSummary = summary;
    gen++;
    advancePhase();
    emit();
  }

  function setDropSize(n) {
    if (RulesRef.DROP_SIZE_OPTIONS.indexOf(n) === -1) return;
    state.settings = Object.assign({}, state.settings, { dropSize: n });
    emit();
  }

  function beginRound(targets) {
    state.round = { targets: targets.slice(), thrown: 0 };
    emit();
  }

  function eliminate(number) {
    if (state.round && state.round.targets.indexOf(number) === -1) return;
    if (state.eliminated.some(e => e.number === number)) return;
    const ticket = state.tickets.find(t => t.number === number);
    if (!ticket) return;

    const stage = inFinalStage() ? 'final' : 'bulk';
    const dismissal = DismissalsRef.pick(stage, state.usedFinalDismissals);
    if (stage === 'final') state.usedFinalDismissals.push(dismissal);

    state.eliminated.push({
      number: ticket.number,
      name: ticket.name,
      dismissal: dismissal,
      stage: stage,
      at: Date.now()
    });
    if (state.round) state.round.thrown++;
    emit();
  }

  // The drawn order the final-stage spotlight walks; set once, so a reload does not reshuffle
  function setFinalOrder(order) {
    state.finalOrder = order.slice();
    emit();
  }

  function setSpotlight(number) {
    state.spotlight = number;
    emit();
  }

  function endRound() {
    state.round = null;
    advancePhase();
    emit();
  }

  function resolveAuction(name) {
    if (state.phase !== 'auction') return;
    const trimmed = String(name == null ? '' : name).trim();
    if (trimmed) {
      const one = state.tickets.find(RulesRef.isAuctionTicket);
      if (one) one.name = trimmed;
    }
    state.auctionResolved = true;
    advancePhase();
    emit();
  }

  function skipAuction() {
    if (state.phase !== 'auction') return;
    state.auctionResolved = true;
    advancePhase();
    emit();
  }

  function hydrate(saved) {
    if (!saved || typeof saved !== 'object') return false;
    if (saved.schemaVersion !== SCHEMA_VERSION) return false;
    if (!Array.isArray(saved.tickets) || !Array.isArray(saved.eliminated)) return false;

    state = {
      schemaVersion: SCHEMA_VERSION,
      tickets: saved.tickets.map(t => ({ number: t.number, name: t.name })),
      eliminated: saved.eliminated.slice(),
      phase: saved.phase || 'awaiting-csv',
      settings: Object.assign({}, RulesRef.DEFAULT_SETTINGS, saved.settings || {}),
      round: null,   // an interrupted round is discarded; resume at a boundary
      usedFinalDismissals: (saved.usedFinalDismissals || []).slice(),
      auctionResolved: !!saved.auctionResolved,
      loadSummary: saved.loadSummary || null,
      finalOrder: (saved.finalOrder || []).slice(),
      spotlight: typeof saved.spotlight === 'number' ? saved.spotlight : null
    };
    gen++;
    advancePhase();
    emit();
    return true;
  }

  return {
    SCHEMA_VERSION,
    get, generation, subscribe, reset,
    loadTickets, setDropSize,
    beginRound, eliminate, endRound, setFinalOrder, setSpotlight,
    resolveAuction, skipAuction, hydrate,
    remaining, remainingTickets, wicketsThisStage, stageTotal, nextDrop, winner
  };
})();

if (typeof module !== 'undefined') module.exports = Store;
