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

test('handles a mid-field unescaped quote as a literal character, not a quote toggle', () => {
  const r = Csv.parse('A,1\nO"Brien,7\nC,6\n');
  assert.deepStrictEqual(r.tickets.map(t => t.name), ['A', 'O"Brien', 'C']);
  assert.deepStrictEqual(r.tickets.map(t => t.number), [1, 7, 6]);
});

test('keeps a first row whose name contains "name" when its number cell is numeric', () => {
  const r = Csv.parse('Nameless Joe,5\nB,6\n');
  assert.strictEqual(r.tickets.length, 2);
  assert.strictEqual(r.tickets[0].name, 'Nameless Joe');
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
