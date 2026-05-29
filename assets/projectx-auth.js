// ProjectX auth gate — shared across all protected pages.
// Exposes window.__projectxReady (Promise) that resolves once the user is
// authenticated and has an active 'projectx' access grant.
// Each protected page starts its module with: await window.__projectxReady;
(function () {
  const SUPABASE_URL = 'https://uhodycdbkwocvptiffks.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_TKWfAttrdywsm1BOMUMNlw_FjMolZO5';
  const APP_CODE    = 'projectx';
  const SESSION_KEY = 'ngl-am-auth';

  // White cover sits above the page until showBody() pulls it. The login
  // overlay (z-index 9999) sits above that.
  var cover = document.createElement('div');
  cover.id = 'projectx-cover';
  cover.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:9997';
  document.documentElement.appendChild(cover);

  function showBody() {
    var c = document.getElementById('projectx-cover');
    if (c) c.remove();
  }

  let __resolveReady;
  window.__projectxReady = new Promise(function (r) { __resolveReady = r; });

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

  // Silent refresh: swap a long-lived refresh token for a fresh access
  // token. Access tokens live 1h, refresh tokens live months — wiring
  // this in means a returning user doesn't have to re-OTP every day.
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

  // ── Overlay scaffolding (only mounted if auth check decides we need it) ──
  var style = document.createElement('style');
  style.textContent = [
    '.projectx-login-overlay{position:fixed;inset:0;background:rgba(10,20,40,.96);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}',
    '.projectx-login-overlay.open{display:flex}',
    '.projectx-login-card{background:#fff;border-radius:12px;padding:28px;max-width:380px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.4)}',
    '.projectx-login-card h2{font-size:1.15rem;font-weight:800;color:#1e3a5f;margin-bottom:6px;text-align:center}',
    '.projectx-login-card p{font-size:.85rem;color:#6b7280;margin-bottom:18px;text-align:center;line-height:1.45}',
    '.projectx-login-field{margin-bottom:14px}',
    '.projectx-login-field label{display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px}',
    '.projectx-login-field input{width:100%;padding:9px 11px;border:1px solid #d1d5db;border-radius:7px;font-size:14px;outline:none;box-sizing:border-box}',
    '.projectx-login-field input:focus{border-color:#1e3a5f;box-shadow:0 0 0 3px rgba(30,58,95,.12)}',
    '.projectx-login-btn{width:100%;padding:10px;background:#1e3a5f;color:#fff;border:none;border-radius:7px;font-size:14px;font-weight:600;cursor:pointer;margin-top:4px}',
    '.projectx-login-btn:disabled{opacity:.55;cursor:default}',
    '.projectx-login-err{color:#dc2626;font-size:12px;margin-top:8px;display:none;text-align:center}',
    '.projectx-login-err.show{display:block}',
    '.projectx-login-back{background:none;border:none;color:#6b7280;font-size:12px;cursor:pointer;margin-top:8px;display:block;text-align:center;width:100%}',
  ].join('');
  document.head.appendChild(style);

  var overlay = document.createElement('div');
  overlay.className = 'projectx-login-overlay';
  overlay.id = 'projectx-login-overlay';
  overlay.innerHTML = '<div class="projectx-login-card">'
    + '<h2>Sign in to ProjectX</h2>'
    + '<p id="projectx-login-msg">Enter your NGL email — we’ll send a one-time code.</p>'
    + '<div id="projectx-login-step-email">'
    +   '<div class="projectx-login-field"><label>Email</label>'
    +     '<input type="email" id="projectx-login-email" inputmode="email" autocomplete="email" placeholder="firstname.lastname@nationalgroupltd.com">'
    +   '</div>'
    +   '<button class="projectx-login-btn" id="projectx-login-send-btn" onclick="projectxLoginSend()">Send Code →</button>'
    + '</div>'
    + '<div id="projectx-login-step-code" style="display:none">'
    +   '<div class="projectx-login-field"><label>6-digit code</label>'
    +     '<input type="text" id="projectx-login-code" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="6" placeholder="••••••">'
    +   '</div>'
    +   '<button class="projectx-login-btn" id="projectx-login-verify-btn" onclick="projectxLoginVerify()">Verify &amp; Continue →</button>'
    +   '<button class="projectx-login-back" onclick="projectxLoginBack()">‹ Use a different email</button>'
    + '</div>'
    + '<div id="projectx-login-err" class="projectx-login-err"></div>'
    + '</div>';

  function whenBodyReady(fn) {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  function mountOverlay() {
    whenBodyReady(function () {
      document.body.insertBefore(overlay, document.body.firstChild);
      overlay.classList.add('open');
      setTimeout(function () { var e = document.getElementById('projectx-login-email'); if (e) e.focus(); }, 50);
    });
  }

  // ── Auth decision ───────────────────────────────────────────────────
  // (a) valid token → straight in
  // (b) expired token + refresh token → silent refresh; if it fails, login
  // (c) no session at all → login
  function admitLoggedIn() {
    whenBodyReady(showBody);
    __resolveReady();
  }
  function showLogin() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    mountOverlay();
  }

  var stored = loadSession();
  var nowSec = Math.floor(Date.now() / 1000);

  if (stored && stored.access_token && stored.expires_at > nowSec + 60) {
    window.__projectxJwt = stored.access_token;
    admitLoggedIn();
  } else if (stored && stored.refresh_token) {
    tryRefresh(stored.refresh_token).then(function (s) {
      if (s && s.access_token) {
        saveSession(s);
        admitLoggedIn();
      } else {
        showLogin();
      }
    });
  } else {
    showLogin();
  }

  // ── Login UI helpers ────────────────────────────────────────────────
  var __loginEmail = '';

  window.projectxLoginErr = function (msg) {
    var e = document.getElementById('projectx-login-err');
    if (msg) { e.textContent = msg; e.classList.add('show'); }
    else      { e.textContent = ''; e.classList.remove('show'); }
  };

  window.projectxLoginSend = async function () {
    projectxLoginErr('');
    var email = (document.getElementById('projectx-login-email').value || '').trim().toLowerCase();
    if (!email || !email.includes('@')) { projectxLoginErr('Enter a valid email address'); return; }
    if (!email.endsWith('@nationalgroupltd.com')) { projectxLoginErr('Access is restricted to NGL staff. Use your @nationalgroupltd.com email.'); return; }
    __loginEmail = email;
    var btn = document.getElementById('projectx-login-send-btn');
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      var r = await fetch(SUPABASE_URL + '/auth/v1/otp', {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, create_user: false }),
      });
      if (!r.ok) {
        var t = await r.text();
        if (t.includes('Signups not allowed') || t.includes('not allowed'))
          projectxLoginErr('This email isn\'t set up yet. Ask Richard to add you in Access Manager.');
        else
          projectxLoginErr('Couldn\'t send code: ' + t.slice(0, 140));
        btn.disabled = false; btn.textContent = 'Send Code →'; return;
      }
      document.getElementById('projectx-login-step-email').style.display = 'none';
      document.getElementById('projectx-login-step-code').style.display  = 'block';
      document.getElementById('projectx-login-msg').textContent = 'Code sent — check your email.';
      btn.disabled = false; btn.textContent = 'Send Code →';
      setTimeout(function () { var c = document.getElementById('projectx-login-code'); if (c) c.focus(); }, 50);
    } catch (e) {
      projectxLoginErr('Network error: ' + e.message);
      btn.disabled = false; btn.textContent = 'Send Code →';
    }
  };

  window.projectxLoginVerify = async function () {
    projectxLoginErr('');
    var token = (document.getElementById('projectx-login-code').value || '').trim();
    if (!/^\d{6}$/.test(token)) { projectxLoginErr('Code is 6 digits'); return; }
    var btn = document.getElementById('projectx-login-verify-btn');
    btn.disabled = true; btn.textContent = 'Verifying…';
    try {
      var r = await fetch(SUPABASE_URL + '/auth/v1/verify', {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: __loginEmail, token: token, type: 'email' }),
      });
      if (!r.ok) {
        projectxLoginErr('Code didn\'t verify — try again');
        btn.disabled = false; btn.textContent = 'Verify & Continue →'; return;
      }
      var s = await r.json();
      saveSession(s);
      var acR = await fetch(
        SUPABASE_URL + '/rest/v1/app_access?select=role,active&user_id=eq.' + s.user.id
        + '&app_code=eq.' + APP_CODE + '&active=eq.true&limit=1',
        { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + s.access_token } }
      );
      var acData = await acR.json();
      if (!acData || !acData.length) {
        projectxLoginErr('You don\'t have access to ProjectX. Contact Richard to request access.');
        localStorage.removeItem(SESSION_KEY);
        window.__projectxJwt = null;
        btn.disabled = false; btn.textContent = 'Verify & Continue →'; return;
      }
      overlay.classList.remove('open');
      showBody();
      __resolveReady();
    } catch (e) {
      projectxLoginErr('Network error: ' + e.message);
      btn.disabled = false; btn.textContent = 'Verify & Continue →';
    }
  };

  window.projectxLoginBack = function () {
    projectxLoginErr('');
    document.getElementById('projectx-login-step-code').style.display  = 'none';
    document.getElementById('projectx-login-step-email').style.display = 'block';
    document.getElementById('projectx-login-msg').textContent = 'Enter your NGL email — we’ll send a one-time code.';
  };
})();
