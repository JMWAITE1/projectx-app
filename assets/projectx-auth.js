// ProjectX auth gate — shared across all protected pages.
// Exposes window.__projectxReady (Promise) that resolves once the user is
// authenticated and has an active 'projectx' access grant.
// Each protected page starts its module with: await window.__projectxReady;
(function () {
  const SUPABASE_URL = 'https://uhodycdbkwocvptiffks.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_TKWfAttrdywsm1BOMUMNlw_FjMolZO5';
  const APP_CODE    = 'projectx';
  const SESSION_KEY = 'ngl-am-auth';
  const AM_LOGIN    = 'https://apps.nationalgroupltd.com/login?return=/projectx';

  var cover = document.createElement('div');
  cover.id = 'projectx-cover';
  cover.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:499';
  document.documentElement.appendChild(cover);

  function showBody() {
    var c = document.getElementById('projectx-cover');
    if (c) c.remove();
  }

  let __resolveReady;
  window.__projectxReady = new Promise(function (r) { __resolveReady = r; });
  window.__projectxJwt = null;

  // ── Session helpers ─────────────────────────────────────────────────
  function loadSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }
  function saveSession(s) {
    var data = {
      access_token:  s.access_token,
      refresh_token: s.refresh_token,
      expires_at:    s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600),
      user:          s.user,
    };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch (e) {}
    window.__projectxJwt = data.access_token;
  }

  async function tryRefresh(refresh_token) {
    try {
      var r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh_token }),
      });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }

  async function checkAccess(token, userId) {
    try {
      var r = await fetch(
        SUPABASE_URL + '/rest/v1/app_access?select=active&user_id=eq.' + userId
        + '&app_code=eq.' + APP_CODE + '&active=eq.true&limit=1',
        { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token } }
      );
      var data = await r.json();
      return Array.isArray(data) && data.length > 0;
    } catch (e) { return false; }
  }

  function goToLogin() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    location.href = AM_LOGIN;
  }

  function whenBodyReady(fn) {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  async function init() {
    var stored = loadSession();
    var nowSec = Math.floor(Date.now() / 1000);
    var jwt = null, userId = null;

    if (stored && stored.access_token && stored.expires_at > nowSec + 60) {
      jwt = stored.access_token;
      userId = stored.user && stored.user.id;
      window.__projectxJwt = jwt;
    } else if (stored && stored.refresh_token) {
      var s = await tryRefresh(stored.refresh_token);
      if (s && s.access_token) {
        saveSession(s);
        jwt = s.access_token;
        userId = s.user && s.user.id;
      }
    }

    if (!jwt || !userId) { goToLogin(); return; }

    var hasAccess = await checkAccess(jwt, userId);
    if (!hasAccess) { location.href = AM_LOGIN; return; }

    whenBodyReady(showBody);
    __resolveReady();
  }

  init();
})();
