// One-time migration: restructure FAQ data to recipe-style folders.
//
// Source layout:
//   src/assets/data/faqs.json         (single metadata file)
//   src/assets/faq-item/<slug>.html   (answer HTML)
//   src/assets/image/<slug>/*         (images, referenced as assets/image/<slug>/<file>)
//
// Target layout:
//   src/assets/faqs/index.json
//   src/assets/faqs/<folderId>/faq.json
//   src/assets/faqs/<folderId>/answer.html        (img src rewritten to images/<file>)
//   src/assets/faqs/<folderId>/images/<file>
//
// folderId = Answer__c without ".html" suffix.
//
// Idempotent: removes target dir before writing.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_FAQS_JSON = path.join(ROOT, 'src', 'assets', 'data', 'faqs.json');
const SRC_FAQ_ITEM_DIR = path.join(ROOT, 'src', 'assets', 'faq-item');
const SRC_IMAGE_DIR = path.join(ROOT, 'src', 'assets', 'image');
const DST_FAQS_DIR = path.join(ROOT, 'src', 'assets', 'faqs');

const stats = {
  total: 0,
  succeeded: 0,
  skippedNoAnswer: 0,
  missingHtml: 0,
  missingImages: 0,
  crossFolderImageRefs: 0,
  imagesCopied: 0,
  imagesCopiedFromSameNameFolder: 0,
  filenameCollisions: 0,
};

