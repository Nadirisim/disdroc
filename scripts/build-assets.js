#!/usr/bin/env node
// Deliberately whitespace/comment/syntax minification ONLY — no identifier
// renaming. app.js is a single monolithic classic <script> (no bundler, no
// module boundaries) with window.disdrocX-style globals; safely mangling
// identifiers would require verifying nothing outside this file references
// an internal name by string, which isn't practical to guarantee here. This
// still cuts real weight (the source is heavily commented) with none of that
// risk. Run via `npm run build`; output is committed/deployed alongside the
// untouched originals, which stay reachable directly for debugging.
'use strict';
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const PUBLIC = path.join(__dirname, '..', 'public');

const jobs = [
  { in: 'js/app.js', out: 'js/app.min.js', loader: 'js' },
  { in: 'js/voicefx.js', out: 'js/voicefx.min.js', loader: 'js' },
  { in: 'css/style.css', out: 'css/style.min.css', loader: 'css' },
];
// Note: voicefx-worklet.js is deliberately NOT minified — it is fetched by path
// from inside voicefx.js via audioWorklet.addModule('/js/voicefx-worklet.js'),
// which is a plain string that no build step rewrites.

for (const job of jobs) {
  const inPath = path.join(PUBLIC, job.in);
  const outPath = path.join(PUBLIC, job.out);
  const result = esbuild.buildSync({
    entryPoints: [inPath],
    outfile: outPath,
    minifyWhitespace: true,
    minifySyntax: true,
    minifyIdentifiers: false,
    bundle: false,
    legalComments: 'none',
    logLevel: 'warning',
  });
  const before = fs.statSync(inPath).size;
  const after = fs.statSync(outPath).size;
  const pct = (100 * (1 - after / before)).toFixed(1);
  console.log(`[build] ${job.in} -> ${job.out}: ${before} -> ${after} bytes (-${pct}%)`);
}
