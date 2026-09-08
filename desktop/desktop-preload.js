const { contextBridge, ipcRenderer } = require('electron');

// Bridge between the Electron main process (which can scan running processes)
// and the web app loaded from disdroc.com. The web app calls onActivity()
// to receive { name, since } | null whenever the detected game changes.
contextBridge.exposeInMainWorld('disdrocDesktop', {
  version: '0.6.0',
  onActivity: (cb) => {
    ipcRenderer.on('desktop:activity', (_e, data) => { try { cb(data); } catch (err) {} });
    // Ask main to push the current game right away (a game may already be running).
    ipcRenderer.send('desktop:activity-ready');
  },
  // Launch the bundled checksum updater (Windows). Resolves { ok, error? }.
  checkForUpdates: () => ipcRenderer.invoke('updater:run'),
});

// ─── Language bridge ────────────────────────────────────────────────────────
// The tray menu and screen-share picker are drawn by Electron, so they can't see
// the web app's i18n. A preload script shares the page's localStorage, so we can
// read the very same `disdroc_lang` key public/js/i18n.js and public/js/lang.js
// use and forward it to the main process — no change to the web app required.
(function reportLanguage() {
  let last = null;

  function read() {
    try { return localStorage.getItem('disdroc_lang'); } catch (e) { return null; }
  }

  function push() {
    const v = read();
    if (v && v !== last) { last = v; ipcRenderer.send('desktop:lang', v); }
  }

  push();
  window.addEventListener('DOMContentLoaded', push);
  // lang.js dispatches this on every switch; the SPA writes the key directly, so
  // also catch cross-tab writes and poll as a cheap catch-all for same-document
  // writes that fire no event at all.
  document.addEventListener('langchange', push);
  window.addEventListener('storage', (e) => { if (!e.key || e.key === 'disdroc_lang') push(); });
  setInterval(push, 5000);
})();
