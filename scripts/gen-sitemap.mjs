// Generate a full sitemap.xml covering every prerendered content route plus the
// static marketing/legal pages, and write it into the assembled deploy dir
// (dist/deploy), overriding the small hand-maintained homepage/sitemap.xml.
//
// Runs as a Firebase predeploy step AFTER assemble-firebase.mjs, so it reads the
// generated prerender-routes.txt (produced by gen-prerender-routes.mjs during the
// build) and writes over dist/deploy/sitemap.xml.

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ORIGIN = 'https://www.datasyncpro.io';
const DEPLOY = join(ROOT, 'dist', 'deploy');
const ROUTES_FILE = join(ROOT, 'prerender-routes.txt');

// lastmod: prefer the build's deployTime, fall back to today (date only).
let lastmod = new Date().toISOString().slice(0, 10);
const versionFile = join(ROOT, 'src', 'assets', 'data', 'version.json');
if (existsSync(versionFile)) {
  const t = JSON.parse(readFileSync(versionFile, 'utf8')).deployTime;
  if (t) lastmod = String(t).slice(0, 10);
}

// Static, server-rendered marketing/legal pages (mirror the previous sitemap).
const staticPages = [
  { loc: '/', priority: '1.0', changefreq: 'weekly' },
  { loc: '/naming-conventions', priority: '0.6', changefreq: 'monthly' },
  { loc: '/license-explained.html', priority: '0.5', changefreq: 'yearly' },
  { loc: '/privacy.html', priority: '0.3', changefreq: 'yearly' },
  { loc: '/support-policy.html', priority: '0.3', changefreq: 'yearly' },
];

if (!existsSync(ROUTES_FILE)) {
  console.error(`[sitemap] ${ROUTES_FILE} missing — run the build first.`);
  process.exit(1);
}

const routes = readFileSync(ROUTES_FILE, 'utf8')
  .split(/\r?\n/)
  .map((r) => r.trim())
  .filter(Boolean);

// Section landing pages rank slightly higher than individual detail pages.
const isSection = (r) => ['/recipes', '/faqs', '/transformation', '/user-manual'].includes(r);
const contentUrls = routes.map((loc) => ({
  loc,
  priority: isSection(loc) ? '0.8' : '0.6',
  changefreq: 'weekly',
}));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const urlXml = ({ loc, priority, changefreq }) =>
  `  <url>\n    <loc>${esc(ORIGIN + loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n` +
  `    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;

const all = [...staticPages, ...contentUrls];
const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  all.map(urlXml).join('\n') +
  `\n</urlset>\n`;

if (!existsSync(DEPLOY)) {
  console.error(`[sitemap] deploy dir ${DEPLOY} missing — run assemble-firebase.mjs first.`);
  process.exit(1);
}
const outPath = join(DEPLOY, 'sitemap.xml');
writeFileSync(outPath, xml, 'utf8');
console.log(`[sitemap] wrote ${all.length} URLs to ${outPath} (${contentUrls.length} content + ${staticPages.length} static)`);
