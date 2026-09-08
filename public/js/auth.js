// Copy goes through window.dLang (/js/lang.js) so login/signup follow the same
// `disdroc_lang` preference as the rest of disdroc.
function t(en, tr) { return window.dLang ? window.dLang.t(en, tr) : en; }

// Looked up lazily (as functions) so each call renders in the current language
// rather than whatever was active when this file was parsed.
const errMessages = {
  invalid_username: () => t('Username must be 3–20 chars, letters/numbers/underscore.', 'Kullanıcı adı 3–20 karakter olmalı; harf, rakam ve alt çizgi kullanabilirsin.'),
  invalid_email: () => t('Please enter a valid email.', 'Lütfen geçerli bir e-posta adresi gir.'),
  invalid_password: () => t('Password must be at least 8 characters.', 'Parola en az 8 karakter olmalı.'),
  weak_password: () => t('That password is too common — pick something more unique.', 'Bu parola fazla yaygın — daha özgün bir şey seç.'),
  username_taken: () => t('That username is taken.', 'Bu kullanıcı adı alınmış.'),
  username_not_allowed: () => t('That username isn\'t allowed.', 'Bu kullanıcı adına izin verilmiyor.'),
  email_taken: () => t('That email is already in use.', 'Bu e-posta adresi zaten kullanımda.'),
  invalid_credentials: () => t('Wrong username or password.', 'Kullanıcı adı veya parola hatalı.'),
  invalid_code: () => t('That code is incorrect or expired.', 'Bu kod hatalı veya süresi dolmuş.'),
  banned: () => t('This account has been banned.', 'Bu hesap yasaklandı.'),
  account_locked: () => t('Too many failed attempts. Try again in 15 minutes.', 'Çok fazla başarısız deneme. 15 dakika sonra tekrar dene.'),
  reauth_required: () => t('Unusual sign-in detected — please verify it\'s you.', 'Olağan dışı bir giriş algılandı — lütfen senin olduğunu doğrula.'),
  session_expired: () => t('Your session expired. Please log in again.', 'Oturumun sona erdi. Lütfen tekrar giriş yap.'),
};

// Show success message if arriving after a password reset
if (new URLSearchParams(location.search).get('reset') === '1') {
  const el = document.getElementById('err');
  if (el) {
    el.style.color = 'var(--accent, #4ade80)';
    el.textContent = t('Password reset — you can log in now.', 'Parolan sıfırlandı — artık giriş yapabilirsin.');
  }
}

function showErr(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.style.color = ''; // clear any success-green left over from e.g. a "code sent" message
  if (!msg) { el.textContent = ''; return; }
  const known = errMessages[msg];
  el.textContent = known ? known() : msg || t('Something went wrong.', 'Bir şeyler ters gitti.');
}

// A banned account gets the branded /banned screen (reason + duration) instead of
// a one-line error in the form. Returns true if it redirected (caller should stop).
function redirectIfBanned(body) {
  if (!body || body.error !== 'banned') return false;
  const params = new URLSearchParams();
  if (body.reason) params.set('reason', body.reason);
  if (body.until) params.set('until', body.until);
  location.href = '/banned' + (params.toString() ? '?' + params.toString() : '');
  return true;
}

// Stable-ish device fingerprint volunteered to the server for loose session
// binding + risk scoring. Never a hard lock — purely a signal.
function deviceFp() {
  let fp = localStorage.getItem('disdroc_fp');
  if (!fp) {
    const seed = [navigator.userAgent, navigator.language, navigator.platform,
      screen.width + 'x' + screen.height, Intl.DateTimeFormat().resolvedOptions().timeZone].join('|');
    let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    fp = (h >>> 0).toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('disdroc_fp', fp);
  }
  return fp;
}

// Stable opaque per-device id (X-Device-Id) — anchors trusted-devices + per-device
// geo so logging in elsewhere on another device doesn't bounce your other sessions.
function deviceId() {
  let id = localStorage.getItem('disdroc_device_id');
  if (!id || !/^[\w.-]{8,64}$/.test(id)) {
    id = (window.crypto && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '')
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 14));
    localStorage.setItem('disdroc_device_id', id);
  }
  return id;
}

// Prevent the slow-wifi double-submit: while a form's request is in flight, its
// submit button is disabled so mashing "Log in" / "Sign up" can't fire the same
// email-code-sending request 5 times. Returns false if already busy.
function runOnce(form, fn) {
  const btn = form.querySelector('button[type="submit"]');
  if (form._busy) return;
  form._busy = true;
  if (btn) btn.disabled = true;
  Promise.resolve(fn()).finally(() => {
    form._busy = false;
    if (btn) btn.disabled = false;
  });
}

async function postJson(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-device-fp': deviceFp(), 'x-device-id': deviceId() },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
}

function saveToken(token, refresh) {
  if (token) localStorage.setItem('disdroc_token', token);
  if (refresh) localStorage.setItem('disdroc_refresh', refresh);
}

