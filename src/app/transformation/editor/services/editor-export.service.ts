import { Injectable } from '@angular/core';
import JSZip from 'jszip';
import { DocData } from '../../services/docs.service';
import { EditorStateService, isSpecialDoc } from './editor-state.service';
import { ImageCacheService } from './image-cache.service';

const README = [
  'How to apply this export',
  '================================',
  '',
  '1. Copy each `formulas/<name>/` directory in this archive over the matching folder',
  '   under `src/assets/transformation/formulas/` in the repo. data.json is a full replacement;',
  '   any `images/` files inside are new uploads — drop them alongside existing ones.',
  '',
  '2. If `tags.json.patch.json` is present, merge each entry into',
  '   `src/assets/transformation/formulas/tags.json`. Each patch object matches the source schema',
  '   ({"Item Name": ..., "Tags": [...]}). Append new entries; for entries whose',
  '   "Item Name" already exists, replace.',
  '',
  '3. Removed images: if you deleted an image in the editor, the editor cannot',
  '   delete the file on disk for you. Remove unwanted files manually.',
  '',
  '4. Run `npm run build` to verify, then commit.',
].join('\n');

@Injectable()
export class EditorExportService {
  constructor(
    private state: EditorStateService,
    private cache: ImageCacheService
  ) {}

  /**
   * Export a single function. Downloads a plain JSON file when there are no
   * uploaded images for it; otherwise downloads a ZIP with data.json + images/.
   */
  async exportSingle(name: string): Promise<void> {
    const doc = this.state.getDraft(name);
    if (!doc) return;

    // Special top-level files: download as plain JSON with the original filename.
    if (isSpecialDoc(name)) {
      this.downloadBlob(
        new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }),
        `${name}.json`
      );
      return;
    }

    const uploads = this.cache.getAll(name);
    if (uploads.length === 0) {
      this.downloadBlob(
        new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }),
        `${name}.data.json`
      );
      return;
    }

    const zip = new JSZip();
    zip.file('data.json', JSON.stringify(doc, null, 2));
    for (const img of uploads) {
      zip.file(`images/${img.filename}`, img.blob);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    this.downloadBlob(blob, `${name}.zip`);
  }

  /**
   * Export all dirty / new functions plus a tags.json patch. Always a ZIP.
   */
  async exportAll(): Promise<void> {
    const dirtyNames = this.state.getDirtyNames();
    const newMeta = this.state.getNewFunctionsMeta();
    const tagDrafts = this.state.getTagDrafts();

    if (dirtyNames.length === 0 && newMeta.size === 0 && tagDrafts.size === 0) return;

    const zip = new JSZip();
    const formulas = zip.folder('formulas')!;

    for (const name of dirtyNames) {
      const doc = this.state.getDraft(name);
      if (!doc) continue;
      if (isSpecialDoc(name)) {
        // Top-level file like formulas/global_variables.json
        formulas.file(`${name}.json`, JSON.stringify(doc, null, 2));
        continue;
      }
      const dir = formulas.folder(name)!;
      dir.file('data.json', JSON.stringify(doc, null, 2));
      const uploads = this.cache.getAll(name);
      if (uploads.length > 0) {
        const imagesDir = dir.folder('images')!;
        for (const img of uploads) {
          imagesDir.file(img.filename, img.blob);
        }
      }
    }

    // tags.json patch — entries where the user changed tags or created a new function.
    const patch: Array<{ 'Item Name': string; Tags: string[] }> = [];
    const seen = new Set<string>();

    for (const [name] of newMeta) {
      const doc = this.state.getDraft(name);
      const itemName = (doc?.title || name).toUpperCase();
      patch.push({ 'Item Name': itemName, Tags: this.state.getEffectiveTags(name) });
      seen.add(name);
    }

    for (const [name] of tagDrafts) {
      if (seen.has(name)) continue;
      if (!this.state.isTagOverridden(name)) continue;
      const doc = this.state.getDraft(name);
      const itemName = (doc?.title || name).toUpperCase();
      patch.push({ 'Item Name': itemName, Tags: this.state.getEffectiveTags(name) });
      seen.add(name);
    }

    if (patch.length > 0) {
      zip.file('tags.json.patch.json', JSON.stringify(patch, null, 2));
    }

    zip.file('README.txt', README);

    const blob = await zip.generateAsync({ type: 'blob' });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.downloadBlob(blob, `formula-edits-${stamp}.zip`);
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
