const { app, BrowserWindow, Menu, Tray, shell, session, nativeImage, desktopCapturer, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const locale = require('./locale');

// ─── Native-chrome language (tray menu + screen-share picker) ───────────────
// The web view translates itself, but the tray menu and the picker window are
// drawn by Electron, so they need their own copy of the language preference.
//
// The tray is built at startup, before the web view has loaded, so we can't read
// the app's localStorage at that point. Instead the last language the renderer
// reported is cached on disk and used immediately; the renderer then pushes the
// authoritative value (and any later change) over IPC via desktop-preload.js.
let uiLang = null;
function langFile() {
  return path.join(app.getPath('userData'), 'lang.json');
}
function loadLang() {
  try {
    const raw = JSON.parse(fs.readFileSync(langFile(), 'utf8'));
    const v = locale.normalize(raw && raw.lang);
    if (v) return v;
  } catch (e) { /* first run, or unreadable — fall through */ }
  // Cold start: best guess from the OS locale, same spirit as the web app's
  // navigator.language fallback.
  return locale.normalize(app.getLocale()) || locale.DEFAULT;
}
function saveLang(l) {
  try { fs.writeFileSync(langFile(), JSON.stringify({ lang: l })); } catch (e) {}
}
function T(key) { return locale.t(uiLang || locale.DEFAULT, key); }

// The renderer (desktop-preload.js) reports `disdroc_lang` on load and whenever
// it changes, so the tray follows a language picked inside the app.
ipcMain.on('desktop:lang', (_e, reported) => {
  const l = locale.normalize(reported);
  if (!l || l === uiLang) return;
  uiLang = l;
  saveLang(l);
  rebuildTrayMenu();
});

// ─── Game tracker (Rich-presence "Playing X") ───────────────────────────────
let GAMES = {};
try { GAMES = require('./games.json'); } catch (e) { GAMES = {}; }
let currentGame = null;       // { name, since } | null
let gameScanTimer = null;

function listProcessNames(cb) {
  const cmd = process.platform === 'win32' ? 'tasklist /fo csv /nh' : 'ps -eo comm=';
  exec(cmd, { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
    if (err || !stdout) return cb([]);
    let names;
    if (process.platform === 'win32') {
      names = stdout.split(/\r?\n/).map((line) => { const m = line.match(/^"([^"]+)"/); return m ? m[1] : null; });
    } else {
      names = stdout.split(/\r?\n/).map((l) => l.trim().split('/').pop());
    }
    cb(names.filter(Boolean).map((n) => n.toLowerCase().replace(/\.exe$/, '')));
  });
}

function detectGame(names) {
  const set = new Set(names);
  for (const key of Object.keys(GAMES)) {
    if (set.has(key.toLowerCase().replace(/\.exe$/, ''))) return GAMES[key];
  }
  return null;
}

function sendActivity() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('desktop:activity', currentGame); } catch (e) {}
  }
}

function scanGames() {
  listProcessNames((names) => {
    const game = detectGame(names);
    if (game) {
      if (!currentGame || currentGame.name !== game) { currentGame = { name: game, since: Date.now() }; sendActivity(); }
    } else if (currentGame) {
      currentGame = null; sendActivity();
    }
  });
}

ipcMain.on('desktop:activity-ready', () => sendActivity());

// "Check for updates" in the app shells out to the bundled updater exe, which
// lives next to disdroc.exe in the install dir. It runs in its own console window.
ipcMain.handle('updater:run', () => {
  if (process.platform !== 'win32') return { ok: false, error: 'desktop_windows_only' };
  const updater = path.join(path.dirname(app.getPath('exe')), 'disdroc-updater.exe');
  if (!fs.existsSync(updater)) return { ok: false, error: 'updater_not_found' };
  try {
    spawn(updater, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
});

const SERVER_URL = process.env.DISDROC_URL || 'https://disdroc.com';
const ALLOWED_PATHS = ['/app', '/login', '/signup', '/admin'];
// 256px logo for the window/taskbar/tray (the old icon.png was only 64px and
// looked blurry on Windows). The exe's own icon is set at build time via build.win.icon.
const ICON_PATH = path.join(__dirname, 'assets', 'icon-256.png');

let mainWindow = null;
let tray = null;
let isQuitting = false;

function isAllowed(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.origin !== SERVER_URL) return false;
    return ALLOWED_PATHS.some((p) => u.pathname === p || u.pathname.startsWith(p + '/'));
  } catch { return false; }
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// Split out so the menu can be rebuilt in place when the language changes —
// Electron has no way to relabel an existing menu item.
function rebuildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: T('tray.open'), click: showWindow },
    { type: 'separator' },
    { label: T('tray.quit'), click: () => { isQuitting = true; app.quit(); } },
  ]));
}

