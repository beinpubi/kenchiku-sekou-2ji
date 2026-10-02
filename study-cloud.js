// Cloud runtime v6.2 for lesson pages.
// Public browser configuration for the study app. Cloud sync pilot v6.2.
window.STUDY_CONFIG = Object.freeze({
  SUPABASE_URL: 'https://aniaxezhssgumxmbxkhl.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_6NbASFJULfnuggdm6MukFg_UknPZCIB',
  APP_ROOT_URL: 'https://beinpubi.github.io/kenchiku-sekou-2ji/'
});

(function () {
  'use strict';

  const SESSION_KEY = 'study-cloud-session-v5';
  window.__STUDY_CLOUD_CLIENT_VERSION__ = '6.2';
  const listeners = new Set();

  function config() {
    const cfg = window.STUDY_CONFIG || {};
    const url = String(cfg.SUPABASE_URL || '').replace(/\/+$/, '');
    const key = String(cfg.SUPABASE_PUBLISHABLE_KEY || '');
    if (!url || !key) throw new Error('Embedded Supabase configuration is missing or incomplete');
    return { url, key };
  }

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  function safeRemove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  function readSession() {
    const raw = safeGet(SESSION_KEY);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      return value && value.access_token && value.refresh_token && value.user ? value : null;
    } catch (e) {
      return null;
    }
  }

  function saveSession(session) {
    if (!session) {
      safeRemove(SESSION_KEY);
      return;
    }
    safeSet(SESSION_KEY, JSON.stringify(session));
  }

  function normalizeSession(payload) {
    if (!payload || !payload.access_token || !payload.refresh_token) return null;
    const expiresAt = Number(payload.expires_at) ||
      (Math.floor(Date.now() / 1000) + (Number(payload.expires_in) || 3600));
    return {
      access_token: payload.access_token,
      token_type: payload.token_type || 'bearer',
      expires_in: Number(payload.expires_in) || 3600,
      expires_at: expiresAt,
      refresh_token: payload.refresh_token,
      user: payload.user || null
    };
  }

  function errorObject(message, status, raw) {
    return {
      message: String(message || 'Request failed'),
      status: Number(status) || 0,
      raw: raw || null
    };
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) { return text; }
  }

  function messageFromBody(body, fallback) {
    if (!body) return fallback;
    if (typeof body === 'string') return body;
    return body.msg || body.message || body.error_description || body.error || body.details || fallback;
  }

  async function authRequest(path, options) {
    const { url, key } = config();
    const headers = Object.assign({
      'apikey': key,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Client-Info': 'kenchiku-study-sync/6.2'
    }, options?.headers || {});

    let response;
    try {
      response = await fetch(url + path, {
        method: options?.method || 'GET',
        headers,
        body: options?.body === undefined ? undefined : JSON.stringify(options.body),
        cache: 'no-store'
      });
    } catch (e) {
      throw errorObject('Could not connect to Supabase Auth: ' + (e?.message || e), 0, null);
    }

    const body = await parseResponse(response);
    if (!response.ok) {
      throw errorObject(messageFromBody(body, 'Supabase Auth request failed'), response.status, body);
    }
    return body;
  }

  function notify(event, session) {
    for (const callback of listeners) {
      try { callback(event, session || null); } catch (e) { console.error(e); }
    }
  }

  async function refreshSession(current) {
    if (!current?.refresh_token) return null;
    try {
      const payload = await authRequest('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: { refresh_token: current.refresh_token }
      });
      const session = normalizeSession(payload);
      if (!session || !session.user) throw new Error('Invalid refresh response');
      saveSession(session);
      notify('TOKEN_REFRESHED', session);
      return session;
    } catch (e) {
      safeRemove(SESSION_KEY);
      notify('SIGNED_OUT', null);
      throw e;
    }
  }

  async function getValidSession() {
    let session = readSession();
    if (!session) return null;
    const now = Math.floor(Date.now() / 1000);
    if (!session.expires_at || session.expires_at <= now + 60) {
      session = await refreshSession(session);
    }
    return session;
  }

  const auth = {
    async signInWithPassword(credentials) {
      try {
        const payload = await authRequest('/auth/v1/token?grant_type=password', {
          method: 'POST',
          body: {
            email: String(credentials?.email || '').trim(),
            password: String(credentials?.password || '')
          }
        });
        const session = normalizeSession(payload);
        if (!session || !session.user) {
          return { data: { session: null, user: null }, error: errorObject('Supabase returned no session', 0, payload) };
        }
        saveSession(session);
        notify('SIGNED_IN', session);
        return { data: { session, user: session.user }, error: null };
      } catch (e) {
        return { data: { session: null, user: null }, error: errorObject(e?.message || e, e?.status, e?.raw) };
      }
    },

    async getSession() {
      try {
        const session = await getValidSession();
        return { data: { session }, error: null };
      } catch (e) {
        return { data: { session: null }, error: errorObject(e?.message || e, e?.status, e?.raw) };
      }
    },

    async signOut() {
      let serverError = null;
      const session = readSession();
      if (session?.access_token) {
        try {
          await authRequest('/auth/v1/logout?scope=local', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + session.access_token },
            body: {}
          });
        } catch (e) {
          serverError = e;
          console.warn('[study-cloud] Remote sign-out failed; local session will still be cleared.', e);
        }
      }
      safeRemove(SESSION_KEY);
      notify('SIGNED_OUT', null);
      return { error: serverError ? errorObject(serverError?.message || serverError, serverError?.status, serverError?.raw) : null };
    },

    onAuthStateChange(callback) {
      if (typeof callback === 'function') listeners.add(callback);
      const subscription = {
        unsubscribe() { listeners.delete(callback); }
      };
      return { data: { subscription } };
    }
  };

  class QueryBuilder {
    constructor(table) {
      this.table = table;
      this.operation = 'select';
      this.columns = '*';
      this.payload = null;
      this.filters = [];
      this.orderBy = null;
      this.limitCount = null;
    }

    select(columns) {
      this.columns = columns || '*';
      return this;
    }

    insert(payload) {
      this.operation = 'insert';
      this.payload = payload;
      return this;
    }

    update(payload) {
      this.operation = 'update';
      this.payload = payload;
      return this;
    }

    eq(column, value) {
      this.filters.push([column, value]);
      return this;
    }

    order(column, options) {
      this.orderBy = [column, options?.ascending !== false];
      return this;
    }

    limit(value) {
      this.limitCount = Math.max(0, Number(value) || 0);
      return this;
    }

    async maybeSingle() {
      const result = await this.execute();
      if (result.error) return result;
      const rows = Array.isArray(result.data) ? result.data : (result.data ? [result.data] : []);
      return { data: rows.length ? rows[0] : null, error: null };
    }

    async execute() {
      const { url, key } = config();
      let session;
      try {
        session = await getValidSession();
      } catch (e) {
        return { data: null, error: errorObject(e?.message || e, e?.status, e?.raw) };
      }

      if (!session?.access_token) {
        return { data: null, error: errorObject('No active Supabase session', 401, null) };
      }

      const endpoint = new URL(url + '/rest/v1/' + encodeURIComponent(this.table));
      if (this.columns) endpoint.searchParams.set('select', this.columns);
      for (const [column, value] of this.filters) {
        endpoint.searchParams.set(column, 'eq.' + String(value));
      }
      if (this.orderBy) {
        endpoint.searchParams.set('order', this.orderBy[0] + '.' + (this.orderBy[1] ? 'asc' : 'desc'));
      }
      if (this.limitCount !== null) endpoint.searchParams.set('limit', String(this.limitCount));

      const headers = {
        'apikey': key,
        'Authorization': 'Bearer ' + session.access_token,
        'Accept': 'application/json'
      };
      let method = 'GET';
      let body;
      if (this.operation === 'insert') {
        method = 'POST';
        headers['Content-Type'] = 'application/json';
        headers['Prefer'] = 'return=representation';
        body = JSON.stringify(this.payload);
      } else if (this.operation === 'update') {
        method = 'PATCH';
        headers['Content-Type'] = 'application/json';
        headers['Prefer'] = 'return=representation';
        body = JSON.stringify(this.payload);
      }

      let response;
      try {
        response = await fetch(endpoint.href, {
          method,
          headers,
          body,
          cache: 'no-store'
        });
      } catch (e) {
        return { data: null, error: errorObject('Could not connect to Supabase Data API: ' + (e?.message || e), 0, null) };
      }

      const responseBody = await parseResponse(response);
      if (!response.ok) {
        return {
          data: null,
          error: errorObject(messageFromBody(responseBody, 'Supabase Data API request failed'), response.status, responseBody)
        };
      }
      return { data: responseBody || [], error: null };
    }
  }

  const client = {
    auth,
    from(table) { return new QueryBuilder(table); }
  };

  window.StudySupabaseReady = Promise.resolve(client);
  window.createStudySupabaseClient = async function () {
    config();
    return client;
  };
  window.__STUDY_CLOUD_CLIENT_READY__ = true;
})();
