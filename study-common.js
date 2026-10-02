(function () {
  'use strict';

  const root = document.documentElement;
  const body = document.body;
  const q = id => document.getElementById(id);
  const FONT_LEVELS = Array.from({ length: 21 }, (_, i) => 50 + i * 5);

  const controls = q('control-cluster');
  const controlsToggle = q('controls-toggle');
  const controlPanel = q('control-panel');
  const themeButton = q('theme-toggle');
  const modeButton = q('mode-toggle');
  const fontDown = q('font-down');
  const fontUp = q('font-up');
  const fontReset = q('font-reset');
  const tocButton = q('toc-toggle');
  const tocClose = q('toc-close');
  const overlay = q('toc-overlay');
  const prevButton = q('section-prev');
  const nextButton = q('section-next');
  const homeButton = q('home-button');
  const forceColumnsButton = q('force-columns-toggle');

  const pageKey = location.pathname + location.search;
  const activeUserId = safeGet('study-active-user-id', 'guest');
  const readerStateKey = 'study-reader-position:' + activeUserId + ':' + pageKey;
  const legacyReaderStateKey = 'study-reader-position:' + pageKey;
  const legacyRenamedFileName = document.querySelector('meta[name="study-legacy-file-path"]')?.content || '';
  const legacyRenamedPageKeys = [
    location.pathname.replace(/[^/]*$/, encodeURI(legacyRenamedFileName)) + location.search,
    location.pathname.replace(/[^/]*$/, legacyRenamedFileName) + location.search
  ];
  const legacyRenamedReaderStateKeys = [...new Set(legacyRenamedPageKeys)].map(
    key => 'study-reader-position:' + activeUserId + ':' + key
  );
  const lastPageKey = 'study-last-page:' + activeUserId;
  const explicitHomeKey = 'study-explicit-home';
  const anchorSelector = [
    '.page-shell h1', '.page-shell h2', '.page-shell h3', '.page-shell h4',
    '.page-shell p', '.page-shell li', '.page-shell td', '.page-shell th',
    '.page-shell figcaption', '.page-shell .card-title'
  ].join(', ');

  let anchorElements = [];
  let lastStablePosition = null;
  let scrollSaveTimer = 0;
  let resizeRestoreTimer = 0;
  let resizeAnchor = null;
  let suppressScrollSaveUntil = 0;
  function layoutViewportSize() {
    const de = document.documentElement;
    return {
      width: de.clientWidth || window.innerWidth,
      height: de.clientHeight || window.innerHeight
    };
  }

  function visualViewportScale() {
    const vv = window.visualViewport;
    return vv && Number.isFinite(vv.scale) ? vv.scale : 1;
  }

  function isPinchZoomActive() {
    return Math.abs(visualViewportScale() - 1) > 0.015;
  }

  const initialLayoutViewport = layoutViewportSize();
  let lastViewportWidth = initialLayoutViewport.width;
  let lastViewportHeight = initialLayoutViewport.height;
  let pinchZoomSession = false;

  try {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  } catch (e) {}

  function safeGet(key, fallback = null) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (e) {
      return fallback;
    }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  function safeRemove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  /* ---------- Persistent page / PWA resume metadata ---------- */

  function rememberCurrentPage() {
    safeSet(lastPageKey, pageKey);
    safeSet('study-last-active-at', String(Date.now()));
  }

  rememberCurrentPage();

  /* ---------- Layout viewport geometry ---------- */

  /*
    Pinch zoom changes visualViewport.width / height / scale.
    It must NOT change the document layout width.

    Therefore --app-viewport-width is derived only from the layout viewport
    (documentElement.clientWidth / innerWidth), never from visualViewport.width.
  */
  function syncViewportGeometry() {
    const { width } = layoutViewportSize();
    root.style.setProperty(
      '--app-viewport-width',
      `${Math.round(width * 100) / 100}px`
    );
  }

  syncViewportGeometry();

  /* ---------- Reader anchors ---------- */

  function rebuildReaderAnchors() {
    anchorElements = Array.from(document.querySelectorAll(anchorSelector));
    anchorElements.forEach((el, index) => {
      el.dataset.readerKey = 'r' + index;
    });
  }

  function closestReaderElement(node) {
    if (!node) return null;
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return el ? el.closest('[data-reader-key]') : null;
  }

  function caretAtPoint(x, y) {
    try {
      if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y);
        if (!pos || !pos.offsetNode) return null;
        return { node: pos.offsetNode, offset: pos.offset };
      }
      if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(x, y);
        if (!range) return null;
        return { node: range.startContainer, offset: range.startOffset };
      }
    } catch (e) {}
    return null;
  }

  function textOffsetFromElementStart(element, node, offset) {
    try {
      const range = document.createRange();
      range.setStart(element, 0);
      range.setEnd(node, offset);
      return range.toString().length;
    } catch (e) {
      return 0;
    }
  }

  function domPositionFromTextOffset(element, targetOffset) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let remaining = Math.max(0, targetOffset);
    let node = walker.nextNode();
    let last = null;

    while (node) {
      last = node;
      const len = node.nodeValue ? node.nodeValue.length : 0;
      if (remaining <= len) {
        return { node, offset: remaining };
      }
      remaining -= len;
      node = walker.nextNode();
    }

    if (last) return { node: last, offset: last.nodeValue ? last.nodeValue.length : 0 };
    return { node: element, offset: 0 };
  }

  function characterRect(node, offset) {
    try {
      if (node.nodeType !== Node.TEXT_NODE) {
        const r = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
        return r && r.height ? r : null;
      }

      const len = node.nodeValue ? node.nodeValue.length : 0;
      if (!len) return node.parentElement ? node.parentElement.getBoundingClientRect() : null;

      let start = Math.max(0, Math.min(offset, len - 1));
      let end = Math.min(len, start + 1);
      if (offset >= len && len > 0) {
        start = len - 1;
        end = len;
      }

      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      const rects = range.getClientRects();
      return rects.length ? rects[0] : range.getBoundingClientRect();
    } catch (e) {
      return null;
    }
  }

  function captureReadingPosition() {
    if (!anchorElements.length) rebuildReaderAnchors();
    if (!anchorElements.length) return null;

    const vv = window.visualViewport;
    const viewportWidth = vv ? vv.width : window.innerWidth;
    const topProbe = 6;
    const ys = [topProbe, 12, 18, 26, 36, 50];
    const xs = [];

    for (let x = 12; x <= Math.min(viewportWidth - 12, 220); x += 16) xs.push(x);
    xs.push(viewportWidth * .25, viewportWidth * .5, viewportWidth * .75);

    for (const y of ys) {
      for (const x of xs) {
        if (x <= 0 || x >= viewportWidth) continue;
        const caret = caretAtPoint(x, y);
        if (!caret) continue;
        const element = closestReaderElement(caret.node);
        if (!element || !document.querySelector('.page-shell')?.contains(element)) continue;

        const offset = textOffsetFromElementStart(element, caret.node, caret.offset);
        const rect = characterRect(caret.node, caret.offset);
        const key = element.dataset.readerKey;
        if (key && rect && Number.isFinite(rect.top)) {
          return { key, offset, top: rect.top };
        }
      }
    }

    /* Fallback: nearest textual block to the top edge. */
    let best = null;
    let bestDistance = Infinity;
    for (const element of anchorElements) {
      const rect = element.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > (vv ? vv.height : window.innerHeight)) continue;
      const distance = Math.abs(rect.top);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { key: element.dataset.readerKey, offset: 0, top: rect.top };
      }
    }
    return best;
  }

  function restoreReadingPosition(state) {
    if (!state || !state.key) return false;
    if (!anchorElements.length) rebuildReaderAnchors();

    const element = document.querySelector('[data-reader-key="' + CSS.escape(state.key) + '"]');
    if (!element) return false;

    const pos = domPositionFromTextOffset(element, Number(state.offset) || 0);
    const rect = characterRect(pos.node, pos.offset);
    if (!rect || !Number.isFinite(rect.top)) return false;

    const desiredTop = Number.isFinite(Number(state.top)) ? Number(state.top) : 6;
    const delta = rect.top - desiredTop;
    if (Math.abs(delta) < .5) return true;

    suppressScrollSaveUntil = Date.now() + 700;
    const oldBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollBy(0, delta);
    root.style.scrollBehavior = oldBehavior;
    return true;
  }

  function saveReaderState(state) {
    if (!state) return;
    lastStablePosition = state;
    safeSet(readerStateKey, JSON.stringify(state));
  }

  function readReaderState() {
    try {
      const raw = safeGet(readerStateKey);
      if (raw) return JSON.parse(raw);

      // Import the user-scoped position saved under the pre-rename filename.
      for (const oldKey of legacyRenamedReaderStateKeys) {
        const renamedRaw = safeGet(oldKey);
        if (renamedRaw) {
          safeSet(readerStateKey, renamedRaw);
          return JSON.parse(renamedRaw);
        }
      }

      // One-time backward-compatible import of the pre-sync local position.
      const legacyOwner = safeGet('study-legacy-import-owner');
      const mayImportLegacy = activeUserId !== 'guest' && (!legacyOwner || legacyOwner === activeUserId);
      if (mayImportLegacy) {
        const legacyRaw = safeGet(legacyReaderStateKey);
        if (legacyRaw) {
          safeSet('study-legacy-import-owner', activeUserId);
          safeSet(readerStateKey, legacyRaw);
          return JSON.parse(legacyRaw);
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function settleRestore(state, delays = [0, 60, 180, 420]) {
    if (!state) return;
    suppressScrollSaveUntil = Date.now() + Math.max(...delays) + 350;
    delays.forEach(delay => {
      window.setTimeout(() => {
        requestAnimationFrame(() => restoreReadingPosition(state));
      }, delay);
    });
    window.setTimeout(() => {
      saveReaderState(state);
    }, Math.max(...delays) + 120);
  }

  function preserveReadingPosition(mutator) {
    const state = captureReadingPosition() || lastStablePosition || readReaderState();
    if (state) saveReaderState(state);
    mutator();
    rebuildReaderAnchors();
    settleRestore(state);
  }

  function scheduleReaderSave() {
    if (Date.now() < suppressScrollSaveUntil) return;
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer = window.setTimeout(() => {
      if (Date.now() < suppressScrollSaveUntil) return;
      const state = captureReadingPosition();
      if (state) saveReaderState(state);
    }, 130);
  }

  rebuildReaderAnchors();
  lastStablePosition = readReaderState();

  /* ---------- Theme ---------- */

  function applyTheme(theme) {
    theme = theme === 'light' ? 'light' : 'dark';
    root.dataset.theme = theme;
    safeSet('study-theme', theme);
    if (themeButton) {
      themeButton.textContent = theme === 'dark' ? '☀' : '☾';
      themeButton.title = theme === 'dark' ? 'Chuyển sang Light theme' : 'Chuyển sang Dark theme';
      themeButton.setAttribute('aria-label', themeButton.title);
      themeButton.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
    }
  }

  /* ---------- Full / Keywords ---------- */

  function applyMode(mode) {
    mode = mode === 'keywords' ? 'keywords' : 'full';
    root.dataset.studyMode = mode;
    body.classList.toggle('keyword-focus', mode === 'keywords');
    safeSet('study-mode', mode);
    if (modeButton) {
      modeButton.textContent = mode === 'full' ? '🎯' : '📖';
      modeButton.title = mode === 'full' ? 'Chuyển sang Keywords mode' : 'Trở lại Full mode';
      modeButton.setAttribute('aria-label', modeButton.title);
      modeButton.setAttribute('aria-pressed', mode === 'keywords' ? 'true' : 'false');
    }
  }

  /* ---------- Font 50-150%, step 5% ---------- */

  function currentScale() {
    const saved = Number(safeGet('study-font-scale', '100'));
    return FONT_LEVELS.includes(saved) ? saved : 100;
  }

  function applyFontScale(scale) {
    if (!FONT_LEVELS.includes(scale)) scale = 100;
    root.style.setProperty('--base-font-size', (16 * scale / 100) + 'px');
    safeSet('study-font-scale', String(scale));

    if (fontReset) {
      fontReset.textContent = scale + '%';
      fontReset.title = 'Cỡ chữ hiện tại ' + scale + '%. Chạm để về 100%';
      fontReset.setAttribute('aria-label', fontReset.title);
    }
    if (fontDown) fontDown.disabled = scale === FONT_LEVELS[0];
    if (fontUp) fontUp.disabled = scale === FONT_LEVELS[FONT_LEVELS.length - 1];
  }


  /* ---------- Forced bilingual two-column mode ---------- */

  const FORCE_COLUMNS_KEY = 'study-force-columns';

  function applyForceColumns(enabled, persist = true) {
    const on = !!enabled;
    root.dataset.forceColumns = on ? 'on' : 'off';
    if (persist) safeSet(FORCE_COLUMNS_KEY, on ? 'on' : 'off');
    if (forceColumnsButton) {
      forceColumnsButton.setAttribute('aria-pressed', String(on));
      forceColumnsButton.title = on
        ? '強制2列表示 ON。タップで自動レイアウトに戻す'
        : '日本語・ベトナム語を強制的に2列表示';
      forceColumnsButton.setAttribute('aria-label', forceColumnsButton.title);
    }
  }

  applyForceColumns(root.dataset.forceColumns === 'on' || safeGet(FORCE_COLUMNS_KEY) === 'on', false);
  forceColumnsButton?.addEventListener('click', () => {
    preserveReadingPosition(() => applyForceColumns(root.dataset.forceColumns !== 'on'));
  });

  /* ---------- Collapsible controls ---------- */

  function setControlsOpen(open) {
    if (!controls) return;
    controls.classList.toggle('open', open);
    controlsToggle?.setAttribute('aria-expanded', String(open));
    controlsToggle?.setAttribute('aria-label', open ? 'Đóng công cụ' : 'Mở công cụ');
    controlsToggle?.setAttribute('title', open ? 'Đóng công cụ' : 'Mở công cụ');
  }

  controlsToggle?.addEventListener('click', event => {
    event.stopPropagation();
    setControlsOpen(!controls.classList.contains('open'));
  });

  controlPanel?.addEventListener('click', event => event.stopPropagation());
  document.addEventListener('pointerdown', event => {
    if (controls?.classList.contains('open') && !controls.contains(event.target)) setControlsOpen(false);
  });

  /* ---------- Two-level TOC: this page <-> whole site ---------- */

  const toc = q('toc');
  const tocHead = toc?.querySelector('.toc-drawer-head') || null;
  const tocTitle = tocHead?.querySelector('strong') || null;
  let tocViewToggle = null;
  let tocLocalView = null;
  let tocGlobalView = null;
  let tocMode = 'local';

  function prepareTocViews() {
    if (!toc || !tocHead || tocLocalView) return;

    if (tocTitle) {
      tocTitle.classList.add('toc-drawer-title');
      tocTitle.textContent = 'このページの目次';
    }

    tocViewToggle = document.createElement('button');
    tocViewToggle.type = 'button';
    tocViewToggle.id = 'toc-view-toggle';
    tocViewToggle.className = 'toc-view-toggle';
    tocViewToggle.textContent = '‹ 全体目次';
    tocViewToggle.setAttribute('aria-label', '全体目次を表示');
    tocHead.insertBefore(tocViewToggle, tocHead.firstChild);

    tocLocalView = document.createElement('div');
    tocLocalView.className = 'toc-local-view';
    const movable = [];
    let node = tocHead.nextSibling;
    while (node) {
      const next = node.nextSibling;
      movable.push(node);
      node = next;
    }
    movable.forEach(n => tocLocalView.appendChild(n));

    tocGlobalView = document.createElement('div');
    tocGlobalView.className = 'toc-global-view';
    tocGlobalView.hidden = true;

    toc.append(tocLocalView, tocGlobalView);
    renderGlobalToc();

    tocViewToggle.addEventListener('click', () => {
      setTocView(tocMode === 'local' ? 'global' : 'local', true);
    });
  }

  function currentLessonName() {
    try { return decodeURIComponent(location.pathname.split('/').pop() || ''); }
    catch (_) { return location.pathname.split('/').pop() || ''; }
  }

  function renderGlobalToc() {
    if (!tocGlobalView || tocGlobalView.dataset.ready === '1') return;
    const data = window.STUDY_NAV_DATA;
    if (!data?.sections?.length) {
      tocGlobalView.textContent = '全体目次データを読み込めません。';
      return;
    }

    const current = currentLessonName();
    const frag = document.createDocumentFragment();
    data.sections.forEach(section => {
      const group = document.createElement('section');
      group.className = 'toc-site-group';

      const title = document.createElement('h3');
      title.className = 'toc-site-group-title';
      title.textContent = section.title || '';
      group.appendChild(title);

      if (section.subtitle) {
        const sub = document.createElement('p');
        sub.className = 'toc-site-group-subtitle';
        sub.textContent = section.subtitle;
        group.appendChild(sub);
      }

      const list = document.createElement('div');
      list.className = 'toc-site-lessons';
      for (const lesson of section.lessons || []) {
        const a = document.createElement('a');
        a.className = 'toc-site-link';
        a.href = lesson.href;
        a.dataset.lessonHref = lesson.href;
        if (lesson.href === current) {
          a.classList.add('is-current');
          a.setAttribute('aria-current', 'page');
        }
        const code = document.createElement('span');
        code.className = 'toc-site-code';
        code.textContent = lesson.code || '';
        const label = document.createElement('span');
        label.className = 'toc-site-label';
        label.textContent = lesson.title || lesson.href;
        a.append(code, label);
        a.addEventListener('click', async event => {
          event.preventDefault();
          const state = captureReadingPosition();
          if (state) saveReaderState(state);
          try { window.StudyGoogleTTS?.stop?.(true); } catch (_) {}
          try {
            if (window.StudySync?.saveNow) {
              await Promise.race([
                Promise.resolve(window.StudySync.saveNow()),
                new Promise(resolve => setTimeout(resolve, 700))
              ]);
            }
          } catch (_) {}
          location.href = a.href;
        });
        list.appendChild(a);
      }
      group.appendChild(list);
      frag.appendChild(group);
    });
    tocGlobalView.appendChild(frag);
    tocGlobalView.dataset.ready = '1';
  }

  function scrollTocItemIntoView(el) {
    if (!toc || !el) return;
    requestAnimationFrame(() => {
      const top = el.offsetTop - Math.max(90, (toc.clientHeight - el.offsetHeight) / 2);
      toc.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
    });
  }

  function localTocLinks() {
    return Array.from((tocLocalView || toc)?.querySelectorAll('a[href^="#"]') || [])
      .filter(a => a.getAttribute('href') && a.getAttribute('href') !== '#toc');
  }

  function updateCurrentTocHighlight(scrollIntoView = false) {
    const links = localTocLinks();
    links.forEach(a => {
      a.classList.remove('is-current', 'is-current-parent');
      a.removeAttribute('aria-current');
    });
    const i = currentSectionIndex();
    if (i < 0 || !tocTargets[i]) return;
    const targetId = tocTargets[i].id;
    const currentLink = links.find(a => decodeURIComponent((a.getAttribute('href') || '').slice(1)) === targetId);
    if (!currentLink) return;
    currentLink.classList.add('is-current');
    currentLink.setAttribute('aria-current', 'location');

    const topLi = currentLink.closest('li');
    const rootOl = (tocLocalView || toc)?.querySelector(':scope > ol');
    if (topLi && rootOl) {
      let ancestorLi = topLi;
      while (ancestorLi.parentElement && ancestorLi.parentElement !== rootOl) {
        const parentLi = ancestorLi.parentElement.closest('li');
        if (!parentLi) break;
        ancestorLi = parentLi;
      }
      const parentLink = ancestorLi.querySelector(':scope > a[href^="#"]');
      if (parentLink && parentLink !== currentLink) parentLink.classList.add('is-current-parent');
    }
    if (scrollIntoView) scrollTocItemIntoView(currentLink);
  }

  function updateGlobalCurrent(scrollIntoView = false) {
    if (!tocGlobalView) return;
    const current = currentLessonName();
    tocGlobalView.querySelectorAll('.toc-site-link').forEach(a => {
      const active = a.dataset.lessonHref === current;
      a.classList.toggle('is-current', active);
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (scrollIntoView) scrollTocItemIntoView(tocGlobalView.querySelector('.toc-site-link.is-current'));
  }

  function setTocView(mode, scrollCurrent = false) {
    prepareTocViews();
    tocMode = mode === 'global' ? 'global' : 'local';
    if (tocLocalView) tocLocalView.hidden = tocMode !== 'local';
    if (tocGlobalView) tocGlobalView.hidden = tocMode !== 'global';
    if (tocTitle) tocTitle.textContent = tocMode === 'local' ? 'このページの目次' : '全体目次';
    if (tocViewToggle) {
      tocViewToggle.textContent = tocMode === 'local' ? '‹ 全体目次' : '› このページの目次';
      tocViewToggle.setAttribute('aria-label', tocMode === 'local' ? '全体目次を表示' : 'このページの目次に戻る');
    }
    if (tocMode === 'local') updateCurrentTocHighlight(scrollCurrent);
    else updateGlobalCurrent(scrollCurrent);
  }

  function openToc() {
    prepareTocViews();
    setTocView('local', false);
    body.classList.add('toc-open');
    tocButton?.setAttribute('aria-expanded', 'true');
    setControlsOpen(false);
    window.setTimeout(() => updateCurrentTocHighlight(true), 20);
  }

  function closeToc() {
    body.classList.remove('toc-open');
    tocButton?.setAttribute('aria-expanded', 'false');
  }

  prepareTocViews();
  tocButton?.addEventListener('click', openToc);
  tocClose?.addEventListener('click', closeToc);
  overlay?.addEventListener('click', closeToc);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeToc();
      setControlsOpen(false);
    }
  });

  document.querySelectorAll('a[href="#toc"]').forEach(a => {
    a.addEventListener('click', event => {
      event.preventDefault();
      openToc();
    });
  });

  /* TOC navigation does not add hash-history entries. */
  localTocLinks().forEach(a => {
    a.addEventListener('click', event => {
      const href = a.getAttribute('href');
      if (!href || href === '#toc') return;
      const target = document.getElementById(decodeURIComponent(href.slice(1)));
      if (!target) return;
      event.preventDefault();
      closeToc();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(scheduleReaderSave, 450);
    });
  });

  /* ---------- Previous / next lesson item ---------- */

  const tocTargets = localTocLinks()
    .map(a => document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))))
    .filter((el, i, arr) => el && el.id !== 'toc' && arr.indexOf(el) === i);

  function currentSectionIndex() {
    let idx = -1;
    const threshold = 24;
    tocTargets.forEach((el, i) => {
      if (el.getBoundingClientRect().top <= threshold) idx = i;
    });
    return idx < 0 && tocTargets.length ? 0 : idx;
  }

  function updateSectionButtons() {
    const i = currentSectionIndex();
    if (prevButton) prevButton.disabled = !tocTargets.length || i <= 0;
    if (nextButton) nextButton.disabled = !tocTargets.length || i >= tocTargets.length - 1;
  }

  function goToIndex(i) {
    if (!tocTargets.length) return;
    i = Math.max(0, Math.min(tocTargets.length - 1, i));
    tocTargets[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      const state = captureReadingPosition();
      if (state) saveReaderState(state);
      updateSectionButtons();
    }, 450);
  }

  prevButton?.addEventListener('click', () => goToIndex(Math.max(0, currentSectionIndex() - 1)));
  nextButton?.addEventListener('click', () => goToIndex(Math.min(tocTargets.length - 1, currentSectionIndex() + 1)));

  /* ---------- Home ---------- */

  homeButton?.addEventListener('click', () => {
    const state = captureReadingPosition();
    if (state) saveReaderState(state);
    safeSet(explicitHomeKey, '1');
    safeSet('study-home-click-at', String(Date.now()));
    window.location.href = new URL('index.html', window.location.href).href;
  });

  /* ---------- Initialize state ---------- */

  applyTheme(root.dataset.theme === 'light' ? 'light' : 'dark');
  applyMode(root.dataset.studyMode || 'full');
  applyFontScale(currentScale());

  themeButton?.addEventListener('click', () => applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));
  modeButton?.addEventListener('click', () => applyMode(root.dataset.studyMode === 'keywords' ? 'full' : 'keywords'));

  fontDown?.addEventListener('click', () => {
    const i = FONT_LEVELS.indexOf(currentScale());
    if (i > 0) preserveReadingPosition(() => applyFontScale(FONT_LEVELS[i - 1]));
  });

  fontUp?.addEventListener('click', () => {
    const i = FONT_LEVELS.indexOf(currentScale());
    if (i >= 0 && i < FONT_LEVELS.length - 1) preserveReadingPosition(() => applyFontScale(FONT_LEVELS[i + 1]));
  });

  fontReset?.addEventListener('click', () => preserveReadingPosition(() => applyFontScale(100)));

  /* ---------- Scroll / rotation / resize persistence ---------- */

  window.addEventListener('scroll', () => {
    scheduleReaderSave();
    updateSectionButtons();
  }, { passive: true });

  function handleLayoutViewportChange() {
    /*
      A native two-finger pinch changes VisualViewport but normally does not
      change the layout viewport. Ignore it completely so the page does not
      recalculate width or fight the browser's native zoom.
    */
    if (isPinchZoomActive()) {
      pinchZoomSession = true;
      return;
    }

    const { width: w, height: h } = layoutViewportSize();

    /*
      When pinch zoom returns to scale 1, VisualViewport may emit another
      resize. If the layout viewport itself did not change, this was only zoom,
      so do nothing.
    */
    const layoutChanged =
      Math.abs(w - lastViewportWidth) >= 1 ||
      Math.abs(h - lastViewportHeight) >= 1;

    if (!layoutChanged) {
      pinchZoomSession = false;
      return;
    }

    pinchZoomSession = false;

    if (!resizeAnchor) {
      resizeAnchor =
        lastStablePosition ||
        readReaderState() ||
        captureReadingPosition();
    }

    /*
      Only a real layout change, such as portrait <-> landscape, updates
      --app-viewport-width.
    */
    syncViewportGeometry();
    lastViewportWidth = w;
    lastViewportHeight = h;

    if (resizeAnchor) {
      settleRestore(resizeAnchor, [0, 50, 140, 300]);
    }

    clearTimeout(resizeRestoreTimer);
    resizeRestoreTimer = window.setTimeout(() => {
      if (resizeAnchor) {
        settleRestore(resizeAnchor, [0, 80, 220]);
      }

      window.setTimeout(() => {
        lastStablePosition =
          resizeAnchor ||
          captureReadingPosition();

        if (lastStablePosition) {
          saveReaderState(lastStablePosition);
        }

        resizeAnchor = null;
        updateSectionButtons();
      }, 320);
    }, 260);
  }

  function handleVisualViewportResize() {
    /*
      visualViewport resize is the main signal used by Safari/WebKit while
      pinch-zooming. At scale != 1 this is zoom, not a responsive-layout event.
    */
    if (isPinchZoomActive()) {
      pinchZoomSession = true;
      return;
    }

    handleLayoutViewportChange();
  }

  window.addEventListener(
    'resize',
    handleLayoutViewportChange,
    { passive: true }
  );

  window.addEventListener('orientationchange', () => {
    /*
      Rotation is a genuine layout change. Use the stored logical reading
      position, then wait for iOS to finish updating its layout viewport.
    */
    resizeAnchor =
      lastStablePosition ||
      readReaderState() ||
      captureReadingPosition();

    [40, 120, 280].forEach(delay => {
      window.setTimeout(() => {
        if (isPinchZoomActive()) return;

        const size = layoutViewportSize();
        syncViewportGeometry();

        if (
          Math.abs(size.width - lastViewportWidth) >= 1 ||
          Math.abs(size.height - lastViewportHeight) >= 1
        ) {
          lastViewportWidth = size.width;
          lastViewportHeight = size.height;
        }

        if (resizeAnchor) {
          settleRestore(resizeAnchor, [0, 70, 180]);
        }
      }, delay);
    });

    window.setTimeout(() => {
      resizeAnchor = null;
      updateSectionButtons();
    }, 620);
  }, { passive: true });

  window.visualViewport?.addEventListener(
    'resize',
    handleVisualViewportResize,
    { passive: true }
  );

  function saveLifecycleState() {
    const state = captureReadingPosition() || lastStablePosition;
    if (state) saveReaderState(state);
    rememberCurrentPage();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveLifecycleState();
    else {
      rememberCurrentPage();
      const state = readReaderState();
      if (state) settleRestore(state, [0, 80, 220]);
    }
  });

  window.addEventListener('pagehide', saveLifecycleState);
  window.addEventListener('beforeunload', saveLifecycleState);

  window.addEventListener('pageshow', () => {
    rememberCurrentPage();
    rebuildReaderAnchors();
    const state = readReaderState();
    if (!location.hash && state) settleRestore(state, [0, 80, 220, 500]);
    window.setTimeout(updateSectionButtons, 80);
  });

  window.addEventListener('load', () => {
    rebuildReaderAnchors();
    const state = readReaderState();
    if (!location.hash && state) settleRestore(state, [0, 80, 220, 500]);
    else {
      const current = captureReadingPosition();
      if (current) saveReaderState(current);
    }
    updateSectionButtons();
  });


  // Public bridge used by the cloud synchronization engine.
  window.StudyReader = Object.freeze({
    pageKey,
    capture: captureReadingPosition,
    restore: restoreReadingPosition,
    rebuild: rebuildReaderAnchors,
    readLocal: readReaderState,
    saveLocal: saveReaderState,
    settleRestore,
    getLastStable: () => lastStablePosition,
    isPinchZoomActive
  });
  window.dispatchEvent(new CustomEvent('studyreaderready'));
})();
