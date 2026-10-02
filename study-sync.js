(async function () {
'use strict';

const VERSION = '6.2';
const FILE_PATH = decodeURIComponent(location.pathname.split('/').pop() || '');
const LEGACY_FILE_PATH = document.querySelector('meta[name="study-legacy-file-path"]')?.content || '';
const DEVICE_ID_KEY = 'study-device-id';
const ACTIVE_USER_KEY = 'study-active-user-id';
const LAST_PAGE_PREFIX = 'study-last-page:';
const SYNC_EVENT = 'study-sync-status';
const SYNC_DEBUG = new URLSearchParams(location.search).get('syncdebug') === '1';

let supabase = null;
let currentUser = null;
let knownRevision = null;
let knownUpdatedAt = null;
let dirty = false;
let dirtyVersion = 0;
let saveTimer = 0;
let applyingRemote = false;
let initializationComplete = false;
let ignoreScrollUntil = Date.now() + 1800;
let lastSyncedSignature = '';
let startupPromise = null;
let synchronizationPromise = null;

function safeGet(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (e) {
    return fallback;
  }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (e) {}
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function payloadSignature(payload) {
  if (!payload) return '';
  return JSON.stringify({
    file_path: payload.file_path || '',
    section_id: payload.section_id || '',
    anchor_key: payload.anchor_key || '',
    text_offset: Number(payload.text_offset) || 0,
    top_offset: Math.round((Number(payload.top_offset) || 0) * 10) / 10,
    context_text: payload.context_text || ''
  });
}

function remoteSignature(progress) {
  if (!progress) return '';
  return payloadSignature(progress);
}

function ensureStatusIndicator() {
  let el = document.getElementById('study-cloud-sync-indicator');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'study-cloud-sync-indicator';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  Object.assign(el.style, {
    position: 'fixed',
    right: 'max(8px, env(safe-area-inset-right))',
    bottom: 'max(10px, env(safe-area-inset-bottom))',
    zIndex: '2300',
    maxWidth: 'min(78vw, 420px)',
    padding: '7px 10px',
    border: '1px solid var(--border, #39465b)',
    borderRadius: '10px',
    background: 'var(--dock-bg, rgba(18,27,43,.95))',
    color: 'var(--text, #edf2f7)',
    font: '600 12px Arial, sans-serif',
    boxShadow: '0 6px 18px rgba(0,0,0,.25)',
    opacity: '0',
    pointerEvents: 'none',
    transition: 'opacity .18s ease'
  });
  document.body.appendChild(el);
  return el;
}

let statusHideTimer = 0;
function emitStatus(state, detail = '') {
  const message = detail || state;
  console.log('[study-sync ' + VERSION + ']', state, message);
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, {
    detail: { state, detail: message, file: FILE_PATH, version: VERSION }
  }));

  /*
    Production mode is deliberately silent while synchronization is healthy.
    Add ?syncdebug=1 to the lesson URL to display loading/pending/saving/synced.
    Real errors remain visible without debug mode.
  */
  const shouldDisplay = state === 'error' || SYNC_DEBUG;
  const existing = document.getElementById('study-cloud-sync-indicator');

  if (!shouldDisplay) {
    if (existing) {
      existing.style.opacity = '0';
      existing.hidden = true;
    }
    return;
  }

  if (!document.body) return;
  const el = ensureStatusIndicator();
  el.hidden = false;
  const labels = {
    loading: 'Cloud: loading…',
    saving: 'Cloud: saving…',
    pending: 'Cloud: pending…',
    synced: 'Cloud: synced',
    ready: 'Cloud: ready',
    offline: 'Cloud: offline',
    signed_out: 'Cloud: signed out',
    error: 'Cloud error: '
  };
  el.textContent = state === 'error' ? labels.error + message : (labels[state] || 'Cloud: ' + message);
  el.style.color = state === 'error' ? '#ff8585' : 'var(--text, #edf2f7)';
  el.style.opacity = '1';
  clearTimeout(statusHideTimer);

  if (SYNC_DEBUG && (state === 'synced' || state === 'ready')) {
    statusHideTimer = setTimeout(() => {
      el.style.opacity = '0';
      el.hidden = true;
    }, 2800);
  }
}

function getDeviceId() {
  let id = safeGet(DEVICE_ID_KEY);
  if (!id) {
    try { id = crypto.randomUUID(); }
    catch (e) { id = 'device-' + Date.now() + '-' + Math.random().toString(36).slice(2); }
    safeSet(DEVICE_ID_KEY, id);
  }
  return id;
}
const DEVICE_ID = getDeviceId();

async function waitForDocumentReady() {
  if (document.readyState === 'complete') return;
  await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
}

async function waitForReader(timeoutMs = 8000) {
  if (window.StudyReader) return window.StudyReader;
  return new Promise(resolve => {
    let finished = false;
    const done = value => {
      if (finished) return;
      finished = true;
      window.removeEventListener('studyreaderready', onReady);
      clearTimeout(timer);
      resolve(value);
    };
    const onReady = () => done(window.StudyReader || null);
    const timer = setTimeout(() => done(window.StudyReader || null), timeoutMs);
    window.addEventListener('studyreaderready', onReady, { once: true });
  });
}

function readerElementForKey(key) {
  if (!key) return null;
  try { return document.querySelector('[data-reader-key="' + CSS.escape(key) + '"]'); }
  catch (e) { return null; }
}

function normalizeState(reader, state) {
  if (state && state.key && readerElementForKey(state.key)) return state;
  reader?.rebuild?.();
  const first = document.querySelector('[data-reader-key]');
  if (!first) return null;
  return { key: first.dataset.readerKey, offset: 0, top: 6 };
}

function buildPayloadFromState(state) {
  if (!state || !state.key) return null;
  const element = readerElementForKey(state.key);
  if (!element) return null;
  const section = element.closest('section[id]');
  return {
    file_path: FILE_PATH,
    section_id: section?.id || null,
    anchor_key: state.key,
    text_offset: Math.max(0, Number(state.offset) || 0),
    top_offset: Number.isFinite(Number(state.top)) ? Number(state.top) : 6,
    context_text: normalizeText(element.textContent).slice(0, 220) || null,
    device_id: DEVICE_ID
  };
}

async function captureStablePayload() {
  const reader = await waitForReader();
  if (!reader) return null;
  const waits = [0, 80, 220, 500, 900];
  for (const ms of waits) {
    if (ms) await delay(ms);
    reader.rebuild?.();
    const state = normalizeState(
      reader,
      reader.capture?.() || reader.getLastStable?.() || reader.readLocal?.()
    );
    const payload = buildPayloadFromState(state);
    if (payload) return payload;
  }
  return null;
}

function findAnchorByContext(contextText) {
  const needle = normalizeText(contextText);
  if (!needle) return null;
  const probe = needle.slice(0, Math.min(90, needle.length));
  for (const node of document.querySelectorAll('[data-reader-key]')) {
    const hay = normalizeText(node.textContent);
    if (hay.includes(probe) || (hay && probe.includes(hay.slice(0, Math.min(70, hay.length))))) return node;
  }
  return null;
}

function restoreRemoteProgress(progress) {
  const reader = window.StudyReader;
  if (!reader || !progress) return false;
  applyingRemote = true;
  ignoreScrollUntil = Date.now() + 1400;
  try {
    reader.rebuild?.();
    let key = progress.anchor_key || '';
    let element = readerElementForKey(key);
    if (!element && progress.context_text) {
      element = findAnchorByContext(progress.context_text);
      key = element?.dataset?.readerKey || '';
    }
    if (element && key) {
      const state = {
        key,
        offset: Math.max(0, Number(progress.text_offset) || 0),
        top: Number.isFinite(Number(progress.top_offset)) ? Number(progress.top_offset) : 6
      };
      reader.saveLocal?.(state);
      if (reader.settleRestore) reader.settleRestore(state, [0, 80, 220, 500]);
      else reader.restore?.(state);
      return true;
    }
    if (progress.section_id) {
      const section = document.getElementById(progress.section_id);
      if (section) {
        section.scrollIntoView({ behavior: 'auto', block: 'start' });
        return true;
      }
    }
  } finally {
    setTimeout(() => { applyingRemote = false; }, 950);
  }
  return false;
}

async function fetchProgressByPath(filePath, quiet = false) {
  if (!currentUser || !navigator.onLine || !filePath) return null;
  const { data, error } = await supabase
    .from('study_progress')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('file_path', filePath)
    .maybeSingle();
  if (error) {
    if (!quiet) emitStatus('error', error.message || 'Could not load progress');
    return null;
  }
  return data || null;
}

async function migrateLegacyCloudProgress(legacy) {
  if (!legacy || !currentUser || !LEGACY_FILE_PATH || LEGACY_FILE_PATH === FILE_PATH) return null;
  const payload = {
    user_id: currentUser.id,
    file_path: FILE_PATH,
    section_id: legacy.section_id || null,
    anchor_key: legacy.anchor_key || null,
    text_offset: Math.max(0, Number(legacy.text_offset) || 0),
    top_offset: Number.isFinite(Number(legacy.top_offset)) ? Number(legacy.top_offset) : 6,
    context_text: legacy.context_text || null,
    context_hash: legacy.context_hash || null,
    device_id: legacy.device_id || DEVICE_ID
  };

  const { data, error } = await supabase
    .from('study_progress')
    .insert(payload)
    .select('*')
    .maybeSingle();

  if (!error && data) {
    emitStatus('synced', 'Legacy progress migrated to the short filename');
    return data;
  }

  // A second device may have created the new row first.
  const existing = await fetchProgressByPath(FILE_PATH, true);
  if (existing) return existing;
  emitStatus('error', error?.message || 'Could not migrate legacy progress');
  return null;
}

async function fetchProgress() {
  const current = await fetchProgressByPath(FILE_PATH);
  if (current) return current;

  if (LEGACY_FILE_PATH && LEGACY_FILE_PATH !== FILE_PATH) {
    const legacy = await fetchProgressByPath(LEGACY_FILE_PATH, true);
    if (legacy) {
      const migrated = await migrateLegacyCloudProgress(legacy);
      return migrated || legacy;
    }
  }
  return null;
}

function rememberScopedLastPage() {
  if (!currentUser) return;
  safeSet(LAST_PAGE_PREFIX + currentUser.id, location.pathname + location.search);
  safeSet('study-last-active-at:' + currentUser.id, Date.now());
}

async function insertInitialProgress(payload) {
  const { data, error } = await supabase
    .from('study_progress')
    .insert({ user_id: currentUser.id, ...payload })
    .select('*')
    .maybeSingle();
  if (!error && data) {
    knownRevision = Number(data.revision) || 1;
    knownUpdatedAt = data.updated_at || null;
    lastSyncedSignature = remoteSignature(data);
    rememberScopedLastPage();
    emitStatus('synced', 'Initial progress created');
    return true;
  }
  const remote = await fetchProgress();
  if (remote) {
    knownRevision = Number(remote.revision) || 1;
    knownUpdatedAt = remote.updated_at || null;
    lastSyncedSignature = remoteSignature(remote);
    return false;
  }
  emitStatus('error', error?.message || 'Could not create progress row');
  return false;
}

async function updateProgress(payload, expectedRevision) {
  const { data, error } = await supabase
    .from('study_progress')
    .update(payload)
    .eq('user_id', currentUser.id)
    .eq('file_path', FILE_PATH)
    .eq('revision', expectedRevision)
    .select('*')
    .maybeSingle();
  if (error) {
    emitStatus('error', error.message || 'Could not save progress');
    return { ok: false, conflict: false };
  }
  if (!data) return { ok: false, conflict: true };
  knownRevision = Number(data.revision) || expectedRevision + 1;
  knownUpdatedAt = data.updated_at || null;
  lastSyncedSignature = remoteSignature(data);
  rememberScopedLastPage();
  emitStatus('synced', 'Progress saved');
  return { ok: true, conflict: false };
}

async function saveCloudProgress(force = false, retryOnConflict = true) {
  if (!currentUser || !navigator.onLine || applyingRemote) return false;
  if (!dirty && !force) return false;
  const payload = await captureStablePayload();
  if (!payload) {
    emitStatus('error', 'Could not capture the current reading position');
    return false;
  }
  const signature = payloadSignature(payload);
  if (!force && signature === lastSyncedSignature) {
    dirty = false;
    return true;
  }
  const versionAtStart = dirtyVersion;
  emitStatus('saving', 'Saving progress');
  if (knownRevision === null) {
    const created = await insertInitialProgress(payload);
    if (created) {
      if (dirtyVersion === versionAtStart) dirty = false;
      return true;
    }
  }
  if (knownRevision !== null) {
    const result = await updateProgress(payload, knownRevision);
    if (result.ok) {
      if (dirtyVersion === versionAtStart) dirty = false;
      return true;
    }
    if (result.conflict) {
      const remote = await fetchProgress();
      if (remote) {
        knownRevision = Number(remote.revision) || 1;
        knownUpdatedAt = remote.updated_at || null;
        lastSyncedSignature = remoteSignature(remote);
        if ((dirty || force) && retryOnConflict) return saveCloudProgress(force, false);
        if (!dirty) restoreRemoteProgress(remote);
      }
    }
  }
  return false;
}

function scheduleSave(delayMs = 550) {
  if (!dirty || !currentUser) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void saveCloudProgress(false); }, delayMs);
}

