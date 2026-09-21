#!/usr/bin/env node
// Static checks that replace a build step: every element id the scripts look
// up must exist in the HTML, every CSS class they set must exist in the CSS,
// and every file the manifest names must be on disk.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const html = read('newtab.html');
const jsFiles = readdirSync(join(root, 'js')).filter((name) => name.endsWith('.js'));
const js = jsFiles.map((name) => ({ name, source: read(`js/${name}`) }));
const css = ['css/base.css', 'css/app.css'].map(read).join('\n');

const problems = [];
const collect = (source, pattern, group = 1) =>
  [...source.matchAll(pattern)].map((match) => match[group]);

/* 1. Element ids -------------------------------------------------- */

const htmlIds = new Set(collect(html, /\sid="([^"]+)"/g));
js.forEach(({ name, source }) => {
  collect(source, /getElementById\(['"]([^'"]+)['"]\)/g).forEach((id) => {
    if (!htmlIds.has(id)) problems.push(`js/${name}: no element with id "${id}" in newtab.html`);
  });
});

/* 2. CSS classes -------------------------------------------------- */

const cssClasses = new Set(collect(css, /\.([a-zA-Z][\w-]*)/g));
const usedClasses = new Set();
js.forEach(({ source }) => {
  collect(source, /class:\s*`?'([^'`]+)'/g).forEach((value) =>
    value.split(/\s+/).filter(Boolean).forEach((cls) => usedClasses.add(cls))
  );
  collect(source, /classList\.(?:add|toggle|remove)\(\s*'([\w-]+)'/g).forEach((cls) =>
    usedClasses.add(cls)
  );
});
collect(html, /\sclass="([^"]+)"/g).forEach((value) =>
  value.split(/\s+/).filter(Boolean).forEach((cls) => usedClasses.add(cls))
);

[...usedClasses]
  .filter((cls) => !cssClasses.has(cls))
  .forEach((cls) => problems.push(`css: class "${cls}" is used but never styled`));

/* 3. Manifest and script references ------------------------------- */

const manifest = JSON.parse(read('manifest.json'));
if (!existsSync(join(root, manifest.chrome_url_overrides.newtab))) {
  problems.push(`manifest: ${manifest.chrome_url_overrides.newtab} is missing`);
}
collect(html, /(?:src|href)="([^":]+)"/g).forEach((path) => {
  if (!existsSync(join(root, path))) problems.push(`newtab.html: ${path} is missing`);
});

/* 4. Imports resolve ---------------------------------------------- */

js.forEach(({ name, source }) => {
  collect(source, /from\s+'(\.\/[^']+)'/g).forEach((path) => {
    if (!existsSync(join(root, 'js', path))) {
      problems.push(`js/${name}: import "${path}" does not resolve`);
    }
  });
});

/* 5. The background worker stays free of the DOM ------------------- */

// A service worker has no document. Whatever it imports, and whatever that
// imports in turn, has to keep away from the page.
const DOM_WORDS = ['document.', 'window.', 'localStorage', 'requestAnimationFrame'];
const workerPath = manifest.background?.service_worker;
if (workerPath) {
  if (!existsSync(join(root, workerPath))) {
    problems.push(`manifest: background worker ${workerPath} is missing`);
  } else {
    const seen = new Set();
    const walk = (path) => {
      if (seen.has(path) || !existsSync(join(root, path))) return;
      seen.add(path);
      const source = read(path);
      const dom = path === workerPath ? null : DOM_WORDS.find((word) => source.includes(word));
      if (dom) problems.push(`${workerPath} reaches ${path}, which uses ${dom}`);
      collect(source, /from\s+'(\.[^']+)'/g).forEach((ref) => {
        const base = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
        walk(join(base, ref).replaceAll('\\', '/'));
      });
    };
    walk(workerPath);
  }
}

/* ----------------------------------------------------------------- */

if (problems.length) {
  console.error(`${problems.length} problem(s) found:\n`);
  problems.forEach((problem) => console.error(`  - ${problem}`));
  process.exit(1);
}
console.log(`OK — ${jsFiles.length} modules, ${htmlIds.size} ids, ${cssClasses.size} CSS classes.`);