function rmrf(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// Parse <img src="..."> attributes (single OR double quotes).
// Returns array of { fullMatch, src, start, end }.
function findImgSrcs(html) {
  const results = [];
  const re = /<img\b[^>]*?\bsrc\s*=\s*(["'])([^"']*)\1[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    results.push({
      fullMatch: m[0],
      src: m[2],
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return results;
}

// Rewrite a single <img> tag's src attribute to a new value.
function rewriteImgSrc(imgTag, newSrc) {
  return imgTag.replace(
    /(\bsrc\s*=\s*)(["'])[^"']*\2/i,
    (_full, prefix, quote) => `${prefix}${quote}${newSrc}${quote}`
  );
}

function migrateFaq(record) {
  stats.total++;

  const answerFile = record.Answer__c;
  if (!answerFile || typeof answerFile !== 'string' || !answerFile.trim()) {
    console.warn(`[skip] ${record.Id}: Answer__c is empty`);
    stats.skippedNoAnswer++;
    return null;
  }

  const folderId = answerFile.replace(/\.html$/i, '');
  const targetDir = path.join(DST_FAQS_DIR, folderId);
  const targetImagesDir = path.join(targetDir, 'images');
  ensureDir(targetDir);

  // 1) Build metadata (NOT written per-folder; returned to caller for the
  //    consolidated assets/faqs/faqs.json index).
  const faqMeta = {
    id: record.Id,
    folderId,
    question: record.Question__c ?? '',
    category: record.Category__c ?? '',
    subCategory: record.SubCategory__c ?? '',
    seqNo: record.SeqNo__c ?? null,
    isActive: record.isActive !== false,
  };

  // 2) Read answer HTML
  const htmlSrc = path.join(SRC_FAQ_ITEM_DIR, answerFile);
  if (!fs.existsSync(htmlSrc)) {
    console.warn(`[missing-html] ${folderId}: ${htmlSrc} not found`);
    stats.missingHtml++;
    fs.writeFileSync(path.join(targetDir, 'answer.html'), '', 'utf8');
    return faqMeta;
  }
  let html = fs.readFileSync(htmlSrc, 'utf8');

  // 3) Find all <img src="..."> and process
  const imgs = findImgSrcs(html);
  if (imgs.length === 0) {
    fs.writeFileSync(path.join(targetDir, 'answer.html'), html, 'utf8');
    return faqMeta;
  }

  // copy images + rewrite (process in reverse to preserve offsets)
  const usedFilenames = new Set();
  let imagesCreated = false;

  // First pass: build replacement plan
  const replacements = [];
  for (const img of imgs) {
    const src = img.src.trim();

    // Only rewrite paths that point at the legacy image dir.
    // External (http/https), absolute paths starting with /, or paths
    // already pointing inside assets/faqs/ are passed through unchanged.
    const legacyMatch = src.match(/^(?:\.?\/)?assets\/image\/([^/]+)\/(.+)$/i);
    if (!legacyMatch) {
      continue;
    }
    const imgFolder = legacyMatch[1];
    const imgFile = legacyMatch[2];

    if (imgFolder !== folderId) {
      stats.crossFolderImageRefs++;
      console.warn(
        `[cross-ref] ${folderId}: image references foreign folder ` +
          `assets/image/${imgFolder}/${imgFile}`
      );
    }

    const sourceImgPath = path.join(SRC_IMAGE_DIR, imgFolder, imgFile);
    if (!fs.existsSync(sourceImgPath)) {
      console.warn(`[missing-image] ${folderId}: ${sourceImgPath} not found`);
      stats.missingImages++;
      continue;
    }

    // Determine target filename. If a file with the same basename was
    // already copied from a DIFFERENT source folder, prefix with the source
    // folder name to avoid collisions; identical content is silently reused.
    const baseName = path.basename(imgFile);
    let targetName = baseName;
    if (usedFilenames.has(targetName)) {
      const existing = path.join(targetImagesDir, targetName);
      const sameContent =
        fs.existsSync(existing) &&
        fs.readFileSync(sourceImgPath).equals(fs.readFileSync(existing));
      if (!sameContent) {
        targetName = `${imgFolder}__${baseName}`;
        stats.filenameCollisions++;
      }
    }

    const targetImgPath = path.join(targetImagesDir, targetName);
    if (!imagesCreated) {
      ensureDir(targetImagesDir);
      imagesCreated = true;
    }
    if (!fs.existsSync(targetImgPath)) {
      fs.copyFileSync(sourceImgPath, targetImgPath);
      stats.imagesCopied++;
    }
    usedFilenames.add(targetName);

    const newTag = rewriteImgSrc(img.fullMatch, `images/${targetName}`);
    replacements.push({ start: img.start, end: img.end, newTag });
  }

  // Apply replacements in reverse so offsets stay valid
  replacements.sort((a, b) => b.start - a.start);
  for (const r of replacements) {
    html = html.slice(0, r.start) + r.newTag + html.slice(r.end);
  }

  fs.writeFileSync(path.join(targetDir, 'answer.html'), html, 'utf8');

  // Copy any leftover images from the same-name source folder
  // (assets/image/<folderId>/) into images/, so the FAQ folder owns its full
  // image set even if some files aren't referenced by the answer HTML.
  const sameNameSrcDir = path.join(SRC_IMAGE_DIR, folderId);
  if (fs.existsSync(sameNameSrcDir) && fs.statSync(sameNameSrcDir).isDirectory()) {
    const siblingFiles = fs.readdirSync(sameNameSrcDir);
    for (const file of siblingFiles) {
      const src = path.join(sameNameSrcDir, file);
      if (!fs.statSync(src).isFile()) continue;
      if (usedFilenames.has(file)) continue;
      if (!imagesCreated) {
        ensureDir(targetImagesDir);
        imagesCreated = true;
      }
      const dst = path.join(targetImagesDir, file);
      if (!fs.existsSync(dst)) {
        fs.copyFileSync(src, dst);
        stats.imagesCopied++;
        stats.imagesCopiedFromSameNameFolder++;
      }
      usedFilenames.add(file);
    }
  }

  stats.succeeded++;
  return faqMeta;
}

function main() {
  if (!fs.existsSync(SRC_FAQS_JSON)) {
    console.error(`Source faqs.json not found: ${SRC_FAQS_JSON}`);
    process.exit(1);
  }

  console.log(`[migrate-faqs] reset target ${DST_FAQS_DIR}`);
  rmrf(DST_FAQS_DIR);
  ensureDir(DST_FAQS_DIR);

  const records = JSON.parse(fs.readFileSync(SRC_FAQS_JSON, 'utf8'));
  if (!Array.isArray(records)) {
    console.error('faqs.json root is not an array');
    process.exit(1);
  }

  const allMetas = [];
  for (const record of records) {
    const meta = migrateFaq(record);
    if (meta) {
      allMetas.push(meta);
    }
  }

  // Stable order: by folderId
  allMetas.sort((a, b) => a.folderId.localeCompare(b.folderId));

  const indexPath = path.join(DST_FAQS_DIR, 'faqs.json');
  fs.writeFileSync(
    indexPath,
    JSON.stringify({ faqs: allMetas }, null, 2) + '\n',
    'utf8'
  );

  console.log('\n[migrate-faqs] done.');
  console.log(`  total records:           ${stats.total}`);
  console.log(`  succeeded:               ${stats.succeeded}`);
  console.log(`  skipped (no Answer__c):  ${stats.skippedNoAnswer}`);
  console.log(`  missing html files:      ${stats.missingHtml}`);
  console.log(`  missing image files:     ${stats.missingImages}`);
  console.log(`  cross-folder img refs:   ${stats.crossFolderImageRefs}`);
  console.log(`  images copied:           ${stats.imagesCopied}`);
  console.log(`    of which orphans:      ${stats.imagesCopiedFromSameNameFolder}`);
  console.log(`  filename collisions:     ${stats.filenameCollisions}`);
  console.log(`  index entries:           ${allMetas.length}`);
  console.log(`  index file:              ${indexPath}`);
}

main();
