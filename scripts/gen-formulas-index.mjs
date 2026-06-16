#!/usr/bin/env node
// Scans src/assets/transformation/formulas/ for sub-directories that contain a
// data.json (i.e. function folders) and writes the sorted list to _index.json so
// the editor sidebar can show every function — including ones missing from tags.json.

import { readdirSync, statSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'transformation', 'formulas');

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

  // Also emit a single combined descriptions file so the transformation home
  // page can fetch ONE file instead of one HTTP request per function (~150).
  const descriptions = {};
  for (const name of entries) {
    try {
      const data = JSON.parse(readFileSync(join(ROOT, name, 'data.json'), 'utf8'));
      if (data && typeof data.description === 'string') {
        descriptions[name] = data.description;
      }
    } catch { /* skip unreadable/invalid data.json */ }
  }
  const descPath = join(ROOT, '_descriptions.json');
  writeFileSync(descPath, JSON.stringify(descriptions) + '\n', 'utf8');
  console.log(`Wrote ${Object.keys(descriptions).length} descriptions to ${descPath}`);
} catch (error) {
  console.error('Failed to generate formulas index:', error && error.message ? error.message : error);
  process.exit(1);
}
