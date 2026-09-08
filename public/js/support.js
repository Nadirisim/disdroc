(function () {
    'use strict';
    var TOKEN_KEY = 'disdroc_token';
    function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }

    var STR = {
      en: {
        'title': 'Help & Support',
        'subtitle': "Answers to common problems — and a way to reach us when they don't help.",
        'ts.heading': 'Troubleshooting',
        'fb.heading': 'Still stuck? Tell us',
        'fb.intro': 'Send the team a message. Admins read every submission in the dashboard.',
        'fb.categoryLabel': "What's this about?",
        'fb.cat.bug': 'Something is broken',
        'fb.cat.idea': 'Feature idea / suggestion',
        'fb.cat.account': 'Account or login help',
        'fb.cat.other': 'Something else',
        'fb.messageLabel': 'Your message',
        'fb.placeholder': 'Describe what happened, what you expected, and any steps to reproduce it.',
        'fb.send': 'Send',
        'fb.sending': 'Sending…',
        'fb.signedHint': 'You must be signed in to send feedback.',
        'fb.empty': 'Please write a message first.',
        'fb.ok': 'Thanks! Your feedback was sent — we appreciate it.',
        'fb.errAuth': 'Please sign in first, then come back and send your message.',
        'fb.errGeneric': "Couldn't send right now. Please try again in a moment.",
        'fb.recoveryIntro': "Locked out and can't sign in? Leave your username and a way to reach you — an admin will verify it's you and help you back in.",
        'fb.usernameLabel': 'Your username',
        'fb.contactLabel': 'Where can we reach you?',
        'fb.contactPlaceholder': 'An email address not tied to this account, or any other way to reach you',
        'fb.recoveryHint': "No sign-in needed for this one — we'll verify it's you before doing anything.",
        'fb.recoveryOk': "Thanks — an admin will review this and reach out to verify it's you.",
        'foot.backToApp': '← Back to disdroc'
      },
      tr: {
        'title': 'Yardım ve Destek',
        'subtitle': 'Sık karşılaşılan sorunların yanıtları — ve işe yaramadığında bize ulaşmanın yolu.',
        'ts.heading': 'Sorun Giderme',
        'fb.heading': 'Hâlâ takıldın mı? Bize yaz',
        'fb.intro': 'Ekibe bir mesaj gönder. Yöneticiler her gönderiyi panelden okur.',
        'fb.categoryLabel': 'Konu nedir?',
        'fb.cat.bug': 'Bir şey çalışmıyor',
        'fb.cat.idea': 'Özellik fikri / öneri',
        'fb.cat.account': 'Hesap veya giriş yardımı',
        'fb.cat.other': 'Başka bir şey',
        'fb.messageLabel': 'Mesajın',
        'fb.placeholder': 'Ne olduğunu, ne beklediğini ve tekrarlama adımlarını yaz.',
        'fb.send': 'Gönder',
        'fb.sending': 'Gönderiliyor…',
        'fb.signedHint': 'Geri bildirim göndermek için giriş yapmış olmalısın.',
        'fb.empty': 'Lütfen önce bir mesaj yaz.',
        'fb.ok': 'Teşekkürler! Geri bildirimin gönderildi — çok değerli.',
        'fb.errAuth': 'Lütfen önce giriş yap, sonra geri gelip mesajını gönder.',
        'fb.errGeneric': 'Şu anda gönderilemedi. Lütfen birazdan tekrar dene.',
        'fb.recoveryIntro': 'Hesabına giremiyor musun? Kullanıcı adını ve sana ulaşabileceğimiz bir yolu bırak — bir yönetici senin olduğunu doğrulayıp yardımcı olacak.',
        'fb.usernameLabel': 'Kullanıcı adın',
        'fb.contactLabel': 'Sana nasıl ulaşabiliriz?',
        'fb.contactPlaceholder': 'Bu hesaba bağlı olmayan bir e-posta adresi, ya da ulaşabileceğimiz başka bir yol',
        'fb.recoveryHint': 'Bunun için giriş yapmana gerek yok — bir şey yapmadan önce senin olduğunu doğrulayacağız.',
        'fb.recoveryOk': 'Teşekkürler — bir yönetici bunu inceleyip senin olduğunu doğrulamak için ulaşacak.',
        'foot.backToApp': '← disdroc\'a dön'
      }
    };

    // Troubleshooting entries — each has a question + HTML answer, per language.
    var FAQ = {
      en: [
        ['I sent a message but it disappeared / shows "sending…"',
         "This usually means a flaky connection. Messages send optimistically and retry automatically; a failed one turns red with <b>retry</b> and <b>delete</b> buttons. <ul><li>Check your internet connection.</li><li>Wait a few seconds — late confirmations still go through.</li><li>If it stays red, press <b>retry</b>.</li></ul>"],
        ["I can't log in",
         "<ul><li>Make sure your username and password are correct (passwords are case-sensitive).</li><li>If you enabled 2FA, enter the current 6-digit code from your authenticator.</li><li>Lost your 2FA device? Use a backup code.</li><li>Still stuck? Send us a message below with your username.</li></ul>"],
        ['The GIF or image picker search box looks odd',
         "Make sure you're on the latest version — reload the page (the app shows an <b>update available</b> banner after a deploy). If it persists, tell us your browser and what you clicked."],
        ['Voice / calls have no sound or mic',
         "<ul><li>Grant the browser microphone permission when prompted.</li><li>Check the correct input/output device under <b>Settings → Voice &amp; Video</b>.</li><li>Some browsers need HTTPS — use <b>https://disdroc.online</b>, not an IP.</li></ul>"],
        ["I'm not getting notifications",
         "<ul><li>Enable notifications under <b>Settings → Notifications</b> and allow them in your browser.</li><li>Check the channel/server isn't muted.</li><li>On mobile, add disdroc to your home screen for push to work reliably.</li></ul>"],
        ['How do I change the language?',
         "Open <b>Settings → Language</b> and pick English or Türkçe. Your choice is remembered on this device."]
      ],
      tr: [
        ['Mesaj gönderdim ama kayboldu / "gönderiliyor…" yazıyor',
         "Bu genelde dengesiz bağlantı demektir. Mesajlar iyimser şekilde gönderilir ve otomatik yeniden denenir; başarısız olan kırmızıya döner ve <b>yeniden dene</b> ile <b>sil</b> düğmeleri çıkar. <ul><li>İnternet bağlantını kontrol et.</li><li>Birkaç saniye bekle — geç onaylar yine de iletilir.</li><li>Kırmızı kalırsa <b>yeniden dene</b>'ye bas.</li></ul>"],
        ['Giriş yapamıyorum',
         "<ul><li>Kullanıcı adı ve şifrenin doğru olduğundan emin ol (şifreler büyük/küçük harfe duyarlıdır).</li><li>2FA açtıysan, doğrulayıcındaki güncel 6 haneli kodu gir.</li><li>2FA cihazını mı kaybettin? Bir yedek kod kullan.</li><li>Hâlâ takıldıysan, aşağıdan kullanıcı adınla bize yaz.</li></ul>"],
        ['GIF veya görsel seçici arama kutusu tuhaf görünüyor',
         "En son sürümde olduğundan emin ol — sayfayı yenile (dağıtımdan sonra uygulama bir <b>güncelleme mevcut</b> bildirimi gösterir). Devam ederse, tarayıcını ve neye tıkladığını bize yaz."],
        ['Sesli görüşmede ses veya mikrofon yok',
         "<ul><li>İstendiğinde tarayıcıya mikrofon izni ver.</li><li><b>Ayarlar → Ses ve Görüntü</b> altında doğru giriş/çıkış cihazını seç.</li><li>Bazı tarayıcılar HTTPS ister — IP değil, <b>https://disdroc.online</b> kullan.</li></ul>"],
        ['Bildirim almıyorum',
         "<ul><li><b>Ayarlar → Bildirimler</b> altında bildirimleri aç ve tarayıcında izin ver.</li><li>Kanalın/sunucunun sessize alınmadığından emin ol.</li><li>Mobilde, push'un düzgün çalışması için disdroc'u ana ekranına ekle.</li></ul>"],
        ['Dili nasıl değiştiririm?',
         "<b>Ayarlar → Dil</b>'i aç ve English ya da Türkçe seç. Seçimin bu cihazda hatırlanır."]
      ]
    };

    function curLang() {
      var stored = localStorage.getItem('disdroc_lang');
      if (STR[stored]) return stored;
      // No explicit choice yet — match the rest of disdroc and guess from the
      // browser locale (refined with /api/geo further down).
      return (navigator.language || '').toLowerCase().indexOf('tr') === 0 ? 'tr' : 'en';
    }

    function apply(lang) {
      var dict = STR[lang] || STR.en;
      document.documentElement.lang = lang;
      document.querySelectorAll('[data-i18n]').forEach(function (el) {
        var k = el.getAttribute('data-i18n');
        if (dict[k] != null) el.textContent = dict[k];
      });

      var titleEl = document.querySelector('title[data-' + lang + ']');
      if (titleEl) document.title = titleEl.getAttribute('data-' + lang);
      document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
        var k = el.getAttribute('data-i18n-ph');
        if (dict[k] != null) el.setAttribute('placeholder', dict[k]);
      });
      // FAQ
      var faq = document.getElementById('faq');
      faq.innerHTML = '';
      (FAQ[lang] || FAQ.en).forEach(function (pair) {
        var d = document.createElement('details');
        var s = document.createElement('summary');
        s.textContent = pair[0];
        var body = document.createElement('div');
        body.className = 'faq-body';
        body.innerHTML = pair[1];
        d.appendChild(s); d.appendChild(body);
        faq.appendChild(d);
      });
      // lang toggle active state
      document.querySelectorAll('#langToggle button').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-lang') === lang);
      });
    }

    document.getElementById('langToggle').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var lang = b.getAttribute('data-lang');
      localStorage.setItem('disdroc_lang', lang);
      localStorage.setItem('disdroc_lang_userset', '1');
      apply(lang);
    });

    var sendBtn = document.getElementById('fbSend');
    var resultEl = document.getElementById('fbResult');
    var catSel = document.getElementById('fbCat');
    var recoveryFields = document.getElementById('fbRecoveryFields');
    var signedHint = document.getElementById('fbSignedHint');

    // "Account or login help" + not signed in = exactly the locked-out case
    // /support's own FAQ tells people to use — but the normal feedback POST
    // requires a token, which someone who can't log in doesn't have. Route
    // that specific combination to the unauthenticated recovery endpoint
    // instead of the dead-end "please sign in first" error.
    function recoveryMode() { return catSel.value === 'account' && !getToken(); }
    function updateMode() {
      var dict = STR[curLang()];
      var recovery = recoveryMode();
      recoveryFields.style.display = recovery ? '' : 'none';
      signedHint.textContent = recovery ? dict['fb.recoveryHint'] : dict['fb.signedHint'];
    }
    catSel.addEventListener('change', updateMode);

    sendBtn.addEventListener('click', async function () {
      var dict = STR[curLang()];
      var msg = document.getElementById('fbMsg').value.trim();
      var category = catSel.value;
      var recovery = recoveryMode();
      resultEl.className = 'fb-msg';
      if (!msg) { resultEl.classList.add('err'); resultEl.textContent = dict['fb.empty']; return; }
      if (!recovery && !getToken()) { resultEl.classList.add('err'); resultEl.textContent = dict['fb.errAuth']; return; }
      sendBtn.disabled = true;
      var origLabel = sendBtn.textContent;
      sendBtn.textContent = dict['fb.sending'];
      try {
        var r = recovery
          ? await fetch('/api/account-recovery', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: document.getElementById('fbUsername').value.trim(),
                contactEmail: document.getElementById('fbContact').value.trim(),
                message: msg,
              }),
            })
          : await fetch('/api/feedback', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
              body: JSON.stringify({ message: msg, category: category }),
            });
        if (!recovery && r.status === 401) { resultEl.classList.add('err'); resultEl.textContent = dict['fb.errAuth']; }
        else if (!r.ok) { resultEl.classList.add('err'); resultEl.textContent = dict['fb.errGeneric']; }
        else {
          resultEl.classList.add('ok'); resultEl.textContent = recovery ? dict['fb.recoveryOk'] : dict['fb.ok'];
          document.getElementById('fbMsg').value = '';
          if (recovery) { document.getElementById('fbUsername').value = ''; document.getElementById('fbContact').value = ''; }
        }
      } catch (err) {
        resultEl.classList.add('err'); resultEl.textContent = dict['fb.errGeneric'];
      } finally {
        sendBtn.disabled = false; sendBtn.textContent = origLabel;
      }
    });

    apply(curLang());
    updateMode();

    // First visit with no stored choice: refine the guess via geo-IP, the same
    // way /js/lang.js and the SPA do.
    if (!localStorage.getItem('disdroc_lang')) {
      fetch('/api/geo').then(function (r) { return r.json(); }).then(function (d) {
        var c = (d && d.country) || '';
        if ((c === 'TR' || c === 'CY') && !localStorage.getItem('disdroc_lang')) {
          apply('tr');
          updateMode();
        }
      }).catch(function () {});
    }
  })();
