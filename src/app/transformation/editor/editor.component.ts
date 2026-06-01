import {
  Component,
  OnDestroy,
  OnInit,
  ViewEncapsulation,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  Observable,
  Subject,
  combineLatest,
  interval,
  map,
  startWith,
  takeUntil,
} from 'rxjs';
import { DocData } from '../services/docs.service';
import { EditorStateService, SaveStatus } from './services/editor-state.service';
import { EditorExportService } from './services/editor-export.service';
import { ImageCacheService } from './services/image-cache.service';

interface TagItem {
  'Item Name': string;
  Tags: string[];
}

@Component({
  selector: 'app-editor',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.css'],
  encapsulation: ViewEncapsulation.None,
})
export class EditorComponent implements OnInit, OnDestroy {
  readonly currentDoc$: Observable<DocData | null>;
  readonly selectedDocName$: Observable<string | null>;
  readonly canExport$: Observable<boolean>;
  readonly hasAnyDirty$: Observable<boolean>;
  readonly hasPendingSave$: Observable<boolean>;
  readonly saveStatusLabel$: Observable<string>;

  showNewFunctionModal = false;
  availableTags: string[] = [];

  private readonly destroy$ = new Subject<void>();

  constructor(
    private state: EditorStateService,
    private exporter: EditorExportService,
    private cache: ImageCacheService,
    private http: HttpClient
  ) {
    this.currentDoc$ = this.state.currentDoc$;
    this.selectedDocName$ = this.state.selectedDocName$;
    this.canExport$ = combineLatest([
      this.state.selectedDocName$,
      this.state.currentDoc$,
    ]).pipe(map(([name, doc]) => !!name && !!doc));
    this.hasAnyDirty$ = this.state.dirty$.pipe(map((set) => set.size > 0));
    this.hasPendingSave$ = this.state.saveStatus$.pipe(
      map((s) => s.kind === 'pending')
    );

    // Refresh the "Saved 5s ago" string every 10s on top of every status change.
    this.saveStatusLabel$ = combineLatest([
      this.state.saveStatus$,
      interval(10_000).pipe(startWith(0)),
    ]).pipe(map(([status]) => this.formatSaveStatus(status)));
  }

  ngOnInit(): void {
    this.http
      .get<TagItem[]>('assets/transformation/formulas/tags.json')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        const set = new Set<string>();
        for (const item of data) {
          for (const t of item.Tags ?? []) set.add(t);
        }
        this.availableTags = Array.from(set).sort();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  hasUnexportedImages(): boolean {
    const name = this.state.getCurrentDocName();
    return !!name && this.cache.hasUploads(name);
  }

  uploadedImageCount(): number {
    const name = this.state.getCurrentDocName();
    return name ? this.cache.getAll(name).length : 0;
  }

  isCurrentDirty(): boolean {
    const name = this.state.getCurrentDocName();
    return !!name && this.state.isDirty(name);
  }

  isCurrentNew(): boolean {
    const name = this.state.getCurrentDocName();
    return !!name && this.state.isNew(name);
  }

  saveNow(): void {
    this.state.saveNow();
  }

  exportCurrent(): void {
    const name = this.state.getCurrentDocName();
    if (!name) return;
    void this.exporter.exportSingle(name);
  }

  exportAll(): void {
    void this.exporter.exportAll();
  }

  clearAllData(): void {
    const editedCount = this.state.totalEditedCount();
    const uploadCount = this.cache.totalUploadCount();
    if (editedCount === 0 && uploadCount === 0) {
      alert('No edited data to clear.');
      return;
    }
    const summary = [
      editedCount > 0 ? `${editedCount} edited function${editedCount === 1 ? '' : 's'}` : null,
      uploadCount > 0 ? `${uploadCount} uploaded image${uploadCount === 1 ? '' : 's'}` : null,
    ]
      .filter(Boolean)
      .join(' and ');
    if (!confirm(`This will permanently delete ${summary} from your local browser. Continue?`)) {
      return;
    }
    this.state.clearAll();
  }

  revertCurrent(): void {
    const name = this.state.getCurrentDocName();
    if (!name) return;
    if (!this.state.isDirty(name)) return;
    const isNew = this.state.isNew(name);
    const msg = isNew
      ? `Discard the new draft "${name}"? It will be removed.`
      : `Discard local changes to "${name}" and reload from disk?`;
    if (!confirm(msg)) return;
    this.cache.clearForFunction(name);
    this.state.revert(name);
  }

  openNewFunctionModal(): void {
    this.showNewFunctionModal = true;
  }

  closeNewFunctionModal(): void {
    this.showNewFunctionModal = false;
  }

  private formatSaveStatus(status: SaveStatus): string {
    if (status.kind === 'idle') return '';
    if (status.kind === 'pending') return 'Unsaved changes';
    const ageSec = Math.max(1, Math.round((Date.now() - status.at) / 1000));
    if (ageSec < 60) return `Saved ${ageSec}s ago`;
    const ageMin = Math.round(ageSec / 60);
    if (ageMin < 60) return `Saved ${ageMin}m ago`;
    const ageHr = Math.round(ageMin / 60);
    return `Saved ${ageHr}h ago`;
  }

}
