'use strict';

(function () {
  const el = (id) => document.getElementById(id);
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  let storageOk = false;
  let bowling = false;
  let persistArmed = false;

  // ---- persistence wiring ----

  function persist() {
    if (storageOk && persistArmed) Persistence.save(Store.get());
  }

  // ---- auction wiring ----

  function showAuction() {
    if (document.querySelector('.auction-popup')) return;
    Auction.show();
  }

  // ---- the round loop (spec section 10) ----

  async function bowlBulk(targets, startGen) {
    for (let i = 0; i < targets.length; i++) {
      if (Store.generation() !== startGen) return;
      const number = targets[i];
      const cell = Render.cellFor(number);

      await Animation.throwBall(cell, Store.get().settings.ballMs);
      if (Store.generation() !== startGen) return;

      Animation.strike(cell);
      Sound.wicket();
      Store.eliminate(number);
      announceWicket(2000);

      if (i < targets.length - 1) await delay(Store.get().settings.interBallMs);
    }
  }

  // The victim is already chosen fairly; this is the theatre laid over that decision
  async function bowlSuspense(victim, startGen) {
    const alive = new Set(Store.remainingTickets().map(t => t.number));
    const order = Store.get().finalOrder.filter(n => alive.has(n));
    const plan = Suspense.planSteps(order, Store.get().spotlight, victim);

    if (!plan.length) {
      Store.eliminate(victim);
      announceWicket(10000);
      return;
    }

    Animation.resetStumps();

    for (const step of plan) {
      if (Store.generation() !== startGen) return;
      await bowlDelivery(step, victim, startGen);
      if (Store.generation() !== startGen) return;
    }

    Store.setSpotlight(Suspense.litAfterKill(order, victim));
  }

  // One delivery: the card becomes the bail, the ball is bowled, and the wicket either falls or does not
  async function bowlDelivery(step, victim, startGen) {
    Store.setSpotlight(step.number);

    const cell = Render.cellFor(step.number);
    const slot = el('bail-slot');
    const stumps = el('stumps');

    // Timed off baseMs, never the decelerated ms, so the wicket ball does not fly slower and give itself away
    const presentMs = Math.round(step.baseMs * 0.12);
    const ballMs = Math.round(step.baseMs * 0.34);
    const returnMs = Math.round(step.baseMs * 0.10);
    const dwellMs = Math.max(400, step.ms - presentMs - ballMs - returnMs);

    const bail = await Animation.presentToBail(cell, slot, presentMs);
    if (Store.generation() !== startGen) return;

    const aim = Animation.centreOf(stumps);
    const outcome = step.kill ? null : Dismissals.pickSurvival();
    const wide = !step.kill && outcome.kind === 'wide';

    // The bat swings on every delivery, wicket included, or its absence would announce the out
    Animation.swingBat(aim, Math.round(ballMs * 1.05));

    // A wide passes just outside the stumps rather than halfway across the screen
    const stumpsWidth = stumps.getBoundingClientRect().width;
    const target = wide
      ? { x: aim.x + (Math.random() < 0.5 ? -1 : 1) * stumpsWidth * 0.85, y: aim.y }
      : aim;

    const landed = (await Animation.bowlAt(target, ballMs)) || { dx: 0, dy: 0 };
    if (Store.generation() !== startGen) return;

    // Contact makes a noise, whether it hits the stumps or the bat; a wide hits nothing
    if (!wide) Sound.wicket();

    if (step.kill) {
      Animation.hitStumps();
      await Promise.all([
        Animation.bailBowled(bail, cell, 1100),
        Animation.ballAway('deflected', landed, 950)
      ]);
      if (Store.generation() !== startGen) return;
      Store.eliminate(victim);
      announceWicket(10000);
      return;
    }

    Animation.showOutcome(outcome.text, dwellMs + returnMs + 300);
    const awayMs = Math.min(dwellMs, 950);
    await Promise.all([
      Animation.ballAway(outcome.kind, landed, awayMs),
      delay(dwellMs)
    ]);
    if (Store.generation() !== startGen) return;

    await Animation.returnFromBail(bail, cell, returnMs);
  }

  function announceWicket(durationMs) {
    const log = Store.get().eliminated;
    const entry = log[log.length - 1];
    if (entry) Animation.showWicketPopup(entry.number, entry.dismissal, durationMs);
  }

  async function bowlRound() {
    if (bowling) return;
    const state = Store.get();
    if (state.phase !== 'bulk' && state.phase !== 'final') return;

    const drop = Store.nextDrop();
    const targets = Rules.pickTargets(Rules.eligibleTargets(state), drop);
    if (!targets.length) return;

    const startGen = Store.generation();
    bowling = true;
    Store.beginRound(targets);

    try {
      if (state.phase === 'final') {
        await bowlSuspense(targets[0], startGen);
      } else {
        await bowlBulk(targets, startGen);
      }
    } finally {
      if (Store.generation() === startGen) Store.endRound();
      bowling = false;

      if (Store.generation() === startGen) {
        const after = Store.get();
        if (after.phase === 'auction') setTimeout(showAuction, 1000);
        if (after.phase === 'won') showWinner();
      }
    }
  }

  function showWinner() {
    const winner = Store.winner();
    if (winner) Animation.showWinnerBanner(winner);
  }

  // ---- CSV upload ----

  function handleCsvText(text) {
    const result = Csv.parse(text);
    if (!result.ok) {
      Render.showError(result.error);
      return;
    }
    Animation.clearOverlays();
    Store.loadTickets(result.tickets, result.summary);
    Render.showLoadSummary(result.summary, Rules.hasAuctionTicket(result.tickets));
    if (Store.get().phase === 'won') showWinner();
  }

  function readFile(file, onText) {
    const reader = new FileReader();
    reader.onload = (e) => onText(String(e.target.result));
    reader.readAsText(file);
  }

  // ---- controls ----

  function wireControls() {
    el('upload-btn').addEventListener('click', () => el('csv-upload').click());

    el('csv-upload').addEventListener('change', (event) => {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      if (!/\.csv$/i.test(file.name)) { Render.showError('Please choose a .csv file.'); return; }
      readFile(file, handleCsvText);
    });

    el('throw').addEventListener('click', bowlRound);

    el('drop-size').addEventListener('change', (event) => {
      Store.setDropSize(Number(event.target.value));
    });

    el('reset-btn').addEventListener('click', () => {
      if (!window.confirm('Reset the draw? This clears all progress.')) return;
      Animation.clearOverlays();
      Persistence.clear();
      Store.reset();
      el('load-summary').hidden = true;
    });

    el('export-btn').addEventListener('click', () => {
      const json = Persistence.toJson(Store.get());
      // toJson returns null if the state cannot be serialised
      if (json === null) { Render.showError('Could not export the draw.'); return; }
      const blob = new Blob([json], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'swcc-raffle-progress.json';
      link.click();
      URL.revokeObjectURL(link.href);
    });

    el('import-btn').addEventListener('click', () => el('import-input').click());

    el('import-input').addEventListener('change', (event) => {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      readFile(file, (text) => {
        const saved = Persistence.fromJson(text);
        if (!saved || !Store.hydrate(saved)) {
          Render.showError('That file could not be read as a saved draw.');
          return;
        }
        Animation.clearOverlays();
        if (Store.get().phase === 'won') showWinner();
      });
    });

    // The grid is sized from the board box, so it has to be recomputed when that box changes
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(Render.fitBoard, 120);
    });

    // A native confirm works, unlike the F5/Ctrl+R interception it replaces
    window.addEventListener('beforeunload', (event) => {
      const state = Store.get();
      if (state.tickets.length && state.phase !== 'won') {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  }

  // ---- boot ----

  function setPreDecisionControlsDisabled(disabled) {
    el('upload-btn').disabled = disabled;
    el('import-btn').disabled = disabled;
    el('reset-btn').disabled = disabled;
  }

  // Drawn once per final stage, whichever route got us there: a round, the auction, or a resume
  function ensureFinalOrder(state) {
    if (state.phase !== 'final' || state.finalOrder.length) return;
    Store.setFinalOrder(Suspense.drawOrder(Store.remainingTickets().map(t => t.number)));
  }

  function boot() {
    Render.mount();
    wireControls();
    Store.subscribe(ensureFinalOrder);
    Store.subscribe(Render.apply);
    Store.subscribe(persist);

    storageOk = Persistence.isAvailable();
    Render.showStorageWarning(!storageOk);

    const saved = storageOk ? Persistence.load() : null;
    if (saved && Persistence.isResumable(saved)) {
      setPreDecisionControlsDisabled(true);
      Render.showResumePrompt(
        saved,
        () => {
          setPreDecisionControlsDisabled(false);
          persistArmed = true;
          if (!Store.hydrate(saved)) { Persistence.clear(); Store.reset(); return; }
          if (Store.get().phase === 'auction') showAuction();
          if (Store.get().phase === 'won') showWinner();
        },
        () => {
          setPreDecisionControlsDisabled(false);
          persistArmed = true;
          Persistence.clear();
          Store.reset();
        }
      );
    } else {
      persistArmed = true;
    }

    Render.apply(Store.get());
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
