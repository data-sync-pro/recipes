import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  BehaviorSubject,
  Observable,
  Subject,
  catchError,
  of,
  takeUntil,
} from 'rxjs';
import { DocsService, DocData } from '../../services/docs.service';
import { EditorStorageService, NewFunctionMeta } from './editor-storage.service';
import { ImageCacheService } from './image-cache.service';

interface TagItem {
  'Item Name': string;
  Tags: string[];
}

const itemKey = (rawName: string): string =>
  rawName.toLowerCase().replace(/\s+/g, '_');

/** Top-level files in `src/assets/transformation/formulas/` that aren't function folders. */
export const SPECIAL_DOC_NAMES = new Set<string>([
  'global_variables',
  'elements_of_formula',
]);

export function isSpecialDoc(name: string): boolean {
  return SPECIAL_DOC_NAMES.has(name);
}

export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'pending' }       // dirty edits not yet persisted
  | { kind: 'saved'; at: number };

@Injectable()
export class EditorStateService implements OnDestroy {
  private readonly destroy$ = new Subject<void>();

  private readonly drafts = new Map<string, DocData>();
  /** Functions with a draft in memory (and persisted in localStorage after Save). */
  private readonly dirtySet = new Set<string>();
  /** Functions whose draft has been modified since the last Save click. Subset of dirtySet. */
  private readonly pendingSet = new Set<string>();
  private readonly newFunctionsMeta = new Map<string, NewFunctionMeta>();
  /** Original tags loaded from tags.json — keyed by snake_case function name. */
  private readonly tagSource = new Map<string, string[]>();
  /** Per-function tag overrides made by the user. */
  private readonly tagDrafts = new Map<string, string[]>();

  private readonly selectedDocNameSubject = new BehaviorSubject<string | null>(null);
  private readonly currentDocSubject = new BehaviorSubject<DocData | null>(null);
  private readonly dirtySubject = new BehaviorSubject<Set<string>>(new Set());
  private readonly pendingSubject = new BehaviorSubject<Set<string>>(new Set());
  private readonly newFunctionsSubject = new BehaviorSubject<Set<string>>(new Set());
  private readonly saveStatusSubject = new BehaviorSubject<SaveStatus>({ kind: 'idle' });
  private readonly currentTagsSubject = new BehaviorSubject<string[]>([]);
  private readonly allTagsSubject = new BehaviorSubject<string[]>([]);

  readonly selectedDocName$: Observable<string | null> = this.selectedDocNameSubject.asObservable();
  readonly currentDoc$: Observable<DocData | null> = this.currentDocSubject.asObservable();
  readonly dirty$: Observable<Set<string>> = this.dirtySubject.asObservable();
  readonly pending$: Observable<Set<string>> = this.pendingSubject.asObservable();
  readonly newFunctions$: Observable<Set<string>> = this.newFunctionsSubject.asObservable();
  readonly saveStatus$: Observable<SaveStatus> = this.saveStatusSubject.asObservable();
  readonly currentTags$: Observable<string[]> = this.currentTagsSubject.asObservable();
  readonly allTags$: Observable<string[]> = this.allTagsSubject.asObservable();

