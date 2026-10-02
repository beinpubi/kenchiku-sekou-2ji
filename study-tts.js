(() => {
  'use strict';

  const VERSION = '4.1-cloudflare-jwt-allowlist';
  const TTS_PROXY_URL = 'https://kenchiku-google-tts.duysdoor.workers.dev/tts';
  const MAX_CHARS = 170;

  const state = {
    section: null,
    chunks: [],
    index: 0,
    status: 'idle', // idle | loading | playing | paused
    requestSerial: 0,
    objectUrl: '',
    prefetch: null
  };

  const audio = new Audio();
  audio.preload = 'auto';
  audio.playsInline = true;

  function normalizeMultiline(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/;
  const SOURCE_SELECTORS = [
    '.study-card.original .recall-source[lang="ja"]',
    '.study-card.original .recall-source',
    '.study-card.original [lang="ja"]',
    '.lang-card.original .recall-source[lang="ja"]',
    '.lang-card.original .card-body[lang="ja"]',
    '.lang-card.original [lang="ja"]',
    '.note-pane.original-cell[lang="ja"]',
    '.original-cell[lang="ja"]',
    '.jp-topic[lang="ja"]',
    '.jp-answer[lang="ja"]',
    '.card.original[lang="ja"]',
    '.card.original [lang="ja"]',
    '.card.orig[lang="ja"]',
    '.card.orig',
    '.original[lang="ja"]',
    '.recall-source[lang="ja"]'
  ].join(', ');

  function hasJapaneseText(value) {
    return JAPANESE_RE.test(String(value || ''));
  }

  function sourceNodes(unit) {
    const all = [...unit.querySelectorAll(SOURCE_SELECTORS)]
      .filter(node => hasJapaneseText(node.innerText || node.textContent || ''));
    const unique = [...new Set(all)];
    // Keep outer nodes and discard nested duplicates.
    return unique.filter(node => !unique.some(other => other !== node && other.contains(node)));
  }

  function japaneseHeading(unit) {
    const node = unit.querySelector(':scope > h2, :scope > h3, :scope > h4, :scope > .subsection-title, :scope > .section-head h2, :scope > .section-head h3, h3, h2');
    const raw = normalizeMultiline(node?.innerText || node?.textContent || '');
    if (!raw || !hasJapaneseText(raw)) return '';
    const parts = raw.split(/[|｜/／]/).map(v => v.trim()).filter(Boolean);
    return parts.find(hasJapaneseText) || raw;
  }

  function extractJapanese(unit) {
    const nodes = sourceNodes(unit);
    if (!nodes.length) return null;
    const body = nodes
      .map(node => normalizeMultiline(node.innerText || node.textContent || ''))
      .filter(Boolean)
      .join('\n');
    if (!body) return null;
    const heading = japaneseHeading(unit);
    return { source: nodes[0], sources: nodes, text: heading ? `${heading}\n${body}` : body };
  }

  function collectTtsUnits() {
    const result = [];
    const seen = new Set();
    const add = node => {
      if (!node || seen.has(node) || !extractJapanese(node)) return;
      seen.add(node);
      result.push(node);
    };

    // Preferred granularity: one control per subsection.
    document.querySelectorAll('.subsection').forEach(add);

    // Fallback for table-based and older lesson layouts without .subsection.
    const fallback = [...document.querySelectorAll(
      'section.study-section, section.topic, section.aggregate-section, main#lesson > section, main > section, section[id]'
    )].filter(node => {
      if (result.some(primary => node.contains(primary))) return false;
      return !!extractJapanese(node);
    });
    // Prefer the deepest matching section so controls are not duplicated on nested sections.
    fallback
      .filter(node => !fallback.some(other => other !== node && node.contains(other)))
      .forEach(add);

    // Last resort for uncommon layouts: one unit per standalone original card.
    if (!result.length) {
      document.querySelectorAll('.study-card.original, .lang-card.original, .card.original, .card.orig').forEach(add);
    }

    result.forEach((unit, index) => {
      unit.classList.add('gttts-unit');
      if (!unit.id) unit.dataset.gtttsUnit = String(index + 1);
    });
    return result;
  }

  function controlHost(unit) {
    const card = unit.querySelector(
      '.study-card.original, .lang-card.original, .note-pane.original-cell, .card.original, .card.orig'
    );
    const host = card || unit;
    host.classList.add('gttts-control-host');
    return host;
  }
  function hardSplit(text, maxChars = MAX_CHARS) {
    const s = text.trim();
    if (!s) return [];
    if (s.length <= maxChars) return [s];
    const out = [];
    let rest = s;
    while (rest.length > maxChars) {
      const windowText = rest.slice(0, maxChars + 1);
      let cut = -1;
      for (const mark of ['。', '！', '？', '!', '?', '；', ';', '：', ':', '、', '，', ',', '）', ')', ' ']) {
        const p = windowText.lastIndexOf(mark);
        if (p >= Math.floor(maxChars * 0.55)) {
          cut = p + 1;
          break;
        }
      }
      if (cut < 1) cut = maxChars;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
    return out.filter(Boolean);
  }

  function splitForTts(text) {
    const normalized = normalizeMultiline(text);
    const logical = [];
    for (const rawLine of normalized.split(/\n+/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const sentences = line.match(/[^。！？!?]+[。！？!?]?/g) || [line];
      for (const sentence of sentences) {
        const s = sentence.trim();
        if (s) logical.push(s);
      }
    }
    return logical.flatMap(part => hardSplit(part));
  }

  function showToast(message, isError = false, duration = 2800) {
    let toast = document.getElementById('gttts-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'gttts-toast';
      toast.className = 'gttts-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.toggle('is-error', !!isError);
    toast.classList.add('is-visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), duration);
  }


  async function getTtsAccessToken() {
    if (typeof window.createStudySupabaseClient !== 'function') {
      throw new Error('Cloud client chưa sẵn sàng.');
    }
    const client = await window.createStudySupabaseClient();
    const { data, error } = await client.auth.getSession();
    if (error) {
      throw new Error(error.message || 'Không đọc được phiên đăng nhập Supabase.');
    }
    const token = data?.session?.access_token;
    if (!token) {
      throw new Error('Cần đăng nhập bằng tài khoản được phép để sử dụng audio.');
    }
    return token;
  }

  async function hasTtsSession() {
    try {
      await getTtsAccessToken();
      return true;
    } catch (_) {
      return false;
    }
  }

  async function fetchAudioBlob(text, signal) {
    const accessToken = await getTtsAccessToken();
    const response = await fetch(TTS_PROXY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'text/plain;charset=UTF-8',
        'Accept': 'audio/mpeg,audio/*;q=0.9,*/*;q=0.1'
      },
      body: text,
      cache: 'no-store',
      signal
    });

    const contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        if (contentType.includes('application/json')) {
          const body = await response.json();
          detail = body?.message || body?.error || detail;
        } else {
          const body = (await response.text()).trim();
          if (body) detail = body.slice(0, 220);
        }
      } catch (_) {}

      if (response.status === 401) {
        detail = 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại từ index.html.';
      } else if (response.status === 403) {
        detail = 'Tài khoản này không được phép sử dụng chức năng audio.';
      }
      throw new Error(detail);
    }

    if (!contentType.includes('audio/')) {
      const body = (await response.text()).trim();
      throw new Error(
        `Cloudflare proxy không trả audio (${contentType || 'unknown'}): ${body.slice(0, 180)}`
      );
    }

    return await response.blob();
  }

  function revokeCurrentObjectUrl() {
    if (state.objectUrl) {
      try { URL.revokeObjectURL(state.objectUrl); } catch (_) {}
      state.objectUrl = '';
    }
  }

  function clearPrefetch() {
    if (state.prefetch?.controller) {
      try { state.prefetch.controller.abort(); } catch (_) {}
    }
    if (state.prefetch?.url) {
      try { URL.revokeObjectURL(state.prefetch.url); } catch (_) {}
    }
    state.prefetch = null;
  }

  function updateUi() {
    document.querySelectorAll('.gttts-unit.gttts-active').forEach(el => {
      if (el !== state.section || state.status === 'idle') el.classList.remove('gttts-active');
    });
    if (state.section && state.status !== 'idle') state.section.classList.add('gttts-active');

    document.querySelectorAll('.gttts-section-controls').forEach(controls => {
      const section = controls.closest('.gttts-unit');
      const play = controls.querySelector('[data-role="play"]');
      const stop = controls.querySelector('[data-role="stop"]');
      const active = section === state.section && state.status !== 'idle';
      if (play) {
        play.textContent = active && state.status === 'playing' ? '⏸' : active && state.status === 'paused' ? '▶' : active && state.status === 'loading' ? '…' : '🔊';
        play.disabled = active && state.status === 'loading';
        play.title = active && state.status === 'playing' ? 'Pause' : active && state.status === 'paused' ? 'Resume' : 'Đọc tiếng Nhật bằng Google Translate TTS';
        play.setAttribute('aria-label', play.title);
      }
      if (stop) stop.hidden = !active;
    });

    const mini = document.getElementById('gttts-mini');
    if (mini) {
      const active = state.status !== 'idle';
      mini.hidden = !active;
      const toggle = mini.querySelector('[data-role="toggle"]');
      if (toggle) {
        toggle.textContent = state.status === 'playing' ? '⏸' : state.status === 'paused' ? '▶' : '…';
        toggle.disabled = state.status === 'loading';
      }
    }
  }

  async function ensureChunkUrl(index, serial) {
    if (index < 0 || index >= state.chunks.length) throw new Error('Chunk index ngoài phạm vi.');

    if (state.prefetch && state.prefetch.index === index && state.prefetch.url) {
      const url = state.prefetch.url;
      state.prefetch.url = '';
      state.prefetch = null;
      return url;
    }

    const controller = new AbortController();
    const blob = await fetchAudioBlob(state.chunks[index], controller.signal);
    if (serial !== state.requestSerial) throw new DOMException('Stale request', 'AbortError');
    return URL.createObjectURL(blob);
  }

  function prefetchNext(serial) {
    clearPrefetch();
    const next = state.index + 1;
    if (next >= state.chunks.length || serial !== state.requestSerial) return;
    const controller = new AbortController();
    state.prefetch = { index: next, controller, url: '' };
    fetchAudioBlob(state.chunks[next], controller.signal)
      .then(blob => {
        if (!state.prefetch || state.prefetch.index !== next || serial !== state.requestSerial) return;
        state.prefetch.url = URL.createObjectURL(blob);
      })
      .catch(err => {
        if (err?.name !== 'AbortError') console.warn('[GT TTS Proxy] prefetch failed:', err);
        if (state.prefetch?.index === next) state.prefetch = null;
      });
  }

  async function playCurrentChunk(serial) {
    if (serial !== state.requestSerial) return;
    if (state.index >= state.chunks.length) {
      stop(true);
      return;
    }

    state.status = 'loading';
    updateUi();
    try {
      const url = await ensureChunkUrl(state.index, serial);
      if (serial !== state.requestSerial) {
        URL.revokeObjectURL(url);
        return;
      }
      revokeCurrentObjectUrl();
      state.objectUrl = url;
      audio.src = url;
      audio.currentTime = 0;
      await audio.play();
      state.status = 'playing';
      updateUi();
      prefetchNext(serial);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('[GT TTS Proxy] playback failed:', err);
      state.status = 'idle';
      updateUi();
      showToast(`Không phát được Google TTS: ${err?.message || err}`, true, 7000);
    }
  }

  function stop(finished = false) {
    state.requestSerial += 1;
    try { audio.pause(); } catch (_) {}
    try { audio.removeAttribute('src'); audio.load(); } catch (_) {}
    revokeCurrentObjectUrl();
    clearPrefetch();
    state.status = 'idle';
    state.index = 0;
    if (!finished) showToast('Đã dừng. Lần sau sẽ đọc lại từ đầu.', false, 1700);
    updateUi();
  }

  async function startSection(section) {
    const data = extractJapanese(section);
    if (!data?.text) {
      showToast('Không tìm thấy phần tiếng Nhật của section này.', true, 4500);
      return;
    }
    if (state.status !== 'idle') stop(true);

    const chunks = splitForTts(data.text);
    if (!chunks.length) {
      showToast('Không có nội dung để đọc.', true, 4000);
      return;
    }
    state.section = section;
    state.chunks = chunks;
    state.index = 0;
    const serial = ++state.requestSerial;
    await playCurrentChunk(serial);
  }

  async function toggleSection(section) {
    const same = section === state.section && state.status !== 'idle';
    if (!same) {
      await startSection(section);
      return;
    }
    if (state.status === 'playing') {
      audio.pause();
      state.status = 'paused';
      updateUi();
      return;
    }
    if (state.status === 'paused') {
      try {
        await audio.play();
        state.status = 'playing';
        updateUi();
      } catch (err) {
        showToast(`Không resume được audio: ${err?.message || err}`, true, 5000);
      }
    }
  }

  audio.addEventListener('ended', () => {
    if (state.status === 'idle') return;
    state.index += 1;
    const serial = state.requestSerial;
    void playCurrentChunk(serial);
  });

  audio.addEventListener('error', () => {
    if (state.status === 'idle') return;
    const code = audio.error?.code || 0;
    console.error('[GT TTS Proxy] HTMLAudioElement error:', code, audio.error);
    state.status = 'idle';
    updateUi();
    showToast(`Lỗi phát audio trên trình duyệt (code ${code}).`, true, 6000);
  });

  function makeButton(text, label, role) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gttts-btn';
    btn.textContent = text;
    btn.dataset.role = role;
    btn.setAttribute('aria-label', label);
    btn.title = label;
    return btn;
  }

  function installMiniPlayer() {
    if (document.getElementById('gttts-mini')) return;
    const mini = document.createElement('div');
    mini.id = 'gttts-mini';
    mini.className = 'gttts-mini';
    mini.hidden = true;
    const toggle = makeButton('⏸', 'Pause/Resume', 'toggle');
    const stopBtn = makeButton('■', 'Stop và trở về đầu', 'stop');
    toggle.addEventListener('click', async () => {
      if (!state.section) return;
      await toggleSection(state.section);
    });
    stopBtn.addEventListener('click', () => stop(false));
    mini.append(toggle, stopBtn);
    document.body.appendChild(mini);
  }

  async function installControls() {
    const signedIn = await hasTtsSession();
    if (!signedIn) {
      console.info('[GT TTS Cloudflare] Audio controls hidden because no Supabase session is active.');
      return;
    }
    let installed = 0;
    for (const section of collectTtsUnits()) {
      const host = controlHost(section);
      if (host.querySelector(':scope > .gttts-section-controls')) continue;

      const controls = document.createElement('div');
      controls.className = 'gttts-section-controls';
      controls.dataset.engine = VERSION;

      const play = makeButton('🔊', 'Đọc tiếng Nhật bằng Google Translate TTS', 'play');
      const stopBtn = makeButton('■', 'Stop và trở về đầu', 'stop');
      stopBtn.hidden = true;

      play.addEventListener('click', async e => {
        e.preventDefault();
        e.stopPropagation();
        await toggleSection(section);
      });
      stopBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        stop(false);
      });

      controls.append(play, stopBtn);
      host.appendChild(controls);
      installed += 1;
    }
    installMiniPlayer();
    updateUi();
    console.info(`[GT TTS Cloudflare] v${VERSION} installed on ${installed} Japanese unit(s)`);
  }
  function init() { void installControls(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.addEventListener('pagehide', () => stop(true));

  window.StudyGoogleTTS = Object.freeze({
    version: VERSION,
    start: startSection,
    stop,
    extract: extractJapanese,
    split: splitForTts,
    state: () => ({ status: state.status, index: state.index, total: state.chunks.length })
  });
})();
