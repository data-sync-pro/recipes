import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { DocImage } from '../../../services/docs.service';
import { EditorStateService } from '../../services/editor-state.service';
import { ImageCacheService } from '../../services/image-cache.service';

@Component({
  selector: 'app-images-section',
  templateUrl: './images-section.component.html',
})
export class ImagesSectionComponent implements OnInit, OnDestroy {
  @Input() images: DocImage[] | undefined;
  @Input() heading = 'Images';

  private readonly destroy$ = new Subject<void>();

  constructor(
    private state: EditorStateService,
    private cache: ImageCacheService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Re-render thumbnails when uploads/removals happen anywhere — including the
    // async IDB restore that completes shortly after the editor loads.
    this.cache.changes$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.cdr.markForCheck());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  trackByIndex(index: number): number {
    return index;
  }

  get list(): DocImage[] {
    return this.images ?? [];
  }

  resolve(src: string): string {
    const name = this.state.getCurrentDocName() ?? '';
    return this.cache.resolvePreviewUrl(name, src);
  }

  isUploaded(src: string): boolean {
    const name = this.state.getCurrentDocName() ?? '';
    const filename = src.replace(/^images\//, '');
    return this.cache.resolveBlobUrl(name, filename) !== null;
  }

  onFiles(files: File[]): void {
    const name = this.state.getCurrentDocName();
    if (!name || !this.images) return;
    for (const file of files) {
      const cached = this.cache.add(name, file);
      this.images.push({ src: `images/${cached.filename}`, alt: '' });
    }
    this.state.markDirty();
  }

  remove(i: number): void {
    if (!this.images) return;
    const name = this.state.getCurrentDocName();
    const removedSrc = this.images[i].src;
    this.images.splice(i, 1);
    if (name) {
      const filename = removedSrc.replace(/^images\//, '');
      const stillUsed = this.images.some((img) => img.src === removedSrc);
      if (!stillUsed) this.cache.remove(name, filename);
    }
    this.state.markDirty();
  }

  altChanged(): void {
    this.state.markDirty();
  }
}
