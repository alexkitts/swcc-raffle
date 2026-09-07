'use strict';

(function () {
  const el = (id) => document.getElementById(id);
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  let storageOk = false;
  let bowling = false;

  // ---- persistence wiring ----

  function persist() {
    if (storageOk) Persistence.save(Store.get());
  }

  // ---- auction wiring ----

  function showAuction() {
    if (document.querySelector('.auction-popup')) return;
    Auction.show();
  }

  // ---- the round loop (spec section 10) ----

  async function bowlRound() {
    if (bowling) return;
    const state = Store.get();
    if (state.phase !== 'bulk' && state.phase !== 'final') return;

    const drop = Store.nextDrop();
    const targets = Rules.pickTargets(Rules.eligibleTargets(state), drop);
    if (!targets.length) return;

    bowling = true;
    Store.beginRound(targets);

    try {
      for (let i = 0; i < targets.length; i++) {
        const number = targets[i];
        const cell = Render.cellFor(number);

        await Animation.throwBall(cell, Store.get().settings.ballMs);

        Animation.strike(cell);
        Sound.wicket();
        Store.eliminate(number);

        const entry = Store.get().eliminated[Store.get().eliminated.length - 1];
        if (entry) {
          Animation.showWicketPopup(entry.number, entry.dismissal, entry.stage === 'final' ? 10000 : 2000);
        }

        if (i < targets.length - 1) await delay(Store.get().settings.interBallMs);
      }
    } finally {
      Store.endRound();
      bowling = false;
    }

    const after = Store.get();
    if (after.phase === 'auction') setTimeout(showAuction, 1000);
    if (after.phase === 'won') showWinner();
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

  function boot() {
    Render.mount();
    wireControls();
    Store.subscribe(Render.apply);
    Store.subscribe(persist);

    storageOk = Persistence.isAvailable();
    Render.showStorageWarning(!storageOk);

    const saved = storageOk ? Persistence.load() : null;
    if (saved && Persistence.isResumable(saved)) {
      Render.showResumePrompt(
        saved,
        () => {
          if (!Store.hydrate(saved)) { Persistence.clear(); Store.reset(); return; }
          if (Store.get().phase === 'auction') showAuction();
          if (Store.get().phase === 'won') showWinner();
        },
        () => { Persistence.clear(); Store.reset(); }
      );
    }

    Render.apply(Store.get());
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
