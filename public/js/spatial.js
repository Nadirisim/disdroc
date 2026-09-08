/* ────────────────────────────────────────────────────────────────────────────
 * disdroc — Spatial Audio
 * Routes each remote voice peer's WebRTC audio through the Web Audio API so it
 * is positioned around you in a virtual room (binaural / HRTF). Inspired by
 * Discord's Spatial Audio: Line / Arc / Grid / Manual placement + room size,
 * with a draggable room you can rearrange in real time.
 *
 * Loaded after app.js, so it shares its global scope (state, el, modal,
 * avatarEl, userLabel). Exposes window.Spatial; app.js calls into it at the
 * voice lifecycle hooks (attach / detach / setMasterMuted / teardown).
 * ──────────────────────────────────────────────────────────────────────────── */
(function () {
  const LS = {
    on: 'disdroc_spatial_on',
    mode: 'disdroc_spatial_mode',
    room: 'disdroc_spatial_room',
    dist: 'disdroc_spatial_dist',   // placement distance / radius (0.2..1)
    arc: 'disdroc_spatial_arc',     // arc spread in degrees (40..180)
    spread: 'disdroc_spatial_spread', // line width / grid spacing (0.4..2)
    pos: 'disdroc_spatial_pos',     // manual positions, keyed by userId
  };

  // Default tuning, shared by sp() and "Reset to Defaults".
  const DEFAULTS = { mode: 'arc', roomSize: 4, distance: 0.85, arcAngle: 140, spread: 1.6 };

  // state.voice.spatial holds the live audio graph + settings.
  function sp() {
    const v = state.voice;
    if (!v.spatial) {
      let manual = {};
      try { manual = JSON.parse(localStorage.getItem(LS.pos) || '{}') || {}; } catch {}
      v.spatial = {
        enabled: localStorage.getItem(LS.on) === '1',
        mode: localStorage.getItem(LS.mode) || DEFAULTS.mode,   // line | arc | grid | manual
        roomSize: clamp(parseFloat(localStorage.getItem(LS.room)) || DEFAULTS.roomSize, 1, 10),
        distance: clamp(parseFloat(localStorage.getItem(LS.dist)) || DEFAULTS.distance, 0.2, 1),
        arcAngle: clamp(parseFloat(localStorage.getItem(LS.arc)) || DEFAULTS.arcAngle, 40, 180),
        spread: clamp(parseFloat(localStorage.getItem(LS.spread)) || DEFAULTS.spread, 0.4, 2),
        ctx: null, master: null,
        nodes: new Map(),       // socketId -> { source, panner, gain }
        manual,                 // userId -> { x, y } in [-1, 1]
        renderRoom: null,       // set while the panel is open
      };
    }
    return v.spatial;
  }

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function ensureCtx() {
    const s = sp();
    if (s.ctx) return s.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    s.ctx = new AC();
    s.master = s.ctx.createGain();
    s.master.gain.value = state.voice.deafened ? 0 : 1;
    s.master.connect(s.ctx.destination);
    // The listener sits at the origin, facing forward (−Z). Web Audio's default
    // already matches this; set it explicitly for older engines.
    const L = s.ctx.listener;
    if (L.positionX) { L.positionX.value = 0; L.positionY.value = 0; L.positionZ.value = 0; }
    else if (L.setPosition) L.setPosition(0, 0, 0);
    if (L.forwardX) {
      L.forwardX.value = 0; L.forwardY.value = 0; L.forwardZ.value = -1;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else if (L.setOrientation) L.setOrientation(0, 0, -1, 0, 1, 0);
    // Try to follow the chosen output device (Chromium 110+).
    if (state.voice.outDeviceId && s.ctx.setSinkId) s.ctx.setSinkId(state.voice.outDeviceId).catch(() => {});
    return s.ctx;
  }

  function buildNode(socketId, peer) {
    const s = sp();
    if (!s.ctx || !peer || !peer.audio || !peer.audio.srcObject) return;
    if (s.nodes.has(socketId)) return;
    const tracks = peer.audio.srcObject.getAudioTracks();
    if (!tracks.length) return;
    let source;
    try {
      // Build the source from a dedicated MediaStream (not the one bound to the
      // <audio> element). Chromium otherwise often pulls no samples through the
      // graph when the element owns the same remote stream → silent spatial mix.
      const ms = new MediaStream(tracks);
      source = s.ctx.createMediaStreamSource(ms);
      peer._spatialMs = ms;
    } catch (e) { console.warn('[spatial] source', e.message); return; }
    const panner = s.ctx.createPanner();
    panner.panningModel = 'HRTF';        // binaural — best with headphones
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 10000;
    panner.rolloffFactor = 1;
    const gain = s.ctx.createGain();
    gain.gain.value = 1;
    source.connect(panner); panner.connect(gain); gain.connect(s.master);
    s.nodes.set(socketId, { source, panner, gain });
    // The element keeps the WebRTC track alive (Chromium drops audio from a
    // MediaStreamSource otherwise) but must be silent so we don't double-play.
    peer.audio.muted = true;
  }

  function destroyNode(socketId) {
    const s = sp();
    const n = s.nodes.get(socketId);
    if (!n) return;
    try { n.source.disconnect(); n.panner.disconnect(); n.gain.disconnect(); } catch {}
    s.nodes.delete(socketId);
  }

  function setPannerPos(panner, nx, ny) {
    const s = sp();
    // UI plane: x = right, y = front (toward where you're facing).
    // Map to Web Audio world: +x right, front = −z. Scale by room size.
    const k = s.roomSize;
    const x = nx * k, y = 0, z = -ny * k;
    if (panner.positionX) {
      const t = s.ctx.currentTime;
      panner.positionX.setTargetAtTime(x, t, 0.03);
      panner.positionY.setTargetAtTime(y, t, 0.03);
      panner.positionZ.setTargetAtTime(z, t, 0.03);
    } else if (panner.setPosition) panner.setPosition(x, y, z);
  }

  // ── Layout: produce normalized [-1,1] positions for the current peers ──────
  function layoutFor(peers) {
    const s = sp();
    const n = peers.length;
    const out = new Map(); // socketId -> { x, y, userId }
    if (s.mode === 'manual') {
      peers.forEach((p, i) => {
        const saved = s.manual[p.userId];
        out.set(p.socketId, saved
          ? { x: clamp(saved.x, -1, 1), y: clamp(saved.y, -1, 1), userId: p.userId }
          : { ...defaultArc(i, n), userId: p.userId });
      });
      return out;
    }
    peers.forEach((p, i) => {
      let pos;
      if (s.mode === 'line') {
        const w = s.spread;                       // total line width
        const x = n === 1 ? 0 : (i / (n - 1)) * w - w / 2;
        pos = { x, y: s.distance * 0.65 };         // distance pushes the line forward
      } else if (s.mode === 'grid') {
        const cols = Math.ceil(Math.sqrt(n));
        const rows = Math.ceil(n / cols);
        const col = i % cols, row = Math.floor(i / cols);
        const w = s.spread;                        // grid spacing
        const x = cols === 1 ? 0 : (col / (cols - 1)) * w - w / 2;
        const top = s.distance, depth = s.distance * 1.65;
        const y = rows === 1 ? top * 0.25 : top - (row / (rows - 1)) * depth;
        pos = { x, y };
      } else { // arc (default)
        pos = defaultArc(i, n);
      }
      out.set(p.socketId, { ...pos, userId: p.userId });
    });
    return out;
  }

  // Even arc in front of the listener, centred on straight-ahead. Spread = arcAngle.
  function defaultArc(i, n) {
    const s = sp();
    const r = s.distance;
    if (n === 1) return { x: 0, y: r };
    const span = (s.arcAngle * Math.PI) / 180, c = Math.PI / 2; // centre = front
    const a = (c + span / 2) + (-span) * (i / (n - 1));
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }

  function currentPeers() {
    const peers = [];
    for (const [socketId, p] of state.voice.peers) {
      if (p.audio && p.audio.srcObject) peers.push({ socketId, userId: p.userId, peer: p });
    }
    return peers;
  }

  // Recompute positions for everyone + redraw the room if the panel is open.
  function reapply() {
    const s = sp();
    if (!s.enabled || !s.ctx) return;
    const peers = currentPeers();
    const layout = layoutFor(peers);
    for (const [socketId, pos] of layout) {
      const node = s.nodes.get(socketId);
      if (node) setPannerPos(node.panner, pos.x, pos.y);
    }
    if (s.renderRoom) s.renderRoom(layout);
  }

  function saveManual() {
    try { localStorage.setItem(LS.pos, JSON.stringify(sp().manual)); } catch {}
  }

  // ── Public lifecycle hooks (called from app.js) ────────────────────────────
  const Spatial = {
    supported: !!(window.AudioContext || window.webkitAudioContext),

    // A peer's audio track just arrived.
    attach(socketId, peer) {
      const s = sp();
      if (!s.enabled) return;
      if (!ensureCtx()) return;
      s.ctx.resume?.();
      buildNode(socketId, peer);
      reapply();
    },

    // A peer left.
    detach(socketId) {
      const s = sp();
      destroyNode(socketId);
      if (s.enabled) reapply();
    },

    // Is spatial currently on? (used by app.js so it doesn't fight the muting.)
    isEnabled() { return !!(state.voice.spatial && state.voice.spatial.enabled); },

    // Output volume (0..1) applied to the spatial master gain.
    _vol: 1,
    setVolume(v) {
      this._vol = Math.max(0, Math.min(1, v));
      const s = state.voice.spatial;
      if (s && s.master && !state.voice.deafened) s.master.gain.value = this._vol;
    },

    // Deafen toggles the whole spatial mix.
    setMasterMuted(muted) {
      const s = state.voice.spatial;
      if (s && s.ctx && s.ctx.state === 'suspended') s.ctx.resume?.();
      if (s && s.master) s.master.gain.value = muted ? 0 : this._vol;
    },

    // Switch spatial audio on/off live.
    setEnabled(on) {
      const s = sp();
      s.enabled = !!on;
      localStorage.setItem(LS.on, s.enabled ? '1' : '0');
      if (s.enabled) {
        if (!ensureCtx()) { s.enabled = false; localStorage.setItem(LS.on, '0'); return false; }
        s.ctx.resume?.();
        for (const { socketId, peer } of currentPeers()) buildNode(socketId, peer);
        this.setMasterMuted(state.voice.deafened);
        reapply();
      } else {
        for (const socketId of [...s.nodes.keys()]) destroyNode(socketId);
        // Hand playback back to the plain <audio> elements.
        for (const [, p] of state.voice.peers) if (p.audio) p.audio.muted = state.voice.deafened;
      }
      return s.enabled;
    },

    setMode(mode) {
      const s = sp();
      s.mode = mode;
      localStorage.setItem(LS.mode, mode);
      reapply();
    },

    setRoomSize(v) {
      const s = sp();
      s.roomSize = clamp(v, 1, 10);
      localStorage.setItem(LS.room, String(s.roomSize));
      reapply();
    },

    setDistance(v) {
      const s = sp();
      s.distance = clamp(v, 0.2, 1);
      localStorage.setItem(LS.dist, String(s.distance));
      reapply();
    },

    setArcAngle(v) {
      const s = sp();
      s.arcAngle = clamp(v, 40, 180);
      localStorage.setItem(LS.arc, String(s.arcAngle));
      reapply();
    },

    setSpread(v) {
      const s = sp();
      s.spread = clamp(v, 0.4, 2);
      localStorage.setItem(LS.spread, String(s.spread));
      reapply();
    },

    // Restore the factory tuning (clears manual placements too).
    resetDefaults() {
      const s = sp();
      s.mode = DEFAULTS.mode; s.roomSize = DEFAULTS.roomSize;
      s.distance = DEFAULTS.distance; s.arcAngle = DEFAULTS.arcAngle; s.spread = DEFAULTS.spread;
      s.manual = {};
      localStorage.setItem(LS.mode, s.mode);
      localStorage.setItem(LS.room, String(s.roomSize));
      localStorage.setItem(LS.dist, String(s.distance));
      localStorage.setItem(LS.arc, String(s.arcAngle));
      localStorage.setItem(LS.spread, String(s.spread));
      localStorage.removeItem(LS.pos);
      reapply();
    },

    setManualPos(userId, x, y) {
      const s = sp();
      s.manual[userId] = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
      saveManual();
      if (s.mode === 'manual') reapply();
    },

    teardown() {
      const v = state.voice;
      const s = v.spatial;
      if (!s) return;
      for (const socketId of [...s.nodes.keys()]) destroyNode(socketId);
      try { s.ctx && s.ctx.close(); } catch {}
      s.ctx = null; s.master = null; s.renderRoom = null;
    },

    reapply,

    // ── The panel ────────────────────────────────────────────────────────────
    openPanel() {
      const s = sp();
      if (!this.supported) { alert('Spatial audio is not supported in this browser.'); return; }

      const room = el('div', { class: 'spatial-room' });
      const youPuck = el('div', { class: 'spatial-puck you', title: 'You' }, '🎧');
      room.append(youPuck);

      // Re-draw participant pucks from a layout map.
      function renderRoom(layout) {
        // wipe everything except the centred "you" puck
        [...room.querySelectorAll('.spatial-puck:not(.you)')].forEach(n => n.remove());
        const rect = () => room.getBoundingClientRect();
        const lay = layout || layoutFor(currentPeers());
        for (const [socketId, pos] of lay) {
          const peer = state.voice.peers.get(socketId);
          if (!peer) continue;
          const meta = (state.voiceRooms.get(state.voice.channelId) || [])
            .find(p => p.id === peer.userId) || { username: peer.username, id: peer.userId };
          const puck = el('div', { class: 'spatial-puck', dataset: { sid: socketId, uid: peer.userId } }, [
            avatarEl(meta, 'small'),
            el('span', { class: 'puck-name' }, userLabel(meta)),
          ]);
          placePuck(puck, pos.x, pos.y);
          if (s.mode === 'manual') {
            puck.classList.add('draggable');
            enableDrag(puck, socketId, peer.userId);
          }
          room.append(puck);
        }
      }

      function placePuck(puck, nx, ny) {
        // normalized [-1,1] (y up = front) → percentage within the room box
        puck.style.left = ((nx + 1) / 2 * 100) + '%';
        puck.style.top = ((1 - ny) / 2 * 100) + '%';
      }

      function enableDrag(puck, socketId, userId) {
        const onDown = (e) => {
          e.preventDefault();
          puck.setPointerCapture?.(e.pointerId);
          const move = (ev) => {
            const r = room.getBoundingClientRect();
            const nx = clamp(((ev.clientX - r.left) / r.width) * 2 - 1, -1, 1);
            const ny = clamp(1 - ((ev.clientY - r.top) / r.height) * 2, -1, 1);
            placePuck(puck, nx, ny);
            Spatial.setManualPos(userId, nx, ny);
          };
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        };
        puck.addEventListener('pointerdown', onDown);
      }

      // Snapshot of every setting so Cancel can revert the live changes.
      const snap = {
        enabled: s.enabled, mode: s.mode, roomSize: s.roomSize,
        distance: s.distance, arcAngle: s.arcAngle, spread: s.spread,
        manual: JSON.parse(JSON.stringify(s.manual || {})),
      };

      // Mode buttons
      const modes = [['line', 'Line'], ['arc', 'Arc'], ['grid', 'Grid'], ['manual', 'Manual']];
      const modeRow = el('div', { class: 'spatial-modes' });
      function paintModes() {
        [...modeRow.children].forEach(b => b.classList.toggle('active', b.dataset.mode === s.mode));
      }
      for (const [m, label] of modes) {
        modeRow.append(el('button', {
          type: 'button', class: 'ghost', dataset: { mode: m },
          on: { click: () => { Spatial.setMode(m); paintModes(); paintModeFields(); renderRoom(); } },
        }, label));
      }

      // Room size slider
      const sizeVal = el('span', { class: 'spatial-size-val' }, s.roomSize.toFixed(1) + 'm');
      const sizeSlider = el('input', {
        type: 'range', min: '1', max: '10', step: '0.5', value: String(s.roomSize),
        on: { input: (e) => { Spatial.setRoomSize(parseFloat(e.target.value)); sizeVal.textContent = s.roomSize.toFixed(1) + 'm'; } },
      });

      // Distance slider (how far people sit from you) — every auto layout, not manual.
      const distVal = el('span', { class: 'spatial-size-val' }, Math.round(s.distance * 100) + '%');
      const distSlider = el('input', {
        type: 'range', min: '0.2', max: '1', step: '0.05', value: String(s.distance),
        on: { input: (e) => { Spatial.setDistance(parseFloat(e.target.value)); distVal.textContent = Math.round(s.distance * 100) + '%'; renderRoom(); } },
      });
      const distField = el('div', { class: 'spatial-field' }, [el('label', {}, ['Distance', distVal]), distSlider]);

      // Arc angle slider (arc mode only).
      const arcVal = el('span', { class: 'spatial-size-val' }, Math.round(s.arcAngle) + '°');
      const arcSlider = el('input', {
        type: 'range', min: '40', max: '180', step: '5', value: String(s.arcAngle),
        on: { input: (e) => { Spatial.setArcAngle(parseFloat(e.target.value)); arcVal.textContent = Math.round(s.arcAngle) + '°'; renderRoom(); } },
      });
      const arcField = el('div', { class: 'spatial-field' }, [el('label', {}, ['Arc angle', arcVal]), arcSlider]);

      // Spread slider — "Width" for line, "Spacing" for grid.
      const spreadLabel = el('span', {}, 'Width');
      const spreadVal = el('span', { class: 'spatial-size-val' }, s.spread.toFixed(1));
      const spreadSlider = el('input', {
        type: 'range', min: '0.4', max: '2', step: '0.1', value: String(s.spread),
        on: { input: (e) => { Spatial.setSpread(parseFloat(e.target.value)); spreadVal.textContent = s.spread.toFixed(1); renderRoom(); } },
      });
      const spreadField = el('div', { class: 'spatial-field' }, [el('label', {}, [spreadLabel, spreadVal]), spreadSlider]);

      // Show only the slider(s) that apply to the current mode.
      function paintModeFields() {
        const auto = s.mode !== 'manual';
        distField.style.display = auto ? '' : 'none';
        arcField.style.display = s.mode === 'arc' ? '' : 'none';
        spreadField.style.display = (s.mode === 'line' || s.mode === 'grid') ? '' : 'none';
        spreadLabel.textContent = s.mode === 'grid' ? 'Spacing' : 'Width';
      }

      // Enable toggle
      const toggle = el('input', { type: 'checkbox' });
      toggle.checked = s.enabled;
      const body = el('div', { class: 'spatial-body' });
      const controls = el('div', { class: 'spatial-controls' });

      function paintEnabled() {
        body.classList.toggle('disabled', !s.enabled);
        controls.style.opacity = s.enabled ? '1' : '0.5';
        controls.style.pointerEvents = s.enabled ? 'auto' : 'none';
      }
      toggle.addEventListener('change', () => {
        const ok = Spatial.setEnabled(toggle.checked);
        toggle.checked = ok;
        paintEnabled();
        renderRoom();
      });

      controls.append(
        el('div', { class: 'spatial-field' }, [el('label', {}, 'Placement'), modeRow]),
        el('div', { class: 'spatial-field' }, [el('label', {}, ['Room size', sizeVal]), sizeSlider]),
        distField, arcField, spreadField,
        el('p', { class: 'spatial-hint' },
          'Switch to Manual, then drag people around the room. Best with headphones.'),
      );

      body.append(room, controls);

      const content = el('div', { class: 'spatial-panel' }, [
        el('label', { class: 'spatial-enable' }, [toggle, el('span', {}, 'Enable spatial audio')]),
        body,
      ]);

      // Push the current state back into every control (after Reset / on open).
      function syncControls() {
        toggle.checked = s.enabled;
        sizeSlider.value = String(s.roomSize); sizeVal.textContent = s.roomSize.toFixed(1) + 'm';
        distSlider.value = String(s.distance); distVal.textContent = Math.round(s.distance * 100) + '%';
        arcSlider.value = String(s.arcAngle); arcVal.textContent = Math.round(s.arcAngle) + '°';
        spreadSlider.value = String(s.spread); spreadVal.textContent = s.spread.toFixed(1);
        paintModes(); paintModeFields(); paintEnabled();
      }

      syncControls();
      // Live-redraw while the panel is open.
      s.renderRoom = renderRoom;
      renderRoom();

      // Own overlay (NOT the shared modal helper) so closing it removes only this
      // panel and leaves the Settings window underneath intact.
      const root = document.getElementById('modalRoot');
      let overlay;
      const finish = (revert) => {
        if (revert) {
          // Restore the snapshot taken on open.
          s.mode = snap.mode; localStorage.setItem(LS.mode, s.mode);
          s.roomSize = snap.roomSize; localStorage.setItem(LS.room, String(s.roomSize));
          s.distance = snap.distance; localStorage.setItem(LS.dist, String(s.distance));
          s.arcAngle = snap.arcAngle; localStorage.setItem(LS.arc, String(s.arcAngle));
          s.spread = snap.spread; localStorage.setItem(LS.spread, String(s.spread));
          s.manual = JSON.parse(JSON.stringify(snap.manual)); saveManual();
          if (s.enabled !== snap.enabled) Spatial.setEnabled(snap.enabled);
          else reapply();
        }
        s.renderRoom = null;
        window.removeEventListener('keydown', onKey, true);
        overlay.remove();
      };
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(true); } };

      const panelEl = el('div', { class: 'modal spatial-modal' }, [
        el('h3', {}, '🎧 Spatial Audio'),
        content,
        el('div', { class: 'row spatial-actions' }, [
          el('button', { type: 'button', class: 'ghost', on: { click: () => { Spatial.resetDefaults(); syncControls(); renderRoom(); } } }, 'Reset to Defaults'),
          el('button', { type: 'button', class: 'ghost', on: { click: () => finish(true) } }, 'Cancel'),
          el('button', { type: 'button', on: { click: () => finish(false) } }, 'Done'),
        ]),
      ]);
      overlay = el('div', { class: 'modal-bg', on: { click: (e) => { if (e.target === e.currentTarget) finish(true); } } }, panelEl);
      root.append(overlay);
      window.addEventListener('keydown', onKey, true);
    },
  };

  window.Spatial = Spatial;
  // Initialise settings from localStorage up-front so the in-call button and the
  // enable toggle reflect the saved state before the panel is ever opened.
  try { if (typeof state !== 'undefined' && state.voice) sp(); } catch {}
})();
