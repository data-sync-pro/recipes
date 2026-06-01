import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ImageDbService } from './image-db.service';

export interface CachedImage {
  filename: string;
  blob: Blob;
  blobUrl: string;
}

/**
 * Holds Blob references for images uploaded during the editor session.
 * Persists bytes to IndexedDB so uploads survive a page refresh.
 */
@Injectable()
export class ImageCacheService implements OnDestroy {
  private readonly cache = new Map<string, CachedImage[]>();
  private readonly changeSubject = new BehaviorSubject<void>(undefined);

  /** Emits whenever any function's cache changes. */
  readonly changes$: Observable<void> = this.changeSubject.asObservable();

  constructor(private db: ImageDbService) {
    // Restore is best-effort: if IndexedDB is unavailable (private mode, quota
    // exceeded, schema mismatch) we still want the in-memory cache to work for
    // the current session. Surface the failure so it is visible in dev tools.
    this.restoreFromDb().catch((err) => {
      console.error('ImageCacheService: failed to restore from IndexedDB', err);
    });
  }

  ngOnDestroy(): void {
    for (const list of this.cache.values()) {
      for (const img of list) URL.revokeObjectURL(img.blobUrl);
    }
    this.cache.clear();
  }

  getAll(docName: string): CachedImage[] {
    return this.cache.get(docName) ?? [];
  }

  hasUploads(docName: string): boolean {
    const list = this.cache.get(docName);
    return !!list && list.length > 0;
  }

  totalUploadCount(): number {
    let n = 0;
    for (const list of this.cache.values()) n += list.length;
    return n;
  }

  add(docName: string, file: File): CachedImage {
    const existing = this.cache.get(docName) ?? [];
    const filename = this.uniqueFilename(file.name, existing);
    const blob = file.slice(0, file.size, file.type);
    const blobUrl = URL.createObjectURL(blob);
    const cached: CachedImage = { filename, blob, blobUrl };
    existing.push(cached);
    this.cache.set(docName, existing);
    void this.db.put(docName, filename, blob);
    this.changeSubject.next();
    return cached;
  }

  remove(docName: string, filename: string): void {
    const list = this.cache.get(docName);
    if (!list) return;
    const idx = list.findIndex((c) => c.filename === filename);
    if (idx < 0) return;
    URL.revokeObjectURL(list[idx].blobUrl);
    list.splice(idx, 1);
    if (list.length === 0) this.cache.delete(docName);
    void this.db.delete(docName, filename);
    this.changeSubject.next();
  }

  resolveBlobUrl(docName: string, filename: string): string | null {
    const list = this.cache.get(docName);
    if (!list) return null;
    return list.find((c) => c.filename === filename)?.blobUrl ?? null;
  }

  resolvePreviewUrl(docName: string, src: string): string {
    if (/^(https?:|data:|\/|assets\/)/.test(src)) return src;
    const filename = src.replace(/^images\//, '');
    const blob = this.resolveBlobUrl(docName, filename);
    if (blob) return blob;
    return `assets/transformation/formulas/${docName}/${src}`;
  }

  clearForFunction(docName: string): void {
    const list = this.cache.get(docName);
    if (!list) return;
    for (const img of list) URL.revokeObjectURL(img.blobUrl);
    this.cache.delete(docName);
    void this.db.deleteByDocName(docName);
    this.changeSubject.next();
  }

  /** Wipe everything — used by Clear All Data. */
  clearAll(): void {
    for (const list of this.cache.values()) {
      for (const img of list) URL.revokeObjectURL(img.blobUrl);
    }
    this.cache.clear();
    void this.db.clear();
    this.changeSubject.next();
  }

  allUploads(): Map<string, CachedImage[]> {
    return this.cache;
  }

  private async restoreFromDb(): Promise<void> {
    const stored = await this.db.loadAll();
    for (const rec of stored) {
      const list = this.cache.get(rec.docName) ?? [];
      const blobUrl = URL.createObjectURL(rec.blob);
      list.push({ filename: rec.filename, blob: rec.blob, blobUrl });
      this.cache.set(rec.docName, list);
    }
    this.changeSubject.next();
  }

  private uniqueFilename(requested: string, existing: CachedImage[]): string {
    const taken = new Set(existing.map((c) => c.filename));
    if (!taken.has(requested)) return requested;
    const dot = requested.lastIndexOf('.');
    const stem = dot === -1 ? requested : requested.slice(0, dot);
    const ext = dot === -1 ? '' : requested.slice(dot);
    let n = 2;
    while (taken.has(`${stem}_${n}${ext}`)) n++;
    return `${stem}_${n}${ext}`;
  }
}
