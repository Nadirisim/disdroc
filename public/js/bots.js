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

  // ─── Minimal modal helpers (self-contained, same pattern as developers.js —
  // this is a standalone page, not part of app.js's SPA) ─────────────────────
  const modalRoot = $('#modalRoot');
  function closeModal() { modalRoot.innerHTML = ''; }
  function panelModal({ title, render }) {
    const body = el('div', {});
    const card = el('div', { class: 'modal panel-modal', style: { maxWidth: '520px', minWidth: '320px' } }, [
      el('div', { class: 'panel-head' }, [
        el('h3', { style: 'margin:0' }, title),
        el('button', { class: 'ghost', type: 'button', on: { click: closeModal } }, t('Close', 'Kapat')),
      ]),
      body,
    ]);
    modalRoot.append(el('div', { class: 'modal-bg', on: { click: (e) => { if (e.target === e.currentTarget) closeModal(); } } }, card));
    const refresh = async () => { body.innerHTML = ''; await render(body, refresh); };
    refresh();
    return { body, refresh };
  }

  const PRESET_ICONS = { welcome: '👋', owo: '🏹', rank: '📈', critterdex: '🐾' };

  // ─── Grid of available presets ─────────────────────────────────────────────
  const grid = $('#grid');
  const installsSection = $('#installsSection');

  async function loadGrid() {
    const { presets } = await api('/api/bot-presets');
    grid.innerHTML = '';
    for (const preset of presets) {
      grid.append(el('div', { class: 'mkt-card' }, [
        el('div', { class: 'mkt-card-icon' }, PRESET_ICONS[preset.id] || '🤖'),
        el('h4', {}, preset.name),
        el('p', {}, t(preset.tagline, preset.taglineTr || preset.tagline)),
        el('button', { type: 'button', on: { click: () => startInstallWizard(preset) } }, t('Add to Server', 'Sunucuya Ekle')),
      ]));
    }
    await loadInstalls(presets);
  }

  // ─── "Already installed" management list, per preset the user has an app for ──
  async function loadInstalls(presets) {
    installsSection.innerHTML = '';
    const { apps } = await api('/api/bot-apps');
    for (const preset of presets) {
      const app = apps.find(a => a.preset === preset.id);
      if (!app) continue;
      const { servers } = await api('/api/bot-apps/' + app.id + '/servers');
      const section = el('div', {}, [
        el('div', { class: 'mkt-section-title' }, [el('h3', { style: 'margin:0' }, preset.name + t(' — installed in', ' — şu sunucularda kurulu'))]),
      ]);
      if (!servers.length) {
        section.append(el('p', { class: 'empty-note' }, t('Not added to any server yet.', 'Henüz hiçbir sunucuya eklenmedi.')));
      }
      for (const s of servers) {
        const row = el('div', { class: 'install-row' }, [
          s.icon_path ? el('img', { class: 'server-icon-sm', src: '/api/server-icon/' + s.icon_path }) : el('div', { class: 'server-icon-sm' }),
          el('div', { class: 'meta' }, [
            el('h5', {}, s.name),
            el('p', {}, preset.configurable === false
              ? t('Active — responds to commands automatically', 'Etkin — komutlara otomatik yanıt veriyor')
              : t('Click Edit to set the channel and message', 'Kanalı ve mesajı ayarlamak için Düzenle’ye tıkla')),
          ]),
          preset.configurable === false ? null : el('button', { type: 'button', class: 'ghost', on: { click: () => openConfigStep(app, s) } }, t('Edit', 'Düzenle')),
          el('button', { type: 'button', class: 'ghost danger', on: { click: () => removeInstall(app, s, preset) } }, t('Remove', 'Kaldır')),
        ]);
        section.append(row);
      }
      installsSection.append(section);
    }
  }

  async function removeInstall(app, server, preset) {
    if (preset && preset.configurable === false) {
      if (!confirm(t(
        `Remove ${app.name} from "${server.name}"? It'll be kicked from the server.`,
        `${app.name} "${server.name}" sunucusundan kaldırılsın mı? Sunucudan atılacak.`
      ))) return;
      await api(`/api/bot-apps/${app.id}/servers/${server.id}`, { method: 'DELETE' });
      await loadGrid();
      return;
    }
    if (!confirm(t(
      `Stop ${app.name}'s welcome messages in "${server.name}"? (The bot itself stays in the server — remove it from the member list if you want it gone entirely.)`,
      `${app.name} botunun "${server.name}" sunucusundaki karşılama mesajları durdurulsun mu? (Bot sunucuda kalmaya devam eder — tamamen kaldırmak istersen üye listesinden çıkar.)`
    ))) return;
    await api(`/api/bot-apps/${app.id}/servers/${server.id}/config`, { method: 'DELETE' });
    await loadGrid();
  }

  // ─── Install wizard: pick server → configure ───────────────────────────────
  async function startInstallWizard(preset) {
    const { app } = await api('/api/bot-apps/preset/' + preset.id, { method: 'POST' });
    const { servers } = await api('/api/servers-i-manage');
    if (!servers.length) {
      panelModal({
        title: preset.name,
        render: (body) => body.append(el('p', {}, t(
          'You don’t manage any servers to add this bot to yet.',
          'Bu botu ekleyebileceğin, yönettiğin bir sunucu henüz yok.'
        ))),
      });
      return;
    }
    panelModal({
      title: t('Add ' + preset.name, preset.name + ' ekle'),
      render: (body) => {
        const select = el('select', {}, servers.map(s => el('option', { value: s.id }, s.name)));
        body.append(el('div', { class: 'wizard-step' }, [
          el('p', { class: 'muted-text' }, t(
            'Choose a server to add ' + preset.name + ' to:',
            preset.name + ' botunu ekleyeceğin sunucuyu seç:'
          )),
          select,
          el('button', {
            type: 'button', style: 'margin-top:8px',
            on: {
              click: async () => {
                const server = servers.find(s => String(s.id) === select.value);
                await api(`/api/bot-apps/${app.id}/servers/${server.id}`, { method: 'POST' });
                closeModal();
                if (preset.configurable === false) {
                  panelModal({
                    title: preset.name,
                    render: (body) => body.append(el('p', {}, t(
                      `${preset.name} was added to "${server.name}" — it's ready to go, no setup needed.`,
                      `${preset.name}, "${server.name}" sunucusuna eklendi — kuruluma gerek yok, kullanıma hazır.`
                    ))),
                  });
                  await loadGrid();
                } else {
                  openConfigStep(app, server, preset);
                }
              },
            },
          }, t('Next: configure', 'Sıradaki: yapılandır')),
        ]));
      },
    });
  }

  async function openConfigStep(app, server, preset) {
    preset = preset || {
      defaultMessage: t('Welcome to the server, {user}! \u{1F44B}', 'Sunucuya hoş geldin, {user}! \u{1F44B}'),
    };
    const [{ channels: allChannels }, { config }] = await Promise.all([
      api('/api/servers/' + server.id),
      api(`/api/bot-apps/${app.id}/servers/${server.id}/config`),
    ]);
    const channels = allChannels.filter(c => c.type === 'channel');
    panelModal({
      title: t('Configure — ' + server.name, 'Yapılandır — ' + server.name),
      render: (body) => {
        const errBox = el('div', { class: 'error' });
        const channelSelect = el('select', {}, channels.map(c => el('option', {
          value: c.id, selected: config && config.channel_id === c.id ? true : null,
        }, '#' + c.name)));
        const msgInput = el('textarea', { rows: 3, maxlength: 500 }, (config && config.message) || preset.defaultMessage);
        const fileInput = el('input', { type: 'file', accept: 'image/*' });
        const sampleMember = t('@newmember', '@yeniuye');
        const previewLabel = t('Preview: ', 'Önizleme: ');
        const preview = el('div', { class: 'msg-preview' }, previewLabel + msgInput.value.replace('{user}', sampleMember));
        msgInput.addEventListener('input', () => { preview.textContent = previewLabel + msgInput.value.replace('{user}', sampleMember); });
        if (config && config.image_path) {
          body.append(el('img', { src: '/api/bot-welcome-image/' + config.image_path, style: 'max-width:100%;border-radius:8px;margin-bottom:8px' }));
        }
        body.append(el('div', { class: 'wizard-step' }, [
          !channels.length ? el('p', { class: 'muted-text' }, t('This server has no text channels yet.', 'Bu sunucuda henüz metin kanalı yok.')) : null,
          el('label', {}, t('Channel to greet in', 'Karşılamanın yapılacağı kanal')), channelSelect,
          el('label', { style: 'margin-top:8px' }, t('Message', 'Mesaj')), msgInput,
          el('p', { class: 'placeholder-hint' }, t(
            'Use {user} where the new member should be @mentioned.',
            'Yeni üyeden @bahsedilmesini istediğin yere {user} yaz.'
          )),
          preview,
          el('label', { style: 'margin-top:8px' }, t('Picture (optional)', 'Görsel (isteğe bağlı)')), fileInput,
          errBox,
          el('button', {
            type: 'button', style: 'margin-top:10px',
            on: {
              click: async () => {
                if (!channels.length) {
                  // Used to surface the raw error code "no_channels" to the user.
                  errBox.textContent = t(
                    'Create a text channel in this server first, then set the bot up.',
                    'Önce bu sunucuda bir metin kanalı oluştur, sonra botu ayarla.'
                  );
                  return;
                }
                try {
                  await api(`/api/bot-apps/${app.id}/servers/${server.id}/config`, {
                    method: 'POST',
                    body: JSON.stringify({ channelId: +channelSelect.value, message: msgInput.value.trim() }),
                  });
                  if (fileInput.files[0]) {
                    const fd = new FormData();
                    fd.append('image', fileInput.files[0]);
                    await api(`/api/bot-apps/${app.id}/servers/${server.id}/config/image`, { method: 'POST', body: fd });
                  }
                  closeModal();
                  await loadGrid();
                } catch (e) { errBox.textContent = e.message; }
              },
            },
          }, t('Save', 'Kaydet')),
        ]));
      },
    });
  }

  // ─── Community Bots: developer-submitted bots accepted into the marketplace ──
  const communityGrid = $('#communityGrid');
  const communityInstallsSection = $('#communityInstallsSection');

  async function loadCommunityGrid() {
    const { bots } = await api('/api/bot-scripts/marketplace');
    communityGrid.innerHTML = '';
    if (!bots.length) {
      communityGrid.append(el('p', { class: 'empty-note' }, t('No community bots listed yet.', 'Henüz listelenen topluluk botu yok.')));
    } else {
      for (const bot of bots) {
        communityGrid.append(el('div', { class: 'mkt-card' }, [
          bot.bot && bot.bot.avatarPath
            ? el('img', { class: 'mkt-card-icon', style: 'object-fit:cover', src: '/api/avatar/' + bot.bot.avatarPath })
            : el('div', { class: 'mkt-card-icon' }, '🤖'),
          el('h4', {}, bot.name),
          el('p', {}, bot.tagline || ''),
          el('button', { type: 'button', on: { click: () => startCommunityInstallWizard(bot) } }, t('Add to Server', 'Sunucuya Ekle')),
        ]));
      }
    }
    await loadCommunityInstalls(bots);
  }

  // ─── "Already installed" list for community bots — parallel to loadInstalls
  // above, but scoped by "servers I manage" rather than "bot apps I own",
  // since the installer here is essentially never the bot's own developer ──
  async function loadCommunityInstalls(bots) {
    communityInstallsSection.innerHTML = '';
    for (const bot of bots) {
      const { servers } = await api('/api/bot-apps/' + bot.botAppId + '/installed-servers');
      if (!servers.length) continue;
      const hasSetup = bot.configSchema && bot.configSchema.length > 0;
      const section = el('div', {}, [
        el('div', { class: 'mkt-section-title' }, [el('h3', { style: 'margin:0' }, bot.name + t(' — installed in', ' — şu sunucularda kurulu'))]),
      ]);
      for (const s of servers) {
        const row = el('div', { class: 'install-row' }, [
          s.icon_path ? el('img', { class: 'server-icon-sm', src: '/api/server-icon/' + s.icon_path }) : el('div', { class: 'server-icon-sm' }),
          el('div', { class: 'meta' }, [
            el('h5', {}, s.name),
            el('p', {}, hasSetup
              ? t('Click Edit to set this bot up for your server', 'Bu botu sunucun için ayarlamak üzere Düzenle’ye tıkla')
              : t('Active — no setup needed', 'Etkin — kuruluma gerek yok')),
          ]),
          hasSetup ? el('button', { type: 'button', class: 'ghost', on: { click: () => openScriptConfigStep(bot, s) } }, t('Edit', 'Düzenle')) : null,
          el('button', { type: 'button', class: 'ghost danger', on: { click: () => removeCommunityInstall(bot, s) } }, t('Remove', 'Kaldır')),
        ]);
        section.append(row);
      }
      communityInstallsSection.append(section);
    }
  }

  async function removeCommunityInstall(bot, server) {
    if (!confirm(t(
      `Remove ${bot.name} from "${server.name}"? It'll be kicked from the server.`,
      `${bot.name} "${server.name}" sunucusundan kaldırılsın mı? Sunucudan atılacak.`
    ))) return;
    await api(`/api/bot-apps/${bot.botAppId}/servers/${server.id}`, { method: 'DELETE' });
    await loadCommunityGrid();
  }

  // ─── Generic setup-screen renderer ──────────────────────────────────────────
  // Turns one config field descriptor (defined by the bot's developer via the
  // Setup Screen editor in Community Bot Hosting) into one input widget, bound
  // to the server being configured — channel/role fields are populated from
  // that server's own channels/roles, same as the Welcome Bot config above.
  function renderConfigField(f, value, ctx) {
    // Channel/role fields never have a platform-wide default (see the server's
    // validateConfigSchema) — for every other type, fall back to the schema's
    // declared default when nothing's been saved yet, so hitting Save without
    // touching an untouched field persists that default instead of blanking it.
    const val = value !== undefined && value !== null ? value : f.default;
    let input;
    if (f.type === 'boolean') {
      input = el('input', { type: 'checkbox', checked: val ? true : null });
    } else if (f.type === 'select') {
      input = el('select', {}, f.options.map((o) => el('option', { value: o, selected: val === o ? true : null }, o)));
    } else if (f.type === 'channel') {
      input = el('select', {}, [
        el('option', { value: '' }, t('— choose a channel —', '— bir kanal seç —')),
        ...ctx.channels.map((c) => el('option', { value: c.id, selected: val != null && String(val) === String(c.id) ? true : null }, '#' + c.name)),
      ]);
    } else if (f.type === 'role') {
      input = el('select', {}, [
        el('option', { value: '' }, t('— choose a role —', '— bir rol seç —')),
        ...ctx.roles.map((r) => el('option', { value: r.id, selected: val != null && String(val) === String(r.id) ? true : null }, r.name)),
      ]);
    } else if (f.type === 'number') {
      input = el('input', { type: 'number', value: val != null ? String(val) : '' });
    } else if (f.type === 'textarea') {
      input = el('textarea', { rows: 3 }, val || '');
    } else {
      input = el('input', { value: val || '', placeholder: f.placeholder || '' });
    }
    const wrap = el('div', { style: 'margin-top:10px' }, [
      el('label', {}, f.label + (f.required ? ' *' : '')),
      input,
      f.helpText ? el('p', { class: 'placeholder-hint' }, f.helpText) : null,
    ]);
    return { wrap, getValue: () => (f.type === 'boolean' ? input.checked : input.value) };
  }

  async function openScriptConfigStep(bot, server) {
    const [{ schema, values }, full] = await Promise.all([
      api(`/api/bot-apps/${bot.botAppId}/servers/${server.id}/script-config`),
      api('/api/servers/' + server.id),
    ]);
    const channels = full.channels.filter((c) => c.type === 'channel');
    const roles = full.roles || [];
    const fields = schema.map((f) => renderConfigField(f, values[f.key], { channels, roles }));
    panelModal({
      title: t('Configure — ' + server.name, 'Yapılandır — ' + server.name),
      render: (body) => {
        const errBox = el('div', { class: 'error' });
        body.append(el('div', { class: 'wizard-step' }, [
          ...fields.map((f) => f.wrap),
          errBox,
          el('button', {
            type: 'button', style: 'margin-top:10px',
            on: {
              click: async () => {
                try {
                  const vals = {};
                  schema.forEach((f, i) => { vals[f.key] = fields[i].getValue(); });
                  await api(`/api/bot-apps/${bot.botAppId}/servers/${server.id}/script-config`, {
                    method: 'POST',
                    body: JSON.stringify({ values: vals }),
                  });
                  closeModal();
                  await loadCommunityGrid();
                } catch (e) { errBox.textContent = e.message; }
              },
            },
          }, t('Save', 'Kaydet')),
        ]));
      },
    });
  }

  async function startCommunityInstallWizard(bot) {
    const { servers } = await api('/api/servers-i-manage');
    if (!servers.length) {
      panelModal({
        title: bot.name,
        render: (body) => body.append(el('p', {}, t(
          'You don’t manage any servers to add this bot to yet.',
          'Bu botu ekleyebileceğin, yönettiğin bir sunucu henüz yok.'
        ))),
      });
      return;
    }
    panelModal({
      title: t('Add ' + bot.name, bot.name + ' ekle'),
      render: (body) => {
        const select = el('select', {}, servers.map(s => el('option', { value: s.id }, s.name)));
        body.append(el('div', { class: 'wizard-step' }, [
          el('p', { class: 'muted-text' }, t(
            'Choose a server to add ' + bot.name + ' to:',
            bot.name + ' botunu ekleyeceğin sunucuyu seç:'
          )),
          select,
          el('button', {
            type: 'button', style: 'margin-top:8px',
            on: {
              click: async () => {
                const server = servers.find(s => String(s.id) === select.value);
                await api(`/api/bot-apps/${bot.botAppId}/servers/${server.id}`, { method: 'POST' });
                closeModal();
                if (bot.configSchema && bot.configSchema.length) {
                  await openScriptConfigStep(bot, server);
                } else {
                  panelModal({
                    title: bot.name,
                    render: (body) => body.append(el('p', {}, t(
                      `${bot.name} was added to "${server.name}".`,
                      `${bot.name}, "${server.name}" sunucusuna eklendi.`
                    ))),
                  });
                }
                await loadCommunityGrid();
              },
            },
          }, t('Add', 'Ekle')),
        ]));
      },
    });
  }

  loadGrid();
  loadCommunityGrid();
})();
