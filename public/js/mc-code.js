(function () {
  var input = document.getElementById('code');
  var err = document.getElementById('err');
  // Prefill if arrived as /mc-link?code=XXXX
  var q = new URLSearchParams(location.search).get('code');
  if (q) input.value = q.trim().toUpperCase();
  input.addEventListener('input', function () {
    input.value = input.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    err.textContent = '';
  });
  document.getElementById('form').addEventListener('submit', function (e) {
    e.preventDefault();
    var c = input.value.trim();
    if (c.length < 4) {
      err.textContent = window.dLang
        ? window.dLang.t('Enter the code from /link.', '/link komutunun verdiği kodu gir.')
        : 'Enter the code from /link.';
      return;
    }
    location.href = '/mc-link/' + encodeURIComponent(c);
  });
  input.focus();
})();
