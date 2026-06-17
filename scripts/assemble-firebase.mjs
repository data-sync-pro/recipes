// Assemble the Firebase Hosting deploy directory.
//
// Layout produced in dist/deploy:
//   /index.html            marketing homepage (root landing page)
//   /privacy.html, /msa.pdf, /partnership/...   homepage static pages
//   /app.html              Angular SPA shell (firebase.json rewrites point app routes here)
//   /main.<hash>.js, /assets/...                Angular build output at root (baseHref "/")
//
// The Angular app and the homepage both expect "/index.html"; only one file can
// win, and the homepage owns the root. So the Angular index is renamed to
// app.html and served via path-scoped rewrites (/recipes, /faq, /transformation,
// /setup). Run "npm run build:firebase" first to produce dist/website.

import { existsSync, rmSync, mkdirSync, cpSync, renameSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const NG_OUT = join(ROOT, 'dist', 'website');
const DEPLOY = join(ROOT, 'dist', 'deploy');
const HOMEPAGE = join(ROOT, 'homepage');

// Homepage entries kept out of the public deploy.
const HOMEPAGE_EXCLUDE = new Set(['internal']);

if (!existsSync(NG_OUT)) {
  console.error(`[assemble] Angular build missing at ${NG_OUT} — run "npm run build:firebase" first.`);
  process.exit(1);
}
if (!existsSync(HOMEPAGE)) {
  console.error(`[assemble] Homepage source missing at ${HOMEPAGE}.`);
  process.exit(1);
}

// Fresh output dir
rmSync(DEPLOY, { recursive: true, force: true });
mkdirSync(DEPLOY, { recursive: true });

// 1) Angular build at root
cpSync(NG_OUT, DEPLOY, { recursive: true });

// 2) Free up /index.html for the homepage; the SPA shell becomes /app.html
renameSync(join(DEPLOY, 'index.html'), join(DEPLOY, 'app.html'));

// 3) Collision guard: warn if a homepage file would overwrite Angular output
const listFiles = (dir, base = dir) =>
  readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? listFiles(p, base) : [p.slice(base.length + 1).replace(/\\/g, '/')];
  });
const deployFiles = new Set(listFiles(DEPLOY));
const clashes = listFiles(HOMEPAGE).filter((rel) => !rel.startsWith('internal/') && deployFiles.has(rel));
if (clashes.length) {
  console.warn('[assemble] WARNING: homepage files overwrite Angular build output:\n  ' + clashes.join('\n  '));
}

// 4) Overlay the marketing homepage at root (excluding internal-only pages)
for (const entry of readdirSync(HOMEPAGE)) {
  if (HOMEPAGE_EXCLUDE.has(entry)) continue;
  cpSync(join(HOMEPAGE, entry), join(DEPLOY, entry), { recursive: true });
}

console.log(`[assemble] dist/deploy ready (${deployFiles.size} app files + homepage overlay).`);
