const { contextBridge, ipcRenderer } = require('electron');

// desktopCapturer.getSources is main-process only since Electron 17, so the
// list (with thumbnails) is fetched in main and handed over via IPC.
// Strings come from desktop/locale.js in the main process, resolved from the
// same `disdroc_lang` preference the web app uses. Fetched synchronously so the
// picker's first paint is already in the right language (no English flash).
let strings = {};
try { strings = ipcRenderer.sendSync('picker:strings') || {}; } catch (e) { strings = {}; }

contextBridge.exposeInMainWorld('picker', {
  list: () => ipcRenderer.invoke('picker:list'),
  choose: (id) => ipcRenderer.send('picker:choose', id),
  cancel: () => ipcRenderer.send('picker:choose', null),
  t: (key) => (strings[key] != null ? strings[key] : key),
});
