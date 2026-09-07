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

  const centreOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  // Arcs the ball to a point rather than an element, so a wide can miss on purpose
  function bowlAt(point, ms) {
    const el = ball();
    if (!el || !point) return Promise.resolve();

    const cx = window.innerWidth / 2;
    const cy = window.innerHeight - 40;
    const dx = point.x - cx;
    const dy = point.y - cy;
    const arc = Math.min(220, Math.sqrt(dx * dx + dy * dy) * 0.32);
    const at = (f, lift, scale) => ({
      transform: 'translateX(-50%) translate(' + (dx * f) + 'px, ' + ((dy * f) - (arc * lift)) + 'px) scale(' + scale + ')',
      offset: f
    });

    const animation = el.animate([
      { transform: 'translateX(-50%) translate(0px, 0px) scale(1)', offset: 0 },
      at(0.25, 0.7, 0.88),
      at(0.55, 1, 0.66),
      at(0.8, 0.7, 0.5),
      at(1, 0, 0.4)
    ], { duration: ms, easing: 'ease-out' });

    return animation.finished.catch(() => {}).then(() => ({ dx: dx, dy: dy }));
  }

  // Carries the ball on from where it landed, in a direction that suits the shot
  function ballAway(kind, from, ms) {
    const el = ball();
    if (!el) return Promise.resolve();

    const side = Math.random() < 0.5 ? -1 : 1;
    const paths = {
      wide: { x: from.dx + side * window.innerWidth * 0.34, y: from.dy + 120, scale: 0.28 },
      defended: { x: from.dx + side * 70, y: from.dy + 150, scale: 0.5 },
      single: { x: from.dx + side * 220, y: from.dy + 90, scale: 0.36 },
      four: { x: from.dx + side * window.innerWidth * 0.6, y: from.dy + 40, scale: 0.2 },
      six: { x: from.dx + side * window.innerWidth * 0.3, y: from.dy - window.innerHeight * 0.75, scale: 0.12 }
    };
    const target = paths[kind] || paths.defended;

    const animation = el.animate([
      { transform: 'translateX(-50%) translate(' + from.dx + 'px, ' + from.dy + 'px) scale(0.4)', opacity: 1, offset: 0 },
      { transform: 'translateX(-50%) translate(' + target.x + 'px, ' + target.y + 'px) scale(' + target.scale + ')', opacity: 0, offset: 1 }
    ], { duration: ms, easing: 'cubic-bezier(.2,.6,.4,1)' });

    return animation.finished.catch(() => {}).then(() => { resetBall(); });
  }

  const rectOf = (el) => el.getBoundingClientRect();

  const boxFrames = (a, b) => [
    { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' },
    { left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px' }
  ];

  // A clone flies to the crease so the grid never reflows, and its text lays out at bail size
  function presentToBail(cell, slot, ms) {
    if (!cell || !slot) return Promise.resolve(null);
    const start = rectOf(cell);
    const end = rectOf(slot);

    const clone = cell.cloneNode(true);
    clone.classList.remove('ticket--live', 'ticket--out');
    clone.classList.add('ticket--bail');
    clone.style.position = 'fixed';
    clone.style.margin = '0';
    clone.style.zIndex = '7';
    overlays().appendChild(clone);

    cell.classList.add('ticket--away');

    const animation = clone.animate(boxFrames(start, end), {
      duration: ms, easing: 'cubic-bezier(.3,.9,.3,1)', fill: 'forwards'
    });
    return animation.finished.catch(() => {}).then(() => clone);
  }

  function returnFromBail(clone, cell, ms) {
    if (!clone) { if (cell) cell.classList.remove('ticket--away'); return Promise.resolve(); }
    const start = rectOf(clone);
    const end = rectOf(cell);
    const animation = clone.animate(boxFrames(start, end), {
      duration: ms, easing: 'cubic-bezier(.3,.9,.3,1)', fill: 'forwards'
    });
    return animation.finished.catch(() => {}).then(() => {
      if (clone.parentNode) clone.parentNode.removeChild(clone);
      if (cell) cell.classList.remove('ticket--away');
    });
  }

  // The bail is knocked away with the stumps
  function bailBowled(clone, cell, ms) {
    if (cell) cell.classList.remove('ticket--away');
    if (!clone) return Promise.resolve();
    const animation = clone.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: 'translate(-34vw, -26vh) rotate(-220deg)', opacity: 0 }
    ], { duration: ms, easing: 'cubic-bezier(.2,.85,.3,1)', fill: 'forwards' });
    return animation.finished.catch(() => {}).then(() => {
      if (clone.parentNode) clone.parentNode.removeChild(clone);
    });
  }

  // The bat swings in for anything the batsman actually connected with
  function swingBat(ms) {
    const host = overlays();
    if (!host) return;
    const bat = document.createElement('div');
    bat.className = 'bat';
    host.appendChild(bat);
    setTimeout(() => { if (bat.parentNode) bat.parentNode.removeChild(bat); }, ms + 250);
  }

  function hitStumps() {
    const stumps = document.getElementById('stumps');
    if (stumps) stumps.classList.add('stumps--hit');
  }

  function resetStumps() {
    const stumps = document.getElementById('stumps');
    if (stumps) stumps.classList.remove('stumps--hit');
  }

  function showOutcome(text, ms) {
    const host = overlays();
    if (!host) return;
    const node = document.createElement('div');
    node.className = 'outcome-popup';
    node.textContent = text;
    node.style.animationDuration = (ms / 1000) + 's';
    host.appendChild(node);
    setTimeout(() => { if (node.parentNode) node.parentNode.removeChild(node); }, ms);
  }

  function clearOverlays() {
    removePopup();
    const host = overlays();
    while (host && host.firstChild) host.removeChild(host.firstChild);
  }

  return {
    throwBall, strike, resetBall, clearOverlays,
    bowlAt, ballAway, presentToBail, returnFromBail, bailBowled,
    swingBat, hitStumps, resetStumps, showOutcome, centreOf,
    showWicketPopup, showWinnerBanner
  };
})();

if (typeof module !== 'undefined') module.exports = Animation;
