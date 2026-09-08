// EN/TR strings for the *native* parts of the desktop app — the tray menu and
// the screen-share picker. Everything inside the web view is already translated
// by public/js/i18n.js + public/js/lang.js; this file only covers the chrome
// Electron draws itself, which no browser-side script can reach.
//
// Why a separate table instead of reusing public/js/i18n.js: that file is an
// IIFE written for a browser (it touches document/localStorage/fetch and never
// exports anything), so it can't be require()'d from the Electron main process.
// The *preference* is still shared — see the resolution order below.
//
// Language resolution (implemented in main.js):
//   1. Whatever the web app last reported over IPC. desktop-preload.js reads the
//      very same `disdroc_lang` localStorage key the web app uses, so a language
//      picked anywhere in disdroc drives the tray menu too. Persisted to
//      userData/lang.json so it survives a restart.
//   2. On a cold first run (nothing persisted, web view not loaded yet), the OS
//      locale via app.getLocale().
//   3. English.
'use strict';

const STRINGS = {
  en: {
    'tray.open': 'Open disdroc',
    'tray.quit': 'Quit',
    'picker.title': 'Choose what to share',
    'picker.subtitle': 'Pick a screen or a window to share with your call.',
    'picker.loading': 'Loading sources…',
    'picker.empty': 'No screens or windows available to share.',
    'picker.cancel': 'Cancel',
  },
  tr: {
    'tray.open': 'disdroc’u aç',
    'tray.quit': 'Çıkış',
    'picker.title': 'Ne paylaşacağını seç',
    'picker.subtitle': 'Aramanda paylaşmak için bir ekran veya pencere seç.',
    'picker.loading': 'Kaynaklar yükleniyor…',
    'picker.empty': 'Paylaşılabilecek ekran veya pencere yok.',
    'picker.cancel': 'İptal',
  },
};

const SUPPORTED = Object.keys(STRINGS);
const DEFAULT = 'en';

// Accepts 'tr', 'tr-TR', 'TR', etc. Anything unrecognised falls back to English.
function normalize(tag) {
  if (!tag || typeof tag !== 'string') return null;
  const base = tag.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED.includes(base) ? base : null;
}

function t(lang, key) {
  const dict = STRINGS[normalize(lang) || DEFAULT] || STRINGS[DEFAULT];
  // Missing keys fall back to English rather than showing a raw key, matching
  // how the web-side i18n.js behaves.
  if (dict[key] != null) return dict[key];
  return STRINGS[DEFAULT][key] != null ? STRINGS[DEFAULT][key] : key;
}

module.exports = { STRINGS, SUPPORTED, DEFAULT, normalize, t };
