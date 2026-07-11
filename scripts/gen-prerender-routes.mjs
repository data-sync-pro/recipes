// Enumerates every prerenderable content route from the JSON content under
// src/assets and writes them (one per line) to prerender-routes.txt for the
// Angular builder's "prerender": { "routesFile": ... } option.
//
// URL rules mirror the app's own link builders — keep in sync with:
// - recipes:        src/app/recipe/core/utils/slug.utils.ts (generateSlug),
//                   recipe.constants.ts (categoryToSlug, AGGREGATE_CATEGORIES)
// - transformation: src/app/transformation/utils/route.util.ts (buildRoute, categorySlug)
// - faqs:           src/app/faq/services/faq-url.service.ts (buildAnswerUrl)
// - user-manual:    src/app/setup/setup.component.ts (selectSetup slug-path chain)
//
// The internal editors (/recipes editor, /faq-editor, /transformation/editor)
// are intentionally NOT prerendered.

import { readFileSync, existsSync, writeFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ASSETS = join(ROOT, 'src', 'assets');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// --- shared slug helpers (mirroring app code) -------------------------------

// recipes: slug.utils.ts generateSlug
const kebab = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

// faqs: faq-url.service.ts slug (spaces→hyphen only, then URI-encoded)
const faqSlug = (s) => encodeURIComponent(s.trim().toLowerCase().replace(/\s+/g, '-'));

// transformation: route.util.ts
const snakeCategory = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const buildFunctionRoute = (name) => {
  if (name.toUpperCase() === '$JOINER') return 'joiner';
  return name.toLowerCase().replace(/\s+/g, '_');
};

// --- recipes -----------------------------------------------------------------

function recipeRoutes(log) {
  const routes = ['/recipes'];
  const categoryOrder = readJson(join(ASSETS, 'recipes', 'category-order.json'));
  const index = readJson(join(ASSETS, 'recipes', 'index.json'));

  // category landing pages (+ the aggregate "ui" category from recipe.constants.ts)
  for (const cat of Object.keys(categoryOrder)) routes.push(`/recipes/${kebab(cat)}`);
  routes.push('/recipes/ui');

  // folderId -> slug computed from the recipe title (matches transform.service.ts)
  const slugByFolder = new Map();
  for (const { folderId, active } of index.recipes) {
    if (!active) continue;
    const recipePath = join(ASSETS, 'recipes', folderId, 'recipe.json');
    if (!existsSync(recipePath)) {
      log.push(`recipes: missing recipe.json for active folder "${folderId}"`);
      continue;
    }
    slugByFolder.set(folderId, kebab(readJson(recipePath).title));
  }

  // detail pages: one URL per (category, recipe) pair the app itself links to
  for (const [cat, folderIds] of Object.entries(categoryOrder)) {
    for (const folderId of folderIds) {
      const slug = slugByFolder.get(folderId);
      if (!slug) {
        log.push(`recipes: category-order references unknown/inactive folder "${folderId}" (${cat})`);
        continue;
      }
      routes.push(`/recipes/${kebab(cat)}/${slug}`);
    }
  }
  return routes;
}

// --- user-manual ---------------------------------------------------------------

function userManualRoutes(log) {
  const routes = ['/user-manual'];
  const tree = readJson(join(ASSETS, 'setups', 'index.json'));
  const walk = (nodes, ancestors) => {
    for (const node of nodes) {
      const chain = node.slug ? [...ancestors, node.slug] : ancestors;
      if (node.slug) {
        if (!existsSync(join(ASSETS, 'setups', `${node.slug}.json`))) {
          log.push(`user-manual: nav slug "${node.slug}" has no ${node.slug}.json`);
        } else {
          routes.push(`/user-manual/${chain.join('/')}`);
        }
      }
      if (node.children) walk(node.children, chain);
    }
  };
  walk(tree, []);
  return routes;
}

// --- transformation ------------------------------------------------------------

function transformationRoutes(log) {
  const routes = ['/transformation'];
  const formulasDir = join(ASSETS, 'transformation', 'formulas');
  const tags = readJson(join(formulasDir, 'tags.json'));

  // Special docs served on the single-segment legacy route by DocViewer
  // (see doc-viewer.component.ts + routerLinks in home/doc-viewer templates).
  // global_variables is a top-level JSON file, the other two are folders.
  const specials = new Set(['global_variables', 'joiner', 'aggregate_general']);
  if (existsSync(join(formulasDir, 'global_variables.json'))) routes.push('/transformation/global_variables');
  for (const s of ['joiner', 'aggregate_general']) {
    if (existsSync(join(formulasDir, s, 'data.json'))) routes.push(`/transformation/${s}`);
  }

  const covered = new Set(specials);
  for (const entry of tags) {
    const name = entry['Item Name'];
    const category = entry.Tags && entry.Tags[0];
    if (!category) {
      log.push(`transformation: "${name}" has no tag/category — skipped`);
      continue;
    }
    const fnSlug = buildFunctionRoute(name);
    if (specials.has(fnSlug)) continue; // already emitted on the single-segment route
    if (!existsSync(join(formulasDir, fnSlug, 'data.json'))) {
      log.push(`transformation: tags.json entry "${name}" -> no folder "${fnSlug}"`);
      continue;
    }
    covered.add(fnSlug);
    routes.push(`/transformation/${snakeCategory(category)}/${fnSlug}`);
  }

  // folders with data.json that no tags.json entry points at (canonically unreachable)
  for (const dir of readdirSync(formulasDir, { withFileTypes: true })) {
    if (dir.isDirectory() && !covered.has(dir.name) && existsSync(join(formulasDir, dir.name, 'data.json'))) {
      log.push(`transformation: folder "${dir.name}" not referenced by tags.json — not prerendered`);
    }
  }
  return routes;
}

// --- faqs ------------------------------------------------------------------------

function faqRoutes(log) {
  const routes = ['/faqs'];
  const { faqs } = readJson(join(ASSETS, 'faqs', 'faqs.json'));
  const active = faqs.filter((f) => f.isActive);

  const catPages = new Set();
  const subPages = new Set();
  for (const f of active) {
    const cat = faqSlug(f.category);
    catPages.add(`/faqs/${cat}`);
    const parts = ['/faqs', cat];
    if (f.subCategory) {
      parts.push(faqSlug(f.subCategory));
      subPages.add(parts.join('/'));
    }
    parts.push(f.folderId);
    routes.push(parts.join('/'));
  }
  // insert category/subcategory listing pages ahead of the question pages
  routes.splice(1, 0, ...[...catPages].sort(), ...[...subPages].sort());

  const inactive = faqs.length - active.length;
  if (inactive) log.push(`faqs: ${inactive} inactive FAQs skipped`);
  return routes;
}

// --- main -----------------------------------------------------------------------

const log = [];
const routes = [
  ...recipeRoutes(log),
  ...userManualRoutes(log),
  ...transformationRoutes(log),
  ...faqRoutes(log),
];

const unique = [...new Set(routes)];
if (unique.length !== routes.length) log.push(`deduped ${routes.length - unique.length} duplicate routes`);

const outPath = join(ROOT, 'prerender-routes.txt');
writeFileSync(outPath, unique.join('\n') + '\n', 'utf8');

console.log(`Wrote ${unique.length} prerender routes to ${outPath}`);
const counts = {};
for (const r of unique) {
  const section = r.split('/')[1];
  counts[section] = (counts[section] || 0) + 1;
}
console.log('By section:', counts);
if (log.length) {
  console.log(`\n${log.length} warnings:`);
  for (const w of log) console.log('  -', w);
}
