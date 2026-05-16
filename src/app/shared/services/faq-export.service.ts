import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FAQStorageService, EditedFAQ } from './faq-storage.service';
import { FAQService } from './faq.service';
import { FAQItem, FAQMetadata } from '../models/faq.model';
import { firstValueFrom } from 'rxjs';
import JSZip from 'jszip';

// One row in `ExportData.faqs` — same shape as one entry in
// `assets/faqs/faqs.json` (FAQMetadata already carries folderId).
export type ExportFAQEntry = FAQMetadata;

export interface ExportData {
  metadata: {
    exportDate: string;
    version: string;
    itemCount: number;
    editedCount: number;
  };
  faqs: ExportFAQEntry[];
  // HTML content keyed by folderId (one entry per FAQ).
  htmlContent: { [folderId: string]: string };
}

export interface ExportProgress {
  step: string;
  current: number;
  total: number;
  percentage: number;
}

@Injectable({
  providedIn: 'root'
})
export class FAQExportService {
  private readonly EXPORT_VERSION = '1.0.0';

  constructor(
    private http: HttpClient,
    private storageService: FAQStorageService,
    private faqService: FAQService
  ) {}

  /**
   * Build a folderId -> relative-folder-path map from the export's metadata.
   * Returns "<cat>/<sub?>/<id>" (or the _inactive/ variant) so the ZIP layout
   * mirrors the on-disk layout produced by FAQService.
   */
  private buildRelPathMap(metas: FAQMetadata[]): Map<string, string> {
    const m = new Map<string, string>();
    for (const meta of metas) {
      if (!meta?.folderId) continue;
      m.set(meta.folderId, this.faqService.buildRelPathFor(meta));
    }
    return m;
  }

  private relPathOf(folderId: string, relPathMap: Map<string, string>): string {
    return relPathMap.get(folderId) ?? folderId;
  }

  /**
   * Extract absolute image asset paths from a FAQ's HTML. Both relative
   * (e.g. "images/foo.jpg") and absolute ("assets/faqs/<folderId>/images/foo.jpg")
   * forms are supported; the relative form is resolved against the owning FAQ's folder.
   */
  private extractImageReferencesFromHTML(
    htmlContent: { [folderId: string]: string },
    relPathMap: Map<string, string>
  ): Set<string> {
    const imageRefs = new Set<string>();

    // Match src/href values; capture the raw value to inspect.
    const attrRegex = /(?:src|href)\s*=\s*['"]([^'"]+)['"]/gi;

    for (const [folderId, content] of Object.entries(htmlContent)) {
      const rel = this.relPathOf(folderId, relPathMap);
      let match;
      while ((match = attrRegex.exec(content)) !== null) {
        const raw = match[1];
        if (/^https?:\/\//i.test(raw) || raw.startsWith('//')) {
          continue; // external URL
        }
        if (raw.startsWith('assets/faqs/') && raw.includes('/images/')) {
          imageRefs.add(raw);
        } else if (raw.startsWith('images/')) {
          imageRefs.add(`assets/faqs/${rel}/${raw}`);
        }
      }
    }

    return imageRefs;
  }

  /**
   * Fetch original image from assets folder
   */
  private async fetchOriginalImage(imagePath: string): Promise<File | null> {
    try {
      const response = await firstValueFrom(this.http.get(imagePath, { responseType: 'blob' }));

      // Extract filename from path
      const filename = imagePath.split('/').pop() || 'image';

      // Convert blob to File object
      const file = new File([response], filename, {
        type: response.type || 'image/jpeg'
      });

      return file;
    } catch (error) {
      console.warn(`Failed to fetch original image ${imagePath}:`, error);
      return null;
    }
  }

