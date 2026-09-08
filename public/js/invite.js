(function () {
  var code = location.pathname.split('/').pop();
  var token = localStorage.getItem('disdroc_token');
  var T = function (en, tr) { return window.dLang ? window.dLang.t(en, tr) : en; };
  var state = null;

  function render() {
    var titleEl = document.getElementById('title');
    var errEl = document.getElementById('err');
    var descEl = document.getElementById('desc');
    if (!state) return;
    if (state.error) {
      titleEl.removeAttribute('data-en'); titleEl.removeAttribute('data-tr');
      titleEl.textContent = T('Invalid invite', 'Ge\u00e7ersiz davet');
      errEl.textContent = state.error;
      return;
    }
    var inv = state.invite;
    titleEl.removeAttribute('data-en'); titleEl.removeAttribute('data-tr');
    titleEl.textContent = T('Join "', '\u015euraya kat\u0131l: "') + inv.server_name + '"';
    descEl.textContent = inv.server_description || '';
  }

  fetch('/api/invites/' + code).then(function (r) { return r.json(); }).then(function (j) {
    if (j.error) { state = { error: j.error }; render(); return; }
    state = { invite: j.invite };
    render();
    var btn = document.getElementById('acceptBtn');
    btn.style.display = '';
    btn.onclick = function () {
      if (!token) { location.href = '/login'; return; }
      fetch('/api/invites/' + code + '/accept', {
        method: 'POST', credentials: 'include',
        headers: { authorization: 'Bearer ' + token }
      }).then(function (r) {
        if (r.ok) r.json().then(function (d) { location.href = '/app#server-' + d.serverId; });
        else document.getElementById('err').textContent = T('Could not join.', 'Kat\u0131lamad\u0131.');
      });
    };
  });

  document.addEventListener('langchange', render);
})();
