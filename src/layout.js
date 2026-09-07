'use strict';

const Layout = (function () {
  // An exact rectangle is preferred only if its cells stay within this fraction of the biggest possible
  const EXACT_TOLERANCE = 0.9;

  // CSS cannot do this: auto-fit picks columns from width alone and has no way to count the tickets
  function chooseGrid(count, width, height, gap) {
    if (!(count > 0) || !(width > 0) || !(height > 0)) {
      return { cols: 1, rows: 1, cellW: width > 0 ? width : 0, cellH: height > 0 ? height : 0 };
    }

    const spacing = gap > 0 ? gap : 0;
    const options = [];

    for (let cols = 1; cols <= count; cols++) {
      const rows = Math.ceil(count / cols);
      const cellW = (width - spacing * (cols - 1)) / cols;
      const cellH = (height - spacing * (rows - 1)) / rows;
      if (cellW <= 0 || cellH <= 0) continue;
      options.push({
        cols: cols,
        rows: rows,
        size: Math.min(cellW, cellH),
        exact: cols * rows === count
      });
    }

    if (!options.length) return { cols: 1, rows: count, cellW: width, cellH: height };

    const biggest = options.reduce((a, b) => (b.size > a.size ? b : a));
    const tidy = options.filter(o => o.exact && o.size >= biggest.size * EXACT_TOLERANCE);
    const chosen = tidy.length ? tidy.reduce((a, b) => (b.size > a.size ? b : a)) : biggest;

    return {
      cols: chosen.cols,
      rows: chosen.rows,
      cellW: (width - spacing * (chosen.cols - 1)) / chosen.cols,
      cellH: (height - spacing * (chosen.rows - 1)) / chosen.rows
    };
  }

  return { EXACT_TOLERANCE, chooseGrid };
})();

if (typeof module !== 'undefined') module.exports = Layout;
