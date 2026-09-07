# SWCC Reverse Raffle — Refactor Design

**Date:** 2026-09-07
**Status:** Approved for planning
**Repo:** https://github.com/alexkitts/swcc-raffle

## 1. Context

A single-screen reverse raffle app for South Wingfield Cricket Club, operated live
from a laptop in front of the crowd. Tickets are uploaded as CSV; clicking "Bowl
Ball" fires an animated cricket ball at a random remaining ticket, which is struck
out. At 10 remaining, one reserved ticket is auctioned live, the board switches to
a names layout, and eliminations proceed one at a time to a single winner.

The current implementation is 637 lines in one `app.js`, with no state model, no
tests and no build. It works for exactly 200 tickets and is incorrect for most
other counts (see D1).

Requirements come from two sources: the club operator (Dylan Kitts, who runs the
draw) and a code review of the existing implementation.

## 2. Goals

1. Correct for **any** ticket count from 1 to 200.
2. A draw survives the laptop being closed, crashing, or the page being reloaded.
3. Game rules live in pure, tested functions rather than in DOM state.
4. The CSV upload tolerates whatever Excel produces, and reports what it did.
5. The board fits any screen the laptop is plugged into.
6. Still runs offline by double-clicking `index.html`. No build step, no
   dependencies, no `node_modules`.

## 3. Requirements

### 3.1 Operator requirements

| ID | Requirement | Source |
|----|-------------|--------|
| R1 | No risk of losing the draw if the laptop is closed | Operator |
| R2 | Support any count of tickets up to 200, numbers displayed on the board | Operator |
| R3 | First click reduces remaining to the nearest lower multiple of the drop size (e.g. 127 to 120); subsequent rounds drop by the drop size until the final 10 | Operator |
| R4 | At the final 10, offer the opportunity to auction one of those 10 numbers | Operator |
| R5 | Drop size is operator-configurable between rounds; the final 10 is always one at a time | Committed to operator |
| R6 | CSV can be exported from Excel and uploaded moments before the draw starts | Operator |

### 3.2 Defects to fix

| ID | Defect | Location |
|----|--------|----------|
| D1 | **The auction stage never fires for ~45% of ticket counts, including the committed 187-row template.** `getEliminations` takes 20 at a time above 20 remaining and only reaches 10 if it happens to land in 11-20. `187 -> 167 -> ... -> 47 -> 27 -> 7`, skipping the final-10 stage, the names board and the auction entirely. Broken for all counts 21-29, 41-49, 61-69, 81-89, 101-109, and so on. | `app.js:16-27` |
| D2 | No persistence. `beforeunload` and the F5/Ctrl+R keydown interception cannot prevent a reload, do nothing about the reload button or a crash, and actively prevent recovery. No reset button either. | `app.js:612-638` |
| D3 | Elimination loop is a race: `setInterval(1000)` fires balls while each flight takes 800ms and targets are only marked `out` in `onfinish`. 200ms of margin. Under frame drops or background-tab throttling the same ticket can be targeted twice, `ballsThrown` counts throws rather than kills, and the `currentAlive.length === 10` guard misses, skipping the auction again. | `app.js:279-328` |
| D4 | Final-stage popups last 10s at a fixed position with a 1200ms round, so they stack into a pile of overlapping boxes. | `app.js:398`, `style.css:163` |
| D5 | `loadPlayersFromCSV()` fetches `./players.csv`, which does not exist — guaranteed 404 on every load, and fails outright on `file://`. Dead path. | `app.js:69-94` |
| D6 | CSV parsed with `line.split(',')`. Breaks on Excel's UTF-8 BOM, CRLF line endings and quoted fields containing commas. Malformed rows are silently dropped by the truthiness filter. | `app.js:412-425` |
| D7 | Names interpolated via `innerHTML` in five places; `&` or `<` in a name renders incorrectly. | `app.js:199,243,505,541` |
| D8 | Protected ticket hardcoded as the string `"1"` in four places. | `app.js:53,262,317,577` |
| D9 | Rules logic duplicated and able to disagree between `updateButtonText` and `throwBall`. | `app.js:49-58` vs `259-267` |
| D10 | No responsive handling: `overflow:hidden`, fixed `100vh`, `flex: 0 0 70%`, hardcoded 35 tickets per row and `25px x 60px` cells, `.csv-controls { right: 35% }` tuned to that split. `.logo` is `position:absolute` with `left` but no `top`, so it floats into the heading. | `style.css:1-42,333` |
| D11 | `alert()` for success and errors; mixed `onclick` / `addEventListener` / deprecated `onkeypress`; table used for layout with no ARIA, no live region, no focus trap or Escape on the auction modal. | throughout |
| D12 | Inline styles injected as HTML strings, duplicating CSS. | `app.js:438,512` |

