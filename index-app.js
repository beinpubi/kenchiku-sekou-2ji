(async function () {
  let supabase;
  let APP_ROOT_URL;
  try {
    if (!window.STUDY_CONFIG) throw new Error('Embedded STUDY_CONFIG is unavailable');
    if (typeof window.createStudySupabaseClient !== 'function') throw new Error('Embedded cloud client is unavailable');
    supabase = await window.createStudySupabaseClient();
    APP_ROOT_URL = window.STUDY_CONFIG.APP_ROOT_URL;
    window.__STUDY_AUTH_MODULE_READY__ = true;
  } catch (error) {
    console.error(error);
    const msg = document.getElementById('authMessage');
    const sync = document.getElementById('syncMessage');
    if (msg) {
      msg.textContent = 'Cloud initialization failed: ' + (error && error.message ? error.message : String(error));
      msg.style.color = '#ff8585';
    }
    if (sync) sync.textContent = 'Build 7.0 initialization error';
    return;
  }

  const authCard = document.getElementById('authCard');
  const authStateBadge = document.getElementById('authStateBadge');
  const loginPanel = document.getElementById('loginPanel');
  const accountPanel = document.getElementById('accountPanel');
  const loginEmail = document.getElementById('loginEmail');
  const loginPassword = document.getElementById('loginPassword');
  const loginButton = document.getElementById('loginButton');
  const continueButton = document.getElementById('continueButton');
  const signOutButton = document.getElementById('signOutButton');
  const accountEmail = document.getElementById('accountEmail');
  const authMessage = document.getElementById('authMessage');
  const syncMessage = document.getElementById('syncMessage');
  const knownLessonNames = new Set(
    [...document.querySelectorAll('a.doc[href]')].map(a => {
      try { return decodeURIComponent(new URL(a.getAttribute('href'), location.href).pathname.split('/').pop() || ''); }
      catch (e) { return ''; }
    }).filter(Boolean)
  );

  let suppressAutoResume = false;
  let resumeAttempted = false;
  let suppressNextAuthAutoResume = false;
  let currentSession = null;

  function safeGet(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function safeSet(key, value) { try { localStorage.setItem(key, String(value)); } catch (e) {} }
  function safeRemove(key) { try { localStorage.removeItem(key); } catch (e) {} }

  if (safeGet('study-explicit-home') === '1') {
    suppressAutoResume = true;
    safeRemove('study-explicit-home');
  }

  function setMessage(text, isError = false) {
    authMessage.textContent = text;
    authMessage.style.color = isError ? '#ff8585' : '';
  }

  function validLessonTarget(value) {
    if (!value) return null;
    try {
      const appRoot = new URL(APP_ROOT_URL);
      let candidate = new URL(value, appRoot);
      if (candidate.origin !== appRoot.origin) return null;
      if (!candidate.pathname.startsWith(appRoot.pathname)) return null;
      const fileName = decodeURIComponent(candidate.pathname.split('/').pop() || '');
      const canonicalName = window.STUDY_LESSON_ALIASES?.[fileName] || fileName;
      if (!knownLessonNames.has(canonicalName)) return null;
      if (canonicalName !== fileName) {
        const suffix = candidate.search + candidate.hash;
        candidate = new URL(canonicalName + suffix, appRoot);
      }
      return candidate;
    } catch (e) {
      return null;
    }
  }

  function renderSession(session) {
    currentSession = session || null;
    const user = session?.user || null;
    if (user) {
      safeSet('study-active-user-id', user.id);
      loginPanel.classList.add('auth-hidden');
      accountPanel.classList.remove('auth-hidden');
      accountEmail.textContent = user.email || user.id;
      authCard.dataset.auth = 'signed-in';
      authStateBadge.textContent = 'SIGNED IN';
      authStateBadge.classList.remove('signed-out');
      authStateBadge.classList.add('signed-in');
      setMessage('Signed in successfully. This device will keep the session and sync reading progress.');
      syncMessage.textContent = navigator.onLine ? 'Build 7.0 · Cloud sync ready' : 'Build 7.0 · Offline';
    } else {
      safeRemove('study-active-user-id');
      loginPanel.classList.remove('auth-hidden');
      accountPanel.classList.add('auth-hidden');
      accountEmail.textContent = '';
      authCard.dataset.auth = 'signed-out';
      authStateBadge.textContent = 'SIGNED OUT';
      authStateBadge.classList.remove('signed-in');
      authStateBadge.classList.add('signed-out');
      setMessage('Use the email address registered in Supabase Authentication.');
      syncMessage.textContent = 'Build 7.0 · Local mode';
    }
  }

  function importLegacyLastPageOnce(userId) {
    const scopedKey = 'study-last-page:' + userId;
    if (safeGet(scopedKey)) return;

    const owner = safeGet('study-legacy-import-owner');
    if (owner && owner !== userId) return;

    const legacy = safeGet('study-last-page');
    const candidate = validLessonTarget(legacy);
    if (candidate) {
      safeSet(scopedKey, candidate.pathname + candidate.search);
      safeSet('study-legacy-import-owner', userId);
    }
  }

  async function latestCloudProgress(user) {
    const { data, error } = await supabase
      .from('study_progress')
      .select('file_path,section_id,anchor_key,text_offset,updated_at,revision')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  async function autoResume(session) {
    if (resumeAttempted || suppressAutoResume || !session?.user) return;
    resumeAttempted = true;
    const user = session.user;
    importLegacyLastPageOnce(user.id);
    syncMessage.textContent = 'Checking latest progress…';

    try {
      if (navigator.onLine) {
        const latest = await latestCloudProgress(user);
        const cloudTarget = validLessonTarget(latest?.file_path);
        if (cloudTarget) {
          safeSet('study-last-page:' + user.id, cloudTarget.pathname + cloudTarget.search);
          syncMessage.textContent = 'Resuming cloud progress…';
          location.replace(cloudTarget.href);
          return;
        }
      }

      const localTarget = validLessonTarget(safeGet('study-last-page:' + user.id));
      if (localTarget) {
        syncMessage.textContent = 'Resuming local progress…';
        location.replace(localTarget.href);
        return;
      }

      syncMessage.textContent = navigator.onLine ? 'Build 7.0 · Cloud sync ready' : 'Build 7.0 · Offline';
    } catch (e) {
      console.error(e);
      syncMessage.textContent = 'Cloud unavailable; using local data';
      const localTarget = validLessonTarget(safeGet('study-last-page:' + user.id));
      if (localTarget) location.replace(localTarget.href);
    }
  }

  loginButton.addEventListener('click', async () => {
    const email = loginEmail.value.trim();
    const password = loginPassword.value;
    if (!email || !password) {
      setMessage('Enter both email address and password.', true);
      return;
    }

    loginButton.disabled = true;
    loginButton.textContent = 'Signing in...';
    setMessage('Contacting Supabase...');
    suppressNextAuthAutoResume = true;

    let data, error;
    try {
      ({ data, error } = await supabase.auth.signInWithPassword({ email, password }));
    } catch (e) {
      error = e;
    }

    loginButton.disabled = false;
    loginButton.textContent = 'Sign in';

    if (error || !data?.session) {
      suppressNextAuthAutoResume = false;
      setMessage(error?.message || 'Sign-in failed. Check the email address, password, and network connection.', true);
      return;
    }

    loginPassword.value = '';
    renderSession(data.session);
    resumeAttempted = false;
    syncMessage.textContent = 'Build 7.0 · Signed in. Tap Continue latest to test cloud resume.';
  });

  loginPassword.addEventListener('keydown', event => {
    if (event.key === 'Enter') loginButton.click();
  });

  continueButton.addEventListener('click', async () => {
    if (!currentSession?.user) {
      setMessage('No active session. Sign in first.', true);
      return;
    }
    resumeAttempted = false;
    suppressAutoResume = false;
    await autoResume(currentSession);
  });

  signOutButton.addEventListener('click', async () => {
    signOutButton.disabled = true;
    const { error } = await supabase.auth.signOut();
    signOutButton.disabled = false;
    if (error) {
      setMessage(error.message || 'Sign-out failed.', true);
      return;
    }
    safeRemove('study-active-user-id');
    resumeAttempted = false;
    suppressAutoResume = true;
    renderSession(null);
  });

  window.addEventListener('online', () => { syncMessage.textContent = 'Cloud sync'; });
  window.addEventListener('offline', () => { syncMessage.textContent = 'Offline'; });

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    setMessage(error.message || 'Could not read sign-in session.', true);
    renderSession(null);
  } else {
    renderSession(data.session);
    await autoResume(data.session);
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => {
      const skipResume = suppressNextAuthAutoResume;
      suppressNextAuthAutoResume = false;
      renderSession(session);
      if (session && !suppressAutoResume && !skipResume) void autoResume(session);
    }, 0);
  });
  })();
