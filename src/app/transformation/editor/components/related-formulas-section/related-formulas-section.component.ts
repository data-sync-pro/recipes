import { Component, Input, OnChanges } from '@angular/core';
import { DocData } from '../../../services/docs.service';
import { EditorStateService } from '../../services/editor-state.service';

@Component({
  selector: 'app-related-formulas-section',
  templateUrl: './related-formulas-section.component.html',
})
export class RelatedFormulasSectionComponent implements OnChanges {
  @Input() doc!: DocData;

  constructor(private state: EditorStateService) {}

  ngOnChanges(): void {
    if (this.doc && !this.doc.relatedFormulas) {
      this.doc.relatedFormulas = [];
    }
  }

  get list(): string[] {
    return this.doc.relatedFormulas as string[];
  }

  trackByIndex(index: number): number {
    return index;
  }

  add(): void {
    this.list.push('');
    this.changed();
  }

  remove(i: number): void {
    this.list.splice(i, 1);
    this.changed();
  }

  moveUp(i: number): void {
    if (i <= 0) return;
    [this.list[i - 1], this.list[i]] = [this.list[i], this.list[i - 1]];
    this.changed();
  }

  moveDown(i: number): void {
    if (i >= this.list.length - 1) return;
    [this.list[i], this.list[i + 1]] = [this.list[i + 1], this.list[i]];
    this.changed();
  }

  setAt(i: number, value: string): void {
    this.list[i] = value;
    this.changed();
  }

  changed(): void {
    this.state.markDirty();
  }
}
