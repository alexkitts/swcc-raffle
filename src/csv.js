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

    if (rows.length && !/^\d+$/.test(rows[0][1] || '')) rows = rows.slice(1);

    const tickets = [];
    const warnings = [];
    const counts = new Map();
    let skipped = 0;

    for (const cells of rows) {
      const name = cells[0] || '';
      const raw = cells[1] || '';
      if (!name || !/^\d+$/.test(raw)) { skipped++; continue; }
      const number = Number(raw);
      if (!Number.isInteger(number) || number < 1) { skipped++; continue; }
      counts.set(number, (counts.get(number) || 0) + 1);
      tickets.push({ number: number, name: name });
    }

    const duplicates = [];
    counts.forEach((count, number) => { if (count > 1) duplicates.push(number); });
    if (duplicates.length) {
      duplicates.sort((a, b) => a - b);
      const named = duplicates.map(n => '#' + n).join(', ');
      return {
        ok: false,
        error: 'Duplicate ticket numbers: ' + named + '. Every ticket must have a unique number.',
        tickets: [],
        summary: null
      };
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
