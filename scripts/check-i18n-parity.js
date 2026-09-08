#!/usr/bin/env node
// Guards against the exact bug class fixed in the 2026-07 localization pass:
// a string added to EN but never mirrored into TR (or vice versa) silently
// falls back to English at runtime — no error, just an untranslated string
// a Turkish user eventually reports. Run via `npm run check-i18n`.
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'public', 'js', 'i18n.js');
const src = fs.readFileSync(FILE, 'utf8');

function block(name) {
  const start = src.indexOf(`const ${name} = {`);
  if (start === -1) throw new Error(`could not find "const ${name} = {" in ${FILE}`);
  const openBrace = src.indexOf('{', start);
  let depth = 0, i = openBrace;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(openBrace, i + 1);
}

function keysOf(objSrc) {
  const keys = new Set();
  const re = /^\s*'([^']+)':/gm;
  let m;
  while ((m = re.exec(objSrc))) keys.add(m[1]);
  return keys;
}

const enKeys = keysOf(block('EN'));
const trKeys = keysOf(block('TR'));

const missingInTR = [...enKeys].filter((k) => !trKeys.has(k)).sort();
const missingInEN = [...trKeys].filter((k) => !enKeys.has(k)).sort();

if (!missingInTR.length && !missingInEN.length) {
  console.log(`[i18n] OK — EN and TR both have ${enKeys.size} keys, no drift.`);
  process.exit(0);
}

if (missingInTR.length) {
  console.error(`[i18n] ${missingInTR.length} key(s) in EN missing from TR:`);
  for (const k of missingInTR) console.error('  - ' + k);
}
if (missingInEN.length) {
  console.error(`[i18n] ${missingInEN.length} key(s) in TR missing from EN:`);
  for (const k of missingInEN) console.error('  - ' + k);
}
process.exit(1);
