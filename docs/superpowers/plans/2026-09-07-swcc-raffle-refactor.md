# SWCC Raffle Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the SWCC reverse raffle around a real state model so it is correct for any ticket count to 250, survives the laptop being closed, and tolerates whatever CSV the operator uploads minutes before the draw.

**Architecture:** Vanilla JavaScript, no framework and no build step. One plain state object is the single source of truth; the DOM holds no game state. Game rules and CSV parsing are pure functions in their own files, unit-tested with Node's built-in test runner. Files load as classic `<script>` tags exposing one namespace object each, so the app still runs by double-clicking `index.html` from a folder with no server and no internet.

**Tech Stack:** ES2020 JavaScript (classic scripts, no modules), CSS Grid, Web Animations API, `localStorage`, `node --test` for unit tests. No npm, no `package.json`, no dependencies.

**Spec:** `docs/superpowers/specs/2026-09-07-swcc-raffle-refactor-design.md`

## Global Constraints

- **No build step, no npm, no `package.json`, no `node_modules`, no dependencies.** Adding any is a plan violation.
- **No ES modules in browser code.** No `import` / `export` / `type="module"`. Browsers block `import` over `file://` and the app must run by double-clicking `index.html`.
- **Every `src/*.js` file** is one IIFE assigned to one `const` namespace, ending with `if (typeof module !== 'undefined') module.exports = <Namespace>;` so Node can `require()` it.
- **Ticket ceiling is 250.** Ticket **#1 is always the auction ticket**, expressed once as `Rules.AUCTION_TICKET_NUMBER`. Never write a bare `1` or `"1"` for this rule.
- **`finalStageAt` is 10 and is not exposed in the UI.** Only `dropSize` is operator-configurable.
- **Drop size options are exactly `[5, 10, 20, 25, 50]`, default `10`.**
- **All user-supplied text reaches the DOM via `textContent`, never `innerHTML`.** Ticket names come from an uploaded file.
- **No block or paragraph comments anywhere. One line per comment, maximum** — `// like this`. This applies to JS, CSS and test files. Condense rather than delete: keep the useful information, fit it on one line. In CSS use a single-line `/* ... */`.
- **No accessibility work.** No ARIA, no `aria-live`, no focus traps, no contrast auditing. Escape-to-close and input autofocus on the auction modal are kept as operator ergonomics, and `keydown` replaces the deprecated `onkeypress`, but nothing else.
- **Test command is `node --test`** run from the repo root.
- **Node's test runner discovers `tests/*.test.js`.** With no `package.json`, `.js` is CommonJS, so tests use `require`.

## Working state during this plan

Tasks 1–7 add new files only and do not touch `app.js`, `index.html` or `style.css`, so the existing app keeps working. **Task 8 begins the switch-over and the app on this branch is non-functional until Task 12 completes.** That is expected; `main` still holds the working version. Do not attempt to keep both wired simultaneously.

---

### Task 1: Drop schedule (`Rules.nextDrop`)

The defect that matters most (D1). Everything else is downstream of this being right.

**Files:**
- Create: `src/rules.js`
- Test: `tests/rules.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `Rules.AUCTION_TICKET_NUMBER` → `1`
  - `Rules.MAX_TICKETS` → `250`
  - `Rules.FINAL_STAGE_AT` → `10`
  - `Rules.DROP_SIZE_OPTIONS` → `[5, 10, 20, 25, 50]`
  - `Rules.DEFAULT_SETTINGS` → `{ dropSize: 10, finalStageAt: 10, ballMs: 800, interBallMs: 200 }`
  - `Rules.nextDrop(remaining: number, settings: {dropSize, finalStageAt}) -> number`

- [ ] **Step 1: Write the failing test**

Create `tests/rules.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Rules = require('../src/rules.js');

const S = (dropSize) => ({ dropSize, finalStageAt: Rules.FINAL_STAGE_AT });

test('nextDrop returns 1 at or below the final stage threshold', () => {
  for (let r = 1; r <= 10; r++) {
    assert.strictEqual(Rules.nextDrop(r, S(10)), 1, 'remaining ' + r);
  }
});

test('nextDrop normalises a non-multiple down to the nearest lower multiple (R3)', () => {
  assert.strictEqual(Rules.nextDrop(127, S(10)), 7);   // 127 -> 120
  assert.strictEqual(Rules.nextDrop(143, S(10)), 3);   // 143 -> 140
  assert.strictEqual(Rules.nextDrop(127, S(20)), 7);   // 127 -> 120
  assert.strictEqual(Rules.nextDrop(237, S(25)), 12);  // 237 -> 225
});

test('nextDrop takes a full drop when already on a multiple', () => {
  assert.strictEqual(Rules.nextDrop(150, S(10)), 10);
  assert.strictEqual(Rules.nextDrop(240, S(20)), 20);
  assert.strictEqual(Rules.nextDrop(250, S(50)), 50);
});

test('nextDrop never overshoots the final stage (the D1 regression)', () => {
  // Old code took 20 here and landed on 5, skipping the auction; now 25 -> 20 -> 10
  assert.strictEqual(Rules.nextDrop(25, S(20)), 5);
  assert.strictEqual(Rules.nextDrop(20, S(20)), 10);   // clamped from 20 to the excess
  assert.strictEqual(Rules.nextDrop(27, S(20)), 7);    // 27 -> 20
  assert.strictEqual(Rules.nextDrop(15, S(10)), 5);    // 15 -> 10
  assert.strictEqual(Rules.nextDrop(11, S(10)), 1);    // 11 -> 10
});

test('every count 11..250 and every drop size lands exactly on 10', () => {
  for (const dropSize of Rules.DROP_SIZE_OPTIONS) {
    for (let n = 11; n <= Rules.MAX_TICKETS; n++) {
      let r = n;
      let rounds = 0;
      while (r > Rules.FINAL_STAGE_AT) {
        const d = Rules.nextDrop(r, S(dropSize));
        assert.ok(d >= 1, 'drop must be positive at ' + r);
        r -= d;
        assert.ok(r >= Rules.FINAL_STAGE_AT,
          'overshot: n=' + n + ' dropSize=' + dropSize + ' landed on ' + r);
        assert.ok(++rounds < 300, 'did not terminate for n=' + n);
      }
      assert.strictEqual(r, Rules.FINAL_STAGE_AT,
        'n=' + n + ' dropSize=' + dropSize + ' ended on ' + r);
    }
  }
});

test('last year\'s 187-ticket count reaches the auction', () => {
  let r = 187;
  const path = [187];
  while (r > Rules.FINAL_STAGE_AT) { r -= Rules.nextDrop(r, S(10)); path.push(r); }
  assert.strictEqual(r, 10);
  assert.ok(path.includes(10), 'path was ' + path.join(' -> '));
});

