/* Shared fetch-with-auth client for standalone pages (Developer Portal, Bot
 * Marketplace, Community Bot Hosting) that aren't part of the main app.js SPA.
 * Each of these pages used to carry its own copy-pasted api() that only read
 * the access token once at load and bounced straight to /login on any 401 —
 * so a short-lived access token expiring mid-session logged people out even
 * though a valid refresh token existed, unlike the main app. This mirrors
 * app.js's tryRefresh()/api() exactly, using the same localStorage keys, so
 * a session started in the main app just works here too.
 *
 * Usage: <script src="/js/api-client.js"></script> before the page's own
 * script. Exposes window.disdrocApi = { api, requireAuth, getToken }.
 */
(function () {
  'use strict';
  var TOKEN_KEY = 'disdroc_token';
  var REFRESH_KEY = 'disdroc_refresh';

  function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function getRefresh() { return localStorage.getItem(REFRESH_KEY) || ''; }
  function clearTokens() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY); }
  function saveTokens(token, refresh) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  }

  function deviceFp() {
    var fp = localStorage.getItem('disdroc_fp');
    if (!fp) {
      var seed = [navigator.userAgent, navigator.language, navigator.platform,
        screen.width + 'x' + screen.height, Intl.DateTimeFormat().resolvedOptions().timeZone].join('|');
      var h = 0; for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
      fp = (h >>> 0).toString(36) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('disdroc_fp', fp);
    }
    return fp;
  }
  function deviceId() {
    var id = localStorage.getItem('disdroc_device_id');
    if (!id || !/^[\w.-]{8,64}$/.test(id)) {
      id = (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '')
        : Date.now().toString(36) + Math.random().toString(36).slice(2, 14));
      localStorage.setItem('disdroc_device_id', id);
    }
    return id;
  }

  var refreshing = null;
  function tryRefresh() {
    if (refreshing) return refreshing;
    var rt = getRefresh();
    if (!rt) return Promise.resolve(false);
    refreshing = fetch('/api/auth/refresh', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-device-fp': deviceFp(), 'x-device-id': deviceId() },
      body: JSON.stringify({ refreshToken: rt }),
    }).then(function (res) {
      if (res.ok) {
        return res.json().catch(function () { return {}; }).then(function (b) {
          saveTokens(b.token, b.refreshToken); return true;
        });
      }
      // Only a definitive rejection (401/403) kills the session — a 5xx/network
      // blip shouldn't turn a transient outage into a forced logout.
      if (res.status === 401 || res.status === 403) { clearTokens(); return false; }
      return false;
    }).catch(function () { return false; })
      .finally(function () { refreshing = null; });
    return refreshing;
  }

  function api(path, opts, _retried) {
    opts = opts || {};
    var headers = Object.assign({}, opts.headers || {}, { 'x-device-fp': deviceFp(), 'x-device-id': deviceId() });
    if (!headers['content-type'] && opts.body && typeof opts.body === 'string') headers['content-type'] = 'application/json';
    var t = getToken();
    if (t) headers.authorization = 'Bearer ' + t;
    return fetch(path, Object.assign({}, opts, { headers: headers, credentials: 'include' })).then(function (res) {
      if (res.status === 401) {
        if (!_retried) {
          return tryRefresh().then(function (ok) {
            if (ok) return api(path, opts, true);
            if (!getToken()) { location.href = '/login'; return new Promise(function () {}); }
            throw new Error('auth_unavailable');
          });
        }
        if (!getToken()) { location.href = '/login'; return new Promise(function () {}); }
        throw new Error('auth_unavailable');
      }
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) throw new Error(body.error || 'request_failed');
        return body;
      });
    });
  }

  // Call at page load in place of the old `if (!token) location.href='/login'`.
  // Unlike that check, this gives an expired-but-refreshable session a chance
  // before bouncing — it only redirects if there's truly nothing to work with.
  function requireAuth() {
    if (getToken() || getRefresh()) return true;
    location.href = '/login';
    return false;
  }

  window.disdrocApi = { api: api, requireAuth: requireAuth, getToken: getToken };
})();
