import { Component, Input, OnChanges } from '@angular/core';
import { DocData } from '../../../services/docs.service';
import { EditorStateService } from '../../services/editor-state.service';

@Component({
  selector: 'app-description-section',
  templateUrl: './description-section.component.html',
})
export class DescriptionSectionComponent implements OnChanges {
  @Input() doc!: DocData;

  constructor(private state: EditorStateService) {}

  ngOnChanges(): void {
    if (this.doc && !this.doc.images) {
      this.doc.images = [];
    }
  }

  changed(): void {
    this.state.markDirty();
  }
}
