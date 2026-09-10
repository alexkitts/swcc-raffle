'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Layout = require('../src/layout.js');

const BOARD_W = 1330;
const BOARD_H = 880;
const GAP = 6;

// Only the track counts matter to these assertions; cellW/cellH are checked separately
const grid = (count) => {
  const g = Layout.chooseGrid(count, BOARD_W, BOARD_H, GAP);
  return { cols: g.cols, rows: g.rows };
};

test('every grid has room for every ticket', () => {
  for (let n = 1; n <= 250; n++) {
    const g = grid(n);
    assert.ok(g.cols * g.rows >= n, n + ' tickets did not fit in ' + g.cols + 'x' + g.rows);
  }
});

test('rows always follow from the column count', () => {
  for (let n = 1; n <= 250; n++) {
    const g = grid(n);
    assert.strictEqual(g.rows, Math.ceil(n / g.cols), 'at ' + n + ' tickets');
  }
});

test('no grid wastes a whole row', () => {
  for (let n = 1; n <= 250; n++) {
    const g = grid(n);
    assert.ok((g.rows - 1) * g.cols < n, n + ' tickets left an empty row in ' + g.cols + 'x' + g.rows);
  }
});

test('130 tickets get an exact 13x10 rectangle, which costs almost nothing', () => {
  assert.deepStrictEqual(grid(130), { cols: 13, rows: 10 });
});

test('200 tickets take the bigger cells rather than a 10% smaller exact rectangle', () => {
  assert.deepStrictEqual(grid(200), { cols: 17, rows: 12 });
});

test('the final 10 land on 5x2, the shape the original app used', () => {
  assert.deepStrictEqual(grid(10), { cols: 5, rows: 2 });
});

test('a single ticket fills the board on its own', () => {
  assert.deepStrictEqual(grid(1), { cols: 1, rows: 1 });
});

test('the chosen cells are never wildly out of proportion', () => {
  for (let n = 12; n <= 250; n++) {
    const g = grid(n);
    const cellW = (BOARD_W - GAP * (g.cols - 1)) / g.cols;
    const cellH = (BOARD_H - GAP * (g.rows - 1)) / g.rows;
    const ratio = Math.max(cellW / cellH, cellH / cellW);
    assert.ok(ratio < 2.2, n + ' tickets gave a ' + ratio.toFixed(2) + ':1 cell in ' + g.cols + 'x' + g.rows);
  }
});

test('an exact rectangle is taken only when it is nearly free', () => {
  assert.notStrictEqual(grid(100).cols * grid(100).rows, 100);
  assert.ok(Layout.EXACT_TOLERANCE > 0.5 && Layout.EXACT_TOLERANCE < 1);
});

// 1fr tracks always fill the screen exactly; this is about empty slots in the last row
test('no realistic ticket count leaves more than a few empty slots', () => {
  for (let n = 20; n <= 250; n++) {
    const g = grid(n);
    const used = n / (g.cols * g.rows);
    assert.ok(used >= 0.85, n + ' tickets used only ' + Math.round(used * 100) + '% of ' + g.cols + 'x' + g.rows);
  }
});

test('the average grid is almost completely filled', () => {
  let total = 0;
  let counted = 0;
  for (let n = 20; n <= 250; n++) {
    const g = grid(n);
    total += n / (g.cols * g.rows);
    counted++;
  }
  const mean = total / counted;
  assert.ok(mean >= 0.95, 'mean slot usage was only ' + Math.round(mean * 100) + '%');
});

test('degenerate inputs return a usable grid instead of throwing', () => {
  assert.deepStrictEqual(grid(0), { cols: 1, rows: 1 });
  assert.deepStrictEqual(grid(-5), { cols: 1, rows: 1 });
  const noBox = Layout.chooseGrid(50, 0, 0, GAP);
  assert.strictEqual(noBox.cols, 1);
  assert.strictEqual(noBox.rows, 1);
  const tiny = Layout.chooseGrid(50, 4, 4, GAP);
  assert.ok(tiny.cols >= 1 && tiny.rows >= 1);
});

test('a missing gap is treated as no gap', () => {
  assert.deepStrictEqual(Layout.chooseGrid(120, BOARD_W, BOARD_H), Layout.chooseGrid(120, BOARD_W, BOARD_H, 0));
});

test('the returned cell size matches the tracks it chose', () => {
  for (const n of [1, 10, 130, 187, 200, 250]) {
    const g = Layout.chooseGrid(n, BOARD_W, BOARD_H, GAP);
    assert.ok(Math.abs(g.cellW * g.cols + GAP * (g.cols - 1) - BOARD_W) < 0.01, n + ' columns do not span the board');
    assert.ok(Math.abs(g.cellH * g.rows + GAP * (g.rows - 1) - BOARD_H) < 0.01, n + ' rows do not span the board');
  }
});

test('a board taller than it is wide gives more rows than columns', () => {
  const g = Layout.chooseGrid(100, 500, 1200, GAP);
  assert.ok(g.rows > g.cols, 'got ' + g.cols + 'x' + g.rows);
});

// The final board is short and wide, so without a cap the ten names land in one unreadable row
test('a column cap keeps the final ten off a single row in a short board', () => {
  const uncapped = Layout.chooseGrid(10, 941, 116, 12);
  assert.deepStrictEqual({ cols: uncapped.cols, rows: uncapped.rows }, { cols: 10, rows: 1 });

  const capped = Layout.chooseGrid(10, 941, 116, 12, 5);
  assert.deepStrictEqual({ cols: capped.cols, rows: capped.rows }, { cols: 5, rows: 2 });
});

test('the cap is a ceiling, not a target: a tall board still takes fewer columns', () => {
  const g = Layout.chooseGrid(10, 400, 1200, GAP, 5);
  assert.ok(g.cols <= 5, 'got ' + g.cols + ' columns');
  assert.ok(g.rows >= g.cols, 'got ' + g.cols + 'x' + g.rows);
});

test('a cap never leaves a ticket without a cell', () => {
  for (let n = 1; n <= 30; n++) {
    for (const cap of [1, 2, 5]) {
      const g = Layout.chooseGrid(n, BOARD_W, BOARD_H, GAP, cap);
      assert.ok(g.cols <= cap, n + ' tickets exceeded a cap of ' + cap);
      assert.ok(g.cols * g.rows >= n, n + ' tickets did not fit in ' + g.cols + 'x' + g.rows);
    }
  }
});

test('cells still span the board exactly under a cap', () => {
  const g = Layout.chooseGrid(10, 941, 116, 12, 5);
  assert.ok(Math.abs(g.cellW * g.cols + 12 * (g.cols - 1) - 941) < 0.01, 'columns do not span the board');
  assert.ok(Math.abs(g.cellH * g.rows + 12 * (g.rows - 1) - 116) < 0.01, 'rows do not span the board');
});

test('a cap of zero or nothing at all leaves the choice unchanged', () => {
  const plain = Layout.chooseGrid(130, BOARD_W, BOARD_H, GAP);
  assert.deepStrictEqual(Layout.chooseGrid(130, BOARD_W, BOARD_H, GAP, 0), plain);
  assert.deepStrictEqual(Layout.chooseGrid(130, BOARD_W, BOARD_H, GAP, 999), plain);
});
