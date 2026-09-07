'use strict';

const Auction = (function () {
  function show() {
    const remaining = Store.remainingTickets()
      .slice()
      .sort((a, b) => a.number - b.number);

    const backdrop = document.createElement('div');
    backdrop.className = 'auction-popup';

    const content = document.createElement('div');
    content.className = 'auction-content';

    const heading = document.createElement('h2');
    heading.textContent = '\u{1F3C6} FINAL ' + remaining.length + ': AUCTION TIME! \u{1F3C6}';

    const table = document.createElement('table');
    table.className = 'auction-table';
    for (let i = 0; i < remaining.length; i += 2) {
      const row = document.createElement('tr');
      for (let j = i; j < i + 2; j++) {
        const cell = document.createElement('td');
        cell.className = 'auction-cell';
        if (remaining[j]) {
          cell.textContent = '#' + remaining[j].number + ' ' + remaining[j].name;   // D7
        }
        row.appendChild(cell);
      }
      table.appendChild(row);
    }

    const prompt = document.createElement('p');
    prompt.textContent = "Enter the auction winner's name to continue:";

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 50;
    input.placeholder = "Enter winner's name...";

    const buttons = document.createElement('div');
    buttons.className = 'auction-buttons';

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.id = 'auction-confirm';
    confirm.textContent = 'Confirm Winner';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.id = 'auction-cancel';
    cancel.textContent = 'Skip Auction';

    buttons.appendChild(confirm);
    buttons.appendChild(cancel);
    [heading, table, prompt, input, buttons].forEach(node => content.appendChild(node));
    backdrop.appendChild(content);
    document.getElementById('overlays').appendChild(backdrop);

    function close() {
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    }

    confirm.addEventListener('click', () => {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      close();
      Store.resolveAuction(name);
    });

    cancel.addEventListener('click', () => {
      close();
      Store.skipAuction();
    });

    // keydown, not the deprecated onkeypress; Escape skips the auction
    function onKeydown(event) {
      if (event.key === 'Enter') { event.preventDefault(); confirm.click(); }
      if (event.key === 'Escape') { event.preventDefault(); cancel.click(); }
    }
    backdrop.addEventListener('keydown', onKeydown);

    setTimeout(() => input.focus(), 100);
  }

  return { show };
})();

if (typeof module !== 'undefined') module.exports = Auction;
