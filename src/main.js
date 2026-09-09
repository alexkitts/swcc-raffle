'use strict';

(function () {
  const el = (id) => document.getElementById(id);
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  let storageOk = false;
  let bowling = false;
  let persistArmed = false;

  // The final stage is bowled by hand, so its plan has to outlive each click
  let finalRound = null;

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

  // One click, one ball, so the operator can narrate the final stage at their own pace
  async function bowlFinalDelivery() {
    const startGen = Store.generation();

    if (!finalRound) {
      const plan = Suspense.planRound(Rules.eligibleTargets(Store.get()));
      if (!plan) return;
      finalRound = { steps: plan.steps, index: 0, victim: plan.victim };
      Store.beginRound([plan.victim]);
      Animation.resetStumps();
    }

    const step = finalRound.steps[finalRound.index];
    const victim = finalRound.victim;
    finalRound.index++;

    bowling = true;
    Store.setDeliveryInFlight(true);
    try {
      await bowlDelivery(step, victim, startGen);
    } finally {
      bowling = false;
      if (Store.generation() === startGen) Store.setDeliveryInFlight(false);
    }

    if (Store.generation() !== startGen) { finalRound = null; return; }
    if (!step.kill) return;

    finalRound = null;
    Store.endRound();

    // Let the scatter land, then stand the wicket back up ready for the next round
    setTimeout(Animation.resetStumps, 2500);
    afterRound(startGen);
  }

  // One delivery: the card becomes the bail, the ball is bowled, and the wicket either falls or does not
  async function bowlDelivery(step, victim, startGen) {
    Store.setSpotlight(step.number);

    const cell = Render.cellFor(step.number);
    const slot = el('bail-slot');
    const stumps = el('stumps');

    // Identical for every delivery, so neither the flight nor the pause hints at which ball is the wicket
    const timing = Suspense.TIMING;

    const bail = await Animation.presentToBail(cell, slot, timing.presentMs);
    if (Store.generation() !== startGen) return;

    // The name stands at the crease while the room looks at it and the operator talks
    const runUp = Math.min(timing.holdMs, Suspense.BOWLER_RELEASE_MS);
    await delay(timing.holdMs - runUp);
    if (Store.generation() !== startGen) { Animation.resetBowler(); return; }

    // Started so his arm comes over at the moment the ball is bowled
    Animation.runBowler();
    await delay(runUp);
    if (Store.generation() !== startGen) { Animation.resetBowler(); return; }

    const aim = Animation.stumpTarget(stumps);
    const outcome = step.kill ? null : Dismissals.pickSurvival();
    const wide = !step.kill && outcome.kind === 'wide';

    // The keyframes hold a backlift then cross the ball line at 72%, hence the duration
    const batMs = Math.round(timing.ballMs / 0.72);
    Animation.swingBat(aim, batMs, 0);

    // A wide passes just outside the stumps rather than halfway across the screen
    const stumpsWidth = stumps.getBoundingClientRect().width;
    const target = wide
      ? { x: aim.x + (Math.random() < 0.5 ? -1 : 1) * stumpsWidth * 0.85, y: aim.y }
      : aim;

    // Every ball lands on something, so every ball makes a noise; a wide only scuffs the pitch
    const contact = setTimeout(wide ? Sound.scuff : Sound.wicket, Math.max(0, timing.ballMs - 80));

    const landed = (await Animation.bowlAt(target, timing.ballMs)) || { dx: 0, dy: 0 };
    if (Store.generation() !== startGen) { clearTimeout(contact); return; }

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

    Animation.showOutcome(outcome.text, timing.dwellMs + timing.returnMs + 300);
    const awayMs = Math.min(timing.dwellMs, 950);
    await Promise.all([
      Animation.ballAway(outcome.kind, landed, awayMs),
      delay(timing.dwellMs)
    ]);
    if (Store.generation() !== startGen) return;

    await Animation.returnFromBail(bail, cell, timing.returnMs);
  }

  function announceWicket(durationMs) {
    const log = Store.get().eliminated;
    const entry = log[log.length - 1];
    if (entry) Animation.showWicketPopup(entry.number, entry.dismissal, durationMs);
  }

  function afterRound(startGen) {
    if (Store.generation() !== startGen) return;
    const after = Store.get();
    if (after.phase === 'auction') setTimeout(showAuction, 1000);
    if (after.phase === 'won') showWinner();
  }

  async function bowlRound() {
    if (bowling) return;
    const state = Store.get();
    if (state.phase === 'final') { await bowlFinalDelivery(); return; }
    if (state.phase !== 'bulk') return;

    const drop = Store.nextDrop();
    const targets = Rules.pickTargets(Rules.eligibleTargets(state), drop);
    if (!targets.length) return;

    const startGen = Store.generation();
    bowling = true;
    Store.beginRound(targets);

    try {
      await bowlBulk(targets, startGen);
    } finally {
      if (Store.generation() === startGen) Store.endRound();
      bowling = false;
      afterRound(startGen);
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

  function boot() {
    Render.mount();
    wireControls();
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
