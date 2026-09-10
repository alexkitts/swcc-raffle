'use strict';
const test = require('node:test');
const assert = require('node:assert');

// Fit measures real elements, so the tests stand in a fake one whose text is a fixed number of
// pixels per character. It is a crude font, but the only thing Fit reasons about is size.
const CHAR_W = 0.6;
const LINE_H = 1.15;

function makeChild(text, opts) {
  const o = opts || {};
  return {
    hidden: false,
    text: text,
    wrap: o.wrap !== false,          // a name wraps; a bail's number does not
    fontSize: o.fontSize || 16,
    style: {},
    width: o.width || 0,             // the width the host gives it, set by the host below
    get scrollWidth() {
      const full = this.text.length * CHAR_W * this.fontSize;
      if (!this.wrap || !this.width) return Math.ceil(full);
      const longest = this.text.split(' ')
        .reduce((a, w) => Math.max(a, w.length), 0) * CHAR_W * this.fontSize;
      return Math.ceil(Math.max(Math.min(full, this.width), longest));
    },
    get scrollHeight() {
      const full = this.text.length * CHAR_W * this.fontSize;
      const lines = this.wrap && this.width ? Math.max(1, Math.ceil(full / this.width)) : 1;
      return Math.ceil(lines * this.fontSize * LINE_H);
    }
  };
}

function makeHost(children, opts) {
  const o = opts || {};
  const pad = o.padding || 0;
  const host = {
    clientWidth: o.width,
    clientHeight: o.height,
    padding: pad,
    column: o.column !== false,
    gap: o.gap || 0,
    children: children
  };
  children.forEach(c => { c.width = o.width - pad * 2; });
  return host;
}

// Fit reads layout through getComputedStyle, which does not exist outside a browser
global.getComputedStyle = (el) => ({
  flexDirection: el.column ? 'column' : 'row',
  rowGap: el.gap + 'px',
  columnGap: el.gap + 'px',
  paddingLeft: el.padding + 'px',
  paddingRight: el.padding + 'px',
  paddingTop: el.padding + 'px',
  paddingBottom: el.padding + 'px',
  fontSize: (el.fontSize || 16) + 'px'
});

const Fit = require('../src/fit.js');

// Fit sets style.fontSize as a string; the fake element has to act on that like a real one would
function trackFontSize(child) {
  const style = {};
  Object.defineProperty(child, 'style', {
    get: () => style,
    configurable: true
  });
  const apply = () => {
    const px = parseFloat(style.fontSize);
    child.fontSize = Number.isFinite(px) ? px : 16;
  };
  return new Proxy(child, {
    get(target, key) {
      apply();
      return target[key];
    }
  });
}

test('a name that already fits is left at its full size', () => {
  const name = trackFontSize(makeChild('Bo Li'));
  const host = makeHost([name], { width: 200, height: 120, padding: 6 });
  assert.strictEqual(Fit.toBox(host, name, 40, 9), 40);
});

test('a name too tall for its card is shrunk until it fits', () => {
  const name = trackFontSize(makeChild('Priyanka Balasubramanian'));
  const host = makeHost([name], { width: 200, height: 90, padding: 6 });
  const px = Fit.toBox(host, name, 48, 9);
  assert.ok(px < 48, 'it was not shrunk at all');
  assert.ok(px > 9, 'it fell all the way to the floor');
  assert.ok(Fit.fits(host), 'it still does not fit at ' + px + 'px');
});

test('shrinking stops at the floor rather than vanishing', () => {
  const name = trackFontSize(makeChild('Bartholomew Fitzwilliam-Cholmondeley the Third'));
  const host = makeHost([name], { width: 60, height: 20, padding: 4 });
  assert.strictEqual(Fit.toBox(host, name, 40, 12), 12);
});

test('the largest size that fits is chosen, not merely a size that fits', () => {
  const name = trackFontSize(makeChild('Alexandra Fotheringay'));
  const host = makeHost([name], { width: 220, height: 100, padding: 6 });
  const px = Fit.toBox(host, name, 60, 9);

  name.style.fontSize = (px + 2) + 'px';
  assert.ok(!Fit.fits(host), 'two pixels larger would also have fitted');
});

test('a hidden sibling gives its space back', () => {
  const name = trackFontSize(makeChild('Christopher Warburton-Smyth', { wrap: false }));
  const number = makeChild('#2', { wrap: false });
  const host = makeHost([name, number], { width: 300, height: 40, padding: 5, column: false, gap: 10 });

  const withNumber = Fit.toBox(host, name, 32, 9);
  number.hidden = true;
  const without = Fit.toBox(host, name, 32, 9);
  assert.ok(without > withNumber, 'dropping the number bought no room');
});

test('a card with room to spare is reported as fitting', () => {
  const name = trackFontSize(makeChild('Ed Ng'));
  const host = makeHost([name], { width: 200, height: 200, padding: 6 });
  name.style.fontSize = '20px';
  assert.strictEqual(Fit.fits(host), true);
});

test('nothing to measure is never an error', () => {
  assert.strictEqual(Fit.toBox(null, null, 40, 9), 0);
  assert.strictEqual(Fit.fits(null), true);
});
