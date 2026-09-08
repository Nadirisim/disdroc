(function () {
  var appId = location.pathname.split('/').pop();
  var token = localStorage.getItem('disdroc_token');
  var T = function (en, tr) { return window.dLang ? window.dLang.t(en, tr) : en; };
  var titleEl = document.getElementById('title');
  var errEl = document.getElementById('err');
  var descEl = document.getElementById('desc');
  var selectEl = document.getElementById('serverSelect');
  var addBtn = document.getElementById('addBtn');

  function setTitle(text) {
    titleEl.removeAttribute('data-en'); titleEl.removeAttribute('data-tr');
    titleEl.textContent = text;
  }

  if (!token) {
    setTitle(T('Log in to add this bot', 'Bu botu eklemek için giriş yap'));
    return;
  }

  function authedJson(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ authorization: 'Bearer ' + token }, opts.headers || {});
    return fetch(url, opts).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); });
  }

  Promise.all([
    authedJson('/api/bot-apps/' + appId + '/public'),
    authedJson('/api/servers-i-manage'),
  ]).then(function (results) {
    var appRes = results[0], serversRes = results[1];
    if (!appRes.ok) {
      setTitle(T('Bot not found', 'Bot bulunamadı'));
      errEl.textContent = appRes.body.error || '';
      return;
    }
    var app = appRes.body.app;
    setTitle(T('Add "', '"') + (app.name) + T('" to a server', '" botunu bir sunucuya ekle'));
    descEl.textContent = app.description || '';

    var servers = (serversRes.ok && serversRes.body.servers) || [];
    if (!servers.length) {
      errEl.textContent = T('You don’t manage any servers to add this bot to.', 'Bu botu ekleyebileceğin bir sunucu yönetmiyorsun.');
      return;
    }
    servers.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.id; opt.textContent = s.name;
      selectEl.appendChild(opt);
    });
    selectEl.style.display = '';
    addBtn.style.display = '';
    addBtn.onclick = function () {
      addBtn.disabled = true;
      var serverId = selectEl.value;
      authedJson('/api/bot-apps/' + appId + '/servers/' + serverId, { method: 'POST' }).then(function (res) {
        addBtn.disabled = false;
        if (res.ok) { location.href = '/app#server-' + res.body.serverId; }
        else { errEl.textContent = res.body.error || T('Could not add bot.', 'Bot eklenemedi.'); }
      });
    };
  });

  document.addEventListener('langchange', function () {});
})();
