// TrakX auth gate — shared across all protected pages.
// Exposes window.__trakxReady (Promise) that resolves once the user is
// authenticated and has an active 'trakx' access grant.
// Each protected page starts its module with: await window.__trakxReady;
(function () {
  const SUPABASE_URL = 'https://uhodycdbkwocvptiffks.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_TKWfAttrdywsm1BOMUMNlw_FjMolZO5';
  const APP_CODE    = 'trakx';
  const SESSION_KEY = 'ngl-am-auth';

  // Hide body immediately so page content never flashes before auth completes.
  var bodyHide = document.createElement('style');
  bodyHide.id = 'trakx-body-hide';
  bodyHide.textContent = 'body{display:none!important}';
  document.head.appendChild(bodyHide);

  function showBody() {
    var s = document.getElementById('trakx-body-hide');
    if (s) s.remove();
  }

  let __resolveReady;
  window.__trakxReady = new Promise(function (r) { __resolveReady = r; });

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
    window.__trakxJwt = data.access_token;
  }

  var stored = loadSession();
  if (stored && stored.access_token && stored.expires_at > Math.floor(Date.now() / 1000) + 60) {
    window.__trakxJwt = stored.access_token;
    document.addEventListener('DOMContentLoaded', showBody);
    __resolveReady();
    return; // already authenticated — skip overlay setup
  }

  // ── Inject overlay styles ───────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '.trakx-login-overlay{position:fixed;inset:0;background:rgba(10,20,40,.96);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}',
    '.trakx-login-overlay.open{display:flex}',
    '.trakx-login-card{background:#fff;border-radius:12px;padding:28px;max-width:380px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.4)}',
    '.trakx-login-card h2{font-size:1.15rem;font-weight:800;color:#1e3a5f;margin-bottom:6px;text-align:center}',
    '.trakx-login-card p{font-size:.85rem;color:#6b7280;margin-bottom:18px;text-align:center;line-height:1.45}',
    '.trakx-login-field{margin-bottom:14px}',
    '.trakx-login-field label{display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px}',
    '.trakx-login-field input{width:100%;padding:9px 11px;border:1px solid #d1d5db;border-radius:7px;font-size:14px;outline:none;box-sizing:border-box}',
    '.trakx-login-field input:focus{border-color:#1e3a5f;box-shadow:0 0 0 3px rgba(30,58,95,.12)}',
    '.trakx-login-btn{width:100%;padding:10px;background:#1e3a5f;color:#fff;border:none;border-radius:7px;font-size:14px;font-weight:600;cursor:pointer;margin-top:4px}',
    '.trakx-login-btn:disabled{opacity:.55;cursor:default}',
    '.trakx-login-err{color:#dc2626;font-size:12px;margin-top:8px;display:none;text-align:center}',
    '.trakx-login-err.show{display:block}',
    '.trakx-login-back{background:none;border:none;color:#6b7280;font-size:12px;cursor:pointer;margin-top:8px;display:block;text-align:center;width:100%}',
  ].join('');
  document.head.appendChild(style);

  // ── Build overlay element ───────────────────────────────────────────
  var overlay = document.createElement('div');
  overlay.className = 'trakx-login-overlay';
  overlay.id = 'trakx-login-overlay';
  overlay.innerHTML = '<div class="trakx-login-card">'
    + '<h2>Sign in to TrakX</h2>'
    + '<p id="trakx-login-msg">Enter your NGL email — we’ll send a one-time code.</p>'
    + '<div id="trakx-login-step-email">'
    +   '<div class="trakx-login-field"><label>Email</label>'
    +     '<input type="email" id="trakx-login-email" inputmode="email" autocomplete="email" placeholder="firstname.lastname@nationalgroupltd.com">'
    +   '</div>'
    +   '<button class="trakx-login-btn" id="trakx-login-send-btn" onclick="trakxLoginSend()">Send Code →</button>'
    + '</div>'
    + '<div id="trakx-login-step-code" style="display:none">'
    +   '<div class="trakx-login-field"><label>6-digit code</label>'
    +     '<input type="text" id="trakx-login-code" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="6" placeholder="••••••">'
    +   '</div>'
    +   '<button class="trakx-login-btn" id="trakx-login-verify-btn" onclick="trakxLoginVerify()">Verify &amp; Continue →</button>'
    +   '<button class="trakx-login-back" onclick="trakxLoginBack()">‹ Use a different email</button>'
    + '</div>'
    + '<div id="trakx-login-err" class="trakx-login-err"></div>'
    + '</div>';

  function mountOverlay() {
    document.body.insertBefore(overlay, document.body.firstChild);
    overlay.classList.add('open');
    setTimeout(function () { var e = document.getElementById('trakx-login-email'); if (e) e.focus(); }, 50);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountOverlay);
  } else {
    mountOverlay();
  }

  // ── Login UI helpers ────────────────────────────────────────────────
  var __loginEmail = '';

  window.trakxLoginErr = function (msg) {
    var e = document.getElementById('trakx-login-err');
    if (msg) { e.textContent = msg; e.classList.add('show'); }
    else      { e.textContent = ''; e.classList.remove('show'); }
  };

  window.trakxLoginSend = async function () {
    trakxLoginErr('');
    var email = (document.getElementById('trakx-login-email').value || '').trim().toLowerCase();
    if (!email || !email.includes('@')) { trakxLoginErr('Enter a valid email address'); return; }
    if (!email.endsWith('@nationalgroupltd.com')) { trakxLoginErr('Access is restricted to NGL staff. Use your @nationalgroupltd.com email.'); return; }
    __loginEmail = email;
    var btn = document.getElementById('trakx-login-send-btn');
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
          trakxLoginErr('This email isn\'t set up yet. Ask Richard to add you in Access Manager.');
        else
          trakxLoginErr('Couldn\'t send code: ' + t.slice(0, 140));
        btn.disabled = false; btn.textContent = 'Send Code →'; return;
      }
      document.getElementById('trakx-login-step-email').style.display = 'none';
      document.getElementById('trakx-login-step-code').style.display  = 'block';
      document.getElementById('trakx-login-msg').textContent = 'Code sent — check your email.';
      btn.disabled = false; btn.textContent = 'Send Code →';
      setTimeout(function () { var c = document.getElementById('trakx-login-code'); if (c) c.focus(); }, 50);
    } catch (e) {
      trakxLoginErr('Network error: ' + e.message);
      btn.disabled = false; btn.textContent = 'Send Code →';
    }
  };

  window.trakxLoginVerify = async function () {
    trakxLoginErr('');
    var token = (document.getElementById('trakx-login-code').value || '').trim();
    if (!/^\d{6}$/.test(token)) { trakxLoginErr('Code is 6 digits'); return; }
    var btn = document.getElementById('trakx-login-verify-btn');
    btn.disabled = true; btn.textContent = 'Verifying…';
    try {
      var r = await fetch(SUPABASE_URL + '/auth/v1/verify', {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: __loginEmail, token: token, type: 'email' }),
      });
      if (!r.ok) {
        trakxLoginErr('Code didn\'t verify — try again');
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
        trakxLoginErr('You don\'t have access to TrakX. Contact Richard to request access.');
        localStorage.removeItem(SESSION_KEY);
        window.__trakxJwt = null;
        btn.disabled = false; btn.textContent = 'Verify & Continue →'; return;
      }
      overlay.classList.remove('open');
      showBody();
      __resolveReady();
    } catch (e) {
      trakxLoginErr('Network error: ' + e.message);
      btn.disabled = false; btn.textContent = 'Verify & Continue →';
    }
  };

  window.trakxLoginBack = function () {
    trakxLoginErr('');
    document.getElementById('trakx-login-step-code').style.display  = 'none';
    document.getElementById('trakx-login-step-email').style.display = 'block';
    document.getElementById('trakx-login-msg').textContent = 'Enter your NGL email — we’ll send a one-time code.';
  };
})();
