import { Component, Input, OnChanges } from '@angular/core';
import { Callout, DocData } from '../../../services/docs.service';
import { EditorStateService } from '../../services/editor-state.service';

type CalloutField =
  | 'descriptionCallouts'
  | 'syntaxCallouts'
  | 'parametersCallouts'
  | 'examplesCallouts'
  | 'tipsCallouts';

@Component({
  selector: 'app-callouts-section',
  templateUrl: './callouts-section.component.html',
})
export class CalloutsSectionComponent implements OnChanges {
  @Input() doc!: DocData;
  @Input() field!: CalloutField;
  @Input() heading = 'Callouts';

  readonly typeOptions: Callout['type'][] = ['info', 'warning', 'tip', 'note'];

  constructor(private state: EditorStateService) {}

  ngOnChanges(): void {
    if (this.doc && !this.doc[this.field]) {
      this.doc[this.field] = [];
    }
  }

  get callouts(): Callout[] {
    return (this.doc[this.field] as Callout[]) ?? [];
  }

  trackByIndex(index: number): number {
    return index;
  }

  add(): void {
    this.callouts.push({ type: 'info', content: '' });
    this.changed();
  }

  remove(i: number): void {
    this.callouts.splice(i, 1);
    this.changed();
  }

  moveUp(i: number): void {
    if (i <= 0) return;
    [this.callouts[i - 1], this.callouts[i]] = [this.callouts[i], this.callouts[i - 1]];
    this.changed();
  }

  moveDown(i: number): void {
    if (i >= this.callouts.length - 1) return;
    [this.callouts[i], this.callouts[i + 1]] = [this.callouts[i + 1], this.callouts[i]];
    this.changed();
  }

  changed(): void {
    this.state.markDirty();
  }
}