function markDirtyFromScroll() {
  if (!initializationComplete || applyingRemote || Date.now() < ignoreScrollUntil) return;
  dirty = true;
  dirtyVersion += 1;
  emitStatus('pending', 'Reading position changed');
  scheduleSave(550);
}

async function refreshFromCloud() {
  if (!currentUser || dirty || !navigator.onLine) return;
  const remote = await fetchProgress();
  if (!remote) return;
  const remoteRevision = Number(remote.revision) || 1;
  if (knownRevision === null || remoteRevision > knownRevision) {
    knownRevision = remoteRevision;
    knownUpdatedAt = remote.updated_at || null;
    lastSyncedSignature = remoteSignature(remote);
    restoreRemoteProgress(remote);
    rememberScopedLastPage();
    emitStatus('synced', 'Newer progress loaded from cloud');
  }
}

async function seedOrRestore() {
  initializationComplete = false;
  await waitForDocumentReady();
  await delay(60);
  const reader = await waitForReader();
  if (!reader || !currentUser) {
    emitStatus('error', 'Reader engine or signed-in user is unavailable');
    return;
  }
  reader.rebuild?.();
  const remote = await fetchProgress();
  if (remote) {
    knownRevision = Number(remote.revision) || 1;
    knownUpdatedAt = remote.updated_at || null;
    lastSyncedSignature = remoteSignature(remote);
    restoreRemoteProgress(remote);
    rememberScopedLastPage();
    emitStatus('synced', 'Cloud progress loaded');
  } else {
    const payload = await captureStablePayload();
    if (payload) await insertInitialProgress(payload);
    else emitStatus('error', 'No readable position was found; progress row was not created');
  }
  ignoreScrollUntil = Date.now() + 1200;
  initializationComplete = true;
}