  constructor(
    private docsService: DocsService,
    private storage: EditorStorageService,
    private imageCache: ImageCacheService,
    private http: HttpClient
  ) {
    const restoredDrafts = this.storage.loadDrafts();
    for (const [name, doc] of Object.entries(restoredDrafts)) {
      this.drafts.set(name, doc);
      this.dirtySet.add(name);
      // Restored drafts are already in localStorage → not pending.
    }
    const restoredNew = this.storage.loadNewFunctions();
    for (const [name, meta] of Object.entries(restoredNew)) {
      this.newFunctionsMeta.set(name, meta);
    }
    const restoredTagDrafts = this.storage.loadTagDrafts();
    for (const [name, tags] of Object.entries(restoredTagDrafts)) {
      this.tagDrafts.set(name, tags);
      this.dirtySet.add(name);
    }
    this.emitDirty();
    this.emitPending();
    this.emitNew();
    this.loadTagSource();

    // When the image cache restores from IndexedDB (or otherwise mutates),
    // re-emit current doc so the preview pane re-renders with up-to-date refs.
    this.imageCache.changes$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentDocSubject.next(this.currentDocSubject.value);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  select(docName: string): void {
    this.selectedDocNameSubject.next(docName);
    this.emitCurrentTags();

    const draft = this.drafts.get(docName);
    if (draft) {
      this.currentDocSubject.next(draft);
      return;
    }

    this.loadDocFromDisk(docName).subscribe((doc) => {
      if (!doc) {
        this.currentDocSubject.next(null);
        return;
      }
      this.drafts.set(docName, doc);
      this.currentDocSubject.next(doc);
    });
  }

  /** Load a doc from its on-disk source, picking the right path for specials. */
  private loadDocFromDisk(docName: string): Observable<DocData | null> {
    if (isSpecialDoc(docName)) {
      return this.http
        .get<DocData>(`assets/transformation/formulas/${docName}.json`)
        .pipe(
          catchError((err) => {
            console.error(`Error loading special ${docName}.json`, err);
            return of(null);
          })
        );
    }
    return this.docsService.getDocByNameRaw(docName);
  }

  /** Form sections call this after any field mutation. Marks pending — caller must saveNow() to persist. */
  markDirty(): void {
    const name = this.selectedDocNameSubject.value;
    if (!name) return;
    this.dirtySet.add(name);
    this.pendingSet.add(name);
    this.emitDirty();
    this.emitPending();
    this.currentDocSubject.next(this.currentDocSubject.value);
    this.saveStatusSubject.next({ kind: 'pending' });
  }

  /** Replace the tag list for a function. Empty array means "no tags". */
  updateTags(name: string, tags: string[]): void {
    const cleaned = tags.map((t) => t.trim()).filter(Boolean);
    this.tagDrafts.set(name, cleaned);
    this.dirtySet.add(name);
    this.pendingSet.add(name);
    this.emitDirty();
    this.emitPending();
    if (this.selectedDocNameSubject.value === name) {
      this.emitCurrentTags();
    }
    this.saveStatusSubject.next({ kind: 'pending' });
  }

  /** Effective tags for a function: draft override if present, else source from tags.json. */
  getEffectiveTags(name: string): string[] {
    return this.tagDrafts.get(name) ?? this.tagSource.get(name) ?? [];
  }

  /** True if this function's tags differ from the on-disk tags.json entry. */
  isTagOverridden(name: string): boolean {
    if (!this.tagDrafts.has(name)) return false;
    const a = this.tagDrafts.get(name) ?? [];
    const b = this.tagSource.get(name) ?? [];
    if (a.length !== b.length) return true;
    return a.some((t, i) => t !== b[i]);
  }

  /** Persist all drafts + new-function metadata to localStorage. */
  saveNow(): void {
    this.persist();
  }

  /** Discard local changes and reload from disk. New-from-scratch functions are removed entirely. */
  revert(docName: string): void {
    const wasNew = this.newFunctionsMeta.has(docName);
    const wasSelected = this.selectedDocNameSubject.value === docName;

    this.drafts.delete(docName);
    this.dirtySet.delete(docName);
    this.pendingSet.delete(docName);
    this.newFunctionsMeta.delete(docName);
    this.tagDrafts.delete(docName);
    this.emitDirty();
    this.emitPending();
    this.emitNew();
    if (this.selectedDocNameSubject.value === docName) {
      this.emitCurrentTags();
    }
    this.saveStatusSubject.next({ kind: 'pending' });

    if (wasSelected) {
      if (wasNew) {
        // Nothing to reload — clear selection.
        this.selectedDocNameSubject.next(null);
        this.currentDocSubject.next(null);
        return;
      }
      this.loadDocFromDisk(docName).subscribe((doc) => {
        if (!doc) {
          this.currentDocSubject.next(null);
          return;
        }
        this.drafts.set(docName, doc);
        this.currentDocSubject.next(doc);
      });
    }
  }

  /** Create a brand-new function. The name is normalized to snake_case. */
  createNewFunction(name: string, title: string, primaryTag: string): { ok: true } | { ok: false; reason: string } {
    const cleanName = name.trim().toLowerCase().replace(/\s+/g, '_');
    if (!/^[a-z0-9_$]+$/.test(cleanName)) {
      return { ok: false, reason: 'Name must be lowercase letters, digits, or underscores.' };
    }
    if (this.drafts.has(cleanName) || this.newFunctionsMeta.has(cleanName)) {
      return { ok: false, reason: `A function named "${cleanName}" already exists in this session.` };
    }
    const blank: DocData = {
      title: title || cleanName.toUpperCase(),
      examples: [],
      parameters: [],
    };
    this.drafts.set(cleanName, blank);
    this.dirtySet.add(cleanName);
    this.pendingSet.add(cleanName);
    this.newFunctionsMeta.set(cleanName, { tags: [primaryTag].filter(Boolean) });
    if (primaryTag) this.tagDrafts.set(cleanName, [primaryTag]);
    this.emitDirty();
    this.emitPending();
    this.emitNew();
    this.saveStatusSubject.next({ kind: 'pending' });
    this.selectedDocNameSubject.next(cleanName);
    this.currentDocSubject.next(blank);
    this.emitCurrentTags();
    return { ok: true };
  }

  isDirty(docName: string): boolean {
    return this.dirtySet.has(docName);
  }

  isNew(docName: string): boolean {
    return this.newFunctionsMeta.has(docName);
  }

  getCurrentDoc(): DocData | null {
    return this.currentDocSubject.value;
  }

  getCurrentDocName(): string | null {
    return this.selectedDocNameSubject.value;
  }

  getDirtyNames(): string[] {
    return Array.from(this.dirtySet);
  }

  getDraft(name: string): DocData | undefined {
    return this.drafts.get(name);
  }

  getNewFunctionsMeta(): Map<string, NewFunctionMeta> {
    return new Map(this.newFunctionsMeta);
  }

  /** Snapshot of every overridden tag set, keyed by function name. */
  getTagDrafts(): Map<string, string[]> {
    return new Map(this.tagDrafts);
  }

  /** Original tag list from tags.json for the given function (read-only). */
  getSourceTags(name: string): string[] {
    return [...(this.tagSource.get(name) ?? [])];
  }

  /** Mark a function as no longer dirty (e.g., right after exporting a clean copy). */
  markClean(docName: string): void {
    if (!this.dirtySet.has(docName)) return;
    this.dirtySet.delete(docName);
    this.pendingSet.delete(docName);
    this.emitDirty();
    this.emitPending();
    this.saveStatusSubject.next({ kind: 'pending' });
  }

  /** Mark every dirty function as clean (after a successful bulk export). */
  markAllClean(): void {
    this.dirtySet.clear();
    this.pendingSet.clear();
    this.newFunctionsMeta.clear();
    this.emitDirty();
    this.emitPending();
    this.emitNew();
    this.saveStatusSubject.next({ kind: 'pending' });
  }

  /**
   * Wipe everything: drafts, dirty set, new-function metadata, the loaded doc,
   * and every cached image (Blob URLs + IndexedDB rows). Used by "Clear All Data".
   */
  clearAll(): void {
    this.drafts.clear();
    this.dirtySet.clear();
    this.pendingSet.clear();
    this.newFunctionsMeta.clear();
    this.tagDrafts.clear();
    this.imageCache.clearAll();
    this.selectedDocNameSubject.next(null);
    this.currentDocSubject.next(null);
    this.emitDirty();
    this.emitPending();
    this.emitNew();
    this.emitCurrentTags();
    // Clear All is itself an explicit destructive action, so flush localStorage
    // and the IDB-backed image cache immediately rather than waiting for Save.
    this.storage.saveDrafts({});
    this.storage.saveNewFunctions({});
    this.storage.saveTagDrafts({});
    this.saveStatusSubject.next({ kind: 'idle' });
  }

  totalEditedCount(): number {
    return this.dirtySet.size;
  }

  private emitDirty(): void {
    this.dirtySubject.next(new Set(this.dirtySet));
  }

  private emitPending(): void {
    this.pendingSubject.next(new Set(this.pendingSet));
  }

  private emitNew(): void {
    this.newFunctionsSubject.next(new Set(this.newFunctionsMeta.keys()));
  }

  private emitCurrentTags(): void {
    const name = this.selectedDocNameSubject.value;
    this.currentTagsSubject.next(name ? this.getEffectiveTags(name) : []);
  }

  private loadTagSource(): void {
    this.http
      .get<TagItem[]>('assets/transformation/formulas/tags.json')
      .pipe(takeUntil(this.destroy$))
      .subscribe((items) => {
        const allTags = new Set<string>();
        for (const item of items) {
          this.tagSource.set(itemKey(item['Item Name']), item.Tags ?? []);
          for (const t of item.Tags ?? []) allTags.add(t);
        }
        this.allTagsSubject.next(Array.from(allTags).sort());
        // Re-emit current tags now that source is available.
        this.emitCurrentTags();
      });
  }

  private persist(): void {
    const drafts: Record<string, DocData> = {};
    for (const name of this.dirtySet) {
      const doc = this.drafts.get(name);
      if (doc) drafts[name] = doc;
    }
    this.storage.saveDrafts(drafts);

    const newMeta: Record<string, NewFunctionMeta> = {};
    for (const [name, meta] of this.newFunctionsMeta) {
      newMeta[name] = meta;
    }
    this.storage.saveNewFunctions(newMeta);

    const tagDrafts: Record<string, string[]> = {};
    for (const [name, tags] of this.tagDrafts) {
      tagDrafts[name] = tags;
    }
    this.storage.saveTagDrafts(tagDrafts);

    // Everything that was pending is now in localStorage.
    if (this.pendingSet.size > 0) {
      this.pendingSet.clear();
      this.emitPending();
    }
    this.saveStatusSubject.next({ kind: 'saved', at: Date.now() });
  }
}
