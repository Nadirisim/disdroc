async function postJson(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

// Error copy follows the shared `disdroc_lang` preference via window.dLang (/js/lang.js).
function t(en, tr) {
  return window.dLang ? window.dLang.t(en, tr) : en;
}

const errMessages = {
  invalid_email: () => t('Please enter a valid email address.', 'Lütfen geçerli bir e-posta adresi gir.'),
  invalid_password: () => t('Password must be at least 6 characters.', 'Parola en az 6 karakter olmalı.'),
  invalid_code: () => t('That code is incorrect or expired.', 'Bu kod hatalı veya süresi dolmuş.'),
};

function showErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  // showErr(id, '') is the "clear the error" call — it must not fall through to
  // the generic message the way the old `a || b || c` chain did.
  if (msg === '') { el.textContent = ''; return; }
  const known = errMessages[msg];
  el.textContent = known ? known() : msg || t('Something went wrong.', 'Bir şeyler ters gitti.');
}

let pendingEmail = '';

const forgotForm = document.getElementById('forgotForm');
if (forgotForm) {
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showErr('err', '');
    const btn = forgotForm.querySelector('button[type=submit]');
    btn.disabled = true;
    pendingEmail = new FormData(forgotForm).get('email');
    await postJson('/api/forgot-password', { email: pendingEmail });
    btn.disabled = false;
    forgotForm.style.display = 'none';
    document.getElementById('resetForm').style.display = '';
    document.getElementById('rcode').focus();
  });
}

const resetForm = document.getElementById('resetForm');
if (resetForm) {
  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showErr('rerr', '');
    const f = new FormData(resetForm);
    const r = await postJson('/api/reset-password', {
      email: pendingEmail,
      code: f.get('code'),
      password: f.get('password'),
    });
    if (!r.ok) return showErr('rerr', r.body.error);
    location.href = '/login?reset=1';
  });
}