### 3.3 Non-goals

- No framework. No React, no Web Components, no bundler, no TypeScript.
- No server, no database, no multi-device or shared state.
- No ticket sales, payment or admin features. CSV in, winner out.
- No new game mechanics beyond R3 and R5.

## 4. Architecture decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | **None — vanilla** | One screen, one user, no network, no routing. The core of the app is imperative animation measuring live DOM geometry (`getBoundingClientRect` into the Web Animations API), which a declarative renderer fights. The missing piece was never a framework; it was a state model. |
| Module system | **Classic scripts with namespace objects**, not ES modules | Browsers block `import` over `file://`. Classic scripts preserve offline double-click operation on unknown venue wifi. A three-line footer per file (`if (typeof module !== 'undefined') module.exports = X`) keeps the pure logic `require()`-able for `node --test`. |
| Rendering | **Keyed patch**, not re-render | A ball in flight holds a reference to its target element; re-rendering the board mid-animation would invalidate it. Cells are built once per phase and thereafter only classes and text are patched, keyed by ticket number. |
| Board layout | **CSS Grid `auto-fit`** | It is not tabular data, and grid is what allows any ticket count to reflow to any screen without clipping. |
| Tests | **`node --test`**, zero dependencies | Node ships the runner. No `package.json`, no lockfile, nothing to rot between annual draws. |
| Persistence | **`localStorage`, with mandatory feature detection** | See section 9. |

## 5. File layout

```
index.html
styles/
  base.css          tokens, reset, typography, buttons
  board.css         ticket grid, final-10 board
  scoreboard.css    scoreboard panel
  overlays.css      wicket popup, winner banner, auction modal, load summary
src/
  rules.js          PURE: drop schedule, target selection, phase transitions
  csv.js            PURE: Excel-tolerant parsing and validation
  dismissals.js     PURE: dismissal message pools and selection
  state.js          the store: one object, named mutations, subscribe
  persistence.js    localStorage save/load/clear, availability detection, JSON export/import
  render.js         state to DOM (the only DOM writer besides animation)
  animation.js      ball flight, wicket popup, winner banner
  audio.js          sound preload and safe playback
  main.js           bootstrap and event wiring only
tests/
  rules.test.js
  csv.test.js
  state.test.js
  fixtures/excel-export.csv
```

Load order in `index.html`: `rules`, `csv`, `dismissals`, `state`, `persistence`,
`audio`, `animation`, `render`, `main`.

## 6. State

One object is the single source of truth. The DOM holds no game state.

```js
{
  schemaVersion: 1,
  tickets: [ { number: Number, name: String, isAuctionTicket: Boolean } ],
  eliminated: [ { number, name, dismissal, at, stage: 'bulk' | 'final' } ],
  phase: 'awaiting-csv' | 'bulk' | 'auction' | 'final' | 'won',
  settings: { dropSize: 10, finalStageAt: 10, ballMs: 800, interBallMs: 200 },
  round: null | { targets: [Number], thrown: Number },
  usedFinalDismissals: [String],
  auctionResolved: Boolean,
  loadSummary: { total, skipped, warnings: [String] } | null
}
```

`tickets` is immutable after load. `eliminated` is an ordered log — it is the
authoritative record of who is out, and it yields the scoreboard, the counts,
recovery and (if ever wanted) undo, and it serialises to a single key.

**Derived, never stored** — these are computed from `tickets` and `eliminated` on
demand: `remaining`, `remainingTickets`, `wickets`, `nextDrop`, `winner`. Storing
them is what allowed `updateButtonText` and `throwBall` to disagree (D9).

`usedFinalDismissals` is persisted so a resumed draw does not repeat a
final-stage dismissal message.

## 7. Game rules (`src/rules.js`, pure)

### 7.1 Drop schedule

```js
function nextDrop(remaining, { dropSize, finalStageAt }) {
  if (remaining <= finalStageAt) return 1;
  const excess = remaining - finalStageAt;
  const offset = remaining % dropSize;
  return Math.min(offset || dropSize, excess);
}
```

The `offset` term implements R3's "first click takes us to a multiple of ten". The
`excess` clamp is the fix for D1 — it makes overshooting `finalStageAt`
structurally impossible.

Worked examples:

