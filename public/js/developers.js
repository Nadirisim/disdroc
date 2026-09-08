(function () {
  if (!window.disdrocApi.requireAuth()) return;

  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, attrs = {}, children = []) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'on' && typeof v === 'object') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
      else e.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
      if (c == null || c === false) continue;
      e.append(c.nodeType ? c : document.createTextNode(c));
    }
    return e;
  };

  const api = window.disdrocApi.api;

  // Strings go through window.dLang (/js/lang.js) so this page follows the same
  // `disdroc_lang` preference as the rest of disdroc.
  const t = (en, tr) => (window.dLang ? window.dLang.t(en, tr) : en);

  // ─── Minimal modal helpers (self-contained — this is a standalone page, not
  // part of app.js's SPA) ────────────────────────────────────────────────────
  const modalRoot = $('#modalRoot');
  function closeModal() { modalRoot.innerHTML = ''; }
  function modal({ title, content, onSubmit, submitLabel = t('Save', 'Kaydet') }) {
    const form = el('form', {
      class: 'modal',
      on: { submit: async (e) => { e.preventDefault(); const ok = await onSubmit(form); if (ok !== false) closeModal(); } },
    }, [
      el('h3', {}, title), content,
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'ghost', on: { click: closeModal } }, t('Cancel', 'İptal')),
        el('button', { type: 'submit' }, submitLabel),
      ]),
    ]);
    modalRoot.append(el('div', { class: 'modal-bg', on: { click: (e) => { if (e.target === e.currentTarget) closeModal(); } } }, form));
    setTimeout(() => form.querySelector('input,textarea')?.focus(), 0);
  }
  function panelModal({ title, render }) {
    const body = el('div', {});
    const card = el('div', { class: 'modal panel-modal', style: { maxWidth: '640px', minWidth: '320px' } }, [
      el('div', { class: 'panel-head' }, [
        el('h3', { style: 'margin:0' }, title),
        el('button', { class: 'ghost', type: 'button', on: { click: closeModal } }, t('Close', 'Kapat')),
      ]),
      body,
    ]);
    modalRoot.append(el('div', { class: 'modal-bg', on: { click: (e) => { if (e.target === e.currentTarget) closeModal(); } } }, card));
    const refresh = async () => { body.innerHTML = ''; await render(body, refresh); };
    refresh();
  }
  function tokenBanner(newToken) {
    return el('div', { class: 'token-banner' }, [
      el('p', { style: 'margin:0 0 4px;font-weight:600' }, t('Copy this token now — you won’t see it again.', 'Bu jetonu şimdi kopyala — bir daha göremeyeceksin.')),
      el('div', { class: 'token-value' }, newToken),
      el('button', {
        type: 'button', class: 'ghost',
        on: { click: (e) => { navigator.clipboard.writeText(newToken); e.target.textContent = t('Copied!', 'Kopyalandı!'); } },
      }, t('Copy', 'Kopyala')),
    ]);
  }

  // ─── App list ──────────────────────────────────────────────────────────────
  const listEl = $('#appList');
  const emptyEl = $('#empty');

  async function loadList() {
    const { apps } = await api('/api/bot-apps');
    listEl.innerHTML = '';
    emptyEl.style.display = apps.length ? 'none' : '';
    for (const app of apps) {
      const card = el('div', { class: 'bot-app-card', on: { click: () => openAppDetail(app.id) } }, [
        app.bot && app.bot.avatarPath
          ? el('img', { class: 'bot-avatar', src: '/api/avatar/' + app.bot.avatarPath })
          : el('div', { class: 'bot-avatar' }),
        el('div', { class: 'bot-app-meta' }, [
          el('h4', {}, app.name),
          el('p', {}, app.description || t('No description', 'Açıklama yok')),
        ]),
      ]);
      listEl.append(card);
    }
  }

  function createAppModal() {
    const nameInput = el('input', { name: 'name', maxlength: 40, required: true, placeholder: t('My Bot', 'Botum') });
    const descInput = el('textarea', { name: 'description', maxlength: 200, rows: 2, placeholder: t('What does this bot do?', 'Bu bot ne yapıyor?') });
    const errBox = el('div', { class: 'error' });
    modal({
      title: t('New Application', 'Yeni Uygulama'),
      submitLabel: t('Create', 'Oluştur'),
      content: el('div', {}, [
        el('label', {}, t('Name', 'Ad')), nameInput,
        el('label', { style: 'margin-top:8px' }, t('Description', 'Açıklama')), descInput,
        errBox,
      ]),
      onSubmit: async () => {
        try {
          const { app, token: newToken } = await api('/api/bot-apps', {
            method: 'POST',
            body: JSON.stringify({ name: nameInput.value.trim(), description: descInput.value.trim() }),
          });
          await loadList();
          showTokenModal(app.name, newToken);
        } catch (e) {
          if (e.message === 'totp_required_for_bots') {
            // Server accepts either an authenticator app (TOTP) or a verified
            // email as the second factor here — most accounts already satisfy
            // this via email and never see this message. It only fires for an
            // unverified-email account with TOTP off, so say both paths.
            errBox.replaceChildren(
              t(
                'Creating a bot needs a second factor on your account: either an authenticator app or a verified email address. ',
                'Bot oluşturmak için hesabında ikinci bir doğrulama adımı gerekiyor: ya bir kimlik doğrulayıcı uygulama ya da doğrulanmış bir e-posta adresi. '
              ),
              el('a', { href: '/app', target: '_blank' }, t(
                'Verify your email or enable an authenticator in Settings → Security',
                'Ayarlar → Güvenlik bölümünden e-postanı doğrula veya bir kimlik doğrulayıcı ekle'
              )),
              t(', then try again.', ', ardından tekrar dene.'),
            );
          } else {
            errBox.textContent = e.message;
          }
          return false;
        }
      },
    });
  }

  function showTokenModal(name, newToken) {
    panelModal({
      title: name,
      render: (body) => {
        body.append(tokenBanner(newToken), el('p', { class: 'muted-text' }, t(
          'Use this as a Bearer token: Authorization: Bot ' + newToken.slice(0, 10) + '…',
          'Bunu Bearer jetonu olarak kullan: Authorization: Bot ' + newToken.slice(0, 10) + '…'
        )));
      },
    });
  }

  async function openAppDetail(id) {
    const { app } = await api('/api/bot-apps/' + id);
    let tab = 'overview';
    panelModal({
      title: app.name,
      render: async (body, refresh) => {
        const tabLabels = {
          overview: t('Overview', 'Genel Bakış'),
          token: t('Token', 'Jeton'),
          danger: t('Danger', 'Tehlikeli Bölge'),
        };
        const tabs = el('div', { class: 'dev-tabs' }, ['overview', 'token', 'danger'].map(key =>
          el('button', {
            type: 'button', class: 'dev-tab' + (key === tab ? ' active' : ''),
            on: { click: () => { tab = key; refresh(); } },
          }, tabLabels[key])
        ));
        body.append(tabs);

        if (tab === 'overview') {
          const nameInput = el('input', { value: app.name, maxlength: 40 });
          const descInput = el('textarea', { rows: 2, maxlength: 200 }, app.description || '');
          const errBox = el('div', { class: 'error' });
          const inviteUrl = location.origin + '/bot-invite/' + app.id;
          body.append(el('div', {}, [
            el('label', {}, t('Name', 'Ad')), nameInput,
            el('label', { style: 'margin-top:8px' }, t('Description', 'Açıklama')), descInput,
            el('button', {
              type: 'button', style: 'margin-top:10px',
              on: {
                click: async () => {
                  try {
                    await api('/api/bot-apps/' + id, {
                      method: 'PATCH',
                      body: JSON.stringify({ name: nameInput.value.trim(), description: descInput.value.trim() }),
                    });
                    await loadList();
                    refresh();
                  } catch (e) { errBox.textContent = e.message; }
                },
              },
            }, t('Save changes', 'Değişiklikleri kaydet')),
            errBox,
            el('hr', {}),
            el('label', {}, t('Invite link (add this bot to a server you manage)', 'Davet bağlantısı (bu botu yönettiğin bir sunucuya ekle)')),
            el('div', { class: 'token-value' }, inviteUrl),
            el('button', {
              type: 'button', class: 'ghost',
              on: { click: (e) => { navigator.clipboard.writeText(inviteUrl); e.target.textContent = t('Copied!', 'Kopyalandı!'); } },
            }, t('Copy invite link', 'Davet bağlantısını kopyala')),
            el('hr', {}),
            el('label', {}, t('Icon', 'Simge')),
            (() => {
              const fileInput = el('input', { type: 'file', accept: 'image/*' });
              const uploadBtn = el('button', {
                type: 'button', style: 'margin-left:8px',
                on: {
                  click: async () => {
                    if (!fileInput.files[0]) return;
                    const fd = new FormData();
                    fd.append('avatar', fileInput.files[0]);
                    try {
                      await api('/api/bot-apps/' + id + '/icon', { method: 'POST', body: fd });
                      await loadList();
                    } catch (e) { errBox.textContent = e.message; }
                  },
                },
              }, t('Upload', 'Yükle'));
              return el('div', {}, [fileInput, uploadBtn]);
            })(),
          ]));
        } else if (tab === 'token') {
          const errBox = el('div', { class: 'error' });
          body.append(el('div', {}, [
            el('p', { class: 'muted-text' }, t(
              'The token is only shown once, right after it’s (re)generated. If you lost it, regenerate — the old one stops working immediately.',
              'Jeton yalnızca oluşturulduğu (veya yenilendiği) anda bir kez gösterilir. Kaybettiysen yenile — eskisi anında çalışmayı bırakır.'
            )),
            el('button', {
              type: 'button',
              on: {
                click: async () => {
                  if (!confirm(t(
                    'Regenerate the token? The old token will stop working immediately.',
                    'Jeton yenilensin mi? Eski jeton anında çalışmayı bırakacak.'
                  ))) return;
                  try {
                    const { token: newToken } = await api('/api/bot-apps/' + id + '/regenerate-token', { method: 'POST' });
                    body.innerHTML = '';
                    body.append(tabs, tokenBanner(newToken));
                  } catch (e) { errBox.textContent = e.message; }
                },
              },
            }, t('Regenerate token', 'Jetonu yenile')),
            errBox,
          ]));
        } else if (tab === 'danger') {
          const errBox = el('div', { class: 'error' });
          body.append(el('div', { class: 'danger-zone' }, [
            el('p', { style: 'margin:0 0 10px' }, t(
              'Deleting this app removes the bot from every server and disables its token. Its past messages stay visible.',
              'Bu uygulamayı silmek botu tüm sunuculardan çıkarır ve jetonunu devre dışı bırakır. Geçmiş mesajları görünür kalır.'
            )),
            el('button', {
              type: 'button', class: 'danger',
              on: {
                click: async () => {
                  if (!confirm(t(
                    'Delete "' + app.name + '"? This cannot be undone.',
                    '"' + app.name + '" silinsin mi? Bu işlem geri alınamaz.'
                  ))) return;
                  try {
                    await api('/api/bot-apps/' + id, { method: 'DELETE' });
                    closeModal();
                    await loadList();
                  } catch (e) { errBox.textContent = e.message; }
                },
              },
            }, t('Delete application', 'Uygulamayı sil')),
            errBox,
          ]));
        }
      },
    });
  }

  $('#createBtn').addEventListener('click', createAppModal);
  loadList();
})();
