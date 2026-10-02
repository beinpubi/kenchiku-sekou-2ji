(() => {
  'use strict';
  const SCROLL_KEY = 'study-index-scroll-y';
  let saveTimer = 0;

  function safeGet(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
    catch (_) { return fallback; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (_) {}
  }

  function saveScroll() {
    safeSet(SCROLL_KEY, Math.max(0, Math.round(window.scrollY || 0)));
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveScroll, 120);
  }
  function restoreScroll() {
    const y = Number(safeGet(SCROLL_KEY, '0'));
    if (!Number.isFinite(y) || y <= 0) return;
    requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' }));
  }

  function basename(value) {
    if (!value) return '';
    try {
      const u = new URL(value, location.href);
      return decodeURIComponent(u.pathname.split('/').pop() || '');
    } catch (_) {
      return String(value).split('/').pop() || '';
    }
  }

  function highlightRecent() {
    const userId = safeGet('study-active-user-id', 'guest');
    const target = basename(safeGet('study-last-page:' + userId, '') || safeGet('study-last-page', ''));
    document.querySelectorAll('a.doc').forEach(a => {
      const active = !!target && basename(a.getAttribute('href')) === target;
      a.classList.toggle('is-recent', active);
      if (active) {
        a.setAttribute('aria-current', 'page');
        const sec = a.closest('.section');
        sec?.classList.remove('collapsed');
        sec?.querySelector('.section-head')?.setAttribute('aria-expanded', 'true');
      } else {
        a.removeAttribute('aria-current');
      }
    });
  }

  window.addEventListener('scroll', scheduleSave, { passive: true });
  window.addEventListener('pagehide', saveScroll);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveScroll();
  });

  window.addEventListener('pageshow', () => {
    restoreScroll();
    highlightRecent();
    [250, 800, 1800].forEach(ms => setTimeout(highlightRecent, ms));
  });
  window.addEventListener('load', () => {
    setTimeout(restoreScroll, 30);
    highlightRecent();
  });
})();
