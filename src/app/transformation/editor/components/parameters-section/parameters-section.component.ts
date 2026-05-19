import { Component, Input, OnChanges } from '@angular/core';
import { DocData } from '../../../services/docs.service';
import { EditorStateService } from '../../services/editor-state.service';

interface Parameter {
  name: string;
  type: string;
  required: string;
  description: string;
}

const TYPE_OPTIONS = [
  'String',
  'Number',
  'Boolean',
  'Date',
  'Datetime',
  'Object',
  'Object[]',
  'Id',
];

const REQUIRED_OPTIONS = ['Yes', 'No'];

@Component({
  selector: 'app-parameters-section',
  templateUrl: './parameters-section.component.html',
})
export class ParametersSectionComponent implements OnChanges {
  @Input() doc!: DocData;

  readonly typeOptions = TYPE_OPTIONS;
  readonly requiredOptions = REQUIRED_OPTIONS;

  constructor(private state: EditorStateService) {}

  ngOnChanges(): void {
    if (this.doc && !this.doc.parameters) {
      this.doc.parameters = [];
    }
  }

  get params(): Parameter[] {
    return this.doc.parameters as Parameter[];
  }

  trackByIndex(index: number): number {
    return index;
  }

  add(): void {
    this.params.push({ name: '', type: 'String', required: 'Yes', description: '' });
    this.changed();
  }

  remove(i: number): void {
    this.params.splice(i, 1);
    this.changed();
  }

  moveUp(i: number): void {
    if (i <= 0) return;
    [this.params[i - 1], this.params[i]] = [this.params[i], this.params[i - 1]];
    this.changed();
  }

  moveDown(i: number): void {
    if (i >= this.params.length - 1) return;
    [this.params[i], this.params[i + 1]] = [this.params[i + 1], this.params[i]];
    this.changed();
  }

  changed(): void {
    this.state.markDirty();
  }
}