let pendingUserId = null;
let pendingMode = 'email';
let pendingCanUseEmail = false;
let pendingHadTotp = false;

function showTwoFaForm(opts = {}) {
  const tw = document.getElementById('twofaForm');
  if (!tw) return;
  tw.style.display = '';

  const title = document.getElementById('tfaTitle');
  const hint = document.getElementById('tfaHint');
  const label = document.getElementById('tfaLabel');
  const switchDiv = document.getElementById('tfaSwitch');
  const switchBtn = document.getElementById('tfaSwitchBtn');

  if (pendingMode === 'totp') {
    if (title) title.textContent = t('Authenticator app', 'Kimlik doğrulayıcı uygulama');
    if (hint) hint.textContent = t(
      'Enter the 6-digit code from your authenticator app, or use a backup code.',
      'Kimlik doğrulayıcı uygulamandaki 6 haneli kodu gir veya bir yedek kod kullan.'
    );
    if (label) label.textContent = t('Authenticator code', 'Doğrulayıcı kodu');
    if (switchBtn) switchBtn.textContent = t('Use email code instead', 'Bunun yerine e-posta kodu kullan');
    if (switchDiv) switchDiv.style.display = pendingCanUseEmail ? '' : 'none';
  } else {
    if (title) title.textContent = t('Check your email', 'E-postanı kontrol et');
    if (hint) hint.textContent = opts.hint
      ? t('Code sent to ' + opts.hint + '.', opts.hint + ' adresine kod gönderildi.')
      : t('We sent a login code to your email.', 'E-postana bir giriş kodu gönderdik.');
    if (label) label.textContent = t('Email code', 'E-posta kodu');
    if (switchBtn) switchBtn.textContent = t('Use authenticator app instead', 'Bunun yerine kimlik doğrulayıcı uygulama kullan');
    if (switchDiv) switchDiv.style.display = pendingHadTotp ? '' : 'none';
  }

  const inp = tw.querySelector('input');
  if (inp) { inp.value = ''; inp.focus(); }
}

// ── Login ──────────────────────────────────────────────────────────────────

const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    runOnce(loginForm, async () => {
    showErr('err', '');
    const f = new FormData(loginForm);
    const r = await postJson('/api/login', { email: f.get('email'), password: f.get('password') });
    if (!r.ok) { if (redirectIfBanned(r.body)) return; return showErr('err', r.body.error); }

    if (r.body.needsVerify) {
      pendingUserId = r.body.userId;
      loginForm.style.display = 'none';
      const v = document.getElementById('verifyForm');
      if (v) { v.style.display = ''; v.querySelector('input').focus(); }
      return;
    }

    if (r.body.needs2fa) {
      pendingUserId = r.body.userId;
      pendingMode = r.body.mode || 'email';
      pendingCanUseEmail = !!r.body.canUseEmail;
      pendingHadTotp = r.body.mode === 'totp';
      loginForm.style.display = 'none';
      showTwoFaForm({ hint: r.body.hint });
      return;
    }

    saveToken(r.body.token, r.body.refreshToken);
    location.href = '/app';
    });
  });
}

// ── 2FA form ───────────────────────────────────────────────────────────────

const twofaForm = document.getElementById('twofaForm');
if (twofaForm) {
  twofaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showErr('terr', '');
    const code = new FormData(twofaForm).get('code');
    const r = await postJson('/api/login/verify', { userId: pendingUserId, code, mode: pendingMode });
    if (!r.ok) { if (redirectIfBanned(r.body)) return; return showErr('terr', r.body.error); }
    saveToken(r.body.token, r.body.refreshToken);
    location.href = '/app';
  });
}

const tfaSwitchBtn = document.getElementById('tfaSwitchBtn');
if (tfaSwitchBtn) {
  tfaSwitchBtn.addEventListener('click', async () => {
    showErr('terr', '');
    if (pendingMode === 'totp') {
      tfaSwitchBtn.disabled = true;
      const r = await postJson('/api/login/send-email-code', { userId: pendingUserId });
      tfaSwitchBtn.disabled = false;
      if (!r.ok) return showErr('terr', r.body.error);
      pendingMode = 'email';
      showTwoFaForm({ hint: r.body.hint });
    } else {
      pendingMode = 'totp';
      showTwoFaForm({});
    }
  });
}

// ── Verify form (login page: unverified account, or signup page post-signup) ─

const verifyForm = document.getElementById('verifyForm');
if (verifyForm) {
  verifyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showErr('verr', '');
    const code = new FormData(verifyForm).get('code');
    const r = await postJson('/api/signup/verify', { userId: pendingUserId, code });
    if (!r.ok) return showErr('verr', r.body.error);
    saveToken(r.body.token, r.body.refreshToken);
    location.href = '/app';
  });
}

