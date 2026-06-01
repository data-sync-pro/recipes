import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, combineLatest, takeUntil } from 'rxjs';
import { EditorStateService } from '../../services/editor-state.service';

@Component({
  selector: 'app-tags-section',
  templateUrl: './tags-section.component.html',
})
export class TagsSectionComponent implements OnInit, OnDestroy {
  tags: string[] = [];
  availableTags: string[] = [];
  newTag = '';
  isOverridden = false;

  private currentName: string | null = null;
  private readonly destroy$ = new Subject<void>();

  constructor(private state: EditorStateService) {}

  ngOnInit(): void {
    combineLatest([this.state.selectedDocName$, this.state.currentTags$])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([name, tags]) => {
        this.currentName = name;
        this.tags = [...tags];
        this.isOverridden = name ? this.state.isTagOverridden(name) : false;
      });

    this.state.allTags$
      .pipe(takeUntil(this.destroy$))
      .subscribe((all) => {
        this.availableTags = all;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  trackByIndex(i: number): number {
    return i;
  }

  addTag(): void {
    if (!this.currentName) return;
    const value = this.newTag.trim();
    if (!value) return;
    if (this.tags.includes(value)) {
      this.newTag = '';
      return;
    }
    this.state.updateTags(this.currentName, [...this.tags, value]);
    this.newTag = '';
  }

  removeTag(i: number): void {
    if (!this.currentName) return;
    const next = [...this.tags];
    next.splice(i, 1);
    this.state.updateTags(this.currentName, next);
  }

  moveUp(i: number): void {
    if (!this.currentName || i <= 0) return;
    const next = [...this.tags];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    this.state.updateTags(this.currentName, next);
  }

  moveDown(i: number): void {
    if (!this.currentName || i >= this.tags.length - 1) return;
    const next = [...this.tags];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    this.state.updateTags(this.currentName, next);
  }
}
