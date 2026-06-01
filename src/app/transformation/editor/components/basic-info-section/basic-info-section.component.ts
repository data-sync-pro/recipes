import { Component, Input } from '@angular/core';
import { DocData } from '../../../services/docs.service';
import { EditorStateService } from '../../services/editor-state.service';

@Component({
  selector: 'app-basic-info-section',
  templateUrl: './basic-info-section.component.html',
})
export class BasicInfoSectionComponent {
  @Input() doc!: DocData;

  constructor(private state: EditorStateService) {}

  changed(): void {
    this.state.markDirty();
  }
}
