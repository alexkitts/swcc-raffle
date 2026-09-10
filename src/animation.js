'use strict';

const Animation = (function () {
  const ball = () => document.getElementById('ball');
  const overlays = () => document.getElementById('overlays');

  let currentPopup = null;
  let popupTimer = null;

  function resetBall() {
    const el = ball();
    if (!el) return;
    el.style.transform = 'translateX(-50%)';
    el.classList.remove('ball--live');
  }

  function showBall() {
    const el = ball();
    if (el) el.classList.add('ball--live');
  }

  // Resolves when the ball lands; awaiting this makes overlapping balls impossible
  function throwBall(targetEl, ballMs) {
    const el = ball();
    if (!el || !targetEl) return Promise.resolve();
    showBall();

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

  // Low on the stumps rather than mid-height, which is where a delivery would actually pitch up
  const stumpTarget = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.74 };
  };

  // Arcs the ball to a point rather than an element, so a wide can miss on purpose
  // Measured off the clip: at release his hand is 71.4% across and 5.7% down the frame
  const BOWLER_HAND = Object.freeze({ x: 0.714, y: 0.057 });

  function bowlerHand() {
    const video = document.getElementById('bowler');
    if (!video) return null;
    const r = video.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left + BOWLER_HAND.x * r.width, y: r.top + BOWLER_HAND.y * r.height };
  }

  // Leaves the bowler's hand when we know where it is, and the bottom of the screen otherwise
  function bowlAt(point, ms, from) {
    const el = ball();
    if (!el || !point) return Promise.resolve();
    showBall();

    const cx = window.innerWidth / 2;
    const cy = window.innerHeight - 40;
    const sx = from ? from.x - cx : 0;
    const sy = from ? from.y - cy : 0;
    const dx = point.x - cx;
    const dy = point.y - cy;
    const span = Math.sqrt((dx - sx) * (dx - sx) + (dy - sy) * (dy - sy));
    // Lofted whichever way the ball is going, because the loop over the pitch is the nice part
    const arc = Math.min(220, span * 0.32);
    const at = (f, lift, scale) => ({
      transform: 'translateX(-50%) translate(' + (sx + (dx - sx) * f) + 'px, ' +
        ((sy + (dy - sy) * f) - (arc * lift)) + 'px) scale(' + scale + ')',
      offset: f
    });

    const animation = el.animate([
      at(0, 0, 1),
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
    const w = window.innerWidth;
    const h = window.innerHeight;

    // A boundary has to leave the screen, or the shot does not read from the back of the room
    const paths = {
      wide: { x: from.dx + side * w * 0.22, y: from.dy + 180, scale: 0.3, fade: 1 },
      defended: { x: from.dx + side * 90, y: from.dy + 170, scale: 0.55, fade: 1 },
      single: { x: from.dx + side * 300, y: from.dy + 120, scale: 0.4, fade: 1 },
      four: { x: from.dx + side * w * 1.15, y: from.dy - 60, scale: 0.16, fade: 0 },
      six: { x: from.dx + side * w * 0.5, y: from.dy - h * 1.25, scale: 0.08, fade: 0 },
      deflected: { x: from.dx + side * w * 0.45, y: from.dy - h * 0.35, scale: 0.18, fade: 0 }
    };
    const target = paths[kind] || paths.defended;

    const animation = el.animate([
      { transform: 'translateX(-50%) translate(' + from.dx + 'px, ' + from.dy + 'px) scale(0.4)', opacity: 1, offset: 0 },
      { transform: 'translateX(-50%) translate(' + target.x + 'px, ' + target.y + 'px) scale(' + target.scale + ')', opacity: target.fade, offset: 0.82 },
      { transform: 'translateX(-50%) translate(' + target.x + 'px, ' + target.y + 'px) scale(' + target.scale + ')', opacity: 0, offset: 1 }
    ], { duration: ms, easing: 'cubic-bezier(.12,.7,.35,1)' });

    return animation.finished.catch(() => {}).then(() => { resetBall(); });
  }

  const rectOf = (el) => el.getBoundingClientRect();

  const boxFrames = (a, b) => [
    { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' },
    { left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px' }
  ];

  // Below this the bail reads as a smudge from the back of the room, so the number goes instead
  const BAIL_MIN_NAME_PX = 13;

  // Once the number has already gone, a small name still beats a clipped one
  const BAIL_FLOOR_PX = 9;

  // The bail is a fixed slot on the stumps, so a long name is measured down to fit rather than
  // clipped; when even the smallest readable name will not sit next to the number, the number goes
  function fitBail(clone, box) {
    clone.style.left = box.left + 'px';
    clone.style.top = box.top + 'px';
    clone.style.width = box.width + 'px';
    clone.style.height = box.height + 'px';

    const name = clone.querySelector('.ticket-name');
    const number = clone.querySelector('.ticket-number');
    if (!name) return;

    const ceiling = Fit.ceilingOf(name);
    Fit.toBox(clone, name, ceiling, BAIL_MIN_NAME_PX);
    if (Fit.fits(clone) || !number) return;

    number.hidden = true;
    Fit.toBox(clone, name, ceiling, BAIL_FLOOR_PX);
  }

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

    // Measured at its destination size, before the flight starts, so the name never resizes mid-air
    fitBail(clone, end);

    cell.classList.add('ticket--away');

    // A gentle ease both ends, so a long present glides rather than darting then crawling
    const animation = clone.animate(boxFrames(start, end), {
      duration: ms, easing: 'cubic-bezier(.4,0,.25,1)', fill: 'forwards'
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
      { transform: 'translate(26vw, -34vh) rotate(265deg)', opacity: 0 }
    ], { duration: ms, easing: 'cubic-bezier(.2,.85,.3,1)', fill: 'forwards' });
    return animation.finished.catch(() => {}).then(() => {
      if (clone.parentNode) clone.parentNode.removeChild(clone);
    });
  }

  // The bat swings in for anything the batsman actually connected with
  function swingBat(point, ms, delayMs) {
    const host = overlays();
    if (!host || !point) return;
    const duration = Math.max(320, ms);
    const delay = Math.max(0, delayMs || 0);

    const bat = document.createElement('div');
    bat.className = 'bat';
    bat.style.left = point.x + 'px';
    bat.style.animationDuration = duration + 'ms';
    bat.style.animationDelay = delay + 'ms';
    host.appendChild(bat);

    // Hang it so the blade covers the aim point, now that its height is known
    bat.style.top = (point.y - bat.offsetHeight * 0.72) + 'px';

    setTimeout(() => { if (bat.parentNode) bat.parentNode.removeChild(bat); }, delay + duration + 160);
  }

  function hitStumps() {
    const stumps = document.getElementById('stumps');
    if (stumps) stumps.classList.add('stumps--hit');
  }

  function resetStumps() {
    const stumps = document.getElementById('stumps');
    if (stumps) stumps.classList.remove('stumps--hit');
  }

  // Purely decorative, so a clip that will not play must never hold up a delivery
  function runBowler() {
    const video = document.getElementById('bowler');
    if (!video) return;
    video.classList.add('bowler--live');
    video.addEventListener('ended', () => video.classList.remove('bowler--live'), { once: true });
    try {
      video.currentTime = 0;
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) {
      // An unplayable clip is a missing flourish, not a broken draw
    }
  }

  function resetBowler() {
    const video = document.getElementById('bowler');
    if (!video) return;
    video.classList.remove('bowler--live');
    try {
      video.pause();
      video.currentTime = 0;
    } catch (e) {
      // Nothing to do; the class is already off
    }
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
    resetBall();
    resetBowler();
    const host = overlays();
    while (host && host.firstChild) host.removeChild(host.firstChild);
  }

  return {
    throwBall, strike, resetBall, clearOverlays,
    bowlAt, ballAway, presentToBail, returnFromBail, bailBowled,
    swingBat, hitStumps, resetStumps, showOutcome, centreOf,
    runBowler, resetBowler, bowlerHand,
    showWicketPopup, showWinnerBanner, stumpTarget
  };
})();

if (typeof module !== 'undefined') module.exports = Animation;
