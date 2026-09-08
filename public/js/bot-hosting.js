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

  // ─── Minimal modal helper (standalone page, same pattern as developers.js) ──
  const modalRoot = $('#modalRoot');
  function closeModal() { modalRoot.innerHTML = ''; }
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

  // Built as functions so they re-evaluate in the current language each render.
  const statusLabel = (k) => ({
    pending: t('Pending review', 'İnceleme bekliyor'),
    approved: t('Approved', 'Onaylandı'),
    rejected: t('Rejected', 'Reddedildi'),
  }[k] || k);
  const marketplaceLabel = (k) => ({
    pending: t('Marketplace: pending review', 'Market: inceleme bekliyor'),
    listed: t('Marketplace: Listed', 'Market: Listelendi'),
    rejected: t('Marketplace: rejected', 'Market: reddedildi'),
  }[k] || k);

  // ─── Submission form ─────────────────────────────────────────────────────
  const RUNTIME_LABEL = { 'isolated-vm': 'isolated-vm', node: 'Node.js' };
  const botAppSelect = $('#botAppSelect');
  const scriptName = $('#scriptName');
  const scriptCode = $('#scriptCode');
  const runtimePicker = $('#runtimePicker');
  const submitWarnings = $('#submitWarnings');
  const submitError = $('#submitError');
  const submitBtn = $('#submitBtn');
  let myBotApps = [];

  async function loadBotApps() {
    const { apps } = await api('/api/bot-apps');
    myBotApps = apps;
    botAppSelect.innerHTML = '';
    if (!apps.length) {
      botAppSelect.append(el('option', { value: '' }, t(
        'Create a bot in the Developer Portal first',
        'Önce Geliştirici Portalı’ndan bir bot oluştur'
      )));
      submitBtn.disabled = true;
      return;
    }
    for (const app of apps) botAppSelect.append(el('option', { value: app.id }, app.name));
  }

  submitBtn.addEventListener('click', async () => {
    submitError.textContent = '';
    submitWarnings.textContent = '';
    const botAppId = +botAppSelect.value;
    const name = scriptName.value.trim();
    const code = scriptCode.value;
    const runtime = runtimePicker.querySelector('input[name="runtime"]:checked').value;
    if (!botAppId) { submitError.textContent = t('Pick a bot application.', 'Bir bot uygulaması seç.'); return; }
    if (!name) { submitError.textContent = t('Give your script a name.', 'Betiğine bir ad ver.'); return; }
    if (!code.trim()) { submitError.textContent = t('Paste your script code.', 'Betik kodunu yapıştır.'); return; }

    // A plain button (not a form submit) means the browser's native
    // required-field validation never fires — resolving silently on an empty
    // value here was the actual bug, not just a missing visual cue.
    const tokenModal = () => new Promise((resolve) => {
      const input = el('input', { placeholder: 'dbot_...', required: true });
      const tokenErr = el('div', { class: 'error' });
      panelModal({
        title: t('Paste this bot\'s token', 'Bu botun jetonunu yapıştır'),
        render: (body) => {
          body.append(
            el('p', { class: 'muted-text' }, t(
              'Needed so the sandbox can act as this bot. Find it again via "Regenerate Token" in the Developer Portal if you\'ve lost it.',
              'Yalıtılmış ortamın bu bot adına işlem yapabilmesi için gerekli. Kaybettiysen Geliştirici Portalı’ndaki "Jetonu yenile" ile yenisini alabilirsin.'
            )),
            el('label', {}, t('Bot token', 'Bot jetonu')), input, tokenErr,
            el('div', { class: 'row', style: 'margin-top:12px' }, [
              el('button', { type: 'button', on: { click: () => {
                const v = input.value.trim();
                if (!v) { tokenErr.textContent = t('Paste the bot token first.', 'Önce bot jetonunu yapıştır.'); input.focus(); return; }
                closeModal(); resolve(v);
              } } }, t('Continue', 'Devam et')),
            ]),
          );
        },
      });
      setTimeout(() => input.focus(), 0);
    });
    const botToken = await tokenModal();
    if (!botToken) return;

    submitBtn.disabled = true;
    try {
      const { script, warnings } = await api('/api/bot-scripts', {
        method: 'POST',
        body: JSON.stringify({ botAppId, name, code, runtime, token: botToken }),
      });
      if (warnings && warnings.length) submitWarnings.textContent = warnings.join(' ');
      scriptName.value = '';
      scriptCode.value = '';
      await loadScripts();
    } catch (e) {
      submitError.textContent = e.message;
    } finally {
      submitBtn.disabled = false;
    }
  });

  // ─── Script list ─────────────────────────────────────────────────────────
  const listEl = $('#scriptList');
  const emptyEl = $('#empty');

  async function loadScripts() {
    const { scripts } = await api('/api/bot-scripts');
    listEl.innerHTML = '';
    emptyEl.style.display = scripts.length ? 'none' : '';
    for (const s of scripts) listEl.append(scriptCard(s));
  }

  function scriptCard(s) {
    const card = el('div', { class: 'script-card' });
    const pill = el('span', { class: 'status-pill ' + s.status }, statusLabel(s.status));
    const top = el('div', { class: 'script-card-top' }, [
      el('span', { class: 'script-name' }, s.name),
      el('span', { class: 'runtime-badge' }, RUNTIME_LABEL[s.runtime] || s.runtime),
      pill,
      s.status === 'approved' && s.marketplaceStatus !== 'none'
        ? el('span', { class: 'status-pill ' + s.marketplaceStatus }, marketplaceLabel(s.marketplaceStatus))
        : null,
    ]);
    card.append(top);
    if (s.status === 'pending') {
      card.append(el('div', { class: 'muted-text' }, t(
        'Will start running automatically as soon as an admin approves it. You can stop it anytime after that from here.',
        'Bir yönetici onaylar onaylamaz otomatik olarak çalışmaya başlayacak. Sonrasında istediğin zaman buradan durdurabilirsin.'
      )));
    }
    if (s.status === 'rejected' && s.rejectReason) {
      card.append(el('div', { class: 'script-reason' }, t('Reason: ', 'Sebep: ') + s.rejectReason));
    }
    if (s.marketplaceStatus === 'rejected' && s.marketplaceRejectReason) {
      card.append(el('div', { class: 'script-reason' }, t('Marketplace reject reason: ', 'Market ret sebebi: ') + s.marketplaceRejectReason));
    }
    if (s.lastError) {
      card.append(el('div', { class: 'script-reason' }, t('Last error: ', 'Son hata: ') + s.lastError));
    }

    const actions = el('div', { class: 'script-actions' });
    if (s.status === 'approved') {
      const toggleBtn = el('button', { type: 'button', class: 'ghost' }, s.enabled ? t('Stop', 'Durdur') : t('Start', 'Başlat'));
      toggleBtn.addEventListener('click', async () => {
        toggleBtn.disabled = true;
        await api(`/api/bot-scripts/${s.id}/toggle`, { method: 'POST', body: JSON.stringify({ enabled: !s.enabled }) });
        await loadScripts();
      });
      actions.append(toggleBtn);
      if (s.marketplaceStatus === 'none' || s.marketplaceStatus === 'rejected') {
        const applyBtn = el('button', { type: 'button', class: 'ghost' }, s.marketplaceStatus === 'rejected'
          ? t('Re-apply to Marketplace', 'Markete yeniden başvur')
          : t('Apply to Marketplace', 'Markete başvur'));
        applyBtn.addEventListener('click', () => openMarketplaceApplyModal(s));
        actions.append(applyBtn);
      }
    }
    const editBtn = el('button', { type: 'button', class: 'ghost' }, t('Edit', 'Düzenle'));
    editBtn.addEventListener('click', () => openEditModal(s));
    const configBtn = el('button', { type: 'button', class: 'ghost' }, t('Setup Screen', 'Kurulum Ekranı'));
    configBtn.addEventListener('click', () => openConfigSchemaModal(s));
    const logsBtn = el('button', { type: 'button', class: 'ghost' }, t('Logs', 'Günlükler'));
    logsBtn.addEventListener('click', () => openLogsModal(s));
    const deleteBtn = el('button', { type: 'button', class: 'ghost' }, t('Delete', 'Sil'));
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(t(
        `Delete "${s.name}"? This can't be undone.`,
        `"${s.name}" silinsin mi? Bu işlem geri alınamaz.`
      ))) return;
      await api(`/api/bot-scripts/${s.id}`, { method: 'DELETE' });
      await loadScripts();
    });
    actions.append(editBtn, configBtn, logsBtn, deleteBtn);
    card.append(actions);
    return card;
  }

  function openEditModal(s) {
    const nameInput = el('input', { value: s.name, maxlength: 60 });
    const codeInput = el('textarea', { class: 'code-input' }, s.code);
    codeInput.value = s.code;
    const runtimeSelect = el('select', {}, [
      el('option', { value: 'isolated-vm', selected: s.runtime !== 'node' ? true : null }, 'isolated-vm'),
      el('option', { value: 'node', selected: s.runtime === 'node' ? true : null }, 'Node.js'),
    ]);
    const warnBox = el('div', { class: 'warn-box' });
    const errBox = el('p', { class: 'error' });
    panelModal({
      title: t('Edit script', 'Betiği düzenle'),
      render: (body) => {
        body.append(
          el('p', { class: 'muted-text' }, t(
            'Editing the code or switching runtimes always sends it back for review before it can run again.',
            'Kodu düzenlemek veya çalışma ortamını değiştirmek, betiği tekrar çalışabilmesi için her zaman yeniden incelemeye gönderir.'
          )),
          el('label', {}, t('Name', 'Ad')), nameInput,
          el('label', { style: 'margin-top:8px' }, t('Runtime', 'Çalışma ortamı')), runtimeSelect,
          el('label', { style: 'margin-top:8px' }, t('Script', 'Betik')), codeInput,
          warnBox, errBox,
          el('div', { class: 'row', style: 'margin-top:10px' }, [
            el('button', { type: 'button', on: {
              click: async () => {
                try {
                  const { warnings } = await api(`/api/bot-scripts/${s.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ name: nameInput.value.trim(), code: codeInput.value, runtime: runtimeSelect.value }),
                  });
                  if (warnings && warnings.length) { warnBox.textContent = warnings.join(' '); return; }
                  closeModal();
                  await loadScripts();
                } catch (e) { errBox.textContent = e.message; }
              },
            } }, t('Save (re-submits for review)', 'Kaydet (yeniden incelemeye gönderir)')),
          ]),
        );
      },
    });
  }

  // ─── Setup Screen editor ─────────────────────────────────────────────────
  // Lets a bot developer describe the per-server settings their bot needs
  // (a channel to post in, a mod role, a toggle, a prefix, ...). Whoever adds
  // the bot to a server from the Bot Marketplace then fills these in through
  // a form built from this exact schema (see bots.js), and the saved values
  // arrive in the sandboxed script as the `config` argument to
  // onMessage/onMemberJoin — see the hosting guide for the exact shape.
  const configTypes = () => [
    { value: 'text', label: t('Short text', 'Kısa metin') },
    { value: 'textarea', label: t('Long text', 'Uzun metin') },
    { value: 'number', label: t('Number', 'Sayı') },
    { value: 'boolean', label: t('Toggle (on/off)', 'Anahtar (açık/kapalı)') },
    { value: 'channel', label: t('Channel picker', 'Kanal seçici') },
    { value: 'role', label: t('Role picker', 'Rol seçici') },
    { value: 'select', label: t('Dropdown (custom options)', 'Açılır liste (özel seçenekler)') },
  ];

  function configFieldRow(f) {
    const keyInput = el('input', { value: f.key || '', placeholder: 'announceChannel', maxlength: 30, style: 'width:150px' });
    const labelInput = el('input', { value: f.label || '', placeholder: t('Label shown to the server admin', 'Sunucu yöneticisine gösterilecek etiket'), maxlength: 80, style: 'flex:1;min-width:160px' });
    const typeSelect = el('select', { style: 'width:190px' }, configTypes().map((ct) => el('option', { value: ct.value, selected: f.type === ct.value ? true : null }, ct.label)));
    const requiredCheck = el('input', { type: 'checkbox', checked: f.required ? true : null });
    const removeBtn = el('button', { type: 'button', class: 'ghost' }, t('Remove', 'Kaldır'));
    const row2 = el('div', { class: 'row2' });
    const row = el('div', { class: 'config-field-row' }, [
      el('div', { class: 'row1' }, [keyInput, labelInput, typeSelect, el('label', { class: 'req-label' }, [requiredCheck, t('Required', 'Zorunlu')]), removeBtn]),
      row2,
    ]);
    removeBtn.addEventListener('click', () => row.remove());

    let optionsInput, defaultInput, helpInput;
    function renderExtra() {
      row2.innerHTML = '';
      const type = typeSelect.value;
      helpInput = el('input', { value: f.helpText || '', placeholder: t('Help text under the field (optional)', 'Alanın altındaki yardım metni (isteğe bağlı)'), maxlength: 200, style: 'flex:1;min-width:160px' });
      if (type === 'select') {
        optionsInput = el('input', { value: (f.options || []).join(', '), placeholder: t('Options, comma separated', 'Seçenekler, virgülle ayrılmış'), style: 'flex:1;min-width:160px' });
        defaultInput = el('input', { value: f.default != null ? String(f.default) : '', placeholder: t('Default option (optional)', 'Varsayılan seçenek (isteğe bağlı)'), style: 'width:160px' });
        row2.append(optionsInput, defaultInput, helpInput);
      } else if (type === 'boolean') {
        defaultInput = el('input', { type: 'checkbox', checked: f.default ? true : null });
        row2.append(el('label', { class: 'req-label' }, [defaultInput, t('Default: on', 'Varsayılan: açık')]), helpInput);
      } else if (type === 'number') {
        defaultInput = el('input', { type: 'number', value: f.default != null ? String(f.default) : '', placeholder: t('Default (optional)', 'Varsayılan (isteğe bağlı)'), style: 'width:160px' });
        row2.append(defaultInput, helpInput);
      } else if (type === 'channel' || type === 'role') {
        row2.append(el('p', { class: 'config-empty', style: 'margin:0;flex-basis:100%' }, t(
          `Set per-server when the bot is added — it can't have a platform-wide default.`,
          'Bot eklendiğinde her sunucu için ayrı ayarlanır — platform genelinde varsayılanı olamaz.'
        )), helpInput);
      } else {
        defaultInput = el('input', { value: f.default != null ? String(f.default) : '', placeholder: t('Default (optional)', 'Varsayılan (isteğe bağlı)'), style: 'width:160px' });
        row2.append(defaultInput, helpInput);
      }
    }
    typeSelect.addEventListener('change', renderExtra);
    renderExtra();

    return {
      row,
      read() {
        const type = typeSelect.value;
        const out = { key: keyInput.value.trim(), label: labelInput.value.trim(), type, required: requiredCheck.checked };
        if (helpInput.value.trim()) out.helpText = helpInput.value.trim();
        if (type === 'select') {
          out.options = optionsInput.value.split(',').map((o) => o.trim()).filter(Boolean);
          if (defaultInput.value.trim()) out.default = defaultInput.value.trim();
        } else if (type === 'boolean') {
          out.default = !!defaultInput.checked;
        } else if (type === 'number') {
          if (defaultInput.value !== '') out.default = +defaultInput.value;
        } else if (type === 'text' || type === 'textarea') {
          if (defaultInput.value !== '') out.default = defaultInput.value;
        }
        return out;
      },
    };
  }

  function openConfigSchemaModal(s) {
    const rows = [];
    const listEl2 = el('div', {});
    const errBox = el('p', { class: 'error' });
    function addRow(f = {}) {
      const entry = configFieldRow(f);
      rows.push(entry);
      listEl2.append(entry.row);
    }
    for (const f of s.configSchema || []) addRow(f);
    const addBtn = el('button', { type: 'button', class: 'ghost' }, t('+ Add field', '+ Alan ekle'));
    addBtn.addEventListener('click', () => {
      const note = document.getElementById('noFieldsNote');
      if (note) note.remove();
      addRow();
    });
    panelModal({
      title: t('Setup Screen — ' + s.name, 'Kurulum Ekranı — ' + s.name),
      render: (body) => {
        body.append(...[
          el('p', { class: 'muted-text' }, t(
            'Define the settings a server admin fills in when they add this bot — a channel to post in, a mod role, a toggle, whatever your bot needs. Read the value back in your script as the third argument, e.g. config.announceChannel.',
            'Bir sunucu yöneticisi bu botu eklerken dolduracağı ayarları tanımla — mesaj atılacak bir kanal, bir moderatör rolü, bir anahtar, botun neye ihtiyacı varsa. Değeri betiğinde üçüncü argüman olarak okursun, örneğin config.announceChannel.'
          )),
          !rows.length ? el('p', { class: 'config-empty', id: 'noFieldsNote' }, t(
            'No fields yet — your bot will install with no setup step.',
            'Henüz alan yok — botun kurulum adımı olmadan yüklenecek.'
          )) : null,
          listEl2,
          addBtn,
          errBox,
          el('div', { class: 'row', style: 'margin-top:12px' }, [
            el('button', {
              type: 'button',
              on: {
                click: async () => {
                  try {
                    const configSchema = rows.map((r) => r.read());
                    for (const f of configSchema) {
                      if (!f.key) throw new Error(t('Every field needs a key.', 'Her alanın bir anahtarı olmalı.'));
                      if (!f.label) throw new Error(t('Every field needs a label.', 'Her alanın bir etiketi olmalı.'));
                      if (f.type === 'select' && !f.options.length) throw new Error(t(
                        `"${f.label}" needs at least one option.`,
                        `"${f.label}" için en az bir seçenek gerekli.`
                      ));
                    }
                    await api(`/api/bot-scripts/${s.id}`, { method: 'PATCH', body: JSON.stringify({ configSchema }) });
                    closeModal();
                    await loadScripts();
                  } catch (e) { errBox.textContent = e.message; }
                },
              },
            }, t('Save setup screen', 'Kurulum ekranını kaydet')),
          ]),
        ].filter(Boolean));
      },
    });
  }

  function openMarketplaceApplyModal(s) {
    const taglineInput = el('input', { maxlength: 140, placeholder: t('A one-line pitch shown on the public marketplace card', 'Herkese açık market kartında görünecek tek satırlık tanıtım'), value: s.marketplaceTagline || '' });
    const errBox = el('p', { class: 'error' });
    panelModal({
      title: t('Apply to Marketplace — ' + s.name, 'Markete başvur — ' + s.name),
      render: (body) => {
        body.append(
          el('p', { class: 'muted-text' }, t(
            'Once approved, anyone can find and add this bot to their server from the Bot Marketplace. This is a separate review from Community Bot Hosting approval.',
            'Onaylandıktan sonra herkes bu botu Bot Marketi’nden bulup kendi sunucusuna ekleyebilir. Bu, Topluluk Bot Barındırma onayından ayrı bir incelemedir.'
          )),
          el('label', {}, t('Tagline', 'Tanıtım metni')), taglineInput,
          errBox,
          el('div', { class: 'row', style: 'margin-top:10px' }, [
            el('button', { type: 'button', on: {
              click: async () => {
                try {
                  await api(`/api/bot-scripts/${s.id}/marketplace-apply`, {
                    method: 'POST',
                    body: JSON.stringify({ tagline: taglineInput.value.trim() }),
                  });
                  closeModal();
                  await loadScripts();
                } catch (e) { errBox.textContent = e.message; }
              },
            } }, t('Submit application', 'Başvuruyu gönder')),
          ]),
        );
      },
    });
  }

  function openLogsModal(s) {
    panelModal({
      title: t('Logs — ' + s.name, 'Günlükler — ' + s.name),
      render: (body) => {
        const pane = el('div', { class: 'log-pane' }, t('Loading…', 'Yükleniyor…'));
        body.append(pane);
        // No close-callback from panelModal — instead of hooking every way the
        // modal can close, just stop polling once the pane is no longer in
        // the document (true whether closed via the X button or the backdrop).
        const refresh = async () => {
          if (!pane.isConnected) { clearInterval(timer); return; }
          try {
            const { logs } = await api(`/api/bot-scripts/${s.id}/logs`);
            if (!pane.isConnected) { clearInterval(timer); return; }
            const locale = window.dLang && window.dLang.get() === 'tr' ? 'tr-TR' : undefined;
            pane.textContent = logs.length
              ? logs.map((l) => `[${new Date(l.ts).toLocaleTimeString(locale)}] ${l.line}`).join('\n')
              : t('No log lines yet.', 'Henüz günlük kaydı yok.');
            pane.scrollTop = pane.scrollHeight;
          } catch (e) { pane.textContent = t('Failed to load logs: ', 'Günlükler yüklenemedi: ') + e.message; }
        };
        const timer = setInterval(refresh, 4000);
        refresh();
      },
    });
  }

  loadBotApps();
  loadScripts();
})();
