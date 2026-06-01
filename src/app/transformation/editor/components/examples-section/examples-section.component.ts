import { Component, Input, OnChanges } from '@angular/core';
import { DocData, DocImage, ExampleItem } from '../../../services/docs.service';
import { EditorStateService } from '../../services/editor-state.service';

interface ExampleSlot {
  isRich: boolean;
  code: string;
  description: string;
  images: DocImage[];
}

@Component({
  selector: 'app-examples-section',
  templateUrl: './examples-section.component.html',
})
export class ExamplesSectionComponent implements OnChanges {
  @Input() doc!: DocData;

  slots: ExampleSlot[] = [];

  constructor(private state: EditorStateService) {}

  ngOnChanges(): void {
    if (!this.doc) return;
    if (!this.doc.examples) this.doc.examples = [];
    this.slots = this.doc.examples.map(this.fromExample);
  }

  trackByIndex(index: number): number {
    return index;
  }

  add(): void {
    this.slots.push({ isRich: false, code: '', description: '', images: [] });
    this.writeBack();
  }

  remove(i: number): void {
    this.slots.splice(i, 1);
    this.writeBack();
  }

  moveUp(i: number): void {
    if (i <= 0) return;
    [this.slots[i - 1], this.slots[i]] = [this.slots[i], this.slots[i - 1]];
    this.writeBack();
  }

  moveDown(i: number): void {
    if (i >= this.slots.length - 1) return;
    [this.slots[i], this.slots[i + 1]] = [this.slots[i + 1], this.slots[i]];
    this.writeBack();
  }

  toggleRich(i: number): void {
    this.slots[i].isRich = !this.slots[i].isRich;
    this.writeBack();
  }

  changed(): void {
    this.writeBack();
  }

  private fromExample(ex: string | ExampleItem): ExampleSlot {
    if (typeof ex === 'string') {
      return { isRich: false, code: ex, description: '', images: [] };
    }
    return {
      isRich: true,
      code: ex.code ?? '',
      description: ex.description ?? '',
      images: ex.images ?? [],
    };
  }

  private writeBack(): void {
    this.doc.examples = this.slots.map((s): string | ExampleItem => {
      if (!s.isRich) return s.code;
      const obj: ExampleItem = { code: s.code };
      if (s.description) obj.description = s.description;
      if (s.images && s.images.length) obj.images = s.images;
      return obj;
    });
    this.state.markDirty();
  }
}
