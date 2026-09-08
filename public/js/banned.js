// Ban / IP-block notice. Text is rendered through window.dLang (see /js/lang.js)
// so it follows the same `disdroc_lang` preference as the rest of disdroc, and
// re-renders when the visitor flips the EN/TR toggle.
(function () {
  'use strict';

  const q = new URLSearchParams(location.search);
  const reason = q.get('reason');
  const until = q.get('until') ? +q.get('until') : null;
  const isIp = reason === 'ip';

  function t(en, tr) {
    return window.dLang ? window.dLang.t(en, tr) : en;
  }

  function render() {
    const tr = window.dLang && window.dLang.get() === 'tr';

    document.getElementById('title').textContent = isIp
      ? t('Access blocked', 'Erişim engellendi')
      : t("You've been banned", 'Hesabın yasaklandı');

    document.getElementById('lede').textContent = isIp
      ? t(
          'Your network has been blocked from disdroc, independent of any specific account.',
          "Ağın, herhangi bir hesaptan bağımsız olarak disdroc'a erişimi engellendi."
        )
      : t(
          "This account has been suspended and can't sign in right now.",
          'Bu hesap askıya alındı ve şu anda giriş yapamaz.'
        );

    if (!isIp && reason) {
      document.getElementById('reasonBox').style.display = '';
      document.getElementById('reasonText').textContent = reason;
    }

    const sub = document.getElementById('sub');
    if (!isIp && until && until > Date.now()) {
      const when = new Date(until).toLocaleString(tr ? 'tr-TR' : undefined);
      sub.textContent = tr
        ? when + ' tarihinde tekrar giriş yapabilirsin.'
        : 'You can sign back in on ' + when + '.';
    } else if (!isIp) {
      sub.textContent = t('This is a permanent ban.', 'Bu kalıcı bir yasaklama.');
    } else {
      sub.textContent = t(
        'If you believe this is a mistake, get in touch below.',
        'Bunun bir hata olduğunu düşünüyorsan aşağıdan bize ulaş.'
      );
    }
  }

  render();
  document.addEventListener('langchange', render);

  const toggleBtn = document.getElementById('appealToggle');
  const form = document.getElementById('appealForm');
  const status = document.getElementById('appealStatus');
  toggleBtn.addEventListener('click', () => {
    form.style.display = form.style.display === 'none' ? '' : 'none';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('appealSubmit');
    submitBtn.disabled = true;
    status.textContent = '';
    status.style.color = '';
    try {
      const res = await fetch('/api/appeals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          identifier: document.getElementById('appealIdentifier').value,
          password: document.getElementById('appealPassword').value,
          message: document.getElementById('appealMessage').value,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        form.reset();
        form.style.display = 'none';
        status.textContent = '';
        const doneMsg = document.createElement('p');
        doneMsg.style.fontSize = '13px';
        doneMsg.style.color = 'var(--public-ok, #2f9e5b)';
        doneMsg.textContent = t(
          'Appeal submitted. A moderator will review it.',
          'İtiraz gönderildi. Bir moderatör inceleyecek.'
        );
        form.parentNode.insertBefore(doneMsg, form.nextSibling);
        return;
      }
      const messages = {
        invalid_credentials: t('Wrong username/email or password.', 'Kullanıcı adı/e-posta veya şifre hatalı.'),
        not_banned: t("That account isn't currently banned.", 'Bu hesap şu anda yasaklı değil.'),
        appeal_already_pending: t('You already have a pending appeal.', 'Zaten bekleyen bir itirazın var.'),
        missing_fields: t('Please fill in every field.', 'Lütfen tüm alanları doldur.'),
        rate_limited: t('Too many attempts — try again later.', 'Çok fazla deneme — daha sonra tekrar dene.'),
      };
      status.style.color = 'var(--public-danger)';
      status.textContent = messages[body.error] || t('Something went wrong. Try again.', 'Bir şeyler ters gitti. Tekrar dene.');
    } catch (err) {
      status.style.color = 'var(--public-danger)';
      status.textContent = t('Something went wrong. Try again.', 'Bir şeyler ters gitti. Tekrar dene.');
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
