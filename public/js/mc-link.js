// Minecraft ↔ disdroc account link approval.
//
// The title/description are written entirely from JS (they depend on the
// request's state), so they deliberately carry NO data-en/data-tr attributes —
// lang.js would otherwise reset them to a static string on every language
// apply. Instead we keep the last render as a closure and re-run it whenever
// the visitor flips the EN/TR toggle.
(function () {
  'use strict';

  var code = location.pathname.split('/').pop();
  var token = localStorage.getItem('disdroc_token');

  var titleEl = document.getElementById('title');
  var descEl = document.getElementById('desc');
  var errEl = document.getElementById('err');
  var bindEl = document.getElementById('bind');
  var actionsEl = document.getElementById('actions');
  var loginLink = document.getElementById('loginLink');

  function t(en, tr) { return window.dLang ? window.dLang.t(en, tr) : en; }

  // The current screen, as a function so it can be replayed on language change.
  var renderCurrent = function () {};
  function show(fn) { renderCurrent = fn; fn(); }

  function setTitle(s) { titleEl.textContent = s; }
  function setDesc(s) { descEl.textContent = s || ''; }
  function setErr(s) { errEl.textContent = s || ''; }
  function hideActions() { actionsEl.style.display = 'none'; }

  function authHeaders() { return token ? { authorization: 'Bearer ' + token } : {}; }

  document.addEventListener('langchange', function () { renderCurrent(); });

  if (!token) {
    show(function () {
      setTitle(t('Log in required', 'Giriş yapman gerekiyor'));
      setDesc(t(
        'Log in to your disdroc account, then reopen this link to connect your Minecraft account.',
        "disdroc hesabına giriş yap, sonra Minecraft hesabını bağlamak için bu bağlantıyı tekrar aç."
      ));
    });
    loginLink.style.display = '';
    loginLink.href = '/login';
    return;
  }

  function showInfo(info) {
    if (info.status === 'expired') {
      hideActions();
      return show(function () {
        setTitle(t('Link expired', 'Bağlantının süresi doldu'));
        setDesc(t(
          'This request has expired. Run /link again in Minecraft to get a fresh link.',
          "Bu isteğin süresi doldu. Yeni bir bağlantı için Minecraft'ta tekrar /link komutunu çalıştır."
        ));
      });
    }
    if (info.status === 'denied') {
      hideActions();
      return show(function () {
        setTitle(t('Request denied', 'İstek reddedildi'));
        setDesc(t(
          'This link request was denied. Run /link again in Minecraft if you want to retry.',
          "Bu bağlantı isteği reddedildi. Tekrar denemek istersen Minecraft'ta yeniden /link komutunu çalıştır."
        ));
      });
    }
    if (info.status === 'approved') {
      var owner = info.already_linked_to;
      hideActions();
      if (owner && info.me && owner.id === info.me.id) {
        return show(function () {
          setTitle(t('Already connected ✓', 'Zaten bağlı ✓'));
          setDesc(t(
            '"' + info.mc_name + '" is connected to your disdroc account. Return to Minecraft to play.',
            '"' + info.mc_name + '" disdroc hesabına bağlı. Oynamak için Minecraft\'a dön.'
          ));
        });
      }
      return show(function () {
        setTitle(t('Already linked', 'Zaten bağlanmış'));
        setDesc(t(
          'This Minecraft account is already connected to a different disdroc account.',
          'Bu Minecraft hesabı başka bir disdroc hesabına bağlı.'
        ));
      });
    }
    // pending
    document.getElementById('mcName').textContent = info.mc_name || '?';
    bindEl.style.display = '';
    actionsEl.style.display = '';
    show(function () {
      setTitle(t('Connect your accounts', 'Hesaplarını bağla'));
      setDesc(t(
        'Approve to let this Minecraft account play on the disdroc SMP as you.',
        'Bu Minecraft hesabının disdroc SMP\'de senin adına oynamasına izin vermek için onayla.'
      ));
      document.getElementById('ddName').textContent = info.me
        ? ('@' + info.me.username)
        : t('you', 'sen');
    });
  }

  function load() {
    fetch('/api/mc/link/info/' + encodeURIComponent(code), { headers: authHeaders(), credentials: 'include' })
      .then(function (r) {
        if (r.status === 401) {
          token = null;
          show(function () {
            setTitle(t('Session expired', 'Oturumun sona erdi'));
            setDesc(t('Please log in to disdroc again.', "Lütfen disdroc'a tekrar giriş yap."));
          });
          loginLink.style.display = '';
          throw 'auth';
        }
        return r.json();
      })
      .then(function (j) {
        if (j.error === 'unknown_code') {
          hideActions();
          return show(function () {
            setTitle(t('Invalid link', 'Geçersiz bağlantı'));
            setDesc(t(
              'This link is not valid. Run /link again in Minecraft.',
              "Bu bağlantı geçerli değil. Minecraft'ta tekrar /link komutunu çalıştır."
            ));
          });
        }
        if (j.error) { setErr(j.error); hideActions(); return; }
        showInfo(j);
      })
      .catch(function (e) {
        if (e !== 'auth') {
          setErr(t('Could not load this request. Try again.', 'Bu istek yüklenemedi. Tekrar dene.'));
        }
      });
  }

  document.getElementById('approveBtn').onclick = function () {
    var b = this; b.disabled = true; setErr('');
    fetch('/api/mc/link/info/' + encodeURIComponent(code) + '/approve', {
      method: 'POST', headers: authHeaders(), credentials: 'include'
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) {
          bindEl.style.display = 'none';
          hideActions();
          show(function () {
            var name = res.j.mc_name || t('Your account', 'Hesabın');
            setTitle(t('Connected ✓', 'Bağlandı ✓'));
            setDesc(t(
              '"' + name + '" is now linked. Head back to Minecraft — you can play now.',
              '"' + name + '" artık bağlı. Minecraft\'a geri dön — artık oynayabilirsin.'
            ));
          });
        } else {
          b.disabled = false;
          var m = {
            expired: t('This request expired — run /link again.', 'Bu isteğin süresi doldu — tekrar /link komutunu çalıştır.'),
            already_linked: t('That Minecraft account is already linked to another disdroc account.', 'Bu Minecraft hesabı başka bir disdroc hesabına bağlı.'),
            already_denied: t('This request was already denied.', 'Bu istek zaten reddedilmiş.'),
          };
          setErr(m[res.j.error] || t('Could not connect. Try again.', 'Bağlanamadı. Tekrar dene.'));
        }
      }).catch(function () {
        b.disabled = false;
        setErr(t('Network error. Try again.', 'Ağ hatası. Tekrar dene.'));
      });
  };

  document.getElementById('denyBtn').onclick = function () {
    var b = this; b.disabled = true;
    fetch('/api/mc/link/info/' + encodeURIComponent(code) + '/deny', {
      method: 'POST', headers: authHeaders(), credentials: 'include'
    }).then(function () {
      bindEl.style.display = 'none';
      hideActions();
      show(function () {
        setTitle(t('Request denied', 'İstek reddedildi'));
        setDesc(t(
          'No problem — nothing was connected. You can close this page.',
          'Sorun değil — hiçbir şey bağlanmadı. Bu sayfayı kapatabilirsin.'
        ));
      });
    }).catch(function () { b.disabled = false; });
  };

  // Initial "checking…" state, shown until the fetch resolves.
  show(function () {
    setTitle(t('Connect Minecraft…', 'Minecraft bağlanıyor…'));
    setDesc(t('Checking your link request…', 'Bağlantı isteğin kontrol ediliyor…'));
  });

  load();
})();