```
127, drop 10 -> 120 -> 110 -> 100 -> ... -> 20 -> 10, then singles
143, drop 10 -> 140 -> 130 -> ... -> 10,             then singles
127, drop 20 -> 120 -> 100 -> 80 -> 60 -> 40 -> 20 -> 10, then singles
200, drop 20 -> 180 -> 160 -> ... -> 20 -> 10,       then singles
 15, drop 10 ->  10,                                 then singles
```

**Proof obligation:** for every `remaining` in 1-200 and every `dropSize` in
{5, 10, 20, 25, 50}, repeated application must reach exactly `finalStageAt` and
never below it, in a finite number of rounds.

### 7.2 Target selection

Two functions, so the pure picker takes no state at all:

```js
function eligibleTargets(state) -> [Number]
function pickTargets(candidates, count, rng = Math.random) -> [Number]
```

`eligibleTargets` derives the remaining tickets from `tickets` minus `eliminated`,
never from the DOM, and excludes the auction ticket while `phase === 'bulk'`.

`pickTargets` returns `count` distinct numbers chosen without replacement,
clamped to `candidates.length`. `rng` is injectable so tests are deterministic.

Choosing the whole round's targets up front, from state, is what makes duplicate
targeting impossible (D3).

### 7.3 Phases and transitions

| Phase | Meaning | Bowl button |
|-------|---------|-------------|
| `awaiting-csv` | No tickets loaded | Disabled |
| `bulk` | `remaining > finalStageAt`; auction ticket protected | Enabled |
| `auction` | `remaining === finalStageAt`, auction ticket present and unresolved | Disabled |
| `final` | At or below `finalStageAt`, auction settled; names board; one at a time | Enabled |
| `won` | `remaining === 1` | Disabled |

Transitions:

- `awaiting-csv` to `bulk` on successful load when `remaining > finalStageAt`.
- `awaiting-csv` to `final` on successful load when `1 < remaining <= finalStageAt`
  (small draws skip the bulk and auction stages entirely).
- `awaiting-csv` to `won` on successful load when `remaining === 1` (a
  single-ticket draw has a winner immediately, with no ball bowled).
- `bulk` to `auction` when `remaining === finalStageAt` and an auction ticket is
  present and unresolved.
- `bulk` to `final` when `remaining === finalStageAt` and no auction ticket exists.
- `auction` to `final` on confirm or skip; sets `auctionResolved = true`.
- `final` to `won` when `remaining === 1`.

Transitions are evaluated once per round boundary, in `endRound`, and once on
load. They are never evaluated mid-round.

Winner determination lives here only. Today it is decided in two independent
places (`app.js:283` and `app.js:35`) which is why the button and the banner can
disagree.

### 7.4 Auction ticket

Identified by **name**, matching `/^\s*auction\s*$/i`, not by number (D8). If no
such row exists, no ticket is protected and the auction stage is skipped — and
this is stated in the load summary (section 8) so the operator is not surprised on
the night. If more than one matches, the first is used and a warning is recorded.

On confirm, the operator-entered name replaces the auction ticket's `name`. On
skip, the name is left unchanged. Either way `auctionResolved` becomes true and
the phase advances.

## 8. CSV parsing (`src/csv.js`, pure)

`parse(text) -> { tickets, summary }`

Must handle, in order:

1. Strip a leading UTF-8 BOM (`﻿`) — Excel adds one.
2. Normalise `\r\n` and `\r` to `\n`.
3. Parse per RFC 4180: quoted fields, commas inside quotes (`"Smith, John"`), and
   escaped quotes (`""`).
4. Skip a header row when the first cell matches `/name/i`.
5. Skip blank and whitespace-only rows.
6. Trim surrounding whitespace from both fields.

Validation:

- `number` must parse as a positive integer. Invalid rows are skipped and counted.
- `name` must be non-empty. Invalid rows are skipped and counted.
- Duplicate ticket numbers are kept but recorded as a warning.
- More than 200 valid rows is an error; nothing is loaded.
- Zero valid rows is an error; nothing is loaded.

Duplicate *names* are expected and legitimate — one person buys several tickets.

`alert()` is replaced by an on-screen **load summary** (D11), because silent
mangling is the failure mode that matters when uploading in front of a room:

> Loaded 127 tickets. Auction ticket #1 detected.
> 2 blank rows skipped. Warning: ticket #43 appears twice.

Loading a CSV resets the draw: `eliminated`, `round`, `usedFinalDismissals` and
`auctionResolved` are cleared, and any saved progress is discarded.

The dead `players.csv` fetch is deleted (D5).

## 9. Persistence and recovery (`src/persistence.js`)

Key: `swcc-raffle:v1`. The whole state object is serialised.