function createTray() {
  if (tray) return;
  const img = nativeImage.createFromPath(ICON_PATH);
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('disdroc');
  rebuildTrayMenu();
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 720, minHeight: 480,
    backgroundColor: '#0e1015', title: 'disdroc',
    icon: ICON_PATH,
    webPreferences: {
      contextIsolation: true, nodeIntegration: false,
      preload: path.join(__dirname, 'desktop-preload.js'),
    },
  });

  // Start the game scanner once the window exists.
  if (!gameScanTimer) {
    setTimeout(scanGames, 4000);
    gameScanTimer = setInterval(scanGames, 20000);
  }

  const ua = mainWindow.webContents.getUserAgent();
  mainWindow.webContents.setUserAgent(ua + ' disdroc-desktop/0.6.0');

  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(true));

  // Screen sharing: getDisplayMedia() rejects in Electron unless a handler is
  // registered. Show an in-app picker and hand back the chosen source.
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const id = await pickDisplaySource(mainWindow);
      if (!id) return callback(); // cancelled → getDisplayMedia rejects (treated as cancel)
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const source = sources.find((s) => s.id === id);
      callback(source ? { video: source } : undefined);
    } catch {
      callback();
    }
  });

  mainWindow.loadURL(SERVER_URL + '/app');

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowed(url)) {
      event.preventDefault();
      if (url.startsWith(SERVER_URL)) mainWindow.loadURL(SERVER_URL + '/app');
      else shell.openExternal(url);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(SERVER_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// The picker window is local HTML, so it gets its strings from the same table
// the tray uses — handed over synchronously at preload time.
ipcMain.on('picker:strings', (e) => {
  e.returnValue = locale.STRINGS[uiLang || locale.DEFAULT] || locale.STRINGS[locale.DEFAULT];
});

// Returns thumbnails for the picker window (desktopCapturer is main-only).
ipcMain.handle('picker:list', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: false,
  });
  return sources.map((s) => ({ id: s.id, name: s.name, thumb: s.thumbnail.toDataURL() }));
});

// Opens a modal picker and resolves with the chosen source id (or null).
function pickDisplaySource(parent) {
  return new Promise((resolve) => {
    const picker = new BrowserWindow({
      width: 760, height: 560, parent, modal: true, show: false,
      title: T('picker.title'), backgroundColor: '#15151a', autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'picker-preload.js'),
        contextIsolation: true, nodeIntegration: false,
      },
    });
    picker.loadFile(path.join(__dirname, 'picker.html'));
    picker.once('ready-to-show', () => picker.show());

    let settled = false;
    const onChoose = (_e, id) => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener('picker:choose', onChoose);
      if (!picker.isDestroyed()) picker.close();
      resolve(id || null);
    };
    ipcMain.on('picker:choose', onChoose);
    picker.on('closed', () => {
      ipcMain.removeListener('picker:choose', onChoose);
      if (!settled) { settled = true; resolve(null); }
    });
  });
}

Menu.setApplicationMenu(null);
app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(() => {
    // Resolve the cached/OS language before the tray is built so the very first
    // paint is already correct; the renderer refines it a moment later.
    uiLang = loadLang();
    createWindow();
    createTray();
  });
  app.on('before-quit', () => { isQuitting = true; });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else showWindow(); });
}