const resendCodeBtn = document.getElementById('resendCodeBtn');
if (resendCodeBtn) {
  resendCodeBtn.addEventListener('click', async () => {
    showErr('verr', '');
    resendCodeBtn.disabled = true;
    const r = await postJson('/api/signup/resend', { userId: pendingUserId });
    if (!r.ok) { showErr('verr', r.body.error); resendCodeBtn.disabled = false; return; }
    const el = document.getElementById('verr');
    if (el) {
      el.style.color = 'var(--accent, #4ade80)';
      el.textContent = t('Code sent — check your email.', 'Kod gönderildi — e-postanı kontrol et.');
    }
    // Mirrors the server's own resend cooldown so the button can't be mashed
    // into spamming the mailbox.
    let secs = 60;
    const tick = () => {
      resendCodeBtn.textContent = t(`Resend code (${secs}s)`, `Kodu tekrar gönder (${secs}sn)`);
      if (secs-- <= 0) {
        clearInterval(iv);
        resendCodeBtn.textContent = t('Resend code', 'Kodu tekrar gönder');
        resendCodeBtn.disabled = false;
      }
    };
    tick();
    const iv = setInterval(tick, 1000);
  });
}

const verifyBackBtn = document.getElementById('verifyBackBtn');
if (verifyBackBtn) {
  verifyBackBtn.addEventListener('click', () => {
    pendingUserId = null;
    showErr('verr', '');
    verifyForm.style.display = 'none';
    const back = document.getElementById('signupForm') || document.getElementById('loginForm');
    if (back) back.style.display = '';
  });
}

// ── QR login ───────────────────────────────────────────────────────────────
// Desktop side: shows a one-time code as a QR image, listens on a dedicated
// unauthenticated socket namespace scoped to that code, and once the phone
// approves it, claims the resulting session (already past 2FA on the phone —
// no second 2FA prompt here).
const loginFormEl = document.getElementById('loginForm');
const qrCard = document.getElementById('qrCard');
const showQrBtn = document.getElementById('showQrBtn');
const showPasswordBtn = document.getElementById('showPasswordBtn');
let qrSocket = null;
let qrToken = null;
let qrRefreshTimer = null;

async function startQrLogin() {
  showErr('qerr', '');
  const r = await postJson('/api/auth/qr/start', {});
  if (!r.ok) { showErr('qerr', r.body.error || 'Could not start QR login.'); return; }
  qrToken = r.body.token;
  const img = document.getElementById('qrImg');
  if (img) img.src = '/api/auth/qr/image/' + encodeURIComponent(qrToken) + '?_=' + Date.now();

  if (qrSocket) { qrSocket.disconnect(); qrSocket = null; }
  qrSocket = io('/qrlogin', { auth: { token: qrToken } });
  qrSocket.on('approved', async () => {
    const c = await postJson('/api/auth/qr/claim', { token: qrToken });
    if (!c.ok) { showErr('qerr', c.body.error || 'Login failed — try again.'); return; }
    saveToken(c.body.token, c.body.refreshToken);
    location.href = '/app';
  });

  // Codes expire (server TTL ~90s) — refresh automatically before that so a
  // lingering login page never shows a dead code.
  clearTimeout(qrRefreshTimer);
  qrRefreshTimer = setTimeout(startQrLogin, ((r.body.expiresIn || 90) - 5) * 1000);
}

function stopQrLogin() {
  clearTimeout(qrRefreshTimer);
  if (qrSocket) { qrSocket.disconnect(); qrSocket = null; }
}

if (showQrBtn) {
  showQrBtn.addEventListener('click', () => {
    if (loginFormEl) loginFormEl.style.display = 'none';
    if (qrCard) qrCard.style.display = '';
    startQrLogin();
  });
}
if (showPasswordBtn) {
  showPasswordBtn.addEventListener('click', () => {
    stopQrLogin();
    if (qrCard) qrCard.style.display = 'none';
    if (loginFormEl) loginFormEl.style.display = '';
  });
}

// ── Signup ─────────────────────────────────────────────────────────────────

const signupForm = document.getElementById('signupForm');
if (signupForm) {
  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    runOnce(signupForm, async () => {
    showErr('err', '');
    const f = new FormData(signupForm);
    const r = await postJson('/api/signup', {
      username: f.get('username'),
      email: f.get('email'),
      password: f.get('password'),
      birthdate: f.get('birthdate'),
    });
    if (!r.ok) return showErr('err', r.body.error === 'invalid_birthdate' ? 'Please enter a valid date of birth.' : r.body.error);
    if (r.body.needsVerify) {
      pendingUserId = r.body.userId;
      signupForm.style.display = 'none';
      const v = document.getElementById('verifyForm');
      if (v) { v.style.display = ''; v.querySelector('input').focus(); }
      return;
    }
    saveToken(r.body.token, r.body.refreshToken);
    location.href = '/app';
    });
  });
}
