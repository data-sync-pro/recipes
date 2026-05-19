import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import {
  DownloadFileCallout,
  PrereqSection,
  PrereqObject,
  PrereqField,
  PrereqRecordType
} from '../../../core/models/recipe.model';
import { TrackByUtil } from '../../../core/utils/trackby.util';

const OBJECT_TYPES: PrereqObject['objectType'][] = ['Custom Object', 'Big Object', 'Standard Object'];

@Component({
  selector: 'app-download-file-callout-editor',
  templateUrl: './download-file-callout-editor.component.html',
  styleUrls: ['./download-file-callout-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DownloadFileCalloutEditorComponent {
  @Input() callouts: DownloadFileCallout[] = [];
  @Input() recipeId: string = '';
  @Input() recipeCategory: string = '';

  @Output() calloutsChange = new EventEmitter<void>();

  readonly objectTypes = OBJECT_TYPES;

  onChange(): void {
    this.calloutsChange.emit();
  }

  // ==================== Callout (group) ====================

  addCallout(): void {
    const newCallout: DownloadFileCallout = { sections: [] };
    this.callouts.push(newCallout);
    this.onChange();
  }

  removeCallout(index: number): void {
    this.callouts.splice(index, 1);
    this.onChange();
  }

  // ==================== Sections ====================

  addSection(calloutIndex: number): void {
    const callout = this.callouts[calloutIndex];
    if (!callout) return;
    if (!callout.sections) callout.sections = [];
    callout.sections.push({ label: '', description: '', media: [] });
    this.onChange();
  }

  removeSection(calloutIndex: number, sectionIndex: number): void {
    const callout = this.callouts[calloutIndex];
    if (!callout?.sections) return;
    callout.sections.splice(sectionIndex, 1);
    this.onChange();
  }

  // ==================== Objects ====================

  addObject(section: PrereqSection): void {
    if (!section.objects) section.objects = [];
    const newObj: PrereqObject = {
      name: '',
      objectType: 'Custom Object',
      fields: []
    };
    section.objects.push(newObj);
    this.onChange();
  }

  removeObject(section: PrereqSection, objectIndex: number): void {
    if (!section.objects) return;
    section.objects.splice(objectIndex, 1);
    this.onChange();
  }

  // ==================== Fields ====================

  addField(obj: PrereqObject): void {
    if (!obj.fields) obj.fields = [];
    const newField: PrereqField = { name: '', type: 'Text' };
    obj.fields.push(newField);
    this.onChange();
  }

  removeField(obj: PrereqObject, fieldIndex: number): void {
    if (!obj.fields) return;
    obj.fields.splice(fieldIndex, 1);
    this.onChange();
  }

  // Toggle whether a field name is included in the object's indexFields array.
  toggleIndexField(obj: PrereqObject, fieldName: string): void {
    if (!obj.indexFields) obj.indexFields = [];
    const idx = obj.indexFields.indexOf(fieldName);
    if (idx === -1) obj.indexFields.push(fieldName);
    else obj.indexFields.splice(idx, 1);
    this.onChange();
  }

  isIndexField(obj: PrereqObject, fieldName: string): boolean {
    return !!obj.indexFields && obj.indexFields.includes(fieldName);
  }

  // ==================== Record Types ====================

  addRecordType(obj: PrereqObject): void {
    if (!obj.recordTypes) obj.recordTypes = [];
    const newRT: PrereqRecordType = { label: '', name: '' };
    obj.recordTypes.push(newRT);
    this.onChange();
  }

  removeRecordType(obj: PrereqObject, rtIndex: number): void {
    if (!obj.recordTypes) return;
    obj.recordTypes.splice(rtIndex, 1);
    this.onChange();
  }

  // ==================== Section Media ====================

  /** Ensure section.media is an array so the image-manager has a stable ref */
  getSectionMedia(section: PrereqSection): any[] {
    if (!section.media) section.media = [];
    return section.media;
  }

  trackByIndex = TrackByUtil.index;
}
