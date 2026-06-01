#!/usr/bin/env node
// Scans src/assets/transformation/formulas/ for sub-directories that contain a
// data.json (i.e. function folders) and writes the sorted list to _index.json so
// the editor sidebar can show every function — including ones missing from tags.json.

import { readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
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
} catch (error) {
  console.error('Failed to generate formulas index:', error && error.message ? error.message : error);
  process.exit(1);
}
