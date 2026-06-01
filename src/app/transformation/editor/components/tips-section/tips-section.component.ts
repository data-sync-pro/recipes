import { Component, Input, OnChanges } from '@angular/core';
import { DocData } from '../../../services/docs.service';
import { Tip } from '../../models/editor-models';
import { EditorStateService } from '../../services/editor-state.service';

@Component({
  selector: 'app-tips-section',
  templateUrl: './tips-section.component.html',
})
export class TipsSectionComponent implements OnChanges {
  @Input() doc!: DocData;

  constructor(private state: EditorStateService) {}

  ngOnChanges(): void {
    if (this.doc && !this.doc.tips) {
      this.doc.tips = [] as unknown as string[];
    }
  }

  get tips(): Tip[] {
    return this.doc.tips as unknown as Tip[];
  }

  trackByIndex(index: number): number {
    return index;
  }

  add(list: Tip[]): void {
    list.push({ text: '' });
    this.changed();
  }

  remove(list: Tip[], i: number): void {
    list.splice(i, 1);
    this.changed();
  }

  moveUp(list: Tip[], i: number): void {
    if (i <= 0) return;
    [list[i - 1], list[i]] = [list[i], list[i - 1]];
    this.changed();
  }

  moveDown(list: Tip[], i: number): void {
    if (i >= list.length - 1) return;
    [list[i], list[i + 1]] = [list[i + 1], list[i]];
    this.changed();
  }

  ensureChildren(tip: Tip): Tip[] {
    if (!tip.children) tip.children = [];
    return tip.children;
  }

  hasChildren(tip: Tip): boolean {
    return !!(tip.children && tip.children.length);
  }

  changed(): void {
    this.state.markDirty();
  }
}
