// Generate llms.txt (a Markdown index of the whole site) and llms-full.txt (the
// full content export) from the same src/assets JSON that backs the app, and
// write both into the assembled deploy dir (dist/deploy). Runs as a Firebase
// predeploy step after assemble-firebase.mjs.
//
// Slug/URL rules mirror scripts/gen-prerender-routes.mjs and the app's link
// builders — keep them in sync.

import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ASSETS = join(ROOT, 'src', 'assets');
const DEPLOY = join(ROOT, 'dist', 'deploy');
const ORIGIN = 'https://www.datasyncpro.io';

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const kebab = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
const faqSlug = (s) => encodeURIComponent(s.trim().toLowerCase().replace(/\s+/g, '-'));
const snakeCategory = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const fnRoute = (name) => (name.toUpperCase() === '$JOINER' ? 'joiner' : name.toLowerCase().replace(/\s+/g, '_'));
const stripHtml = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const snippet = (s, n = 140) => { const t = stripHtml(s); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; };
const u = (path) => ORIGIN + path;

// ---- Recipes -----------------------------------------------------------------
function recipes() {
  const categoryOrder = readJson(join(ASSETS, 'recipes', 'category-order.json'));
  const items = [];
  for (const [cat, folderIds] of Object.entries(categoryOrder)) {
    for (const folderId of folderIds) {
      const p = join(ASSETS, 'recipes', folderId, 'recipe.json');
      if (!existsSync(p)) continue;
      const r = readJson(p);
      items.push({
        title: r.title,
        url: u(`/recipes/${kebab(cat)}/${kebab(r.title)}`),
        desc: r.overview || r.generalUseCase || '',
        body: [r.overview, r.generalUseCase].filter(Boolean).map(stripHtml).join('\n\n'),
      });
    }
  }
  // de-dupe recipes that appear under multiple categories (first URL wins)
  const seen = new Set();
  return items.filter((i) => (seen.has(i.title) ? false : (seen.add(i.title), true)));
}

// ---- User manual -------------------------------------------------------------
function userManual() {
  const tree = readJson(join(ASSETS, 'setups', 'index.json'));
  const items = [];
  const walk = (nodes, ancestors) => {
    for (const node of nodes) {
      const chain = node.slug ? [...ancestors, node.slug] : ancestors;
      if (node.slug) {
        const p = join(ASSETS, 'setups', `${node.slug}.json`);
        if (existsSync(p)) {
          const doc = readJson(p);
          const text = (doc.blocks || []).filter((b) => typeof b.content === 'string').map((b) => stripHtml(b.content)).join('\n\n');
          items.push({ title: doc.title || node.label, url: u(`/user-manual/${chain.join('/')}`), desc: text, body: text });
        }
      }
      if (node.children) walk(node.children, chain);
    }
  };
  walk(tree, []);
  return items;
}

// ---- Transformation ----------------------------------------------------------
function transformation() {
  const dir = join(ASSETS, 'transformation', 'formulas');
  const tags = readJson(join(dir, 'tags.json'));
  const items = [];
  const push = (name, url) => {
    const p = join(dir, fnRoute(name), 'data.json');
    if (!existsSync(p)) return;
    const d = readJson(p);
    const body = [d.description && stripHtml(d.description), d.syntax && `Syntax: ${d.syntax}`].filter(Boolean).join('\n');
    items.push({ title: d.title || name, url, desc: d.description || '', body });
  };
  const specials = new Set(['global_variables', 'joiner', 'aggregate_general']);
  for (const entry of tags) {
    const name = entry['Item Name'];
    const category = entry.Tags && entry.Tags[0];
    const slug = fnRoute(name);
    if (specials.has(slug) || !category) continue;
    if (existsSync(join(dir, slug, 'data.json'))) push(name, u(`/transformation/${snakeCategory(category)}/${slug}`));
  }
  for (const s of ['joiner', 'aggregate_general']) {
    if (existsSync(join(dir, s, 'data.json'))) push(s, u(`/transformation/${s}`));
  }
  return items;
}

// ---- FAQs --------------------------------------------------------------------
function faqs() {
  const { faqs } = readJson(join(ASSETS, 'faqs', 'faqs.json'));
  const items = [];
  for (const f of faqs.filter((x) => x.isActive)) {
    const cat = faqSlug(f.category);
    const parts = ['/faqs', cat];
    const dirParts = [f.category];
    if (f.subCategory) { parts.push(faqSlug(f.subCategory)); dirParts.push(f.subCategory); }
    parts.push(f.folderId);
    dirParts.push(f.folderId);
    // answer.html lives at faqs/<Category>/(<SubCategory>/)<folderId>/answer.html
    const answerPath = join(ASSETS, 'faqs', ...dirParts.map((x) => x), 'answer.html');
    const answer = existsSync(answerPath) ? stripHtml(readFileSync(answerPath, 'utf8')) : '';
    items.push({ title: f.question, url: u(parts.join('/')), desc: answer, body: answer });
  }
  return items;
}

// ---- Assemble ----------------------------------------------------------------
const sections = [
  { name: 'Recipes', blurb: 'Step-by-step guides for common Salesforce automation and data-processing tasks.', items: recipes() },
  { name: 'User Manual', blurb: 'Product documentation: data model, setup, Apex extensions and REST API.', items: userManual() },
  { name: 'Transformation Formulas', blurb: 'Reference for every transformation formula function, with syntax and examples.', items: transformation() },
  { name: 'FAQs', blurb: 'Frequently asked questions about Data Sync Pro.', items: faqs() },
];

const intro =
  '# Data Sync Pro\n\n' +
  '> Data Sync Pro (DSP) is a Salesforce-native, rules-driven engine for business-process automation, ' +
  'data transformation and data quality. This documentation covers recipes, the user manual, ' +
  'transformation formulas, and FAQs.\n';

// llms.txt — link index with short descriptions
let llms = intro + '\n';
for (const s of sections) {
  llms += `## ${s.name}\n\n${s.blurb}\n\n`;
  for (const it of s.items) {
    const d = snippet(it.desc);
    llms += `- [${it.title}](${it.url})${d ? `: ${d}` : ''}\n`;
  }
  llms += '\n';
}

// llms-full.txt — full content export
let full = intro + '\n';
for (const s of sections) {
  full += `\n# ${s.name}\n\n`;
  for (const it of s.items) {
    full += `## ${it.title}\n\n${it.url}\n\n${it.body || snippet(it.desc, 400)}\n\n`;
  }
}

if (!existsSync(DEPLOY)) {
  console.error(`[llms] deploy dir ${DEPLOY} missing — run assemble-firebase.mjs first.`);
  process.exit(1);
}
writeFileSync(join(DEPLOY, 'llms.txt'), llms, 'utf8');
writeFileSync(join(DEPLOY, 'llms-full.txt'), full, 'utf8');
const total = sections.reduce((n, s) => n + s.items.length, 0);
console.log(`[llms] wrote llms.txt + llms-full.txt (${total} entries: ` + sections.map((s) => `${s.name} ${s.items.length}`).join(', ') + ')');
