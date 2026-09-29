```javascript
(() => {
  'use strict';
  if (!document.getElementById('selection-tools-style')) {
    const style = document.createElement('style');
    style.id = 'selection-tools-style';
    style.textContent = String.raw`
/* ===== Authenticated Japanese selection tools ===== */
.seltools-toolbar {
  position: fixed;
  left: 50%;
  bottom: calc(max(12px, env(safe-area-inset-bottom)) + 14px);
  z-index: 12050;
  display: flex;
  align-items: center;
  gap: .28rem;
  max-width: calc(100dvw - 20px);
  padding: .34rem;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  border: 1px solid var(--border, rgba(127,127,127,.3));
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface, #171B22) 95%, transparent);
  box-shadow: 0 10px 34px rgba(0,0,0,.32);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  transform: translate(-50%, 12px) scale(.985);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity .14s ease, transform .14s ease, visibility .14s ease;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}
.seltools-toolbar::-webkit-scrollbar { display: none; }
.seltools-toolbar.is-visible {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transform: translate(-50%, 0) scale(1);
}
.seltools-btn {
  flex: 0 0 auto;
  min-height: 38px;
  padding: .42rem .68rem;
  border: 1px solid var(--border, rgba(127,127,127,.3));
  border-radius: 10px;
  background: var(--surface-alt, #1D232C);
  color: var(--text, #E3E7ED);
  font: 700 .84rem/1.15 var(--font-vi, Arial, sans-serif);
  white-space: nowrap;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.seltools-btn:hover { border-color: var(--link, #7CC4FF); }
.seltools-btn:active { transform: translateY(1px); }
.seltools-btn:disabled { opacity: .48; cursor: default; }
.seltools-btn[data-action="reading"] { font-family: var(--font-ja, sans-serif); }

.seltools-reading-card {
  position: fixed;
  left: 50%;
  bottom: calc(max(12px, env(safe-area-inset-bottom)) + 68px);
  z-index: 12049;
  width: min(560px, calc(100dvw - 24px));
  padding: .8rem .9rem;
  border: 1px solid var(--border, rgba(127,127,127,.3));
  border-radius: 13px;
  background: color-mix(in srgb, var(--surface, #171B22) 97%, transparent);
  color: var(--text, #E3E7ED);
  box-shadow: 0 10px 32px rgba(0,0,0,.28);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  transform: translateX(-50%);
}
.seltools-reading-card[hidden] { display: none !important; }
.seltools-reading-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .7rem;
  margin-bottom: .4rem;
}
.seltools-reading-head strong {
  color: var(--heading, #F4F7FA);
  font-size: .82rem;
  letter-spacing: .04em;
}
.seltools-reading-close {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: var(--surface-alt, #1D232C);
  color: var(--text, #E3E7ED);
  font: 700 1rem/1 Arial, sans-serif;
  cursor: pointer;
}
.seltools-reading-source {
  color: var(--text-muted, #9DA8B5);
  font: 600 .78rem/1.35 var(--font-ja, sans-serif);
  overflow-wrap: anywhere;
}
.seltools-reading-value {
  margin-top: .28rem;
  color: var(--heading, #F4F7FA);
  font: 800 1.08rem/1.55 var(--font-ja, sans-serif);
  overflow-wrap: anywhere;
}
.seltools-reading-note {
  margin-top: .35rem;
  color: var(--text-muted, #9DA8B5);
  font-size: .76rem;
  line-height: 1.35;
}
.seltools-toast {
  position: fixed;
  left: 50%;
  bottom: calc(max(12px, env(safe-area-inset-bottom)) + 74px);
  z-index: 12060;
  max-width: min(82vw, 34rem);
  padding: .52rem .72rem;
  border: 1px solid var(--border, rgba(127,127,127,.3));
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface, #171B22) 97%, transparent);
  color: var(--text, #E3E7ED);
  box-shadow: 0 8px 26px rgba(0,0,0,.24);
  font: 600 .8rem/1.35 var(--font-vi, Arial, sans-serif);
  transform: translate(-50%, 10px);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity .15s ease, transform .15s ease, visibility .15s ease;
}
.seltools-toast.is-visible {
  opacity: 1;
  visibility: visible;
  transform: translate(-50%, 0);
}
.seltools-toast.is-error { border-color: var(--trap, #FF8585); }

@media (max-width: 600px) {
  .seltools-toolbar {
    left: 10px;
    right: 10px;
    max-width: none;
    transform: translate(0, 12px) scale(.985);
  }
  .seltools-toolbar.is-visible { transform: translate(0, 0) scale(1); }
  .seltools-btn { min-height: 40px; padding: .45rem .62rem; }
}
@media print {
  .seltools-toolbar, .seltools-reading-card, .seltools-toast { display: none !important; }
}
`;
    document.head.appendChild(style);
  }
})();

(() => {
  'use strict';

  const VERSION = '1.8-production-3tools';
  const TTS_PROXY_URL = 'https://kenchiku-google-tts.duysdoor.workers.dev/tts';
  const AUTH_CHECK_URL = 'https://kenchiku-google-tts.duysdoor.workers.dev/auth-check';
  const FURIGANA_PROXY_URL = 'https://kenchiku-google-tts.duysdoor.workers.dev/furigana';
  const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/;
  const MAX_SELECTION_CHARS = 1200;

  let currentSelectionText = '';
  let currentSelectionHost = null;
  let currentSelectionRects = [];
  let lastValidSelectionAt = 0;
  let outsideGestureId = 0;
  let pendingOutsideGesture = null;
  let interactionLockUntil = 0;
  let selectionTimer = 0;
  let permissionUserId = '';
  let permissionAllowed = false;
  let selectionAudioSerial = 0;
  let selectionAudioObjectUrl = '';
  let selectionAudioActive = false;

  const selectionAudio = new Audio();
  selectionAudio.preload = 'auto';
  selectionAudio.playsInline = true;


  function normalizeSelectionText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/\s*\n\s*/g, ' ')
      .replace(/ {2,}/g, ' ')
      .trim();
  }

  function nodeElement(node) {
    return node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement || null;
  }

  function isVietnameseArea(node) {
    const el = nodeElement(node);
    return !!el?.closest('[lang="vi"], .translation, .translation-cell, .vn-topic, .vn-answer');
  }

  function readCurrentJapaneseSelection() {
    /*
      iOS Safari/Edge can expose the selected string correctly while reporting
      Range boundary nodes in a way that fails strict DOM-area checks.
      For this study page, the reliable signal is the selected string itself.
      Therefore keep the filter intentionally simple: a real non-collapsed
      selection, reasonable length, and at least one Japanese character.
    */
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount < 1 || sel.isCollapsed) return null;

    const text = normalizeSelectionText(sel.toString());
    if (!text || text.length > MAX_SELECTION_CHARS || !JAPANESE_RE.test(text)) return null;

    // Never react to text selected inside our own toolbar/debug UI.
    const anchorEl = nodeElement(sel.anchorNode);
    const focusEl = nodeElement(sel.focusNode);
    if (anchorEl?.closest?.('#seltools-toolbar, #seltools-reading-card, #seltools-debug')) return null;
    if (focusEl?.closest?.('#seltools-toolbar, #seltools-reading-card, #seltools-debug')) return null;

    let host = null;
    let rects = [];
    try {
      const range = sel.getRangeAt(0);
      host = range.commonAncestorContainer;
      rects = [...range.getClientRects()]
        .filter(r => r && r.width >= 0 && r.height >= 0)
        .map(r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom }));
    } catch (_) {}
    return { text, host, rects };
  }

  async function getSessionContext() {
    if (typeof window.createStudySupabaseClient !== 'function') return null;
    try {
      const client = await window.createStudySupabaseClient();
      const { data, error } = await client.auth.getSession();
      const session = data?.session || null;
      if (error || !session?.access_token) return null;
      return {
        token: session.access_token,
        userId: session.user?.id || '',
        user: session.user || null
      };
    } catch (_) {
      return null;
    }
  }

  async function ensureAllowedUser() {
    // Once this page has received a positive answer from the Worker, keep it
    // latched for the lifetime of the page. iOS may blur/collapse Selection while
    // showing its native menu; that must not revoke an already verified UI.
    if (permissionAllowed) {
      const ctx = await getSessionContext();
      if (ctx) return ctx;
    }

    const ctx = await getSessionContext();
    if (!ctx) return null;

    try {
      const response = await fetch(AUTH_CHECK_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ctx.token}`,
          'Accept': 'application/json'
        },
        cache: 'no-store'
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.allowed !== true) return null;

      permissionAllowed = true;
      permissionUserId = String(body?.user_id || ctx.userId || '');
      return { ...ctx, userId: permissionUserId || ctx.userId };
    } catch (err) {
      console.warn('[Selection Tools] /auth-check failed:', err);
      return null;
    }
  }


  function createUi() {
    if (document.getElementById('seltools-toolbar')) return;

    const toolbar = document.createElement('div');
    toolbar.id = 'seltools-toolbar';
    toolbar.className = 'seltools-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', '選択テキストの学習ツール');
    toolbar.innerHTML = `
      <button class="seltools-btn" type="button" data-action="reading" title="選択した日本語の読み方を表示">あ 読み</button>
      <button class="seltools-btn" type="button" data-action="images" title="Google画像検索">🖼 画像</button>
      <button class="seltools-btn" type="button" data-action="speak" title="選択部分をGoogle Translate TTSで読む">🔊 選択部分を読む</button>
    `;

    const reading = document.createElement('div');
    reading.id = 'seltools-reading-card';
    reading.className = 'seltools-reading-card';
    reading.hidden = true;
    reading.innerHTML = `
      <div class="seltools-reading-head">
        <strong>読み方</strong>
        <button class="seltools-reading-close" type="button" aria-label="閉じる" title="閉じる">×</button>
      </div>
      <div class="seltools-reading-source"></div>
      <div class="seltools-reading-value"></div>
      <div class="seltools-reading-note"></div>
    `;

    const toast = document.createElement('div');
    toast.id = 'seltools-toast';
    toast.className = 'seltools-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    document.body.append(toolbar, reading, toast);

    toolbar.addEventListener('pointerdown', () => {
      interactionLockUntil = Date.now() + 1000;
    }, { passive: true });

    toolbar.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        interactionLockUntil = Date.now() + 1000;
        const action = button.dataset.action;
        if (action === 'reading') void showReading();
        else if (action === 'images') openImageSearch();
        else if (action === 'speak') void toggleSelectionSpeech(button);
      });
    });

    reading.querySelector('.seltools-reading-close')?.addEventListener('click', () => {
      reading.hidden = true;
    });
  }

  function toolbar() { return document.getElementById('seltools-toolbar'); }
  function readingCard() { return document.getElementById('seltools-reading-card'); }

  function setToolbarVisible(visible) {
    const el = toolbar();
    if (!el) return;
    el.classList.toggle('is-visible', !!visible);
    el.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (!visible) {
      const card = readingCard();
      if (card) card.hidden = true;
    }
  }

  function showToast(message, isError = false, duration = 2300) {
    const toast = document.getElementById('seltools-toast');
    if (!toast) return;
    toast.textContent = String(message || '');
    toast.classList.toggle('is-error', !!isError);
    toast.classList.add('is-visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), duration);
  }

  async function refreshSelectionUi() {
    if (Date.now() < interactionLockUntil) return;
    const selected = readCurrentJapaneseSelection();
    if (!selected) {
      // IMPORTANT for iOS: opening/moving the native selection menu can make
      // window.getSelection() look collapsed even though the user still sees the
      // selected text. Once we have captured a valid Japanese selection, keep the
      // toolbar and its text latched until a new valid selection replaces it, the
      // page is left, or the user explicitly closes/stops it.
      if (currentSelectionText) return;
      setToolbarVisible(false);
      return;
    }

    currentSelectionText = selected.text;
    currentSelectionHost = selected.host;
    currentSelectionRects = Array.isArray(selected.rects) ? selected.rects : [];
    lastValidSelectionAt = Date.now();

    // UI visibility is decided locally from the signed-in Supabase user ID.
    // The Worker still independently enforces JWT + ALLOWED_USER_IDS for every
    // protected backend action (TTS/Furigana), so this local check is only a UI gate.
    if (permissionAllowed) {
      setToolbarVisible(true);
      return;
    }

    // Fallback if the login session was still loading when the selection occurred.
    const ctx = await ensureAllowedUser();
    if (!ctx) {
      setToolbarVisible(false);
      return;
    }
    const latest = readCurrentJapaneseSelection();
    if (latest && latest.text === currentSelectionText) setToolbarVisible(true);
  }

  function scheduleSelectionRefresh(delay = 110) {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => { void refreshSelectionUi(); }, delay);
  }

  function selectedTextOrNull() {
    return currentSelectionText ? currentSelectionText : null;
  }

  function openBlank(url) {
    try {
      const w = window.open(url, '_blank', 'noopener,noreferrer');
      if (w) return;
    } catch (_) {}
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function openImageSearch() {
    const text = selectedTextOrNull();
    if (!text) return;
    const q = encodeURIComponent(text);
    openBlank(`https://www.google.com/search?tbm=isch&q=${q}`);
  }

  function buildGlossaryMap() {
    const map = new Map();
    const table = document.querySelector('#terms table');
    if (!table) return map;
    table.querySelectorAll('tbody tr').forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) return;
      const term = normalizeSelectionText(cells[0].textContent);
      const reading = normalizeSelectionText(cells[1].textContent);
      if (term && reading) map.set(term, reading);
    });
    return map;
  }

  let glossaryMap = null;
  function glossaryReading(text) {
    if (!glossaryMap) glossaryMap = buildGlossaryMap();
    return glossaryMap.get(normalizeSelectionText(text)) || '';
  }

  function extractFuriganaPayload(payload) {
    if (!payload) return '';
    if (typeof payload === 'string') return payload.trim();
    if (typeof payload.reading === 'string') return payload.reading.trim();
    if (typeof payload.furigana === 'string') return payload.furigana.trim();
    if (typeof payload.result === 'string') return payload.result.trim();

    const words = payload?.result?.word || payload?.word || payload?.tokens;
    if (Array.isArray(words)) {
      return words.map(item => {
        if (typeof item === 'string') return item;
        return item?.furigana || item?.reading || item?.surface || item?.text || '';
      }).join('').trim();
    }
    return '';
  }

  async function fetchFurigana(text) {
    const ctx = await ensureAllowedUser();
    if (!ctx) throw new Error('Không có quyền sử dụng chức năng này.');
    const response = await fetch(FURIGANA_PROXY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ctx.token}`,
        'Content-Type': 'application/json;charset=UTF-8',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ text }),
      cache: 'no-store'
    });
    const contentType = response.headers.get('content-type') || '';
    let body = null;
    try {
      body = contentType.includes('application/json') ? await response.json() : await response.text();
    } catch (_) {}
    if (!response.ok) {
      const err = new Error(`Furigana API HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }
    const reading = extractFuriganaPayload(body);
    if (!reading) throw new Error('Furigana API không trả về cách đọc.');
    return reading;
  }

  async function showReading() {
    const text = selectedTextOrNull();
    const card = readingCard();
    if (!text || !card) return;

    const source = card.querySelector('.seltools-reading-source');
    const value = card.querySelector('.seltools-reading-value');
    const note = card.querySelector('.seltools-reading-note');
    source.textContent = text;
    value.textContent = '…';
    note.textContent = '';
    card.hidden = false;

    const local = glossaryReading(text);
    if (local) {
      value.textContent = local;
      note.textContent = 'Nguồn: bảng thuật ngữ có sẵn trong trang.';
      return;
    }

    try {
      const reading = await fetchFurigana(text);
      value.textContent = reading;
      note.textContent = 'Nguồn: Furigana API qua Cloudflare Worker.';
    } catch (err) {
      value.textContent = '未取得';
      if (err?.status === 404) {
        note.textContent = 'Bản test hiện chưa có endpoint /furigana trên Worker. Các từ đã có trong bảng thuật ngữ vẫn đọc được ngay.';
      } else {
        note.textContent = 'Không lấy được cách đọc: ' + (err?.message || err);
      }
    }
  }

  function hardSplit(text, maxChars = 170) {
    const s = normalizeSelectionText(text);
    if (!s) return [];
    if (s.length <= maxChars) return [s];
    const out = [];
    let rest = s;
    while (rest.length > maxChars) {
      const windowText = rest.slice(0, maxChars + 1);
      let cut = -1;
      for (const mark of ['。', '！', '？', '!', '?', '；', ';', '：', ':', '、', '，', ',', '）', ')', ' ']) {
        const p = windowText.lastIndexOf(mark);
        if (p >= Math.floor(maxChars * .55)) { cut = p + 1; break; }
      }
      if (cut < 1) cut = maxChars;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
    return out.filter(Boolean);
  }

  function splitForSelectionTts(text) {
    try {
      const external = window.StudyGoogleTTS?.split?.(text);
      if (Array.isArray(external) && external.length) return external;
    } catch (_) {}
    return hardSplit(text);
  }

  function revokeSelectionAudioUrl() {
    if (!selectionAudioObjectUrl) return;
    try { URL.revokeObjectURL(selectionAudioObjectUrl); } catch (_) {}
    selectionAudioObjectUrl = '';
  }

  function setSpeakButtonState(active, loading = false) {
    const btn = toolbar()?.querySelector('[data-action="speak"]');
    if (!btn) return;
    btn.disabled = !!loading;
    btn.textContent = loading ? '… 読込中' : active ? '■ 停止' : '🔊 選択部分を読む';
  }

  function stopSelectionSpeech(silent = true) {
    selectionAudioSerial += 1;
    selectionAudioActive = false;
    try { selectionAudio.pause(); } catch (_) {}
    try { selectionAudio.removeAttribute('src'); selectionAudio.load(); } catch (_) {}
    revokeSelectionAudioUrl();
    setSpeakButtonState(false, false);
    if (!silent) showToast('Đã dừng phần text được chọn.');
  }

  function waitForAudioEnd(serial) {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        selectionAudio.removeEventListener('ended', ended);
        selectionAudio.removeEventListener('error', failed);
      };
      const ended = () => { cleanup(); resolve(); };
      const failed = () => {
        cleanup();
        reject(new Error('Lỗi phát audio trên trình duyệt.'));
      };
      if (serial !== selectionAudioSerial) {
        cleanup();
        resolve();
        return;
      }
      selectionAudio.addEventListener('ended', ended, { once: true });
      selectionAudio.addEventListener('error', failed, { once: true });
    });
  }

  async function fetchSelectionAudio(text, token, signal) {
    const response = await fetch(TTS_PROXY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain;charset=UTF-8',
        'Accept': 'audio/mpeg,audio/*;q=0.9,*/*;q=0.1'
      },
      body: text,
      cache: 'no-store',
      signal
    });
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const type = response.headers.get('content-type') || '';
        const body = type.includes('application/json') ? await response.json() : await response.text();
        detail = body?.message || body?.error || String(body || detail).slice(0, 180);
      } catch (_) {}
      throw new Error(detail);
    }
    return response.blob();
  }

  async function toggleSelectionSpeech() {
    if (selectionAudioActive) {
      stopSelectionSpeech(false);
      return;
    }
    const text = selectedTextOrNull();
    if (!text) return;

    const ctx = await ensureAllowedUser();
    if (!ctx) return;

    try { window.StudyGoogleTTS?.stop?.(true); } catch (_) {}
    stopSelectionSpeech(true);
    selectionAudioActive = true;
    const serial = ++selectionAudioSerial;
    const chunks = splitForSelectionTts(text);
    setSpeakButtonState(true, true);

    try {
      for (let i = 0; i < chunks.length; i += 1) {
        if (serial !== selectionAudioSerial) return;
        const controller = new AbortController();
        const blob = await fetchSelectionAudio(chunks[i], ctx.token, controller.signal);
        if (serial !== selectionAudioSerial) return;
        revokeSelectionAudioUrl();
        selectionAudioObjectUrl = URL.createObjectURL(blob);
        selectionAudio.src = selectionAudioObjectUrl;
        selectionAudio.currentTime = 0;
        setSpeakButtonState(true, false);
        await selectionAudio.play();
        await waitForAudioEnd(serial);
      }
      if (serial === selectionAudioSerial) stopSelectionSpeech(true);
    } catch (err) {
      if (serial !== selectionAudioSerial) return;
      stopSelectionSpeech(true);
      showToast('Không phát được phần text đã chọn: ' + (err?.message || err), true, 5500);
    }
  }

  function clearSelectionTools(reason = 'explicit-dismiss') {
    currentSelectionText = '';
    currentSelectionHost = null;
    currentSelectionRects = [];
    lastValidSelectionAt = 0;
    pendingOutsideGesture = null;
    stopSelectionSpeech(true);
    setToolbarVisible(false);
    try {
      const sel = window.getSelection?.();
      if (sel && typeof sel.removeAllRanges === 'function') sel.removeAllRanges();
    } catch (_) {}
    console.info('[Selection Tools] dismissed:', reason);
  }

  function eventPoint(event) {
    const touch = event?.touches?.[0] || event?.changedTouches?.[0];
    const x = Number(touch?.clientX ?? event?.clientX);
    const y = Number(touch?.clientY ?? event?.clientY);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  function pointInsideLatchedSelection(point, margin = 18) {
    if (!point || !currentSelectionRects.length) return false;
    return currentSelectionRects.some(r =>
      point.x >= r.left - margin && point.x <= r.right + margin &&
      point.y >= r.top - margin && point.y <= r.bottom + margin
    );
  }

  function isSelectionToolTarget(target) {
    const el = nodeElement(target);
    return !!el?.closest?.('#seltools-toolbar, #seltools-reading-card, #seltools-debug, #seltools-toast');
  }

  function armOutsideDismiss(event) {
    if (!currentSelectionText || !toolbar()?.classList.contains('is-visible')) return;
    if (isSelectionToolTarget(event.target)) return;

    // The original long-press/drag starts before a selection is latched, so it
    // never reaches this branch. Later interactions are user intent. Keep taps
    // on/near the selected glyphs available for handle adjustment.
    const point = eventPoint(event);
    if (pointInsideLatchedSelection(point)) return;

    pendingOutsideGesture = {
      id: ++outsideGestureId,
      oldText: currentSelectionText,
      startedAt: Date.now()
    };
  }

  function finishOutsideDismiss() {
    const pending = pendingOutsideGesture;
    if (!pending) return;
    pendingOutsideGesture = null;

    // Give WebKit a moment to finish a possible new long-press selection.
    setTimeout(() => {
      const latest = readCurrentJapaneseSelection();
      if (latest && latest.text && latest.text !== pending.oldText) {
        currentSelectionText = latest.text;
        currentSelectionHost = latest.host;
        currentSelectionRects = Array.isArray(latest.rects) ? latest.rects : [];
        lastValidSelectionAt = Date.now();
        if (permissionAllowed) setToolbarVisible(true);
        return;
      }
      clearSelectionTools('tap-outside');
    }, 220);
  }

  function scheduleIosSelectionSweep() {
    // iOS/WebKit does not always fire selectionchange at the same moment as the
    // native Copy/Look Up menu. Re-check several times after the finger lifts.
    [40, 140, 320, 650].forEach(ms => {
      setTimeout(() => { void refreshSelectionUi(); }, ms);
    });
  }

  async function preflightPermission() {
    const ctx = await ensureAllowedUser();
    if (ctx) {
      permissionAllowed = true;
      // If the user already selected text while the preflight was running,
      // reveal the toolbar immediately now.
      void refreshSelectionUi();
    } else {
      permissionAllowed = false;
      setToolbarVisible(false);
    }
  }

  function installDebugPanel() {
    if (new URLSearchParams(location.search).get('seldebug') !== '1') return;
    const panel = document.createElement('div');
    panel.id = 'seltools-debug';
    Object.assign(panel.style, {
      position: 'fixed', top: '8px', right: '8px', zIndex: '2147483647',
      maxWidth: '92vw', padding: '8px 10px', borderRadius: '8px',
      background: 'rgba(0,0,0,.88)', color: '#fff', font: '12px/1.4 monospace',
      whiteSpace: 'pre-wrap', pointerEvents: 'none'
    });
    document.body.appendChild(panel);
    setInterval(() => {
      const raw = normalizeSelectionText(window.getSelection?.()?.toString?.() || '');
      const tb = toolbar();
      panel.textContent = [
        `VERSION: ${VERSION}`,
        `AUTH: ${permissionAllowed ? 'ALLOW' : 'NO'}`,
        `USER: ${permissionUserId || '[unknown]'}`,
        `RAW: ${raw ? raw.slice(0,80) : '[none]'}`,
        `SEL: ranges=${window.getSelection?.()?.rangeCount || 0} collapsed=${window.getSelection?.()?.isCollapsed ?? 'n/a'}`,
        `LATCH: ${currentSelectionText ? currentSelectionText.slice(0,80) : '[none]'}`,
        `PENDING DISMISS: ${pendingOutsideGesture ? 'YES' : 'NO'}`,
        `TOOLBAR: ${tb?.classList.contains('is-visible') ? 'VISIBLE' : 'HIDDEN'}`
      ].join('\n');
    }, 250);
  }

  function init() {
    createUi();
    installDebugPanel();

    // Verify the current Supabase access token against the Worker's JWT + allowlist
    // endpoint at startup. No client-side copy of the allowlist is required.
    void preflightPermission();

    document.addEventListener('selectionchange', () => scheduleSelectionRefresh(70), { passive: true });

    // Auto-dismiss rule for iOS:
    // 1) first selection gesture does not dismiss because nothing is latched yet;
    // 2) a later tap outside the selected text/tools dismisses the toolbar;
    // 3) a later long-press that creates a different Japanese selection replaces it.
    document.addEventListener('pointerdown', armOutsideDismiss, { passive: true, capture: true });
    document.addEventListener('touchstart', armOutsideDismiss, { passive: true, capture: true });
    document.addEventListener('pointerup', finishOutsideDismiss, { passive: true, capture: true });
    document.addEventListener('touchend', finishOutsideDismiss, { passive: true, capture: true });

    document.addEventListener('pointerup', scheduleIosSelectionSweep, { passive: true });
    document.addEventListener('touchend', scheduleIosSelectionSweep, { passive: true });
    document.addEventListener('mouseup', scheduleIosSelectionSweep, { passive: true });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        clearSelectionTools('escape');
      }
    });
    window.addEventListener('scroll', () => {
      if (!currentSelectionText) return;
      // Keep the bottom toolbar stable while the native iOS selection handles move.
    }, { passive: true });
    window.addEventListener('pageshow', () => { void preflightPermission(); });
    window.addEventListener('pagehide', () => stopSelectionSpeech(true));
    // Do NOT hide on window blur. iOS may blur the page while presenting its
    // native Copy/Look Up menu, which was the cause of the disappearing toolbar.
    console.info(`[Selection Tools] v${VERSION} ready.`);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.StudySelectionTools = Object.freeze({
    version: VERSION,
    refresh: () => refreshSelectionUi(),
    hide: () => clearSelectionTools('api-hide'),
    stop: () => stopSelectionSpeech(true),
    state: () => ({
      text: currentSelectionText,
      allowed: permissionAllowed,
      userId: permissionUserId,
      audioActive: selectionAudioActive
    })
  });
})();

```
