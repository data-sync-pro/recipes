import { Component, Input, OnChanges } from '@angular/core';
import { DocData } from '../../../services/docs.service';
import { EditorStateService } from '../../services/editor-state.service';

@Component({
  selector: 'app-raw-json-section',
  templateUrl: './raw-json-section.component.html',
})
export class RawJsonSectionComponent implements OnChanges {
  @Input() doc!: DocData;
  @Input() hint = '';

  textValue = '';
  parseError = '';

  constructor(private state: EditorStateService) {}

  ngOnChanges(): void {
    this.textValue = JSON.stringify(this.doc, null, 2);
    this.parseError = '';
  }

  onChange(): void {
    let parsed: DocData;
    try {
      parsed = JSON.parse(this.textValue) as DocData;
    } catch (err) {
      this.parseError = (err as Error).message;
      return;
    }
    this.parseError = '';
    // Mutate in place so the same reference still flows to the preview pane.
    Object.keys(this.doc).forEach((key) => {
      delete (this.doc as unknown as Record<string, unknown>)[key];
    });
    Object.assign(this.doc, parsed);
    this.state.markDirty();
  }
}
