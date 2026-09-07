'use strict';

const Sound = (function () {
  function make(src) {
    const audio = new Audio(src);
    audio.preload = 'auto';
    return audio;
  }

  const wicketHit = make('./sound/wickethit.mp3');
  const winnerFanfare = make('./sound/winner.mp3');

  // Autoplay policy can reject these; a silent draw is better than a crash.
  function play(audio) {
    try {
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* ignore */ }
  }

  return {
    wicket: () => play(wicketHit),
    winner: () => play(winnerFanfare)
  };
})();

if (typeof module !== 'undefined') module.exports = Sound;
