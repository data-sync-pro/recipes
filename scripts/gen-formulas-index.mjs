#!/usr/bin/env node
// Scans src/assets/transformation/formulas/ for sub-directories that contain a
// data.json (i.e. function folders) and writes the sorted list to _index.json so
// the editor sidebar can show every function — including ones missing from tags.json.
//
// Also emits _search-index.json: one flat, pre-flattened record per searchable
// thing in the transformation docs (functions, global variables, operators and
// the standalone pages). The sidebar filter reads that single file instead of
// re-deriving an index at runtime from tags.json plus a growing list of one-off
// fetches — which is why global variables and operators were unsearchable.

import { readdirSync, statSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'transformation', 'formulas');

// Pseudo entries in tags.json standing in for the special pages: they carry the
// category tag but have no function page of their own.
const PSEUDO_ITEMS = new Set(['OPERATORS', 'GLOBAL_VARIABLES', 'APEX_CLASS']);

// Mirrors buildRoute() in src/app/transformation/utils/route.util.ts. Slugs that
// don't resolve to a real folder are reported at the end of the run, so drift
// between the two surfaces at build time rather than as a dead search result.
const SPECIAL_SLUGS = { $JOINER: 'joiner' };
const slugOf = (name) =>
  SPECIAL_SLUGS[name.toUpperCase()] ?? name.toLowerCase().replace(/\s+/g, '_');

// Descriptions are authored as HTML. Flatten to plain lowercased text so the
// filter matches prose rather than markup (`<strong>`, `<code>`, …).
const searchable = (...parts) =>
  parts
    .flat()
    .filter((p) => typeof p === 'string')
    .join(' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const readJson = (...segments) => JSON.parse(readFileSync(join(ROOT, ...segments), 'utf8'));

try {
  const entries = readdirSync(ROOT)
    .filter((name) => {
      const dir = join(ROOT, name);
      if (!statSync(dir).isDirectory()) return false;
      return existsSync(join(dir, 'data.json'));
    })
    .sort();

  const outPath = join(ROOT, '_index.json');
  writeFileSync(outPath, JSON.stringify(entries, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${entries.length} function names to ${outPath}`);

  // Parse every data.json once; both the descriptions file and the search index
  // are projections of it.
  const docs = new Map();
  for (const name of entries) {
    try {
      docs.set(name, readJson(name, 'data.json'));
    } catch { /* skip unreadable/invalid data.json */ }
  }

  // A single combined descriptions file so the transformation home page can
  // fetch ONE file instead of one HTTP request per function (~150).
  const descriptions = {};
  for (const [name, data] of docs) {
    if (data && typeof data.description === 'string') {
      descriptions[name] = data.description;
    }
  }
  const descPath = join(ROOT, '_descriptions.json');
  writeFileSync(descPath, JSON.stringify(descriptions) + '\n', 'utf8');
  console.log(`Wrote ${Object.keys(descriptions).length} descriptions to ${descPath}`);

  // ---------------------------------------------------------------------------
  // Search index
  // ---------------------------------------------------------------------------
  // `page: true` marks an entry that lives at /transformation/<route>; the rest
  // are functions, addressed as /transformation/<categorySlug>/<route>. Link
  // assembly stays in the app so route.util.ts remains the single owner of slugs.
  const index = [];
  const linked = new Set();     // folders reachable from the index
  const missingFolders = [];    // tags.json names whose folder doesn't exist

  const add = (entry) => {
    index.push(entry);
    if (entry.route) linked.add(entry.route);
  };

  // Functions, from tags.json (the source of the category tree), enriched with
  // the prose from their own data.json.
  for (const item of readJson('tags.json')) {
    const name = item['Item Name'];
    if (PSEUDO_ITEMS.has(name)) continue;
    const route = slugOf(name);
    if (!docs.has(route)) missingFolders.push(`${name} -> ${route}`);
    const data = docs.get(route);
    add({
      name,
      route,
      tags: item.Tags ?? [],
      keywords: searchable(data?.description, data?.syntax),
    });
  }

  // The three standalone pages, plus Home. Home is the only entry with an empty
  // route (it lives at the transformation root).
  const elements = readJson('elements_of_formula.json');
  add({
    name: 'Home',
    route: '',
    tags: [],
    page: true,
    keywords: searchable(
      'formula',
      elements?.title,
      elements?.description,
      (elements?.elements ?? []).flatMap((el) => [el?.element, el?.description])
    ),
  });

  const globalVariables = readJson('global_variables.json');
  add({
    name: 'Global Variables',
    route: 'global_variables',
    tags: ['Global Variables'],
    page: true,
    keywords: '',
  });

  // Each variable as its own row. A few ($JOINER) have a full page of their own;
  // the rest point at the shared Global Variables table.
  for (const variable of globalVariables?.globalVariables ?? []) {
    const own = variable.variable.replace(/^\$/, '').toLowerCase();
    add({
      name: variable.variable,
      route: docs.has(own) ? own : 'global_variables',
      tags: ['Global Variables'],
      page: true,
      keywords: searchable(variable.description),
    });
  }

  const operators = readJson('operators', 'data.json');
  add({ name: 'Operators', route: 'operators', tags: ['Operators'], page: true, keywords: '' });
  for (const [group, list] of Object.entries(operators?.operators ?? {})) {
    for (const op of list ?? []) {
      add({
        name: `${op.operator} ${op.name}`,
        route: 'operators',
        tags: ['Operators'],
        page: true,
        keywords: searchable(op.operator, op.name, group, op.description),
      });
    }
  }

  const apexClass = readJson('apex_class', 'data.json');
  add({
    name: 'Apex Class',
    route: 'apex_class',
    tags: ['Apex Class'],
    page: true,
    keywords: searchable(apexClass?.description),
  });

  // Documented pages that no other source reaches — e.g. AGGREGATE_GENERAL, which
  // has a full page but no tags.json entry and so appears in neither the sidebar
  // tree nor (before this) the search. Indexed under their legacy one-segment URL.
  // Folder names that aren't plain slugs (parentheses read as Angular's named
  // outlet syntax) are skipped rather than linked to a URL we can't vouch for.
  const unlinkable = entries.filter((name) => !linked.has(name) && !/^[a-z0-9_]+$/.test(name));
  const orphans = entries.filter((name) => !linked.has(name) && /^[a-z0-9_]+$/.test(name));
  for (const name of orphans) {
    const data = docs.get(name);
    add({
      name: data?.title || name,
      route: name,
      tags: [],
      page: true,
      keywords: searchable(data?.description, data?.syntax),
    });
  }

  const searchPath = join(ROOT, '_search-index.json');
  writeFileSync(searchPath, JSON.stringify(index) + '\n', 'utf8');
  console.log(`Wrote ${index.length} entries to ${searchPath}`);

  if (orphans.length) {
    console.warn(`  note: ${orphans.length} page(s) documented but absent from tags.json: ${orphans.join(', ')}`);
  }
  if (unlinkable.length) {
    console.warn(`  note: ${unlinkable.length} page(s) skipped, folder name is not a plain slug: ${unlinkable.join(', ')}`);
  }
  if (missingFolders.length) {
    console.warn(`  warning: ${missingFolders.length} tags.json entr(ies) have no data.json folder: ${missingFolders.join(', ')}`);
  }
} catch (error) {
  console.error('Failed to generate formulas index:', error && error.message ? error.message : error);
  process.exit(1);
}