  /**
   * Fetch all images referenced in HTML content.
   * Map keys are absolute asset paths (assets/faqs/<folderId>/images/<file>).
   */
  private async fetchAllOriginalImages(
    htmlContent: { [folderId: string]: string },
    relPathMap: Map<string, string>
  ): Promise<Map<string, File>> {
    const imageRefs = this.extractImageReferencesFromHTML(htmlContent, relPathMap);
    const originalImages = new Map<string, File>();

    for (const imagePath of imageRefs) {
      const imageFile = await this.fetchOriginalImage(imagePath);
      if (imageFile) {
        originalImages.set(imagePath, imageFile);
      }
    }

    return originalImages;
  }

  /**
   * Build an ExportData covering every FAQ in `allFAQs` plus any newly-created
   * FAQs from local storage. For existing FAQs, edited HTML overrides the
   * on-disk `answer.html`; un-edited ones are fetched from disk.
   */
  async exportAll(allFAQs: FAQItem[]): Promise<ExportData> {
    const editedFAQs = await this.storageService.exportEdits();
    const { newFAQs, editedExistingFAQs } = this.separateNewAndEditedFAQs(editedFAQs, allFAQs);
    const mergedFAQs = this.mergeFAQData(allFAQs, editedExistingFAQs, newFAQs);

    const editedMap = new Map<string, EditedFAQ>();
    editedExistingFAQs.forEach(e => editedMap.set(e.faqId, e));

    const htmlContent: { [folderId: string]: string } = {};

    for (const faq of allFAQs) {
      const edited = editedMap.get(faq.id);
      if (edited) {
        const cleaned = this.cleanHTMLContent(edited.answer);
        htmlContent[faq.folderId] = this.decodeHTMLEntities(cleaned);
      } else {
        const url = this.faqService.getAnswerHtmlUrl(faq.folderId);
        try {
          const html = await firstValueFrom(this.http.get(url, { responseType: 'text' }));
          htmlContent[faq.folderId] = html;
        } catch (err) {
          console.warn(`exportAll: failed to load ${url}`, err);
        }
      }
    }

    newFAQs.forEach(faq => {
      const folderId = this.generateFolderIdForNewFAQ(faq);
      const cleaned = this.cleanHTMLContent(faq.answer);
      htmlContent[folderId] = this.decodeHTMLEntities(cleaned);
    });

    return {
      metadata: {
        exportDate: new Date().toISOString(),
        version: this.EXPORT_VERSION,
        itemCount: allFAQs.length + newFAQs.length,
        editedCount: editedExistingFAQs.length + newFAQs.length
      },
      faqs: mergedFAQs,
      htmlContent
    };
  }

