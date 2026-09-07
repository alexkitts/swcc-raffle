'use strict';

const Render = (function () {
  const el = (id) => document.getElementById(id);
  const cells = new Map();      // ticket number -> element, so a ball in flight
  let builtFor = null;          // keeps a valid reference across renders

  function mount() {
    const select = el('drop-size');
    select.textContent = '';
    Rules.DROP_SIZE_OPTIONS.forEach(n => {
      const option = document.createElement('option');
      option.value = String(n);
      option.textContent = String(n);
      if (n === Rules.DEFAULT_SETTINGS.dropSize) option.selected = true;
      select.appendChild(option);
    });
  }

  function boardMode(state) {
    return (state.phase === 'final' || state.phase === 'won' || state.phase === 'auction')
      ? 'final' : 'bulk';
  }

  // The final board is the bulk-stage survivors, a set final-stage eliminations do not change
  function boardTickets(state) {
    if (boardMode(state) === 'bulk') return state.tickets;
    const bulkOut = new Set(
      state.eliminated.filter(e => e.stage === 'bulk').map(e => e.number)
    );
    return state.tickets.filter(t => !bulkOut.has(t.number));
  }

  // Built once per board mode; later renders only patch classes and text
  function buildBoard(state) {
    const board = el('board');
    const mode = boardMode(state);
    board.textContent = '';
    cells.clear();
    board.classList.toggle('board--final', mode === 'final');

    const tickets = boardTickets(state);

    tickets.forEach(ticket => {
      const cell = document.createElement('div');
      cell.className = 'ticket';
      if (Rules.isAuctionTicket(ticket)) cell.classList.add('ticket--auction');
      cell.dataset.number = String(ticket.number);

      if (mode === 'final') {
        const name = document.createElement('div');
        name.className = 'ticket-name';
        name.textContent = ticket.name;                   // D7
        const number = document.createElement('div');
        number.className = 'ticket-number';
        number.textContent = '#' + ticket.number;
        cell.appendChild(name);
        cell.appendChild(number);
      } else {
        cell.textContent = String(ticket.number);
      }

      board.appendChild(cell);
      cells.set(ticket.number, cell);
    });

    builtFor = signatureOf(state);
  }

  // Stable within a board mode, so the board rebuilds exactly twice per draw
  function signatureOf(state) {
    return boardMode(state) + ':' + boardTickets(state).length + ':' + state.tickets.length;
  }

  function paintOut(state) {
    const out = new Set(state.eliminated.map(e => e.number));
    cells.forEach((cell, number) => {
      cell.classList.toggle('ticket--out', out.has(number));
    });
  }

  function paintScoreboard(state) {
    el('wicket-count').textContent = String(Store.wicketsThisStage());
    el('total-count').textContent = String(Store.stageTotal());
    el('remaining-count').textContent = String(Store.remaining());

    const host = el('scoreboard-content');
    host.textContent = '';

    const finalStage = state.phase === 'final' || state.phase === 'won';
    const entries = state.eliminated.filter(e => e.stage === (finalStage ? 'final' : 'bulk'));

    if (finalStage) {
      const heading = document.createElement('div');
      heading.className = 'scoreboard-stage-heading';
      heading.textContent = '\u{1F3C6} FINAL ' + Store.stageTotal() + ' STAGE \u{1F3C6}';
      host.appendChild(heading);
    }

    if (!entries.length) {
      const placeholder = document.createElement('div');
      placeholder.className = 'scoreboard-placeholder';
      placeholder.textContent = finalStage
        ? 'Final eliminations will appear here...'
        : 'Wickets will appear here...';
      host.appendChild(placeholder);
      return;
    }

    entries.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'wicket-entry';
      row.textContent = (index + 1) + '. #' + entry.number + ' ' + entry.name + ' - OUT';   // D7
      host.appendChild(row);
    });
    host.scrollTop = host.scrollHeight;
  }

  function paintControls(state) {
    const throwBtn = el('throw');
    const select = el('drop-size');
    const midRound = state.round !== null;
    const bowlable = (state.phase === 'bulk' || state.phase === 'final') && !midRound;

    throwBtn.disabled = !bowlable;
    select.value = String(state.settings.dropSize);
    select.disabled = midRound || state.phase !== 'bulk';

    if (state.phase === 'won') throwBtn.textContent = '\u{1F3C6} WINNER FOUND! \u{1F3C6}';
    else if (state.phase === 'awaiting-csv') throwBtn.textContent = 'Bowl Ball';
    else if (state.phase === 'auction') throwBtn.textContent = 'Auction in progress';
    else throwBtn.textContent = 'Bowl Ball (Next: ' + Store.nextDrop() + ' out)';

    el('upload-message').hidden = state.phase !== 'awaiting-csv';
    el('reset-btn').hidden = state.phase === 'awaiting-csv';
  }

  function apply(state) {
    if (builtFor !== signatureOf(state)) buildBoard(state);
    paintOut(state);
    paintScoreboard(state);
    paintControls(state);
  }

  function cellFor(number) { return cells.get(number); }

  function showLoadSummary(summary, hasAuctionTicket) {
    const box = el('load-summary');
    box.textContent = '';
    box.hidden = false;
    box.classList.remove('banner--warning');

    const lines = ['Loaded ' + summary.total + ' tickets.'];
    lines.push(hasAuctionTicket
      ? 'Ticket #' + Rules.AUCTION_TICKET_NUMBER + ' reserved for auction.'
      : 'No ticket #' + Rules.AUCTION_TICKET_NUMBER + ' — the auction stage will be skipped.');
    if (summary.skipped) lines.push(summary.skipped + ' unusable row(s) skipped.');
    summary.warnings.forEach(w => lines.push('Warning: ' + w));

    lines.forEach(text => {
      const line = document.createElement('div');
      line.textContent = text;
      box.appendChild(line);
    });
  }

  function showError(message) {
    const box = el('load-summary');
    box.textContent = message;
    box.hidden = false;
    box.classList.add('banner--warning');
  }

  function showStorageWarning(show) {
    const box = el('storage-warning');
    box.hidden = !show;
    if (show) {
      box.textContent = 'Progress cannot be saved automatically in this browser ' +
        '— do not close this window. Use "Export progress" to save a file by hand.';
    }
  }

  function showResumePrompt(saved, onYes, onNo) {
    const box = el('resume-prompt');
    const out = (saved.eliminated || []).length;
    const total = (saved.tickets || []).length;
    el('resume-text').textContent =
      'A draw is in progress — ' + out + ' of ' + total + ' out.';
    box.hidden = false;
    el('resume-yes').onclick = () => { box.hidden = true; onYes(); };
    el('resume-no').onclick = () => { box.hidden = true; onNo(); };
  }

  return {
    mount, apply, cellFor,
    showLoadSummary, showError, showStorageWarning, showResumePrompt
  };
})();

if (typeof module !== 'undefined') module.exports = Render;
