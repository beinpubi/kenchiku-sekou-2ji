(function() {
    'use strict';
    const root = document.documentElement;
    const input = document.getElementById('q');
    const docs = [...document.querySelectorAll('.doc')];
    const sections = [...document.querySelectorAll('.section')];
    const resultCount = document.getElementById('resultCount');
    const empty = document.getElementById('empty');
    const themeToggle = document.getElementById('themeToggle');
    const themeColorMeta = document.getElementById('themeColorMeta');

    function safeSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
    function safeGet(key, fallback = null) { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; } }
    function safeRemove(key) { try { localStorage.removeItem(key); } catch (e) {} }

    function applyTheme(theme) {
      const next = theme === 'light' ? 'light' : 'dark';
      root.dataset.theme = next;
      safeSet('study-theme', next);
      if (themeToggle) {
        themeToggle.textContent = next === 'dark' ? '☀' : '☾';
        themeToggle.setAttribute('aria-pressed', next === 'light' ? 'true' : 'false');
      }
      if (themeColorMeta) themeColorMeta.setAttribute('content', next === 'dark' ? '#0b1220' : '#f5f7fb');
    }

    applyTheme(root.dataset.theme === 'light' ? 'light' : 'dark');
    themeToggle?.addEventListener('click', () => applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));

    document.querySelectorAll('.section-head').forEach(btn => {
      btn.addEventListener('click', () => {
        const sec = btn.closest('.section');
        sec.classList.toggle('collapsed');
        btn.setAttribute('aria-expanded', String(!sec.classList.contains('collapsed')));
      });
    });

    function normalize(s) { return s.toLowerCase().normalize('NFKC').trim(); }

    function filter() {
      const q = normalize(input.value);
      let shown = 0;
      docs.forEach(a => {
        const ok = !q || normalize(a.dataset.search || '').includes(q);
        a.classList.toggle('hidden', !ok);
        if (ok) shown++;
      });
      sections.forEach(sec => {
        const visible = sec.querySelectorAll('.doc:not(.hidden)').length;
        sec.classList.toggle('hidden', visible === 0);
        if (q && visible) sec.classList.remove('collapsed');
      });
      resultCount.textContent = `${shown} / ${docs.length} file`;
      empty.style.display = shown ? 'none' : 'block';
    }
    input.addEventListener('input', filter);

    // Remember a manually selected lesson in a user-scoped key.
    docs.forEach(a => {
      a.addEventListener('click', () => {
        try {
          const u = new URL(a.getAttribute('href'), location.href);
          const userId = safeGet('study-active-user-id', 'guest');
          safeSet('study-last-page:' + userId, u.pathname + u.search);
          safeSet('study-last-active-at:' + userId, String(Date.now()));
          safeRemove('study-explicit-home');
        } catch (e) {}
      });
    });
  })();
