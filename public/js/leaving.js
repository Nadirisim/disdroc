(function () {
  var T = function (en, tr) { return window.dLang ? window.dLang.t(en, tr) : en; };
  var params = new URLSearchParams(location.search);
  var raw = params.get('url') || '';
  var hostEl = document.getElementById('leavingHost');
  var urlEl = document.getElementById('leavingUrl');
  var cont = document.getElementById('continueBtn');
  var invalid = document.getElementById('invalidNote');
  var url = null;
  try {
    url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') url = null;
  } catch (e) {}
  function trustedHost(h) { h = (h || '').toLowerCase(); return h === 'disdroc.online' || h.endsWith('.disdroc.online'); }
  if (url && trustedHost(url.hostname)) { location.replace(url.href); return; }
  if (!url) {
    hostEl.textContent = T('Invalid link', 'Geçersiz bağlantı');
    urlEl.textContent = raw;
    cont.disabled = true;
    invalid.style.display = 'block';
    document.addEventListener('langchange', function () {
      hostEl.textContent = T('Invalid link', 'Geçersiz bağlantı');
    });
  } else {
    hostEl.textContent = url.hostname;
    urlEl.textContent = url.href;
  }
  cont.onclick = function () { if (url) location.replace(url.href); };
  document.getElementById('cancelBtn').onclick = function () {
    window.close();
    setTimeout(function () { location.replace('/app'); }, 200);
  };
})();
