'use strict';

const Sound = (function () {
  // Pitch and volume for a ball that hits nothing, so a wide thuds into the pitch rather than cracking
  const SCUFF_RATE = 0.62;
  const SCUFF_VOLUME = 0.88;

  function make(src) {
    const audio = new Audio(src);
    audio.preload = 'auto';
    return audio;
  }

  const wicketHit = make('./sound/wickethit.mp3');
  const scuffHit = make('./sound/wickethit.mp3');
  const winnerFanfare = make('./sound/winner.mp3');

  function play(audio, rate, volume) {
    try {
      audio.currentTime = 0;
      audio.playbackRate = rate > 0 ? rate : 1;
      audio.volume = volume >= 0 && volume <= 1 ? volume : 1;
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) {
      // Autoplay or decoding can fail; a silent draw beats a crash.
    }
  }

  return {
    SCUFF_RATE,
    SCUFF_VOLUME,
    wicket: () => play(wicketHit, 1, 1),
    scuff: () => play(scuffHit, SCUFF_RATE, SCUFF_VOLUME),
    winner: () => play(winnerFanfare, 1, 1)
  };
})();

if (typeof module !== 'undefined') module.exports = Sound;