test('the bulk drop never exceeds the eligible targets when ticket #1 is protected', () => {
  for (const dropSize of Rules.DROP_SIZE_OPTIONS) {
    for (let r = 11; r <= Rules.MAX_TICKETS; r++) {
      const d = Rules.nextDrop(r, S(dropSize));
      assert.ok(d <= r - 1,
        'drop ' + d + ' exceeds ' + (r - 1) + ' eligible at remaining ' + r);
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `Cannot find module '../src/rules.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/rules.js`:

```js
'use strict';

const Rules = (function () {
  const AUCTION_TICKET_NUMBER = 1;
  const MAX_TICKETS = 250;
  const FINAL_STAGE_AT = 10;
  const DROP_SIZE_OPTIONS = Object.freeze([5, 10, 20, 25, 50]);
  const DEFAULT_SETTINGS = Object.freeze({
    dropSize: 10,
    finalStageAt: FINAL_STAGE_AT,
    ballMs: 800,
    interBallMs: 200
  });

  // Drops to the nearest lower multiple of dropSize, clamped so we never overshoot finalStageAt
  function nextDrop(remaining, settings) {
    const dropSize = settings.dropSize;
    const finalStageAt = settings.finalStageAt;
    if (remaining <= finalStageAt) return 1;
    const excess = remaining - finalStageAt;
    return Math.min(remaining % dropSize || dropSize, excess);
  }

  return {
    AUCTION_TICKET_NUMBER,
    MAX_TICKETS,
    FINAL_STAGE_AT,
    DROP_SIZE_OPTIONS,
    DEFAULT_SETTINGS,
    nextDrop
  };
})();

if (typeof module !== 'undefined') module.exports = Rules;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/rules.js tests/rules.test.js
git commit -m "Add nextDrop with exhaustive schedule proof

Fixes D1: the auction stage previously never fired for ~45% of ticket
counts, including the committed 187-row template. Proven across all 1200
count/drop-size combinations."
```

---

### Task 2: Auction ticket and target selection

**Files:**
- Modify: `src/rules.js`
- Test: `tests/rules.test.js`

**Interfaces:**
- Consumes: `Rules.AUCTION_TICKET_NUMBER` from Task 1.
- Produces:
  - `Rules.isAuctionTicket(ticket: {number}) -> boolean`
  - `Rules.hasAuctionTicket(tickets: Array<{number}>) -> boolean`
  - `Rules.remainingTickets(state) -> Array<{number, name}>`
  - `Rules.eligibleTargets(state) -> Array<number>`
  - `Rules.pickTargets(candidates: Array<number>, count: number, rng?: () => number) -> Array<number>`

`state` here means any object with `tickets`, `eliminated` and `phase`.

- [ ] **Step 1: Write the failing test**

Append to `tests/rules.test.js`:

```js
function makeState(count, phase, eliminatedNumbers) {
  const tickets = [];
  for (let n = 1; n <= count; n++) tickets.push({ number: n, name: 'Player ' + n });
  return {
    tickets,
    phase: phase || 'bulk',
    eliminated: (eliminatedNumbers || []).map(n => ({ number: n, name: 'Player ' + n }))
  };
}

test('isAuctionTicket identifies ticket 1 only', () => {
  assert.strictEqual(Rules.isAuctionTicket({ number: 1 }), true);
  assert.strictEqual(Rules.isAuctionTicket({ number: 2 }), false);
  assert.strictEqual(Rules.isAuctionTicket({ number: 100 }), false);
});

test('hasAuctionTicket detects whether ticket 1 was uploaded', () => {
  assert.strictEqual(Rules.hasAuctionTicket([{ number: 1 }, { number: 2 }]), true);
  assert.strictEqual(Rules.hasAuctionTicket([{ number: 2 }, { number: 3 }]), false);
  assert.strictEqual(Rules.hasAuctionTicket([]), false);
});

test('remainingTickets excludes everyone eliminated', () => {
  const state = makeState(5, 'bulk', [2, 4]);
  assert.deepStrictEqual(Rules.remainingTickets(state).map(t => t.number), [1, 3, 5]);
});

test('eligibleTargets protects ticket 1 during the bulk stage (R7)', () => {
  const state = makeState(20, 'bulk', []);
  const targets = Rules.eligibleTargets(state);
  assert.strictEqual(targets.includes(1), false);
  assert.strictEqual(targets.length, 19);
});

test('eligibleTargets includes ticket 1 from the final stage onward', () => {
  const state = makeState(10, 'final', []);
  const targets = Rules.eligibleTargets(state);
  assert.strictEqual(targets.includes(1), true);
  assert.strictEqual(targets.length, 10);
});

test('eligibleTargets copes when ticket 1 was never uploaded', () => {
  const state = { tickets: [{ number: 5 }, { number: 6 }], phase: 'bulk', eliminated: [] };
  assert.deepStrictEqual(Rules.eligibleTargets(state), [5, 6]);
});

test('pickTargets returns the requested number of distinct candidates', () => {
  const chosen = Rules.pickTargets([1, 2, 3, 4, 5], 3);
  assert.strictEqual(chosen.length, 3);
  assert.strictEqual(new Set(chosen).size, 3);
  chosen.forEach(n => assert.ok([1, 2, 3, 4, 5].includes(n)));
});

test('pickTargets clamps to the number of candidates available', () => {
  assert.strictEqual(Rules.pickTargets([1, 2], 10).length, 2);
  assert.deepStrictEqual(Rules.pickTargets([], 5), []);
});

test('pickTargets does not mutate the candidate array', () => {
  const candidates = [1, 2, 3];
  Rules.pickTargets(candidates, 2);
  assert.deepStrictEqual(candidates, [1, 2, 3]);
});

test('pickTargets is deterministic with an injected rng', () => {
  const alwaysFirst = () => 0;
  assert.deepStrictEqual(Rules.pickTargets([7, 8, 9], 2, alwaysFirst), [7, 8]);
});

test('ticket 1 survives a full simulated bulk stage from 250, 187 and 127', () => {
  for (const count of [250, 187, 127]) {
    for (let seed = 0; seed < 40; seed++) {
      let rng = (() => { let s = seed + 1; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
      const state = makeState(count, 'bulk', []);
      const settings = { dropSize: 10, finalStageAt: Rules.FINAL_STAGE_AT };
      while (Rules.remainingTickets(state).length > Rules.FINAL_STAGE_AT) {
        const drop = Rules.nextDrop(Rules.remainingTickets(state).length, settings);
        const picked = Rules.pickTargets(Rules.eligibleTargets(state), drop, rng);
        assert.strictEqual(picked.length, drop, 'clamped unexpectedly at count ' + count);
        picked.forEach(n => state.eliminated.push({ number: n, name: 'Player ' + n }));
      }
      const survivors = Rules.remainingTickets(state).map(t => t.number);
      assert.strictEqual(survivors.length, 10);
      assert.ok(survivors.includes(1), 'ticket 1 eliminated (count ' + count + ', seed ' + seed + ')');
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `Rules.isAuctionTicket is not a function`

- [ ] **Step 3: Write minimal implementation**

In `src/rules.js`, add these functions inside the IIFE before the `return`:

```js
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

  // Ticket #1 is off limits until the final stage, which carries it through to the auction
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
```

Add to the returned object: `isAuctionTicket, hasAuctionTicket, remainingTickets, eligibleTargets, pickTargets`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS, 18 tests in this file

- [ ] **Step 5: Commit**

```bash
git add src/rules.js tests/rules.test.js
git commit -m "Add auction-ticket rule and target selection

Fixes D8: ticket #1 is stated once as AUCTION_TICKET_NUMBER instead of a
bare \"1\" in four places. Targets are derived from state, never queried
from the DOM."
```

---

### Task 3: Phase transitions

**Files:**
- Modify: `src/rules.js`
- Test: `tests/rules.test.js`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: `Rules.nextPhase(current: string, remaining: number, opts: {finalStageAt, hasAuctionTicket, auctionResolved}) -> string`
  Return values: `'awaiting-csv' | 'bulk' | 'auction' | 'final' | 'won'`

- [ ] **Step 1: Write the failing test**

Append to `tests/rules.test.js`:

```js
const O = (over) => Object.assign(
  { finalStageAt: 10, hasAuctionTicket: true, auctionResolved: false }, over || {}
);

test('loading more than the final stage starts the bulk stage', () => {
  assert.strictEqual(Rules.nextPhase('awaiting-csv', 187, O()), 'bulk');
  assert.strictEqual(Rules.nextPhase('awaiting-csv', 11, O()), 'bulk');
});

test('loading at or below the final stage skips straight to final', () => {
  assert.strictEqual(Rules.nextPhase('awaiting-csv', 10, O()), 'final');
  assert.strictEqual(Rules.nextPhase('awaiting-csv', 5, O()), 'final');
});

test('loading a single ticket is won immediately, with no ball bowled', () => {
  assert.strictEqual(Rules.nextPhase('awaiting-csv', 1, O()), 'won');
});

test('loading nothing stays in awaiting-csv', () => {
  assert.strictEqual(Rules.nextPhase('awaiting-csv', 0, O()), 'awaiting-csv');
});

test('bulk continues while above the final stage', () => {
  assert.strictEqual(Rules.nextPhase('bulk', 20, O()), 'bulk');
  assert.strictEqual(Rules.nextPhase('bulk', 11, O()), 'bulk');
});

test('bulk reaching the final stage goes to auction when ticket 1 exists', () => {
  assert.strictEqual(Rules.nextPhase('bulk', 10, O()), 'auction');
});

test('bulk reaching the final stage skips auction when ticket 1 was never uploaded', () => {
  assert.strictEqual(Rules.nextPhase('bulk', 10, O({ hasAuctionTicket: false })), 'final');
});

test('auction holds until resolved, then goes to final', () => {
  assert.strictEqual(Rules.nextPhase('auction', 10, O()), 'auction');
  assert.strictEqual(Rules.nextPhase('auction', 10, O({ auctionResolved: true })), 'final');
});

test('final becomes won at one remaining', () => {
  assert.strictEqual(Rules.nextPhase('final', 2, O({ auctionResolved: true })), 'final');
  assert.strictEqual(Rules.nextPhase('final', 1, O({ auctionResolved: true })), 'won');
});

test('won is terminal', () => {
  assert.strictEqual(Rules.nextPhase('won', 1, O({ auctionResolved: true })), 'won');
});

test('a full run from 187 visits bulk, auction, final and won in order', () => {
  const settings = { dropSize: 10, finalStageAt: 10 };
  const seen = [];
  let phase = 'awaiting-csv';
  let remaining = 187;
  let auctionResolved = false;

  phase = Rules.nextPhase(phase, remaining, O({ auctionResolved }));
  seen.push(phase);

  for (let guard = 0; guard < 400 && phase !== 'won'; guard++) {
    if (phase === 'auction') { auctionResolved = true; }
    else { remaining -= Rules.nextDrop(remaining, settings); }
    const next = Rules.nextPhase(phase, remaining, O({ auctionResolved }));
    if (next !== phase) seen.push(next);
    phase = next;
  }

  assert.deepStrictEqual(seen, ['bulk', 'auction', 'final', 'won']);
  assert.strictEqual(remaining, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `Rules.nextPhase is not a function`

- [ ] **Step 3: Write minimal implementation**

In `src/rules.js`, add inside the IIFE:

```js
  // The only place a phase is decided; evaluated at round boundaries and on load, never mid-round
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
```

Add `nextPhase` to the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS, 29 tests in this file

- [ ] **Step 5: Commit**

```bash
git add src/rules.js tests/rules.test.js
git commit -m "Add phase transitions as the single decision point

Fixes D9. Covers the small-draw and single-ticket edge cases the original
had no defined behaviour for."
```

---

### Task 4: CSV parsing

**Files:**
- Create: `src/csv.js`
- Create: `tests/csv.test.js`
- Create: `tests/fixtures/last-year.csv` (copy of `template.csv`)
- Create: `tests/fixtures/spreadsheet-quirks.csv` (generated, see Step 1)

**Interfaces:**
- Consumes: nothing (deliberately independent of `Rules`, so it stays purely about parsing).
- Produces: `Csv.parse(text: string) -> { ok: boolean, error: string|null, tickets: Array<{number, name}>, summary: {total, skipped, warnings: string[]} | null }`

Note: `Csv.parse` does **not** decide anything about the auction ticket. Whether ticket #1 is present is asked later via `Rules.hasAuctionTicket(tickets)`.

- [ ] **Step 1: Create the fixtures**

```bash
mkdir -p tests/fixtures
cp template.csv tests/fixtures/last-year.csv
```

Then generate the quirks fixture, which needs a BOM and CRLF that an editor would silently normalise away:

```bash
node -e '
const fs = require("fs");
const rows = [
  ["Name", "Number"],
  ["Kyle Mitchell", "2"],
  ["Hudson, Richard", "58"],
  ["Gill & John (Katie)", "36"],
  ["He said \"nice shot\"", "77"],
  ["", ""],
  ["   ", "  "],
  ["Auction", "1"]
];
const esc = (v) => /[",]/.test(v) ? "\"" + v.replace(/"/g, "\"\"") + "\"" : v;
const body = rows.map(r => r.map(esc).join(",")).join("\r\n") + "\r\n";
fs.writeFileSync("tests/fixtures/spreadsheet-quirks.csv", "﻿" + body, "utf8");
console.log(JSON.stringify(fs.readFileSync("tests/fixtures/spreadsheet-quirks.csv","utf8").slice(0,40)));
'
```

Expected output starts with `"﻿Name,Number\r\n"`, confirming the BOM and CRLF survived.

- [ ] **Step 2: Write the failing test**

Create `tests/csv.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Csv = require('../src/csv.js');

const fixture = (name) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

test('parses the plain Name,Number format', () => {
  const r = Csv.parse('Kyle Mitchell,2\nAdam Young,3\n');
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.tickets, [
    { number: 2, name: 'Kyle Mitchell' },
    { number: 3, name: 'Adam Young' }
  ]);
});

test('strips a UTF-8 BOM so the first name is not corrupted', () => {
  const r = Csv.parse('﻿Kyle Mitchell,2\n');
  assert.strictEqual(r.tickets[0].name, 'Kyle Mitchell');
});

test('handles CRLF and bare CR line endings', () => {
  assert.strictEqual(Csv.parse('A,1\r\nB,2\r\n').tickets.length, 2);
  assert.strictEqual(Csv.parse('A,1\rB,2\r').tickets.length, 2);
});

test('handles a quoted field containing a comma', () => {
  const r = Csv.parse('"Hudson, Richard",58\n');
  assert.deepStrictEqual(r.tickets, [{ number: 58, name: 'Hudson, Richard' }]);
});

test('handles escaped double quotes inside a quoted field', () => {
  const r = Csv.parse('"He said ""nice shot""",77\n');
  assert.strictEqual(r.tickets[0].name, 'He said "nice shot"');
});

test('skips a header row when present', () => {
  const r = Csv.parse('Name,Number\nKyle Mitchell,2\n');
  assert.strictEqual(r.tickets.length, 1);
  assert.strictEqual(r.tickets[0].name, 'Kyle Mitchell');
});

test('does not skip a first row that is a real player', () => {
  const r = Csv.parse('Kyle Mitchell,2\nAdam Young,3\n');
  assert.strictEqual(r.tickets.length, 2);
});

test('skips blank and whitespace-only rows without counting them as errors', () => {
  const r = Csv.parse('A,1\n\n   ,  \nB,2\n\n');
  assert.strictEqual(r.tickets.length, 2);
  assert.strictEqual(r.summary.skipped, 0);
});

test('trims surrounding whitespace from both fields', () => {
  const r = Csv.parse('  Kyle Mitchell  ,  2  \n');
  assert.deepStrictEqual(r.tickets, [{ number: 2, name: 'Kyle Mitchell' }]);
});

test('skips and counts rows with an unusable number', () => {
  const r = Csv.parse('A,1\nB,abc\nC,-4\nD,2.5\nE,\nF,3\n');
  assert.deepStrictEqual(r.tickets.map(t => t.number), [1, 3]);
  assert.strictEqual(r.summary.skipped, 4);
});

test('skips and counts rows with no name', () => {
  const r = Csv.parse('A,1\n,2\nC,3\n');
  assert.deepStrictEqual(r.tickets.map(t => t.number), [1, 3]);
  assert.strictEqual(r.summary.skipped, 1);
});

test('keeps duplicate ticket numbers but warns about them', () => {
  const r = Csv.parse('A,1\nB,1\n');
  assert.strictEqual(r.tickets.length, 2);
  assert.strictEqual(r.summary.warnings.length, 1);
  assert.match(r.summary.warnings[0], /#1/);
});

test('does not warn about duplicate names, which are expected', () => {
  const r = Csv.parse('Matt Coles,1\nMatt Coles,2\nMatt Coles,3\n');
  assert.strictEqual(r.tickets.length, 3);
  assert.deepStrictEqual(r.summary.warnings, []);
});

test('rejects a file with no usable rows', () => {
  const r = Csv.parse('\n\n,\n');
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /no valid tickets/i);
  assert.deepStrictEqual(r.tickets, []);
});

test('rejects a file over the 250 ticket ceiling without loading any of it', () => {
  let text = '';
  for (let n = 1; n <= 251; n++) text += 'Player ' + n + ',' + n + '\n';
  const r = Csv.parse(text);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /251/);
  assert.match(r.error, /250/);
  assert.deepStrictEqual(r.tickets, []);
});

test('accepts exactly 250 tickets', () => {
  let text = '';
  for (let n = 1; n <= 250; n++) text += 'Player ' + n + ',' + n + '\n';
  const r = Csv.parse(text);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.tickets.length, 250);
});

test('last year\'s template parses to 187 tickets including ticket 1', () => {
  const r = Csv.parse(fixture('last-year.csv'));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.tickets.length, 187);
  assert.strictEqual(r.summary.skipped, 0);
  assert.ok(r.tickets.some(t => t.number === 1), 'ticket #1 must be present');
});

test('a spreadsheet export with every quirk at once parses correctly', () => {
  const r = Csv.parse(fixture('spreadsheet-quirks.csv'));
  assert.strictEqual(r.ok, true);
  const byNumber = new Map(r.tickets.map(t => [t.number, t.name]));
  assert.strictEqual(byNumber.get(2), 'Kyle Mitchell');
  assert.strictEqual(byNumber.get(58), 'Hudson, Richard');
  assert.strictEqual(byNumber.get(36), 'Gill & John (Katie)');
  assert.strictEqual(byNumber.get(77), 'He said "nice shot"');
  assert.strictEqual(byNumber.get(1), 'Auction');
  assert.strictEqual(r.tickets.length, 5);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `Cannot find module '../src/csv.js'`

- [ ] **Step 4: Write minimal implementation**

Create `src/csv.js`:

```js
'use strict';

const Csv = (function () {
  const MAX_TICKETS = 250;

  // RFC 4180 parser: spreadsheets quote fields containing commas and double up embedded quotes
  function parseRows(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch !== '"') { field += ch; continue; }
        if (text[i + 1] === '"') { field += '"'; i++; continue; }
        inQuotes = false;
        continue;
      }
      // A quote opens a quoted field only at field start, so a stray mid-field quote stays literal
      if (ch === '"' && field.trim() === '') { inQuotes = true; continue; }
      if (ch === ',') { row.push(field); field = ''; continue; }
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
      field += ch;
    }
    row.push(field);
    rows.push(row);
    return rows;
  }

  function parse(text) {
    const normalised = String(text == null ? '' : text)
      .replace(/^﻿/, '')      // Excel's UTF-8 BOM
      .replace(/\r\n?/g, '\n');    // CRLF and bare CR

    let rows = parseRows(normalised)
      .map(cells => cells.map(cell => cell.trim()))
      .filter(cells => cells.some(cell => cell !== ''));

    // A data row always has a positive integer in the number cell; a header does not
    if (rows.length && !/^\d+$/.test(rows[0][1] || '')) rows = rows.slice(1);

    const tickets = [];
    const warnings = [];
    const seen = new Set();
    let skipped = 0;

    for (const cells of rows) {
      const name = cells[0] || '';
      const raw = cells[1] || '';
      if (!name || !/^\d+$/.test(raw)) { skipped++; continue; }
      const number = Number(raw);
      if (!Number.isInteger(number) || number < 1) { skipped++; continue; }
      if (seen.has(number)) warnings.push('Ticket #' + number + ' appears more than once.');
      seen.add(number);
      tickets.push({ number: number, name: name });
    }

    if (!tickets.length) {
      return { ok: false, error: 'No valid tickets found in that file.', tickets: [], summary: null };
    }
    if (tickets.length > MAX_TICKETS) {
      return {
        ok: false,
        error: 'That file has ' + tickets.length + ' tickets. The maximum is ' + MAX_TICKETS + '.',
        tickets: [],
        summary: null
      };
    }

    return {
      ok: true,
      error: null,
      tickets: tickets,
      summary: { total: tickets.length, skipped: skipped, warnings: warnings }
    };
  }

  return { MAX_TICKETS, parse };
})();

if (typeof module !== 'undefined') module.exports = Csv;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test`
Expected: PASS, 21 tests in this file (2 added during review for the mid-field-quote and leading-whitespace defects)

- [ ] **Step 6: Commit**

```bash
git add src/csv.js tests/csv.test.js tests/fixtures/
git commit -m "Add spreadsheet-tolerant CSV parsing

Fixes D6: BOM, CRLF, quoted commas and escaped quotes all previously
corrupted or silently dropped rows. Pinned against last year's 187-row
template and a fixture carrying every quirk at once."
```

---

### Task 5: Dismissal messages

**Files:**
- Create: `src/dismissals.js`
- Create: `tests/dismissals.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `Dismissals.REGULAR` → frozen array of strings
  - `Dismissals.FINAL` → frozen array of strings
  - `Dismissals.pick(stage: 'bulk'|'final', used: string[], rng?: () => number) -> string`

- [ ] **Step 1: Write the failing test**

Create `tests/dismissals.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Dismissals = require('../src/dismissals.js');

test('bulk dismissals come from the regular pool and may repeat', () => {
  const msg = Dismissals.pick('bulk', [], () => 0);
  assert.ok(Dismissals.REGULAR.includes(msg));
});

test('final dismissals come from the final pool', () => {
  const msg = Dismissals.pick('final', [], () => 0);
  assert.ok(Dismissals.FINAL.includes(msg));
});

test('final dismissals are not reused while unused ones remain', () => {
  const used = Dismissals.FINAL.slice(0, Dismissals.FINAL.length - 1);
  const msg = Dismissals.pick('final', used, () => 0);
  assert.strictEqual(msg, Dismissals.FINAL[Dismissals.FINAL.length - 1]);
});

test('final pool refills once every message has been used', () => {
  const used = Dismissals.FINAL.slice();
  const msg = Dismissals.pick('final', used, () => 0);
  assert.ok(Dismissals.FINAL.includes(msg));
});

test('drawing the whole final pool yields every message exactly once', () => {
  const used = [];
  for (let i = 0; i < Dismissals.FINAL.length; i++) {
    used.push(Dismissals.pick('final', used, () => 0));
  }
  assert.strictEqual(new Set(used).size, Dismissals.FINAL.length);
});

test('the pools are non-empty and immutable', () => {
  assert.ok(Dismissals.REGULAR.length > 0);
  assert.ok(Dismissals.FINAL.length > 0);
  assert.throws(() => Dismissals.REGULAR.push('x'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `Cannot find module '../src/dismissals.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/dismissals.js`. The message text is carried over verbatim from `app.js:164-188`:

```js
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

  // Regular messages repeat freely; final-stage messages are consumed so each is heard once
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS, 6 tests in this file

- [ ] **Step 5: Commit**

```bash
git add src/dismissals.js tests/dismissals.test.js
git commit -m "Extract dismissal message pools as a pure module

Final-stage messages are now consumed from state rather than a module-level
array, so a resumed draw does not repeat one."
```

---

### Task 6: The store

**Files:**
- Create: `src/state.js`
- Create: `tests/state.test.js`

**Interfaces:**
- Consumes: `Rules` (Tasks 1–3), `Dismissals` (Task 5).
- Produces:
  - `Store.SCHEMA_VERSION` → `1`
  - `Store.get() -> state`
  - `Store.subscribe(fn: (state) => void) -> void`
  - `Store.reset() -> void`
  - `Store.loadTickets(tickets, summary) -> void`
  - `Store.remaining() -> number`
  - `Store.remainingTickets() -> Array<{number, name}>`
  - `Store.wicketsThisStage() -> number`
  - `Store.stageTotal() -> number`
  - `Store.nextDrop() -> number`
  - `Store.winner() -> {number, name} | null`
  - `Store.setDropSize(n: number) -> void`
  - `Store.beginRound(targets: number[]) -> void`
  - `Store.eliminate(number: number) -> void`
  - `Store.endRound() -> void`
  - `Store.resolveAuction(name: string) -> void`
  - `Store.skipAuction() -> void`
  - `Store.hydrate(saved: object) -> boolean`

`Store.eliminate` chooses the dismissal message itself via `Dismissals.pick`, using the current phase as the stage, and records it on the elimination entry.

- [ ] **Step 1: Write the failing test**

Create `tests/state.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Rules = require('../src/rules.js');
const Store = require('../src/state.js');

function ticketsFor(count) {
  const out = [];
  for (let n = 1; n <= count; n++) out.push({ number: n, name: 'Player ' + n });
  return out;
}
function summaryFor(count) {
  return { total: count, skipped: 0, warnings: [] };
}
function load(count) {
  Store.reset();
  Store.loadTickets(ticketsFor(count), summaryFor(count));
}

test('a fresh store awaits a CSV', () => {
  Store.reset();
  assert.strictEqual(Store.get().phase, 'awaiting-csv');
  assert.strictEqual(Store.remaining(), 0);
  assert.strictEqual(Store.winner(), null);
});

test('loading tickets enters the bulk stage and sets the counts', () => {
  load(187);
  assert.strictEqual(Store.get().phase, 'bulk');
  assert.strictEqual(Store.remaining(), 187);
  assert.strictEqual(Store.stageTotal(), 187);
  assert.strictEqual(Store.wicketsThisStage(), 0);
});

test('nextDrop reflects the configured drop size', () => {
  load(127);
  assert.strictEqual(Store.nextDrop(), 7);
  Store.setDropSize(20);
  assert.strictEqual(Store.nextDrop(), 7);
  load(120);
  Store.setDropSize(20);
  assert.strictEqual(Store.nextDrop(), 20);
});

test('setDropSize rejects a value outside the allowed options', () => {
  load(100);
  Store.setDropSize(7);
  assert.strictEqual(Store.get().settings.dropSize, 10);
  Store.setDropSize(25);
  assert.strictEqual(Store.get().settings.dropSize, 25);
});

test('eliminate records the ticket, a dismissal and the stage', () => {
  load(20);
  Store.beginRound([5]);
  Store.eliminate(5);
  const entry = Store.get().eliminated[0];
  assert.strictEqual(entry.number, 5);
  assert.strictEqual(entry.name, 'Player 5');
  assert.strictEqual(entry.stage, 'bulk');
  assert.strictEqual(typeof entry.dismissal, 'string');
  assert.ok(entry.dismissal.length > 0);
  assert.strictEqual(Store.remaining(), 19);
  assert.strictEqual(Store.wicketsThisStage(), 1);
});

test('eliminate advances the in-flight round counter', () => {
  load(20);
  Store.beginRound([5, 6, 7]);
  assert.strictEqual(Store.get().round.thrown, 0);
  Store.eliminate(5);
  assert.strictEqual(Store.get().round.thrown, 1);
});

test('eliminating an already-eliminated ticket is ignored', () => {
  load(20);
  Store.beginRound([5]);
  Store.eliminate(5);
  Store.eliminate(5);
  assert.strictEqual(Store.get().eliminated.length, 1);
});

test('endRound clears the round and moves bulk to auction at the final stage', () => {
  load(11);
  Store.beginRound([2]);
  Store.eliminate(2);
  Store.endRound();
  assert.strictEqual(Store.get().round, null);
  assert.strictEqual(Store.get().phase, 'auction');
});

test('endRound skips the auction when ticket 1 was never uploaded', () => {
  Store.reset();
  const tickets = ticketsFor(11).filter(t => t.number !== 1);
  tickets.push({ number: 999, name: 'Extra' });
  Store.loadTickets(tickets, summaryFor(tickets.length));
  Store.beginRound([2]);
  Store.eliminate(2);
  Store.endRound();
  assert.strictEqual(Store.get().phase, 'final');
});

test('resolveAuction renames ticket 1 and advances to final', () => {
  load(11);
  Store.beginRound([2]);
  Store.eliminate(2);
  Store.endRound();
  Store.resolveAuction('  Dave Harker  ');
  assert.strictEqual(Store.get().phase, 'final');
  assert.strictEqual(Store.get().auctionResolved, true);
  const one = Store.get().tickets.find(t => t.number === 1);
  assert.strictEqual(one.name, 'Dave Harker');
});

test('skipAuction advances without renaming ticket 1', () => {
  load(11);
  Store.beginRound([2]);
  Store.eliminate(2);
  Store.endRound();
  Store.skipAuction();
  assert.strictEqual(Store.get().phase, 'final');
  assert.strictEqual(Store.get().tickets.find(t => t.number === 1).name, 'Player 1');
});

test('the final stage counts wickets and total from the stage, not the whole draw', () => {
  load(11);
  Store.beginRound([2]); Store.eliminate(2); Store.endRound();
  Store.skipAuction();
  assert.strictEqual(Store.wicketsThisStage(), 0);
  assert.strictEqual(Store.stageTotal(), 10);
  Store.beginRound([3]); Store.eliminate(3); Store.endRound();
  assert.strictEqual(Store.wicketsThisStage(), 1);
});

test('stageTotal never claims 10 for a draw smaller than that', () => {
  load(6);
  assert.strictEqual(Store.get().phase, 'final');
  assert.strictEqual(Store.stageTotal(), 6);
});

test('a single-ticket draw is won on load', () => {
  load(1);
  assert.strictEqual(Store.get().phase, 'won');
  assert.deepStrictEqual(Store.winner(), { number: 1, name: 'Player 1' });
});

test('the last survivor becomes the winner', () => {
  load(3);
  Store.beginRound([2]); Store.eliminate(2); Store.endRound();
  Store.beginRound([3]); Store.eliminate(3); Store.endRound();
  assert.strictEqual(Store.get().phase, 'won');
  assert.deepStrictEqual(Store.winner(), { number: 1, name: 'Player 1' });
});

test('final-stage dismissals are recorded so they are not repeated', () => {
  load(12);
  Store.beginRound([2]); Store.eliminate(2); Store.endRound();
  Store.skipAuction();
  Store.beginRound([3]); Store.eliminate(3); Store.endRound();
  assert.strictEqual(Store.get().usedFinalDismissals.length, 1);
});

test('subscribers are notified on every mutation', () => {
  Store.reset();
  let calls = 0;
  Store.subscribe(() => { calls++; });
  load(20);
  const afterLoad = calls;
  assert.ok(afterLoad > 0);
  Store.beginRound([5]);
  Store.eliminate(5);
  assert.ok(calls > afterLoad);
});

test('loading a new CSV clears all prior progress', () => {
  load(20);
  Store.beginRound([5]); Store.eliminate(5); Store.endRound();
  load(30);
  const s = Store.get();
  assert.deepStrictEqual(s.eliminated, []);
  assert.strictEqual(s.round, null);
  assert.strictEqual(s.auctionResolved, false);
  assert.deepStrictEqual(s.usedFinalDismissals, []);
  assert.strictEqual(s.phase, 'bulk');
  assert.strictEqual(Store.remaining(), 30);
});

test('hydrate restores a saved state', () => {
  load(20);
  Store.beginRound([5]); Store.eliminate(5); Store.endRound();
  const saved = JSON.parse(JSON.stringify(Store.get()));
  Store.reset();
  assert.strictEqual(Store.hydrate(saved), true);
  assert.strictEqual(Store.remaining(), 19);
  assert.strictEqual(Store.get().eliminated.length, 1);
});

test('hydrate discards a save from a different schema version', () => {
  load(20);
  const saved = JSON.parse(JSON.stringify(Store.get()));
  saved.schemaVersion = 99;
  Store.reset();
  assert.strictEqual(Store.hydrate(saved), false);
  assert.strictEqual(Store.get().phase, 'awaiting-csv');
});

test('hydrate discards an interrupted round but keeps the eliminations', () => {
  load(20);
  Store.beginRound([5, 6, 7]);
  Store.eliminate(5);
  const saved = JSON.parse(JSON.stringify(Store.get()));
  assert.notStrictEqual(saved.round, null);
  Store.reset();
  Store.hydrate(saved);
  assert.strictEqual(Store.get().round, null);
  assert.strictEqual(Store.remaining(), 19);
});

test('hydrate rejects junk', () => {
  Store.reset();
  assert.strictEqual(Store.hydrate(null), false);
  assert.strictEqual(Store.hydrate({}), false);
  assert.strictEqual(Store.hydrate({ schemaVersion: 1 }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `Cannot find module '../src/state.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/state.js`:

```js
'use strict';

const Store = (function () {
  const SCHEMA_VERSION = 1;

  const RulesRef = typeof require !== 'undefined' ? require('./rules.js') : Rules;
  const DismissalsRef = typeof require !== 'undefined' ? require('./dismissals.js') : Dismissals;

  let state = blank();
  const listeners = [];

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
      loadSummary: null
    };
  }

  function get() { return state; }
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

  function reset() { state = blank(); emit(); }

  function loadTickets(tickets, summary) {
    state = blank();
    state.tickets = tickets.map(t => ({ number: t.number, name: t.name }));
    state.loadSummary = summary;
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

  function endRound() {
    state.round = null;
    advancePhase();
    emit();
  }

  function resolveAuction(name) {
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
      loadSummary: saved.loadSummary || null
    };
    emit();
    return true;
  }

  return {
    SCHEMA_VERSION,
    get, subscribe, reset,
    loadTickets, setDropSize,
    beginRound, eliminate, endRound,
    resolveAuction, skipAuction, hydrate,
    remaining, remainingTickets, wicketsThisStage, stageTotal, nextDrop, winner
  };
})();

if (typeof module !== 'undefined') module.exports = Store;
```

Note the `typeof require !== 'undefined' ? require(...) : Rules` pattern. In the browser there is no `require`, so it uses the global `Rules` established by the earlier `<script>` tag. Under `node --test` it requires the file directly. This is the one place the dual-environment pattern needs care.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS, 15 tests in this file (1 added during review for the toJson throw path)

- [ ] **Step 5: Commit**

```bash
git add src/state.js tests/state.test.js
git commit -m "Add the store as the single source of truth

The DOM no longer holds game state. remaining, wickets, stage totals,
nextDrop and winner are all derived, which is what stopped the button and
the banner disagreeing (D9)."
```

---

### Task 7: Persistence and recovery

**Files:**
- Create: `src/persistence.js`
- Create: `tests/persistence.test.js`

**Interfaces:**
- Consumes: nothing. This module is deliberately standalone — it serialises whatever object it is handed and never imports `Rules` or `Store`, which is what lets it be built and tested independently.
- Produces:
  - `Persistence.KEY` → `'swcc-raffle:v1'`
  - `Persistence.isAvailable(storage?) -> boolean`
  - `Persistence.save(state, storage?) -> boolean`
  - `Persistence.load(storage?) -> object | null`
  - `Persistence.clear(storage?) -> void`
  - `Persistence.isResumable(saved) -> boolean`
  - `Persistence.toJson(state) -> string`
  - `Persistence.fromJson(text) -> object | null`

Every function takes an optional `storage` argument defaulting to `window.localStorage`, so tests inject a fake and never touch a real browser store.

- [ ] **Step 1: Write the failing test**

Create `tests/persistence.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Persistence = require('../src/persistence.js');

function fakeStorage(opts) {
  const failWrites = opts && opts.failWrites;
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => {
      if (failWrites) throw new Error('QuotaExceededError');
      data.set(k, String(v));
    },
    removeItem: (k) => { data.delete(k); },
    _data: data
  };
}

const sampleState = () => ({
  schemaVersion: 1,
  tickets: [{ number: 1, name: 'Auction' }, { number: 2, name: 'Kyle Mitchell' }],
  eliminated: [{ number: 2, name: 'Kyle Mitchell', dismissal: 'Bowled!', stage: 'bulk', at: 1 }],
  phase: 'bulk',
  settings: { dropSize: 10, finalStageAt: 10, ballMs: 800, interBallMs: 200 },
  round: null,
  usedFinalDismissals: [],
  auctionResolved: false,
  loadSummary: { total: 2, skipped: 0, warnings: [] }
});

test('isAvailable is true for a working storage', () => {
  assert.strictEqual(Persistence.isAvailable(fakeStorage()), true);
});

test('isAvailable is false when writes throw, and leaves no probe behind', () => {
  const s = fakeStorage({ failWrites: true });
  assert.strictEqual(Persistence.isAvailable(s), false);
  assert.strictEqual(s._data.size, 0);
});

test('isAvailable is false when there is no storage at all', () => {
  assert.strictEqual(Persistence.isAvailable(null), false);
  assert.strictEqual(Persistence.isAvailable(undefined), false);
});

test('the availability probe cleans up after itself', () => {
  const s = fakeStorage();
  Persistence.isAvailable(s);
  assert.strictEqual(s._data.size, 0);
});

test('save then load round-trips the state exactly', () => {
  const s = fakeStorage();
  const state = sampleState();
  assert.strictEqual(Persistence.save(state, s), true);
  assert.deepStrictEqual(Persistence.load(s), state);
});

test('save reports failure instead of throwing when storage is unavailable', () => {
  assert.strictEqual(Persistence.save(sampleState(), fakeStorage({ failWrites: true })), false);
  assert.strictEqual(Persistence.save(sampleState(), null), false);
});

test('load returns null when nothing is stored', () => {
  assert.strictEqual(Persistence.load(fakeStorage()), null);
  assert.strictEqual(Persistence.load(null), null);
});

test('load returns null for corrupt JSON rather than throwing', () => {
  const s = fakeStorage();
  s.setItem(Persistence.KEY, '{not json');
  assert.strictEqual(Persistence.load(s), null);
});

test('clear removes the saved draw', () => {
  const s = fakeStorage();
  Persistence.save(sampleState(), s);
  Persistence.clear(s);
  assert.strictEqual(Persistence.load(s), null);
});

test('a draw in progress is resumable', () => {
  assert.strictEqual(Persistence.isResumable(sampleState()), true);
});

test('an unstarted or finished draw is not resumable', () => {
  const awaiting = Object.assign(sampleState(), { phase: 'awaiting-csv', eliminated: [] });
  assert.strictEqual(Persistence.isResumable(awaiting), false);

  const won = Object.assign(sampleState(), { phase: 'won' });
  assert.strictEqual(Persistence.isResumable(won), false);

  assert.strictEqual(Persistence.isResumable(null), false);
});

test('a loaded draw with no eliminations yet is still resumable', () => {
  const fresh = Object.assign(sampleState(), { eliminated: [] });
  assert.strictEqual(Persistence.isResumable(fresh), true);
});

test('toJson and fromJson round-trip for the manual export fallback', () => {
  const state = sampleState();
  const text = Persistence.toJson(state);
  assert.strictEqual(typeof text, 'string');
  assert.deepStrictEqual(Persistence.fromJson(text), state);
});

test('fromJson returns null for junk instead of throwing', () => {
  assert.strictEqual(Persistence.fromJson('not json'), null);
  assert.strictEqual(Persistence.fromJson(''), null);
  assert.strictEqual(Persistence.fromJson('[1,2,3]'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `Cannot find module '../src/persistence.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/persistence.js`:

```js
'use strict';

const Persistence = (function () {
  const KEY = 'swcc-raffle:v1';
  const PROBE = KEY + ':probe';

  function defaultStorage() {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null;
    } catch (e) {
      return null;   // some browsers throw on the property access itself
    }
  }

  function pick(storage) {
    return storage === undefined ? defaultStorage() : storage;
  }

  // localStorage is not guaranteed on a file:// origin, so probe for real rather than assuming
  function isAvailable(storage) {
    const s = pick(storage);
    if (!s) return false;
    try {
      s.setItem(PROBE, '1');
      const ok = s.getItem(PROBE) === '1';
      s.removeItem(PROBE);
      return ok;
    } catch (e) {
      try { s.removeItem(PROBE); } catch (ignored) {}
      return false;
    }
  }

  function save(state, storage) {
    const s = pick(storage);
    if (!s) return false;
    try {
      s.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  function load(storage) {
    const s = pick(storage);
    if (!s) return null;
    try {
      const raw = s.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function clear(storage) {
    const s = pick(storage);
    if (!s) return;
    try { s.removeItem(KEY); } catch (e) {}
  }

  function isResumable(saved) {
    if (!saved || typeof saved !== 'object') return false;
    if (!Array.isArray(saved.tickets) || !saved.tickets.length) return false;
    return saved.phase !== 'awaiting-csv' && saved.phase !== 'won';
  }

  function toJson(state) { return JSON.stringify(state, null, 2); }

  function fromJson(text) {
    try {
      const parsed = JSON.parse(text);
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  return { KEY, isAvailable, save, load, clear, isResumable, toJson, fromJson };
})();

if (typeof module !== 'undefined') module.exports = Persistence;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS, 22 tests in this file; whole suite 93

- [ ] **Step 5: Commit**

```bash
git add src/persistence.js tests/persistence.test.js
git commit -m "Add persistence with mandatory availability probing

Fixes D2 and delivers R1. localStorage is not guaranteed on file://, so
availability is probed rather than assumed, and every path degrades to a
return value instead of an exception."
```

---

### Task 8: Markup and styles

**The switch-over begins here. The app is non-functional until Task 12.**

**Files:**
- Modify: `index.html` (full rewrite)
- Create: `styles/base.css`, `styles/board.css`, `styles/scoreboard.css`, `styles/overlays.css`
- Delete at Task 13: `style.css`

**Interfaces:**
- Produces the DOM contract every later task depends on. Element ids, exactly:
  `logo`, `csv-upload`, `upload-btn`, `template-link`, `export-btn`, `import-input`, `import-btn`, `reset-btn`, `drop-size`, `throw`, `board`, `upload-message`, `load-summary`, `storage-warning`, `resume-prompt`, `resume-text`, `resume-yes`, `resume-no`, `wicket-count`, `total-count`, `remaining-count`, `scoreboard-content`, `ball`, `overlays`.
- The markup already includes the `<script>` tag for `src/auction.js` (Task 11), so no later task edits `index.html`.

- [ ] **Step 1: Write the new markup**

Replace `index.html` entirely:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>South Wingfield Cricket Club Raffle</title>
  <link rel="stylesheet" href="styles/base.css">
  <link rel="stylesheet" href="styles/board.css">
  <link rel="stylesheet" href="styles/scoreboard.css">
  <link rel="stylesheet" href="styles/overlays.css">
</head>
<body>
  <main class="main-content">
    <header class="topbar">
      <img class="logo" id="logo" src="./images/logo.png" alt="SWCC">
      <h1>&#127951; SWCC REVERSE RAFFLE DRAW &#127951;</h1>
      <div class="controls">
        <input type="file" id="csv-upload" accept=".csv" hidden>
        <input type="file" id="import-input" accept=".json" hidden>
        <button id="upload-btn" type="button">&#128194; Upload CSV</button>
        <a href="./template.csv" download="template.csv" id="template-link" class="btn">&#128229; Template</a>
        <button id="export-btn" type="button">&#128190; Export progress</button>
        <button id="import-btn" type="button">&#128193; Import progress</button>
        <button id="reset-btn" type="button">&#9888; Reset draw</button>
      </div>
    </header>

    <div class="bowl-row">
      <label for="drop-size">Knock out per ball</label>
      <select id="drop-size"></select>
      <button id="throw" class="bowlbutton" type="button" disabled>Bowl Ball</button>
    </div>

    <div id="storage-warning" class="banner banner--warning" hidden></div>
    <div id="load-summary" class="banner" hidden></div>

    <div id="resume-prompt" class="banner banner--resume" hidden>
      <span id="resume-text"></span>
      <button id="resume-yes" type="button">Resume</button>
      <button id="resume-no" type="button">Start fresh</button>
    </div>

    <section id="upload-message" class="upload-message">
      <h2>&#127951; Welcome to the SWCC Reverse Raffle Draw! &#127951;</h2>
      <p>To get started:</p>
      <ol>
        <li>&#128229; <strong>Download the template</strong> (top right)</li>
        <li>&#9999;&#65039; <strong>Add your players</strong> (Name, Number)</li>
        <li>&#128194; <strong>Upload your CSV</strong> to begin the draw!</li>
      </ol>
    </section>

    <div class="board" id="board"></div>
    <div class="ball" id="ball"></div>
  </main>

  <aside class="scoreboard">
    <div class="scoreboard-header">SCOREBOARD</div>
    <div class="scoreboard-stats">
      <div>WICKETS: <span id="wicket-count">0</span>/<span id="total-count">0</span></div>
      <div>REMAINING: <span id="remaining-count">0</span></div>
    </div>
    <div class="scoreboard-content" id="scoreboard-content"></div>
  </aside>

  <div id="overlays"></div>

  <script src="src/rules.js"></script>
  <script src="src/csv.js"></script>
  <script src="src/dismissals.js"></script>
  <script src="src/state.js"></script>
  <script src="src/persistence.js"></script>
  <script src="src/audio.js"></script>
  <script src="src/animation.js"></script>
  <script src="src/render.js"></script>
  <script src="src/auction.js"></script>
  <script src="src/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `styles/base.css`**

```css
:root {
  --brown: #3b2c20;
  --brown-dark: #2a1f17;
  --gold: #f9a825;
  --gold-dark: #d68400;
  --white: #fff;
  --mono: 'Courier New', monospace;
  --gap: 8px;
}

* { box-sizing: border-box; }

/* A bare [hidden] loses to author display rules like .banner--resume below */
[hidden] { display: none !important; }

body {
  font-family: var(--mono);
  background: var(--brown);
  color: var(--white);
  margin: 0;
  padding: 5px;
  min-height: 100dvh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 30%);
  gap: var(--gap);
  text-align: center;
}

@media (max-width: 900px) {
  body { grid-template-columns: minmax(0, 1fr); }
}

h1 {
  color: var(--gold);
  margin: 0;
  font-size: clamp(1rem, 2.2vw, 1.9rem);
  text-shadow: 2px 2px 4px rgba(0, 0, 0, .7);
}

.main-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.topbar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--gap);
  width: 100%;
}

.logo { width: 90px; height: 90px; object-fit: contain; border-radius: 8px; }

.controls { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }

.bowl-row { display: flex; align-items: center; gap: var(--gap); flex-wrap: wrap; }
.bowl-row label { color: var(--gold); font-size: .95rem; }

button, .btn, select {
  background: var(--brown);
  color: var(--gold);
  border: 2px solid var(--gold);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 1rem;
  font-weight: bold;
  font-family: var(--mono);
  cursor: pointer;
  text-decoration: none;
  transition: background .2s, color .2s, transform .2s;
}

button:hover:not(:disabled), .btn:hover {
  background: var(--gold);
  color: var(--brown);
  transform: translateY(-2px);
}

button:disabled, select:disabled { opacity: .6; cursor: not-allowed; }

.bowlbutton { font-size: clamp(1rem, 1.6vw, 1.4rem); padding: 8px 16px; }

.banner {
  width: 100%;
  padding: 8px 12px;
  border: 2px solid var(--gold);
  border-radius: 8px;
  background: rgba(0, 0, 0, .35);
  color: var(--white);
  font-size: .95rem;
  text-align: left;
}

.banner--warning { border-color: #f44336; background: rgba(244, 67, 54, .2); font-weight: bold; }
.banner--resume { display: flex; gap: var(--gap); align-items: center; justify-content: center; }

.upload-message {
  background: rgba(59, 44, 32, .9);
  color: var(--gold);
  border: 3px solid var(--gold);
  border-radius: 15px;
  padding: 30px;
  margin: 20px auto;
  max-width: 600px;
}

.upload-message h2 { color: var(--gold); font-size: clamp(1.2rem, 2.2vw, 1.8rem); }
.upload-message p, .upload-message li { color: var(--white); }
.upload-message ol { text-align: left; display: inline-block; }
.upload-message strong { color: var(--gold); }
```

- [ ] **Step 3: Write `styles/board.css`**

The grid is what makes any count to 250 reflow (D10, R2).

```css
.board {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(2.5rem, 1fr));
  gap: 6px;
  width: 100%;
  flex: 1;
  align-content: start;
  padding: 4px;
}

.board:empty { display: none; }

.ticket {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--brown);
  border-radius: 5px;
  background: var(--white);
  color: #000;
  font-family: 'Montserrat', Arial, sans-serif;
  font-weight: 800;
  font-size: clamp(.75rem, 1.1vw, 1.15rem);
  min-height: 2.6rem;
  box-shadow: 1px 1px 3px rgba(0, 0, 0, .3);
  transition: background .3s, transform .3s;
}

.ticket--out {
  background: var(--gold);
  color: var(--white);
  text-decoration: line-through;
  transform: rotate(7deg) translateY(-6px);
  border-color: var(--gold-dark);
}

.ticket--struck { transform: scale(1.2) rotate(15deg); }

/* Ticket #1 is reserved for the auction and cannot be bowled out until the final stage */
.ticket--auction:not(.ticket--out) {
  background: linear-gradient(45deg, #fff, #fffacd);
  border-color: gold;
  box-shadow: 0 0 10px rgba(255, 215, 0, .5);
  position: relative;
}

.ticket--auction:not(.ticket--out)::after {
  content: "\1F6E1";
  position: absolute;
  top: -6px;
  right: -6px;
  font-size: .7rem;
  background: gold;
  border-radius: 50%;
  width: 1.1rem;
  height: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Final stage: fewer, bigger cells showing names. */
.board--final { grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 12px; }

.board--final .ticket { flex-direction: column; min-height: 6rem; padding: 8px; }

.board--final .ticket-name {
  font-weight: bold;
  color: var(--brown);
  font-size: clamp(1rem, 1.6vw, 1.6rem);
  line-height: 1.15;
}

.board--final .ticket-number {
  font-weight: bold;
  color: #666;
  font-size: clamp(1.4rem, 2.4vw, 2.6rem);
}

.board--final .ticket--out .ticket-name { color: var(--white); }
.board--final .ticket--out .ticket-number { color: var(--gold-dark); }

.ball {
  position: fixed;
  bottom: 20px;
  left: 50%;
  width: 30px;
  height: 30px;
  background: url('../images/ball.png') center/cover no-repeat;
  border-radius: 50%;
  transform: translateX(-50%);
  pointer-events: none;
  z-index: 5;
}
```

- [ ] **Step 4: Write `styles/scoreboard.css`**

```css
.scoreboard {
  background: var(--brown-dark);
  color: var(--white);
  border: 4px solid var(--gold);
  font-family: var(--mono);
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: calc(100dvh - 10px);
}

.scoreboard-header {
  background: var(--gold);
  color: var(--brown);
  padding: 8px;
  font-weight: bold;
}

.scoreboard-stats {
  padding: 6px;
  border-bottom: 1px solid #5a4332;
  font-size: clamp(.9rem, 1.4vw, 1.3rem);
  color: var(--gold);
}

.scoreboard-content {
  padding: 8px;
  text-align: left;
  flex: 1;
  overflow-y: auto;
}

.scoreboard-placeholder { text-align: center; color: #888; font-style: italic; margin-top: 20px; }
.scoreboard-stage-heading { text-align: center; color: var(--gold); font-weight: bold; margin-bottom: 10px; }

.wicket-entry {
  padding: 4px;
  border-bottom: 2px solid #5a4332;
  font-size: clamp(.85rem, 1.2vw, 1.1rem);
}

.wicket-entry:last-child { border-bottom: none; }
```

- [ ] **Step 5: Write `styles/overlays.css`**

Carry the popup, banner and modal animations over from `style.css:163-330` and `446-580` unchanged, plus the load-summary styles. Keyframes `popupAnimation`, `winnerEntrance`, `winnerJiggle`, `trophyBounce` and `auctionSlideIn` are copied verbatim; only the selectors below change.

```css
#overlays { position: fixed; inset: 0; pointer-events: none; z-index: 1000; }
#overlays > * { pointer-events: auto; }

.wicket-popup {
  position: fixed;
  top: 7%;
  left: 60%;
  transform: translate(-50%, -50%) scale(0);
  background: #f00;
  color: #fff;
  padding: 20px 30px;
  border-radius: 15px;
  font-size: clamp(1.1rem, 2vw, 1.6rem);
  font-weight: bold;
  text-align: center;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .5);
  border: 4px solid #fff;
  font-family: var(--mono);
  text-shadow: 2px 2px 4px rgba(0, 0, 0, .8);
  animation: popupAnimation 2s ease-out forwards;
}

@keyframes popupAnimation {
  0%   { transform: translate(-50%, -50%) scale(0) rotate(0deg); opacity: 0; }
  10%  { transform: translate(-50%, -50%) scale(1.2) rotate(5deg); opacity: 1; }
  20%  { transform: translate(-50%, -50%) scale(1) rotate(-2deg); opacity: 1; }
  30%  { transform: translate(-50%, -50%) scale(1.05) rotate(1deg); opacity: 1; }
  40%  { transform: translate(-50%, -50%) scale(1) rotate(0deg); opacity: 1; }
  90%  { transform: translate(-50%, -50%) scale(1) rotate(0deg); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(0) rotate(0deg); opacity: 0; }
}

.winner-banner {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: linear-gradient(135deg, var(--gold), var(--gold-dark));
  color: #fff;
  padding: 40px 60px;
  border-radius: 20px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, .8);
  border: 6px solid #fff;
  font-family: var(--mono);
  text-shadow: 3px 3px 6px rgba(0, 0, 0, .8);
  animation: winnerEntrance 2s ease-out forwards, winnerJiggle 3s ease-in-out 2s infinite;
}

.winner-banner .trophy { font-size: clamp(4rem, 9vw, 7.5rem); margin-bottom: 20px; animation: trophyBounce 2s infinite; }
.winner-banner .winner-text { font-size: clamp(2rem, 4vw, 3rem); font-weight: bold; letter-spacing: 3px; margin-bottom: 15px; }
.winner-banner .winner-details {
  font-size: clamp(1.3rem, 2.6vw, 2rem);
  font-weight: bold;
  color: var(--brown);
  background: rgba(255, 255, 255, .9);
  padding: 15px 25px;
  border-radius: 10px;
  margin-top: 20px;
}

@keyframes winnerEntrance {
  0%   { transform: translate(-50%, -50%) scale(0) rotate(-180deg); opacity: 0; }
  20%  { transform: translate(-50%, -50%) scale(1.2) rotate(10deg); opacity: 1; }
  40%  { transform: translate(-50%, -50%) scale(1) rotate(-5deg); opacity: 1; }
  60%  { transform: translate(-50%, -50%) scale(1.05) rotate(2deg); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1) rotate(0deg); opacity: 1; }
}

@keyframes winnerJiggle {
  0%, 100% { transform: translate(-50%, -50%) rotate(0deg) scale(1); }
  25%      { transform: translate(-50%, -50%) rotate(2deg) scale(1.02); }
  50%      { transform: translate(-50%, -50%) rotate(0deg) scale(1); }
  75%      { transform: translate(-50%, -50%) rotate(-2deg) scale(1.02); }
}

@keyframes trophyBounce {
  0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-20px); }
  60% { transform: translateY(-10px); }
}

.auction-popup {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .8);
  display: flex;
  justify-content: center;
  align-items: center;
}

.auction-content {
  background: linear-gradient(145deg, var(--gold), #ff8f00);
  color: var(--brown);
  padding: 40px;
  border-radius: 25px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, .5);
  border: 4px solid var(--brown);
  max-width: 800px;
  width: 95%;
  animation: auctionSlideIn .5s ease-out forwards;
}

@keyframes auctionSlideIn {
  0%   { transform: translateY(-100px) scale(.8); opacity: 0; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}

.auction-content h2 { margin-top: 0; font-size: clamp(1.5rem, 3.4vw, 2.6rem); color: var(--brown); }
.auction-content p { font-size: clamp(1rem, 1.8vw, 1.5rem); margin: 16px 0; }

.auction-content input {
  width: 80%;
  padding: 16px;
  font-size: clamp(1rem, 1.6vw, 1.3rem);
  border: 3px solid var(--brown);
  border-radius: 10px;
  text-align: center;
  margin: 16px 0;
  font-family: var(--mono);
  background: rgba(255, 255, 255, .9);
}

.auction-content input:focus { outline: none; border-color: #4caf50; background: #fff; }

.auction-table {
  margin: 16px auto;
  border-collapse: collapse;
  width: 100%;
  max-width: 600px;
  font-size: clamp(1rem, 1.8vw, 1.6rem);
  background: rgba(255, 255, 255, .95);
  border-radius: 3px;
  overflow: hidden;
}

.auction-cell {
  padding: 10px 20px;
  text-align: center;
  border: 2px solid var(--brown);
  font-weight: bold;
  color: var(--brown);
  word-break: break-word;
}

.auction-buttons { display: flex; justify-content: center; gap: 20px; margin-top: 16px; }
.auction-buttons button { padding: 14px 28px; font-size: clamp(1rem, 1.5vw, 1.3rem); border: none; }
#auction-confirm { background: #4caf50; color: #fff; }
#auction-cancel { background: #f44336; color: #fff; }
```

- [ ] **Step 6: Verify the layout renders**

The board is empty at this point, so check the chrome only. Open `index.html` directly from the filesystem (no server) and confirm:
- No console errors other than the expected "src/audio.js not found" style 404s for files not yet created.
- The logo sits inside the top bar rather than overlapping the heading (D10).
- The scoreboard is a right-hand column at 1920x1080 and moves below the board under 900px wide.
- No horizontal page scrollbar.

Take screenshots at 1920x1080 and 1280x720 for the record.

- [ ] **Step 7: Commit**

```bash
git add index.html styles/
git commit -m "Rewrite markup and split styles; board becomes CSS Grid

Fixes D10: grid auto-fit replaces the hardcoded 35-per-row table and fixed
cell sizes, so any count to 250 reflows to the projector. Logo, control
placement and the 70/30 split no longer rely on magic percentages.

The app is intentionally non-functional until the wiring task lands."
```

---

### Task 9: Audio and animation

**Files:**
- Create: `src/audio.js`
- Create: `src/animation.js`

**Interfaces:**
- Consumes: DOM ids `ball` and `overlays` from Task 8.
- Produces:
  - `Sound.wicket() -> void`
  - `Sound.winner() -> void`
  - `Animation.throwBall(targetEl: HTMLElement, ballMs: number) -> Promise<void>`
  - `Animation.showWicketPopup(number: number, dismissal: string, durationMs: number) -> void`
  - `Animation.showWinnerBanner(winner: {number, name}) -> void`
  - `Animation.clearOverlays() -> void`
  - `Animation.strike(targetEl: HTMLElement) -> void`
  - `Animation.resetBall() -> void`

`throwBall` resolves when the flight animation finishes. This is what replaces the `setInterval` race (D3).

- [ ] **Step 1: Write `src/audio.js`**

```js
'use strict';

const Sound = (function () {
  function make(src) {
    const audio = new Audio(src);
    audio.preload = 'auto';
    return audio;
  }

  const wicketHit = make('./sound/wickethit.mp3');
  const winnerFanfare = make('./sound/winner.mp3');

  // Autoplay policy can reject these; a silent draw is better than a crash.
  function play(audio) {
    try {
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* ignore */ }
  }

  return {
    wicket: () => play(wicketHit),
    winner: () => play(winnerFanfare)
  };
})();

if (typeof module !== 'undefined') module.exports = Sound;
```

- [ ] **Step 2: Write `src/animation.js`**

The keyframe arc is carried over from `app.js:343-368` unchanged; only the promise wrapper and the popup lifecycle are new.

```js
'use strict';

const Animation = (function () {
  const ball = () => document.getElementById('ball');
  const overlays = () => document.getElementById('overlays');

  let currentPopup = null;
  let popupTimer = null;

  function resetBall() {
    const el = ball();
    if (el) el.style.transform = 'translateX(-50%)';
  }

  // Resolves when the ball lands; awaiting this makes overlapping balls impossible
  function throwBall(targetEl, ballMs) {
    const el = ball();
    if (!el || !targetEl) return Promise.resolve();

    const rect = targetEl.getBoundingClientRect();
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight - 40;
    const tx = rect.left + rect.width / 2;
    const ty = rect.top + rect.height / 2;

    const distance = Math.sqrt((tx - cx) ** 2 + (ty - cy) ** 2);
    const arc = Math.min(200, distance * 0.3);
    const at = (f, lift, scale) => ({
      transform: 'translateX(-50%) translate(' + ((tx - cx) * f) + 'px, ' +
                 (((ty - cy) * f) - (arc * lift)) + 'px) scale(' + scale + ')',
      offset: f
    });

    const animation = el.animate([
      { transform: 'translateX(-50%) translate(0px, 0px) scale(1)', offset: 0 },
      at(0.2, 0.64, 0.9),
      at(0.4, 0.96, 0.75),
      at(0.6, 0.96, 0.6),
      at(0.8, 0.64, 0.45),
      at(1, 0, 0.3)
    ], { duration: ballMs, easing: 'ease-out' });

    return animation.finished
      .catch(() => {})
      .then(() => { resetBall(); });
  }

  function strike(targetEl) {
    if (!targetEl) return;
    targetEl.classList.add('ticket--struck');
    setTimeout(() => targetEl.classList.remove('ticket--struck'), 200);
  }

  // Only ever one popup: a new one replaces its predecessor
  function showWicketPopup(number, dismissal, durationMs) {
    removePopup();
    const popup = document.createElement('div');
    popup.className = 'wicket-popup';
    popup.style.animationDuration = (durationMs / 1000) + 's';

    const line1 = document.createElement('div');
    line1.textContent = '#' + number;
    const line2 = document.createElement('div');
    line2.textContent = dismissal;      // from a data file, but textContent regardless
    popup.appendChild(line1);
    popup.appendChild(line2);

    overlays().appendChild(popup);
    currentPopup = popup;
    popupTimer = setTimeout(removePopup, durationMs);
  }

  function removePopup() {
    if (popupTimer) { clearTimeout(popupTimer); popupTimer = null; }
    if (currentPopup && currentPopup.parentNode) currentPopup.parentNode.removeChild(currentPopup);
    currentPopup = null;
  }

  function showWinnerBanner(winner) {
    const banner = document.createElement('div');
    banner.className = 'winner-banner';

    const trophy = document.createElement('div');
    trophy.className = 'trophy';
    trophy.textContent = '\u{1F3C6}';

    const text = document.createElement('div');
    text.className = 'winner-text';
    text.textContent = 'WINNER!';

    const details = document.createElement('div');
    details.className = 'winner-details';
    details.textContent = '#' + winner.number + ' ' + winner.name;   // D7

    banner.appendChild(trophy);
    banner.appendChild(text);
    banner.appendChild(details);
    overlays().appendChild(banner);
    Sound.winner();
  }

  function clearOverlays() {
    removePopup();
    const host = overlays();
    while (host && host.firstChild) host.removeChild(host.firstChild);
  }

  return { throwBall, strike, showWicketPopup, showWinnerBanner, clearOverlays, resetBall };
})();

if (typeof module !== 'undefined') module.exports = Animation;
```

- [ ] **Step 3: Verify the modules load**

Open `index.html` from the filesystem and check the console:

```js
typeof Animation.throwBall   // "function"
typeof Sound.wicket          // "function"
```

Expected: both `"function"`, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/audio.js src/animation.js
git commit -m "Add promise-based ball flight and single-popup overlays

throwBall resolves on animation.finished, which is the mechanism that makes
the D3 race impossible. Only one wicket popup exists at a time (D4). Winner
details go in via textContent (D7)."
```

---

### Task 10: Rendering

**Files:**
- Create: `src/render.js`

**Interfaces:**
- Consumes: `Rules`, `Store`, DOM ids from Task 8.
- Produces:
  - `Render.mount() -> void` (populates the drop-size select once)
  - `Render.apply(state) -> void`
  - `Render.cellFor(number) -> HTMLElement | undefined`
  - `Render.showLoadSummary(summary, hasAuctionTicket) -> void`
  - `Render.showError(message) -> void`
  - `Render.showStorageWarning(show) -> void`
  - `Render.showResumePrompt(saved, onYes, onNo) -> void`

`Render.apply` is the only writer to the DOM outside `Animation`.

- [ ] **Step 1: Write `src/render.js`**

```js
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

  // 'auction' stays on the bulk board, so the rebuild happens after the winner's name is set
  function boardMode(state) {
    return (state.phase === 'final' || state.phase === 'won') ? 'final' : 'bulk';
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
```

- [ ] **Step 2: Verify rendering against real data**

Open `index.html` from the filesystem, then in the console:

```js
Render.mount();
Store.subscribe(Render.apply);
Store.loadTickets(
  Array.from({length: 187}, (_, i) => ({ number: i + 1, name: 'Player ' + (i + 1) })),
  { total: 187, skipped: 0, warnings: [] }
);
```

Expected: 187 numbered cells fill the grid with no page scrollbar; ticket #1 carries the shield badge; the scoreboard reads `WICKETS: 0/187` and `REMAINING: 187`; the Bowl button reads `Bowl Ball (Next: 7 out)`.

Then check the switch to the final board:

```js
Store.get().eliminated = Array.from({length: 177}, (_, i) => ({ number: i + 11, name: 'Player ' + (i + 11), dismissal: 'Bowled!', stage: 'bulk', at: 1 }));
Store.skipAuction();
```

Expected: the board rebuilds as 10 large cells showing names and numbers, and the scoreboard total becomes 10.

Repeat the 187-ticket check at 250 tickets and screenshot both at 1920x1080.

- [ ] **Step 3: Commit**

```bash
git add src/render.js
git commit -m "Add keyed renderer as the single DOM writer

Cells are built once per board mode and keyed by ticket number, so an
in-flight ball keeps a valid target reference. All names go in via
textContent (D7) and no inline styles are injected from JS (D12)."
```

---

### Task 11: Auction modal

**Files:**
- Create: `src/auction.js`

Its `<script>` tag is already in the markup from Task 8, so `index.html` is not touched.

**Interfaces:**
- Consumes: `Store.remainingTickets`, `Store.resolveAuction`, `Store.skipAuction` (Task 6); DOM id `overlays` (Task 8).
- Produces: `Auction.show() -> void`

- [ ] **Step 1: Write `src/auction.js`**

```js
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
      document.removeEventListener('keydown', onKeydown);
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
    document.addEventListener('keydown', onKeydown);

    setTimeout(() => input.focus(), 100);
  }

  return { show };
})();

if (typeof module !== 'undefined') module.exports = Auction;
```

- [ ] **Step 2: Verify the modal in isolation**

Nothing calls `Auction.show` yet — that wiring is Task 12. Open `index.html` from the filesystem and drive it by hand in the console:

```js
Render.mount();
Store.subscribe(Render.apply);
Store.loadTickets(
  Array.from({length: 11}, (_, i) => ({ number: i + 1, name: 'Player ' + (i + 1) })),
  { total: 11, skipped: 0, warnings: [] }
);
Store.beginRound([5]); Store.eliminate(5); Store.endRound();
Store.get().phase;        // "auction"
Auction.show();
```

Confirm:
- The modal lists all 10 survivors sorted by number, with ticket #1 among them.
- The input is focused on open.
- Typing a name and pressing Enter closes the modal, renames ticket #1 and leaves `Store.get().phase === 'final'`.
- Re-running the sequence and pressing Escape skips the auction, leaving ticket #1's name unchanged and the phase still `final`.

- [ ] **Step 3: Commit**

```bash
git add src/auction.js
git commit -m "Add the auction modal built with DOM nodes, not HTML strings

Survivor names go in via textContent (D7). Enter confirms, Escape skips,
both on keydown rather than the deprecated onkeypress (D11)."
```

---

### Task 12: Wiring

**Files:**
- Create: `src/main.js`

**Interfaces:**
- Consumes: everything from Tasks 1–11, including `Auction.show`.
- Produces: no public API. This is the bootstrap.

- [ ] **Step 1: Write `src/main.js`**

```js
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

    Store.endRound();
    bowling = false;

    const after = Store.get();
    if (after.phase === 'auction') setTimeout(Auction.show, 1000);
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
          if (Store.get().phase === 'auction') Auction.show();
          if (Store.get().phase === 'won') showWinner();
        },
        () => { Persistence.clear(); Store.reset(); }
      );
    }

    Render.apply(Store.get());
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
```

- [ ] **Step 2: Verify a full draw end to end**

Open `index.html` from the filesystem, upload `template.csv` (187 rows) and click through. Confirm:
- The load summary reports 187 tickets and ticket #1 reserved.
- The first click knocks out 7, landing on 180.
- Ticket #1 keeps its shield and is never struck during the bulk stage.
- At 10 remaining the phase becomes `auction` and the Bowl button disables.
- Only one wicket popup is visible at any moment (D4).

Verify recovery: mid-draw, reload the page. Expect the resume prompt with the correct counts, and Resume restoring the board.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "Wire the app: sequential round loop, upload, resume and reset

Replaces the setInterval race with an awaited loop over targets chosen up
front (D3). Adds resume, reset and manual export/import, and deletes the
F5/Ctrl+R interception that prevented recovery (D2, R1)."
```

---

### Task 13: Remove the old app and verify

**Files:**
- Delete: `app.js`, `style.css`
- Create: `README.md`

- [ ] **Step 1: Fix the one remaining comment-style violation**

`src/audio.js:19` reads `} catch (e) { /* ignore */ }`. The project rule is `//`-style comments only in JS. Change it to:

```js
    } catch (e) {
      // Autoplay policy can reject playback; a silent draw beats a crash
    }
```

Then confirm no `/*` remains in any JS file:

```bash
grep -n "/\*" src/*.js tests/*.js || echo "clean"
```

Expected: `clean`. CSS keeps its single-line `/* ... */` comments — that is the correct form there.

- [ ] **Step 2: Confirm nothing references the old files**

```bash
grep -rn "app\.js\|style\.css" index.html src/ styles/ || echo "clean"
```

Expected: `clean`

- [ ] **Step 3: Delete them**

```bash
git rm app.js style.css
```

- [ ] **Step 4: Run the full unit suite**

Run: `node --test`
Expected: PASS, 93 tests, 0 failures

- [ ] **Step 5: Full browser verification (spec section 14)**

Work through every item and record the result:

1. A full 187-ticket draw from `template.csv`, end to end, through the auction to a winner. **This is the case that is broken today.**
2. A 250-ticket draw at drop size 25.
3. Ticket #1 visibly survives to the final 10 and is then auctioned.
4. Reload mid-draw, then Resume; confirm the board and scoreboard match what was on screen before.
5. **`localStorage` from a `file://` origin.** In the console on the `file://` page, run `Persistence.isAvailable()`. If it returns `false`, the storage warning banner must be visible and Export/Import must be the working fallback. Record which it was — this is the riskiest assumption in the design.
6. Screenshots at 1920x1080, 1280x720 and 1366x768, at both 187 and 250 tickets. Confirm no clipping and no horizontal scrollbar.

- [ ] **Step 6: Write `README.md`**

```markdown
# SWCC Reverse Raffle

A reverse raffle draw for South Wingfield Cricket Club. Vanilla JavaScript,
no build step, no dependencies.

## Running it

Double-click `index.html`. No server and no internet needed.

## Running a draw

1. Download `template.csv` and fill it in as `Name,Number` — one row per ticket.
2. **Ticket #1 is reserved for the auction.** It cannot be knocked out until the
   final 10, then it is auctioned live.
3. Upload the CSV. Check the load summary before you start.
4. Choose how many to knock out per round (default 10), then click Bowl Ball.
   The first click brings the total down to a multiple of that number; after that
   it drops by that amount each round until 10 remain.
5. At 10 remaining, enter the auction winner's name (or press Escape to skip).
6. The last 10 go out one at a time.

Up to 250 tickets.

## If something goes wrong

Progress saves automatically after every wicket, so closing the laptop or
reloading is safe — you will be offered **Resume** when you reopen it. If the
red warning banner says progress cannot be saved, use **Export progress** to
save a file by hand, and **Import progress** to restore it.

**Reset draw** starts over and clears saved progress.

## Tests

```
node --test
```

No install required; Node ships the test runner.
```

- [ ] **Step 7: Commit**

```bash
git add README.md app.js style.css
git commit -m "Remove the original app.js and style.css; add README

The rewrite is complete and verified: 89 unit tests plus a full browser
run of the 187-ticket draw that the original silently broke."
```

---

## Verification summary

| Requirement | Where |
|---|---|
| R1 no data loss | Tasks 7, 12 |
| R2 up to 250 tickets | Tasks 1, 4, 8, 10 |
| R3 first click to a multiple, then drops | Task 1 |
| R4 auction at the final 10 | Tasks 3, 11 |
| R5 configurable drop size | Tasks 6, 10, 12 |
| R6 CSV minutes before the draw | Task 4 |
| R7 ticket #1 reserved | Tasks 2, 3, 11 |
| D1 auction never fires | Task 1 |
| D2 no persistence | Tasks 7, 12 |
| D3 elimination race | Tasks 9, 12 |
| D4 stacked popups | Task 9 |
| D5 dead players.csv fetch | Task 12 (never carried over) |
| D6 naive CSV parsing | Task 4 |
| D7 innerHTML with names | Tasks 9, 10, 11 |
| D8 hardcoded ticket "1" | Task 2 |
| D9 duplicated rules logic | Tasks 3, 6 |
| D10 no responsive handling | Task 8 |
| D11 alerts, onkeypress, no Escape | Tasks 10, 11 |
| D12 inline styles from JS | Tasks 8, 10 |