async function readCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    emitStatus('error', error.message || 'Could not read login session');
    return null;
  }
  return data.session || null;
}

async function ensureSessionAndSyncImpl(forceSeed = false) {
  const session = await readCurrentSession();
  const nextUser = session?.user || null;
  if (!nextUser) {
    currentUser = null;
    emitStatus('signed_out', 'Not signed in; local progress only');
    return;
  }
  const userChanged = !currentUser || currentUser.id !== nextUser.id;
  currentUser = nextUser;
  safeSet(ACTIVE_USER_KEY, currentUser.id);
  if (userChanged) {
    knownRevision = null;
    knownUpdatedAt = null;
    lastSyncedSignature = '';
  }
  if (userChanged || forceSeed || !initializationComplete) {
    emitStatus('loading', 'Loading cloud progress');
    await seedOrRestore();
  } else {
    await refreshFromCloud();
  }
}


async function ensureSessionAndSync(forceSeed = false) {
  if (synchronizationPromise) return synchronizationPromise;
  synchronizationPromise = ensureSessionAndSyncImpl(forceSeed);
  try {
    return await synchronizationPromise;
  } finally {
    synchronizationPromise = null;
  }
}

async function startSync() {
  if (startupPromise) return startupPromise;
  startupPromise = (async () => {
    try {
      supabase = await window.createStudySupabaseClient();
    } catch (error) {
      console.error('[study-sync] Cloud client unavailable:', error);
      emitStatus('error', 'Cloud client unavailable: ' + (error?.message || error));
      return;
    }
    await ensureSessionAndSync(true);
  })();
  return startupPromise;
}

window.addEventListener('scroll', markDirtyFromScroll, { passive: true });
window.addEventListener('touchend', () => { if (dirty) scheduleSave(180); }, { passive: true });
window.addEventListener('pointerup', () => { if (dirty) scheduleSave(220); }, { passive: true });
window.addEventListener('wheel', () => { if (dirty) scheduleSave(250); }, { passive: true });
window.addEventListener('online', () => { void ensureSessionAndSync(false); });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (dirty) void saveCloudProgress(false);
  } else {
    void ensureSessionAndSync(false);
  }
});
window.addEventListener('pageshow', () => { void ensureSessionAndSync(false); });
window.addEventListener('pagehide', () => { if (dirty) void saveCloudProgress(false); });

setInterval(() => {
  if (dirty && document.visibilityState === 'visible') void saveCloudProgress(false);
}, 4000);

window.StudySync = Object.freeze({
  version: VERSION,
  filePath: FILE_PATH,
  saveNow: () => saveCloudProgress(true),
  refreshNow: () => ensureSessionAndSync(false),
  getState: () => ({
    userId: currentUser?.id || null,
    knownRevision,
    knownUpdatedAt,
    dirty,
    initializationComplete,
    deviceId: DEVICE_ID
  })
});

void startSync();
})();