Written after every elimination and every phase change. At 200 tickets the payload
is roughly 10-20KB, well inside quota.

**Availability detection is mandatory.** `localStorage` is not guaranteed on
`file://` origins — Chrome generally permits it, Safari blocks it, and it can be
disabled by policy. Since R1 is the operator's first requirement, at startup the
app performs a write-read-delete probe inside `try/catch`. If it fails:

- A prominent, persistent warning banner is shown: *"Progress cannot be saved
  automatically in this browser — do not close this window."*
- **Export progress** and **Import progress** buttons are enabled, writing and
  reading the same JSON payload as a downloaded file. This is the manual safety
  net for R1.

The export/import buttons are always available, not only in the failure case.

**Resume.** On load, if a saved state exists with a matching `schemaVersion` and a
phase other than `awaiting-csv` or `won`, offer a choice:

> A draw is in progress — 47 of 127 out. **Resume** / **Start fresh**

A `schemaVersion` mismatch discards the save with a message rather than attempting
migration.

**Interrupted rounds.** If `round` is non-null on resume, the remainder of that
round is discarded and the operator resumes at a round boundary. At most one
in-flight ball is lost, and the state is always consistent.

**Removals (D2).** The F5 and Ctrl+R `keydown` interception is deleted — it never
worked, and it prevented recovery. A plain native `beforeunload` confirmation is
kept, since that does work. An explicit **Reset draw** button with a confirmation
step is added, so restarting becomes a deliberate act rather than an impossibility.

## 10. Round execution (`src/main.js` and `src/animation.js`)

Replaces the `setInterval` + `onfinish` race (D3) with a sequential async loop:

```js
async function bowlRound() {
  const count   = Rules.nextDrop(remaining(state), state.settings);
  const targets = Rules.pickTargets(Rules.eligibleTargets(state), count);
  Store.beginRound(targets);

  for (const [i, number] of targets.entries()) {
    await Animation.throwBall(cellFor(number));   // resolves on animation.finished
    Store.eliminate(number, Dismissals.pick(state));   // advances round.thrown, persists
    if (i < targets.length - 1) await delay(state.settings.interBallMs);
  }

  Store.endRound();   // clears round, evaluates phase transition
}
```

- Targets are fixed before the first ball, so duplicate targeting is impossible.
- `await` on `animation.finished` means overlap cannot occur regardless of dropped
  frames or background-tab throttling.
- `Store.eliminate` advances `round.thrown` and persists, so a lid close loses at
  most the single in-flight ball.
- The delay applies *between* balls only, never after the last one, so a round
  ends the moment its final ball lands. `interBallMs` of 200 with `ballMs` of 800
  reproduces the current 1000ms-per-ball cadence.
- The Bowl button and the drop-size control are disabled for the duration of a
  round and re-enabled by `endRound`.

Only one wicket popup exists at a time: a new one replaces any currently visible
one, and each is removed when replaced or when its duration elapses, whichever
comes first. This fixes the stacking pile (D4) while keeping the longer, more
dramatic dwell time in the final stage.

### 10.1 Operator controls (R5)

A `<select>` labelled "Knock out per ball" beside the Bowl button, with options
5, 10, 20, 25 and 50, defaulting to 10. A fixed option list rather than a free
number input, because it is operated live in front of a crowd and cannot be
allowed to hold an invalid value.

It is disabled while a round is running and in the `auction`, `final` and `won`
phases, where the drop is always 1 by rule. Changing it takes effect from the
next round; it never alters a round in progress. The Bowl button's label shows
the resulting next drop, derived from `nextDrop`, so the effect is visible before
committing.

`finalStageAt` remains fixed at 10 and is **not** exposed in the UI — R5 asks
only for the drop size to be configurable.

## 11. Rendering (`src/render.js`)

`render(state)` is the only writer to the DOM outside `animation.js`, which owns
only transforms on the ball element and the transient overlay nodes.

- Ticket cells are created once when tickets load, and once more when the phase
  becomes `final` (the names board). Between those points, render only patches
  classes and text content.
- A `Map<ticketNumber, HTMLElement>` keys cells, so an in-flight ball's target
  reference stays valid across renders.
- All names are set via `textContent`, never `innerHTML` (D7).
- No inline styles from JS; all presentation moves to CSS classes (D12).
- Render is idempotent: calling it twice with the same state produces no change.

Scoreboard display preserves current behaviour: during `bulk` the total is the
ticket count; from `final` onward the total is `min(finalStageAt, ticketCount)`
— the `min` matters for small draws, where showing "10" would be a lie — and the
visible wicket list shows only final-stage eliminations under a "FINAL 10"
heading. The wicket counter likewise counts eliminations within the current
stage, as it does today. The full history remains in `state.eliminated`
regardless of what is displayed.

