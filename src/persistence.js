'use strict';

const Persistence = (function () {
  const KEY = 'swcc-raffle:v1';
  const PROBE = KEY + ':probe';

  function defaultStorage() {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null;
    } catch (e) {
      return null;   // some browsers throw on the property access itself
    }
  }

  function pick(storage) {
    return storage === undefined ? defaultStorage() : storage;
  }

  // localStorage is not guaranteed on a file:// origin, so probe for real rather than assuming
  function isAvailable(storage) {
    const s = pick(storage);
    if (!s) return false;
    try {
      s.setItem(PROBE, '1');
      const ok = s.getItem(PROBE) === '1';
      s.removeItem(PROBE);
      return ok;
    } catch (e) {
      try { s.removeItem(PROBE); } catch (ignored) {}
      return false;
    }
  }

  function save(state, storage) {
    const s = pick(storage);
    if (!s) return false;
    try {
      s.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  function load(storage) {
    const s = pick(storage);
    if (!s) return null;
    try {
      const raw = s.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function clear(storage) {
    const s = pick(storage);
    if (!s) return;
    try { s.removeItem(KEY); } catch (e) {}
  }

  function isResumable(saved) {
    if (!saved || typeof saved !== 'object') return false;
    if (!Array.isArray(saved.tickets) || !saved.tickets.length) return false;
    return saved.phase !== 'awaiting-csv' && saved.phase !== 'won';
  }

  function toJson(state) { return JSON.stringify(state, null, 2); }

  function fromJson(text) {
    try {
      const parsed = JSON.parse(text);
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  return { KEY, isAvailable, save, load, clear, isResumable, toJson, fromJson };
})();

if (typeof module !== 'undefined') module.exports = Persistence;
