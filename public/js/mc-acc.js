// Connected-Minecraft-account management. Everything below the title is drawn
// from JS, so strings go through window.dLang (/js/lang.js) and the whole list
// is re-rendered when the visitor flips the EN/TR toggle.
(function () {
  'use strict';

  var token = localStorage.getItem('disdroc_token');
  var listEl = document.getElementById('list');
  var descEl = document.getElementById('desc');
  var errEl = document.getElementById('err');
  var loginLink = document.getElementById('loginLink');

  function t(en, tr) { return window.dLang ? window.dLang.t(en, tr) : en; }
  function isTr() { return !!window.dLang && window.dLang.get() === 'tr'; }

  function authHeaders(extra) {
    var h = token ? { authorization: 'Bearer ' + token } : {};
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }
  function fmtDate(ms) {
    try {
      return new Date(ms).toLocaleDateString(isTr() ? 'tr-TR' : undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch (e) { return ''; }
  }
  function el(tag, props) { var e = document.createElement(tag); if (props) for (var k in props) e[k] = props[k]; return e; }

  if (!token) {
    var showLoggedOut = function () {
      descEl.textContent = t(
        'Log in to your disdroc account to manage your Minecraft account.',
        'Minecraft hesabını yönetmek için disdroc hesabına giriş yap.'
      );
    };
    showLoggedOut();
    document.addEventListener('langchange', showLoggedOut);
    loginLink.style.display = '';
    return;
  }

  var lastAccounts = null;
  document.addEventListener('langchange', function () {
    if (lastAccounts) render(lastAccounts);
  });

  function render(accounts) {
    lastAccounts = accounts;
    listEl.innerHTML = '';
    if (!accounts.length) {
      descEl.textContent = t(
        'You have no connected Minecraft account yet.',
        'Henüz bağlı bir Minecraft hesabın yok.'
      );
      var p = el('p', { className: 'mc-empty' });
      p.innerHTML = t(
        'Join the SMP and run <b>/link</b> in-game to connect your Minecraft account.',
        "Minecraft hesabını bağlamak için SMP'ye katıl ve oyun içinde <b>/link</b> komutunu çalıştır."
      );
      listEl.appendChild(p);
      return;
    }
    descEl.textContent = t(
      'Change your in-game password or disconnect an account.',
      'Oyun içi parolanı değiştir veya bir hesabın bağlantısını kes.'
    );
    accounts.forEach(function (a) { listEl.appendChild(card(a)); });
  }

  function card(a) {
    var c = el('div', { className: 'mc-acct' });
    var h = el('h3'); h.textContent = a.mc_name; c.appendChild(h);
    c.appendChild(el('p', {
      className: 'sub',
      textContent: t('Connected ' + fmtDate(a.linked_at), fmtDate(a.linked_at) + ' tarihinde bağlandı'),
    }));

    c.appendChild(el('label', { textContent: t('New in-game password', 'Yeni oyun içi parola') }));
    var inp = el('input', {
      type: 'password',
      autocomplete: 'new-password',
      placeholder: t('4–100 characters', '4–100 karakter'),
    });
    c.appendChild(inp);
    c.appendChild(el('div', {
      className: 'mc-hint',
      textContent: t(
        'Used for /login in Minecraft. Letters, numbers and symbols (no spaces).',
        "Minecraft'ta /login için kullanılır. Harf, rakam ve sembol (boşluk yok)."
      ),
    }));

    var msg = el('div', { className: 'mc-msg' });
    var row = el('div', { className: 'mc-row' });
    var unlinkBtn = el('button', { className: 'btn-ghost', type: 'button', textContent: t('Disconnect', 'Bağlantıyı kes') });
    var saveBtn = el('button', { type: 'button', textContent: t('Save password', 'Parolayı kaydet') });
    row.appendChild(unlinkBtn); row.appendChild(saveBtn);
    c.appendChild(row); c.appendChild(msg);

    saveBtn.onclick = function () {
      var pw = inp.value || '';
      msg.className = 'mc-msg';
      if (!/^[!-~]{4,100}$/.test(pw)) {
        msg.className = 'mc-msg err';
        msg.textContent = t(
          'Password must be 4–100 printable characters with no spaces.',
          'Parola boşluksuz, 4–100 yazdırılabilir karakter olmalı.'
        );
        return;
      }
      saveBtn.disabled = true;
      msg.textContent = t('Saving…', 'Kaydediliyor…');
      fetch('/api/mc/accounts/' + encodeURIComponent(a.mc_uuid) + '/password', {
        method: 'POST', credentials: 'include',
        headers: authHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ password: pw })
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          saveBtn.disabled = false;
          if (res.ok) {
            inp.value = '';
            msg.className = 'mc-msg ok';
            msg.textContent = t(
              'Saved. It applies in-game within a few seconds — log in with /login <password>.',
              'Kaydedildi. Birkaç saniye içinde oyunda geçerli olur — /login <parola> ile giriş yap.'
            );
          } else {
            msg.className = 'mc-msg err';
            msg.textContent = res.j.error === 'bad_password'
              ? t('Invalid password.', 'Geçersiz parola.')
              : t('Could not save. Try again.', 'Kaydedilemedi. Tekrar dene.');
          }
        }).catch(function () {
          saveBtn.disabled = false;
          msg.className = 'mc-msg err';
          msg.textContent = t('Network error. Try again.', 'Ağ hatası. Tekrar dene.');
        });
    };

    unlinkBtn.onclick = function () {
      var ask = t(
        'Disconnect "' + a.mc_name + '" from your disdroc account? You\'ll have to run /link again in-game to reconnect.',
        '"' + a.mc_name + '" hesabının disdroc bağlantısı kesilsin mi? Tekrar bağlamak için oyun içinde yeniden /link komutunu çalıştırman gerekir.'
      );
      if (!confirm(ask)) return;
      unlinkBtn.disabled = true;
      msg.className = 'mc-msg';
      msg.textContent = t('Disconnecting…', 'Bağlantı kesiliyor…');
      fetch('/api/mc/accounts/' + encodeURIComponent(a.mc_uuid) + '/unlink', {
        method: 'POST', credentials: 'include', headers: authHeaders()
      }).then(function (r) {
        if (r.ok) load();
        else {
          unlinkBtn.disabled = false;
          msg.className = 'mc-msg err';
          msg.textContent = t('Could not disconnect. Try again.', 'Bağlantı kesilemedi. Tekrar dene.');
        }
      }).catch(function () {
        unlinkBtn.disabled = false;
        msg.className = 'mc-msg err';
        msg.textContent = t('Network error. Try again.', 'Ağ hatası. Tekrar dene.');
      });
    };

    return c;
  }

  function load() {
    fetch('/api/mc/accounts', { headers: authHeaders(), credentials: 'include' })
      .then(function (r) {
        if (r.status === 401) {
          descEl.textContent = t(
            'Your session expired — please log in to disdroc again.',
            "Oturumun sona erdi — lütfen disdroc'a tekrar giriş yap."
          );
          loginLink.style.display = '';
          throw 'auth';
        }
        return r.json();
      })
      .then(function (j) { render(j.accounts || []); })
      .catch(function (e) {
        if (e !== 'auth') {
          errEl.textContent = t('Could not load your account. Try again.', 'Hesabın yüklenemedi. Tekrar dene.');
        }
      });
  }

  load();
})();