  async exportAllEdits(): Promise<ExportData> {
    const editedFAQs = await this.storageService.exportEdits();
    const allFAQs = this.faqService.getAllFAQs();

    // Separate new FAQs from edited ones
    const { newFAQs, editedExistingFAQs } = this.separateNewAndEditedFAQs(editedFAQs, allFAQs);

    // Merge edited FAQs with original data
    const mergedFAQs = this.mergeFAQData(allFAQs, editedExistingFAQs, newFAQs);

    // Prepare HTML content map keyed by folderId
    const htmlContent: { [folderId: string]: string } = {};

    // Add HTML content for edited existing FAQs
    editedExistingFAQs.forEach(faq => {
      const folderId = this.getFolderId(faq.faqId);
      if (folderId) {
        const cleanedContent = this.cleanHTMLContent(faq.answer);
        htmlContent[folderId] = this.decodeHTMLEntities(cleanedContent);
      }
    });

    // Add HTML content for new FAQs
    newFAQs.forEach(faq => {
      const folderId = this.generateFolderIdForNewFAQ(faq);
      const cleanedContent = this.cleanHTMLContent(faq.answer);
      htmlContent[folderId] = this.decodeHTMLEntities(cleanedContent);
    });

    const totalItemCount = allFAQs.length + newFAQs.length;
    const totalEditedCount = editedExistingFAQs.length + newFAQs.length;

    const exportData: ExportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        version: this.EXPORT_VERSION,
        itemCount: totalItemCount,
        editedCount: totalEditedCount
      },
      faqs: mergedFAQs,
      htmlContent: htmlContent
    };

    return exportData;
  }

  private mergeFAQData(
    originalFAQs: FAQItem[],
    editedFAQs: EditedFAQ[],
    newFAQs: EditedFAQ[]
  ): ExportFAQEntry[] {
    const editedMap = new Map<string, EditedFAQ>();
    editedFAQs.forEach(faq => {
      editedMap.set(faq.faqId, faq);
    });

    // Process existing FAQs (original + edited)
    const existingFAQsData: ExportFAQEntry[] = originalFAQs.map(faq => {
      const edited = editedMap.get(faq.id);
      const base: ExportFAQEntry = {
        folderId: faq.folderId,
        id: faq.id,
        category: edited ? edited.category : faq.category,
        subCategory: edited ? (edited.subCategory ?? null) : (faq.subCategory ?? null),
        seqNo: faq.seqNo ?? null,
        question: edited ? edited.question : faq.question,
        isActive: edited ? edited.isActive !== false : faq.isActive !== false
      };
      return base;
    });

    // Process new FAQs (folderId derived from sanitized question)
    const newFAQsData: ExportFAQEntry[] = newFAQs.map(faq => {
      const folderId = this.generateFolderIdForNewFAQ(faq);
      return {
        folderId,
        id: faq.faqId,
        category: faq.category,
        subCategory: faq.subCategory ?? null,
        seqNo: null,
        question: faq.question,
        isActive: faq.isActive !== false
      };
    });

    return [...existingFAQsData, ...newFAQsData];
  }

  private getFolderId(faqId: string): string | null {
    const faq = this.faqService.getAllFAQs().find(f => f.id === faqId);
    return faq?.folderId || null;
  }

  private separateNewAndEditedFAQs(editedFAQs: EditedFAQ[], originalFAQs: FAQItem[]): { newFAQs: EditedFAQ[], editedExistingFAQs: EditedFAQ[] } {
    const originalFAQIds = new Set(originalFAQs.map(f => f.id));

    const newFAQs: EditedFAQ[] = [];
    const editedExistingFAQs: EditedFAQ[] = [];

    editedFAQs.forEach(faq => {
      if (originalFAQIds.has(faq.faqId)) {
        editedExistingFAQs.push(faq);
      } else {
        newFAQs.push(faq);
      }
    });

    return { newFAQs, editedExistingFAQs };
  }

  private generateFolderIdForNewFAQ(faq: EditedFAQ): string {
    // Generate a folder id based on the question, sanitized for file system
    const sanitizedQuestion = faq.question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .substring(0, 50); // Limit length

    // Use timestamp to ensure uniqueness
    const timestamp = new Date(faq.timestamp).toISOString().slice(0, 10);

    return `new-faq-${sanitizedQuestion}-${timestamp}`;
  }

  downloadAsJSON(data: ExportData): void {
    // Normalize text content before export
    const normalizedData = this.normalizeExportData(data);
    const jsonStr = JSON.stringify(normalizedData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    this.downloadFile(blob, `faq-export-${Date.now()}.json`);
  }

  /**
   * Download the consolidated FAQ metadata as JSON. Same shape as
   * `assets/faqs/faqs.json`: { faqs: FAQMetadata[] }.
   */
  downloadFAQsJSON(data: ExportData): void {
    const normalizedData = this.normalizeExportData(data);
    const payload = { faqs: normalizedData.faqs };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    this.downloadFile(blob, 'faqs.json');
  }

  downloadHTMLFiles(data: ExportData): void {
    Object.entries(data.htmlContent).forEach(([folderId, content]) => {
      const normalizedContent = this.normalizeTextContent(content);
      const cleanedContent = this.cleanHTMLContent(normalizedContent);
      const blob = new Blob([cleanedContent], { type: 'text/html;charset=utf-8' });
      this.downloadFile(blob, `${folderId}-answer.html`);
    });
  }

  /**
   * Build a ZIP that mirrors `src/assets/faqs/`:
   *   faqs/
   *     faqs.json                  ← consolidated metadata for all FAQs
   *     <folderId>/
   *       answer.html
   *       images/<filename>
   *   UPDATE_INSTRUCTIONS.txt
   *   export-metadata.json
   *
   * `tempImages` keys are absolute asset paths
   * (assets/faqs/<folderId>/images/<file>); we transcribe them under faqs/ in the ZIP.
   */
  async downloadAsZip(data: ExportData, progressCallback?: (progress: ExportProgress) => void, tempImages?: Map<string, File>): Promise<void> {
    const zip = new JSZip();

    // Normalize data before creating ZIP
    const normalizedData = this.normalizeExportData(data);
    const relPathMap = this.buildRelPathMap(normalizedData.faqs);

    // Get all images already referenced in HTML content
    const originalImages = await this.fetchAllOriginalImages(normalizedData.htmlContent, relPathMap);

    const tempImageCount = tempImages ? tempImages.size : 0;
    const originalImageCount = originalImages.size;
    // 1 faqs.json + per-FAQ answer.html + instructions + metadata + images
    const totalItems =
      1 +
      Object.keys(normalizedData.htmlContent).length +
      2 +
      tempImageCount +
      originalImageCount;
    let currentItem = 0;

    const updateProgress = (step: string) => {
      currentItem++;
      if (progressCallback) {
        progressCallback({
          step,
          current: currentItem,
          total: totalItems,
          percentage: Math.round((currentItem / totalItems) * 100)
        });
      }
    };

    try {
      // Consolidated metadata file: faqs/faqs.json
      const indexPayload = { faqs: normalizedData.faqs };
      zip.file('faqs/faqs.json', JSON.stringify(indexPayload, null, 2) + '\n');
      updateProgress('Adding faqs.json');

      // Per-FAQ answer.html (no per-folder faq.json anymore — metadata lives
      // in the top-level faqs.json above). Inactive FAQs land under faqs/_inactive/.
      for (const [folderId, content] of Object.entries(normalizedData.htmlContent)) {
        const cleanedContent = this.cleanHTMLContent(content);
        const rel = this.relPathOf(folderId, relPathMap);
        zip.file(`faqs/${rel}/answer.html`, cleanedContent);
        updateProgress(`Adding ${rel}/answer.html`);
      }

      // Add temporary (newly uploaded) images.
      if (tempImages && tempImages.size > 0) {
        for (const [imagePath, imageFile] of tempImages.entries()) {
          const zipImagePath = this.toZipImagePath(imagePath);
          zip.file(zipImagePath, imageFile);
          updateProgress(`Adding image ${imageFile.name}`);
        }
      }

      // Add original images referenced in HTML content (excluding tempImages
      // already added under the same path).
      if (originalImages.size > 0) {
        for (const [imagePath, imageFile] of originalImages.entries()) {
          const zipImagePath = this.toZipImagePath(imagePath);
          if (zip.file(zipImagePath)) continue; // already added by tempImages
          zip.file(zipImagePath, imageFile);
          updateProgress(`Adding original image ${imageFile.name}`);
        }
      }

      // Add instructions
      const instructions = this.generateUpdateInstructions(data, tempImages, originalImages);
      zip.file('UPDATE_INSTRUCTIONS.txt', instructions);
      updateProgress('Adding instructions');

      // Add metadata
      const metadata = JSON.stringify(normalizedData.metadata, null, 2);
      zip.file('export-metadata.json', metadata);
      updateProgress('Adding metadata');

      const zipContent = await zip.generateAsync({ type: 'blob' });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const fileName = `faq-export-${timestamp}.zip`;

      this.downloadFile(zipContent, fileName);
    } catch (error: any) {
      console.error('Error creating ZIP file:', error);
      throw new Error(`Failed to create ZIP file: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Convert an absolute asset path to its position inside the export ZIP.
   * `assets/faqs/foo/images/bar.jpg` -> `faqs/foo/images/bar.jpg`.
   */
  private toZipImagePath(absoluteAssetPath: string): string {
    if (absoluteAssetPath.startsWith('assets/faqs/')) {
      return absoluteAssetPath.substring('assets/'.length);
    }
    // Fallback: drop a leading "assets/" if present so the file lands somewhere sane.
    return absoluteAssetPath.replace(/^assets\//, '');
  }

  private downloadFile(blob: Blob, fileName: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  async importFromJSON(file: File): Promise<boolean> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          let content = e.target?.result as string;
          
          // Fix encoding issues in the imported content
          content = this.normalizeTextContent(content);
          
          const data = JSON.parse(content) as ExportData;
          
          // Validate export data
          if (!this.validateExportData(data)) {
            console.error('Invalid export data format');
            resolve(false);
            return;
          }

          // Normalize imported data
          const normalizedData = this.normalizeExportData(data);
          
          // Convert and import the data
          const success = await this.processImportData(normalizedData);
          resolve(success);
        } catch (error) {
          console.error('Error importing JSON:', error);
          resolve(false);
        }
      };

      reader.onerror = () => {
        console.error('Error reading file');
        resolve(false);
      };

      // Read with explicit UTF-8 encoding
      reader.readAsText(file, 'UTF-8');
    });
  }

  async importFromZip(file: File): Promise<boolean> {
    try {
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(file);

      // Read consolidated faqs/faqs.json
      const indexFile = zipContent.file('faqs/faqs.json');
      if (!indexFile) {
        console.error('faqs/faqs.json not found in ZIP file');
        return false;
      }
      const indexJsonRaw = this.normalizeTextContent(await indexFile.async('string'));
      let indexParsed: { faqs: FAQMetadata[] };
      try {
        indexParsed = JSON.parse(indexJsonRaw);
      } catch (error) {
        console.error('Invalid JSON in faqs/faqs.json:', error);
        return false;
      }
      const allMetas: FAQMetadata[] = Array.isArray(indexParsed?.faqs) ? indexParsed.faqs : [];
      const relPathMap = this.buildRelPathMap(allMetas);

      const faqs: ExportFAQEntry[] = [];
      const htmlContent: { [folderId: string]: string } = {};

      for (const meta of allMetas) {
        const folderId = meta.folderId;
        if (!folderId) {
          console.warn('Skipping FAQ entry without folderId:', meta);
          continue;
        }
        faqs.push(meta);

        const rel = this.relPathOf(folderId, relPathMap);
        // Try the path implied by isActive; fall back to the legacy flat layout
        // so older ZIPs (everything under faqs/<id>/) still import.
        const htmlFile =
          zipContent.file(`faqs/${rel}/answer.html`) ??
          (rel !== folderId ? zipContent.file(`faqs/${folderId}/answer.html`) : null);
        if (htmlFile) {
          const html = this.normalizeTextContent(await htmlFile.async('string'));
          htmlContent[folderId] = html;
        }
      }

      // Extract metadata (optional)
      let metadata: any = {
        exportDate: new Date().toISOString(),
        version: this.EXPORT_VERSION,
        itemCount: faqs.length,
        editedCount: faqs.length
      };
      const metadataFile = zipContent.file('export-metadata.json');
      if (metadataFile) {
        try {
          const metadataContent = await metadataFile.async('string');
          metadata = JSON.parse(metadataContent);
        } catch (error) {
          console.warn('Could not parse metadata, using defaults:', error);
        }
      }

      const data: ExportData = { metadata, faqs, htmlContent };

      if (!this.validateExportData(data)) {
        console.error('Invalid export data format in ZIP file');
        return false;
      }

      const success = await this.processImportData(data);
      if (!success) {
        console.error('ZIP import failed during data processing');
      }
      return success;
    } catch (error) {
      console.error('Error importing ZIP file:', error);
      return false;
    }
  }

  private async processImportData(data: ExportData): Promise<boolean> {
    try {
      const editedFAQs: EditedFAQ[] = [];

      for (const faq of data.faqs) {
        const htmlContent = data.htmlContent[faq.folderId];
        if (!htmlContent) continue;

        editedFAQs.push({
          id: `${faq.id}_imported_${Date.now()}`,
          faqId: faq.id,
          question: faq.question,
          answer: this.decodeHTMLEntities(htmlContent),
          category: faq.category,
          subCategory: faq.subCategory ?? undefined,
          isActive: faq.isActive,
          timestamp: Date.now(),
          version: 1
        });
      }

      const success = await this.storageService.importEdits(editedFAQs);
      return success;
    } catch (error) {
      console.error('Error processing import data:', error);
      return false;
    }
  }

  private validateExportData(data: any): data is ExportData {
    return data &&
      data.metadata &&
      data.metadata.version &&
      Array.isArray(data.faqs) &&
      data.htmlContent &&
      typeof data.htmlContent === 'object';
  }

  generateUpdateInstructions(data: ExportData, tempImages?: Map<string, File>, originalImages?: Map<string, File>): string {
    const hasImages = (tempImages && tempImages.size > 0) || (originalImages && originalImages.size > 0);
    const totalImageCount = (tempImages?.size || 0) + (originalImages?.size || 0);

    const imageNote = hasImages ? `
- Total images included: ${totalImageCount}${tempImages && tempImages.size > 0 ? ` (${tempImages.size} new)` : ''}${originalImages && originalImages.size > 0 ? ` (${originalImages.size} existing)` : ''}
- Images live alongside their FAQ at faqs/<folderId>/images/.
- HTML answers reference images using relative paths (images/<file>) or
  absolute paths (assets/faqs/<folderId>/images/<file>); both work at runtime.` : '';

    const instructions = `
FAQ Export Update Instructions
===============================
Export Date: ${data.metadata.exportDate}
Total FAQs: ${data.metadata.itemCount}
Edited FAQs: ${data.metadata.editedCount}${imageNote}

ZIP Layout:
-----------
faqs/
  faqs.json                  ← all FAQ metadata (consolidated)
  <folderId>/
    answer.html
    images/<file>
UPDATE_INSTRUCTIONS.txt
export-metadata.json

How to Update Your Codebase:
----------------------------

1. Replace FAQ Assets:
   - Copy the entire \`faqs/\` directory from this ZIP into \`src/assets/\`,
     overwriting \`src/assets/faqs/\` in your project.
   - Top-level \`faqs.json\` carries metadata for all ${Object.keys(data.htmlContent).length} FAQs;
     each \`<folderId>/\` holds that FAQ's answer.html + images/.

2. Rebuild and Test:
   - Run: npm install (if needed)
   - Run: npm start
   - Open the FAQ page and verify the updated entries render correctly.

3. Commit Changes:
   - git add src/assets/faqs/
   - git commit -m "Update FAQ content from editor"

Notes:
------
- Each FAQ is a self-contained folder under assets/faqs/<folderId>/, with its
  answer.html and any referenced images under images/.
- Backup existing files before overwriting if you have local edits.
- Test thoroughly in development before deploying to production.
`;

    return instructions;
  }

  downloadInstructions(data: ExportData, tempImages?: Map<string, File>, originalImages?: Map<string, File>): void {
    const instructions = this.generateUpdateInstructions(data, tempImages, originalImages);
    const blob = new Blob([instructions], { type: 'text/plain' });
    this.downloadFile(blob, 'UPDATE_INSTRUCTIONS.txt');
  }

  /**
   * Clean HTML content by removing unwanted text and attributes using string operations
   * This avoids DOM manipulation that causes HTML entity encoding
   */
  public cleanHTMLContent(content: string): string {
    if (!content) return content;
    
    let cleaned = content;
    
    // Remove unwanted text nodes that contain "faq-editor"
    cleaned = this.removeUnwantedTextNodesString(cleaned, 'faq-editor');
    
    // Remove all attributes from all elements except img src
    cleaned = this.removeUnwantedAttributesString(cleaned);
    
    // Remove ALL span tags while preserving their content
    cleaned = this.removeAllSpanTagsString(cleaned);
    
    // Remove any elements that might be editor-specific
    cleaned = this.removeEditorElementsString(cleaned);
    
    // Remove empty tags after cleaning (recursively)
    cleaned = this.removeEmptyTagsString(cleaned);
    
    return cleaned;
  }


  /**
   * Decode HTML entities to actual characters
   */
  /**
   * Normalize various quote characters to standard ASCII quotes
   */
  private normalizeQuotes(content: string): string {
    if (!content) return content;
    
    let normalized = content;
    
    // Map of various quote characters to standard ASCII quotes using Unicode escape sequences
    const quoteMap: { [key: string]: string } = {
      // Smart/curly quotes
      '\u2018': "'",  // Left single quotation mark (U+2018)
      '\u2019': "'",  // Right single quotation mark (U+2019) 
      '\u201C': '"',  // Left double quotation mark (U+201C)
      '\u201D': '"',  // Right double quotation mark (U+201D)
      
      // Other quote variants
      '\u00B4': "'",  // Acute accent (U+00B4)
      '\u0060': "'",  // Grave accent (U+0060)
      '\u2032': "'",  // Prime (U+2032)
      '\u2033': '"',  // Double prime (U+2033)
      
      // Apostrophe variants
      '\u02BC': "'",  // Modifier letter apostrophe (U+02BC)
    };
    
    // Replace all quote variants with standard ASCII quotes
    for (const [unicode, ascii] of Object.entries(quoteMap)) {
      normalized = normalized.replace(new RegExp(unicode, 'g'), ascii);
    }
    
    return normalized;
  }

  /**
   * Fix common UTF-8 encoding corruption issues
   */
  private fixEncodingIssues(content: string): string {
    if (!content) return content;
    
    let fixed = content;
    
    // Map of common UTF-8 encoding corruptions to correct characters
    const encodingFixMap: { [key: string]: string } = {
      // Smart quotes corruption
      'â€™': "'",   // Right single quotation mark corrupted
      'â€˜': "'",   // Left single quotation mark corrupted
      'â€œ': '"',   // Left double quotation mark corrupted
      'â€\u009d': '"',   // Right double quotation mark corrupted
      
      // En/em dash corruption  
      'â€"': '–',   // En dash corrupted (U+2013)
      'â€\u0094': '—',   // Em dash corrupted (U+2014)
      'â€\u0095': '•',   // Bullet point corrupted
      
      // Ellipsis corruption
      'â€¦': '…',   // Horizontal ellipsis corrupted
      
      // Other common corruptions
      'Ã¡': 'á',   // a with acute accent
      'Ã©': 'é',   // e with acute accent
      'Ã­': 'í',   // i with acute accent
      'Ã³': 'ó',   // o with acute accent
      'Ãº': 'ú',   // u with acute accent
      'Ã±': 'ñ',   // n with tilde
      'â„¢': '™',   // Trademark symbol corruption
      'Â©': '©',   // Copyright symbol corruption
      'Â®': '®',   // Registered symbol corruption
      'Â ': ' ',   // Non-breaking space corruption
    };
    
    // Fix encoding corruptions
    for (const [corrupted, correct] of Object.entries(encodingFixMap)) {
      fixed = fixed.replace(new RegExp(corrupted, 'g'), correct);
    }
    
    return fixed;
  }

  /**
   * Clean and normalize text content
   */
  public normalizeTextContent(content: string): string {
    if (!content) return content;
    
    let normalized = content;
    
    // Step 1: Fix UTF-8 encoding corruption
    normalized = this.fixEncodingIssues(normalized);
    
    // Step 2: Normalize quotes to ASCII
    normalized = this.normalizeQuotes(normalized);
    
    // Step 3: Decode HTML entities
    normalized = this.decodeHTMLEntities(normalized);
    
    return normalized;
  }

  /**
   * Normalize entire export data structure (encoding fixes + entity decoding).
   */
  private normalizeExportData(data: ExportData): ExportData {
    return {
      ...data,
      faqs: data.faqs.map(faq => ({
        ...faq,
        question: this.normalizeTextContent(faq.question || ''),
        category: this.normalizeTextContent(faq.category || ''),
        subCategory: faq.subCategory != null
          ? this.normalizeTextContent(faq.subCategory)
          : faq.subCategory ?? null
      })),
      htmlContent: Object.fromEntries(
        Object.entries(data.htmlContent).map(([key, value]) => [
          key,
          this.normalizeTextContent(value)
        ])
      )
    };
  }

  public decodeHTMLEntities(content: string): string {
    if (!content) return content;
    
    // Map of HTML entities to their corresponding characters
    const entityMap: { [key: string]: string } = {
      '&amp;': '&',
      '&lt;': '<', 
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&nbsp;': ' ',  // Convert to regular space
      '&mdash;': '—',
      '&ndash;': '–',
      '&hellip;': '…',
      '&copy;': '©',
      '&reg;': '®',
      '&trade;': '™'
    };
    
    let decoded = content;
    
    // Replace named entities
    for (const [entity, char] of Object.entries(entityMap)) {
      decoded = decoded.replace(new RegExp(entity, 'g'), char);
    }
    
    // Handle numeric character references like &#39; &#8217; etc.
    decoded = decoded.replace(/&#(\d+);/g, (match, dec) => {
      return String.fromCharCode(parseInt(dec, 10));
    });
    
    // Handle hexadecimal character references like &#x27; &#x2019; etc.
    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });
    
    return decoded;
  }

  /**
   * String-based methods to avoid HTML entity encoding
   */
  
  private removeUnwantedTextNodesString(content: string, unwantedText: string): string {
    // Remove text content containing the unwanted text
    return content.replace(new RegExp(unwantedText, 'gi'), '');
  }
  
  private removeUnwantedAttributesString(content: string): string {
    // Remove all attributes from all tags except img src
    return content.replace(/<(\w+)([^>]*?)>/gi, (match, tagName, attributes) => {
      if (tagName.toLowerCase() === 'img') {
        // For img tags, only keep src attribute
        const srcMatch = attributes.match(/\s+src\s*=\s*["']([^"']*?)["']/i);
        if (srcMatch) {
          return `<${tagName} src="${srcMatch[1]}">`;
        }
        return `<${tagName}>`;
      } else {
        // For all other tags, remove all attributes
        return `<${tagName}>`;
      }
    });
  }
  
  private removeAllSpanTagsString(content: string): string {
    // Remove span tags but preserve their content
    return content.replace(/<\/?span[^>]*>/gi, '');
  }
  
  private removeEditorElementsString(content: string): string {
    // Remove editor-specific elements
    let cleaned = content;
    
    // Remove elements with editor-specific classes or attributes
    cleaned = cleaned.replace(/<[^>]*class\s*=\s*["'][^"']*(?:faq-editor|editor-|html-wysiwyg)[^"']*["'][^>]*>.*?<\/[^>]+>/gis, '');
    cleaned = cleaned.replace(/<[^>]*contenteditable[^>]*>.*?<\/[^>]+>/gis, '');
    
    return cleaned;
  }
  
  private removeEmptyTagsString(content: string): string {
    let cleaned = content;
    let hasChanges = false;
    
    do {
      hasChanges = false;
      const beforeLength = cleaned.length;
      
      // Remove empty tags (but preserve self-closing important tags)
      // First handle paired tags that are completely empty
      cleaned = cleaned.replace(/<((?!(?:br|hr|img|input|textarea|select|iframe|video|audio|canvas|svg|area|base|col|embed|link|meta|param|source|track|wbr)\b)\w+)[^>]*>\s*<\/\1>/gi, '');
      
      // Then handle tags that only contain whitespace or &nbsp;
      cleaned = cleaned.replace(/<((?!(?:br|hr|img|input|textarea|select|iframe|video|audio|canvas|svg|area|base|col|embed|link|meta|param|source|track|wbr)\b)\w+)[^>]*>(?:\s|&nbsp;)*<\/\1>/gi, '');
      
      hasChanges = cleaned.length !== beforeLength;
    } while (hasChanges);
    
    return cleaned;
  }

}