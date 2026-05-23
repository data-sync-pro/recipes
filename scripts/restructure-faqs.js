// Restructure FAQ folders from flat `assets/faqs/<folderId>/` layout to
// categorized `assets/faqs/<cat>/<sub?>/<folderId>/` layout based on the
// `category` and `subCategory` fields in faqs.json.
//
// Inactive FAQs end up under `_inactive/<cat>/<sub?>/<folderId>/`.
//
// Slug rule matches faq.component.ts encode() and faq-url.service.ts slug():
//   name.trim().toLowerCase().replace(/\s+/g, '-')
//
// Idempotent: re-running detects already-moved folders and is a no-op.
// Orphan folders not referenced in faqs.json are warned about, not moved.
//
// Usage:
//   node scripts/restructure-faqs.js           # apply moves via `git mv`
//   node scripts/restructure-faqs.js --dry-run # print plan only

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FAQS_DIR = path.join(ROOT, 'src', 'assets', 'faqs');
const FAQS_JSON = path.join(FAQS_DIR, 'faqs.json');
const INACTIVE = '_inactive';

const dryRun = process.argv.includes('--dry-run');

function slug(name) {
  return String(name).trim().toLowerCase().replace(/\s+/g, '-');
}

function targetParts(meta) {
  if (!meta.category || !String(meta.category).trim()) {
    throw new Error(`empty category for entry ${meta.id || meta.folderId}`);
  }
  const cat = slug(meta.category);
  const sub = meta.subCategory && String(meta.subCategory).trim()
    ? slug(meta.subCategory)
    : '';
  const tail = sub ? [cat, sub, meta.folderId] : [cat, meta.folderId];
  return meta.isActive === false ? [INACTIVE, ...tail] : tail;
}

function sourceParts(meta) {
  return meta.isActive === false ? [INACTIVE, meta.folderId] : [meta.folderId];
}

function abs(parts) {
  return path.join(FAQS_DIR, ...parts);
}

function relPosix(parts) {
  return parts.join('/');
}

function gitMv(srcAbs, dstAbs) {
  fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
  const srcRepoRel = path.relative(ROOT, srcAbs).replace(/\\/g, '/');
  const dstRepoRel = path.relative(ROOT, dstAbs).replace(/\\/g, '/');
  execSync(`git mv "${srcRepoRel}" "${dstRepoRel}"`, { cwd: ROOT, stdio: 'pipe' });
}

function detectOrphans(parent, allowedNames) {
  if (!fs.existsSync(parent)) return [];
  return fs.readdirSync(parent).filter(name => {
    if (allowedNames.has(name)) return false;
    const full = path.join(parent, name);
    try {
      return fs.statSync(full).isDirectory();
    } catch {
      return false;
    }
  });
}

function main() {
  if (!fs.existsSync(FAQS_JSON)) {
    console.error(`faqs.json not found: ${FAQS_JSON}`);
    process.exit(1);
  }

  const idx = JSON.parse(fs.readFileSync(FAQS_JSON, 'utf8'));
  const entries = Array.isArray(idx?.faqs) ? idx.faqs : [];
  if (entries.length === 0) {
    console.error('faqs.json has no entries');
    process.exit(1);
  }

  console.log(`[restructure-faqs] ${dryRun ? 'DRY-RUN ' : ''}entries: ${entries.length}`);

  const stats = {
    total: entries.length,
    planned: 0,
    moved: 0,
    alreadyMigrated: 0,
    missing: 0,
    conflict: 0,
    errors: 0,
  };

  for (const meta of entries) {
    try {
      const src = sourceParts(meta);
      const dst = targetParts(meta);
      const srcAbs = abs(src);
      const dstAbs = abs(dst);

      if (path.normalize(srcAbs) === path.normalize(dstAbs)) {
        stats.alreadyMigrated++;
        continue;
      }

      const srcExists = fs.existsSync(srcAbs);
      const dstExists = fs.existsSync(dstAbs);

      if (!srcExists && dstExists) {
        stats.alreadyMigrated++;
        continue;
      }
      if (srcExists && dstExists) {
        console.error(`[conflict] both exist: ${relPosix(src)} AND ${relPosix(dst)}`);
        stats.conflict++;
        continue;
      }
      if (!srcExists && !dstExists) {
        console.warn(`[missing] ${meta.folderId}: neither ${relPosix(src)} nor ${relPosix(dst)} exists`);
        stats.missing++;
        continue;
      }

      stats.planned++;
      if (dryRun) {
        console.log(`[plan] git mv "${relPosix(src)}" "${relPosix(dst)}"`);
      } else {
        gitMv(srcAbs, dstAbs);
        stats.moved++;
      }
    } catch (e) {
      console.error(`[error] ${meta.folderId || meta.id}: ${e.message}`);
      stats.errors++;
    }
  }

  // Orphan detection. A directory is "allowed" at the top level if it is:
  // - a known active folderId (pre-migration state)
  // - a category slug (post-migration state)
  // - the literal _inactive/ folder
  // Same for _inactive/, minus the _inactive entry itself.
  const activeFolderIds = new Set(
    entries.filter(m => m.isActive !== false).map(m => m.folderId)
  );
  const inactiveFolderIds = new Set(
    entries.filter(m => m.isActive === false).map(m => m.folderId)
  );
  const categorySlugs = new Set(entries.map(m => slug(m.category)));

  const allowedTop = new Set([...activeFolderIds, ...categorySlugs, INACTIVE, 'faqs.json']);
  const allowedInactive = new Set([...inactiveFolderIds, ...categorySlugs]);

  const orphansActive = detectOrphans(FAQS_DIR, allowedTop);
  const orphansInactive = detectOrphans(path.join(FAQS_DIR, INACTIVE), allowedInactive);

  if (orphansActive.length > 0) {
    console.warn(`\n[orphans] ${orphansActive.length} top-level folder(s) not in faqs.json (NOT moved):`);
    for (const n of orphansActive) console.warn(`  - ${n}`);
  }
  if (orphansInactive.length > 0) {
    console.warn(`\n[orphans-inactive] ${orphansInactive.length} folder(s) under _inactive/ not in faqs.json (NOT moved):`);
    for (const n of orphansInactive) console.warn(`  - ${n}`);
  }

  console.log('\n[restructure-faqs] summary:');
  console.log(`  total entries:        ${stats.total}`);
  console.log(`  planned:              ${stats.planned}`);
  console.log(`  moved:                ${stats.moved}`);
  console.log(`  already migrated:    ${stats.alreadyMigrated}`);
  console.log(`  missing source:       ${stats.missing}`);
  console.log(`  conflict (both):      ${stats.conflict}`);
  console.log(`  errors:               ${stats.errors}`);
  console.log(`  orphan active:        ${orphansActive.length}`);
  console.log(`  orphan inactive:      ${orphansInactive.length}`);

  if (stats.conflict > 0 || stats.errors > 0) {
    process.exit(1);
  }
}

main();