## 12. Layout and responsive (`styles/`)

- Ticket board becomes CSS Grid with
  `grid-template-columns: repeat(auto-fit, minmax(2.5rem, 1fr))`, so any count
  from 1 to 200 reflows to the available width. The hardcoded 35-per-row and
  `25px x 60px` cells are removed. The `2.5rem` floor is a starting value, to be
  confirmed against the screenshot checks below.
- Cell and font sizes scale with the board using `clamp()`, so the same board is
  legible at 200 tickets and at 8.
- `dvh` replaces `vh`; `overflow: hidden` is removed from `body`.
- The 70/30 main/scoreboard split becomes a grid with a minimum scoreboard width,
  and the scoreboard moves below the board under a narrow-width breakpoint.
- `.csv-controls { right: 35% }` is replaced by placement within the layout
  (D10). `.logo` gets an explicit `top`.
- Verified by screenshot at 1366x768, 1920x1080 and 1280x720.

## 13. Accessibility

- Scoreboard is an `aria-live="polite"` region so eliminations are announced.
- Auction modal gets `role="dialog"`, `aria-modal="true"`, a focus trap, Escape to
  close, and focus restored to the trigger on close.
- Deprecated `onkeypress` replaced by `keydown`.
- `prefers-reduced-motion: reduce` skips the ball flight and applies the result
  immediately. This doubles as a deliberate "go faster" path for the operator.
- Real `<button>` semantics throughout, visible focus rings, and a contrast check
  on the gold-on-brown palette.

## 14. Testing

`node --test tests/` — no install required.

**`rules.test.js`**
- `nextDrop` reaches exactly `finalStageAt` for every count 1-200 by dropSize
  {5, 10, 20, 25, 50}, never overshooting (the D1 regression test).
- R3 specifically: the first drop from a non-multiple lands on the nearest lower
  multiple of the drop size.
- `pickTargets` never selects the auction ticket during `bulk`, always selects it
  as eligible from `final`, returns distinct numbers, and clamps to availability.
- `finalStageAt` always yields a drop of exactly 1.
- Phase transitions, including the small-draw case (fewer than 10 tickets loaded)
  and the no-auction-ticket case.

**`csv.test.js`**
- UTF-8 BOM, CRLF, bare CR.
- Quoted field containing a comma; escaped `""` quotes.
- Header row present and absent.
- Blank rows, trailing newlines, whitespace-only rows.
- Invalid and negative and non-integer numbers; empty names.
- Duplicate numbers warn; duplicate names do not.
- Over 200 rows and zero valid rows both error without loading.
- A real Excel export fixture (`tests/fixtures/excel-export.csv`).

**`state.test.js`**
- `eliminate` updates all derived counts consistently.
- Save/load round-trip preserves state exactly.
- Resume with an interrupted `round` discards it and leaves consistent state.
- `schemaVersion` mismatch discards the save.
- Loading a new CSV clears prior progress.

**Browser verification** (manual, driven via automation):
- A full 127-ticket draw end to end, through auction to winner.
- A 187-ticket draw (the committed template) confirming the auction fires — the
  case that is broken today.
- Reload mid-draw, then resume.
- `localStorage` availability probe from a `file://` origin in the operator's
  browser, confirming R1 holds in the real deployment mode.
- Screenshots at the three viewport sizes in section 12.

## 15. Order of work

1. `rules.js` plus tests — D1, D9 fixed and proven.
2. `csv.js` plus tests — D6, D5 fixed; load summary defined.
3. `state.js` plus `persistence.js` plus tests — D2, R1 fixed.
4. Sequential round execution — D3, D4 fixed.
5. `render.js` keyed, phase-driven boards — D7, D12 fixed.
6. Drop-size control — R5.
7. Grid and responsive — D10, R2.
8. Accessibility — D11.
9. Browser verification per section 14.

Every confirmed defect is fixed and proven before any cosmetic work begins.

## 16. Assumptions to confirm with the operator

These do not block starting work, but should be settled before the draw:

1. **Will the CSV contain a reserved `Auction` row, as last year's template did?**
   If not, the auction stage is skipped. Detection by name (section 7.4) means the
   row can be named "Auction" with any ticket number.
2. **A real Excel export is wanted as a test fixture**, rather than a
   hand-constructed guess, so section 8 is verified against what the operator's
   spreadsheet actually produces.
3. The board displays ticket **numbers** during the bulk stage and **names plus
   numbers** in the final 10, as it does today.
