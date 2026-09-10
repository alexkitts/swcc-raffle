'use strict';

// Cards are sized from the box they sit in, but a name is as long as it is: a wide one has to be
// measured and shrunk, because there is no CSS that reads text against the space it was given.
const Fit = (function () {
  // Halvings of the size range; seven lands within a pixel over any range the board uses
  const STEPS = 7;

  function inner(host) {
    const style = getComputedStyle(host);
    const column = style.flexDirection === 'column';
    return {
      column: column,
      gap: parseFloat(column ? style.rowGap : style.columnGap) || 0,
      width: host.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0),
      height: host.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0)
    };
  }

  // scrollWidth/scrollHeight rather than the rendered box, so a child already clipped still reports
  // its true size — which is the whole point of asking
  function needed(host, box) {
    let along = 0;
    let across = 0;
    let shown = 0;

    for (let i = 0; i < host.children.length; i++) {
      const child = host.children[i];
      if (child.hidden) continue;
      shown++;
      const w = child.scrollWidth;
      const h = child.scrollHeight;
      along += box.column ? h : w;
      across = Math.max(across, box.column ? w : h);
    }
    if (shown > 1) along += box.gap * (shown - 1);

    return { along: along, across: across };
  }

  // A pixel of headroom along the stacking axis, where sizes accumulate and scroll heights round
  // up: a fit measured as exact still clips once the browser lays the line boxes out
  const HEADROOM = 1;

  // Across the stack, a block child fills the host by design, so equality is a fit and only a
  // real overflow — a word too long to break — counts against it
  const CROSS_SLACK = 1;

  function fits(host) {
    if (!host) return true;
    const box = inner(host);
    const want = needed(host, box);
    const alongBox = box.column ? box.height : box.width;
    const acrossBox = box.column ? box.width : box.height;
    return want.along <= alongBox - HEADROOM && want.across <= acrossBox + CROSS_SLACK;
  }

  // Binary search: stepping down either overshoots the size or costs a reflow per step
  function toBox(host, node, maxPx, minPx) {
    if (!host || !node) return 0;
    const floor = minPx > 0 ? minPx : 1;
    const ceiling = maxPx > floor ? maxPx : floor;

    node.style.fontSize = ceiling + 'px';
    if (fits(host)) return ceiling;

    let low = floor;
    let high = ceiling;
    for (let i = 0; i < STEPS; i++) {
      const mid = (low + high) / 2;
      node.style.fontSize = mid + 'px';
      if (fits(host)) low = mid; else high = mid;
    }
    node.style.fontSize = low + 'px';
    return low;
  }

  // The size CSS would have chosen, which is the ceiling to shrink from on every re-fit
  function ceilingOf(node) {
    node.style.fontSize = '';
    return parseFloat(getComputedStyle(node).fontSize) || 0;
  }

  return { STEPS, HEADROOM, CROSS_SLACK, fits, toBox, ceilingOf };
})();

if (typeof module !== 'undefined') module.exports = Fit;
