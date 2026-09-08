/* Lightweight EN/TR helper for the static shell pages (login, signup, download,
 * invite, leaving). Shares the `disdroc_lang` key with the rest of the app so a
 * choice made anywhere sticks everywhere.
 *
 * Usage on a page:
 *   - put data-en / data-tr on any element; the value becomes its innerHTML.
 *     (for an attribute instead of text, add data-attr="placeholder" etc.)
 *   - include <script src="/js/lang.js"></script>.
 *   - for JS-generated text, call window.dLang.t('English', 'Türkçe') and
 *     re-render on the 'langchange' event.
 * A small EN/TR toggle is injected automatically (top-right) unless the page
 * already has an element with id="langToggle".
 */
(function () {
  'use strict';
  var KEY = 'disdroc_lang', SET = 'disdroc_lang_userset';

  function ls(get, k, v) {
    try { return get ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch (e) { return null; }
  }

  function initialLang() {
    var s = ls(true, KEY);
    if (s === 'tr' || s === 'en') return s;
    return (navigator.language || '').toLowerCase().indexOf('tr') === 0 ? 'tr' : 'en';
  }

  var lang = initialLang();

  function t(en, tr) { return (lang === 'tr' && tr != null) ? tr : en; }

  function apply(l) {
    if (l !== 'tr') l = 'en';
    lang = l;
    document.documentElement.lang = l;

    var nodes = document.querySelectorAll('[data-en]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.tagName === 'TITLE') continue;
      var v = n.getAttribute('data-' + l);
      if (v == null) continue;
      var attr = n.getAttribute('data-attr');
      if (attr) n.setAttribute(attr, v);
      else n.innerHTML = v;
    }

    var title = document.querySelector('title[data-' + l + ']');
    if (title) document.title = title.getAttribute('data-' + l);

    var segs = document.querySelectorAll('#langToggle [data-lang]');
    for (var j = 0; j < segs.length; j++) {
      segs[j].classList.toggle('on', segs[j].getAttribute('data-lang') === l);
    }

    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: l } }));
  }

  function choose(l) { ls(false, KEY, l); ls(false, SET, '1'); apply(l); }

  window.dLang = { get: function () { return lang; }, t: t, apply: apply, choose: choose };

  function injectToggle() {
    if (document.getElementById('langToggle')) return;
    var css = document.createElement('style');
    css.textContent =
      '#langToggle{position:fixed;top:14px;right:14px;z-index:9999;display:inline-flex;' +
      'border:1px solid var(--border-strong,#3f4147);border-radius:999px;overflow:hidden;' +
      'background:var(--bg-3,#1e1f22);font:700 12px/1 system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.3)}' +
      '#langToggle button{appearance:none;border:0;margin:0;padding:6px 11px;background:transparent;' +
      'color:var(--muted,#949ba4);cursor:pointer;font:inherit;letter-spacing:.04em}' +
      '#langToggle button:hover{color:var(--text,#f2f3f5);background:transparent}' +
      '#langToggle button.on{background:var(--accent,#5865f2);color:#fff}';
    document.head.appendChild(css);

    var wrap = document.createElement('div');
    wrap.id = 'langToggle';
    wrap.setAttribute('aria-label', 'Language / Dil');
    wrap.innerHTML = '<button type="button" data-lang="en">EN</button><button type="button" data-lang="tr">TR</button>';
    document.body.appendChild(wrap);
  }

  function start() {
    injectToggle();
    apply(lang);
    // First visit with no stored choice: refine the guess via geo-IP.
    if (!ls(true, KEY)) {
      fetch('/api/geo').then(function (r) { return r.json(); }).then(function (d) {
        var c = (d && d.country) || '';
        if ((c === 'TR' || c === 'CY') && !ls(true, KEY)) apply('tr');
      }).catch(function () {});
    }
  }

  document.addEventListener('click', function (e) {
    var seg = e.target.closest && e.target.closest('#langToggle [data-lang]');
    if (seg) choose(seg.getAttribute('data-lang'));
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
