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
