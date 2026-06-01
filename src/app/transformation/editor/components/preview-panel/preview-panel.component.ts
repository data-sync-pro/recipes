import { Component } from '@angular/core';
import { Observable, map } from 'rxjs';
import { EditorStateService } from '../../services/editor-state.service';

@Component({
  selector: 'app-preview-panel',
  templateUrl: './preview-panel.component.html',
  styleUrls: ['./preview-panel.component.css'],
})
export class PreviewPanelComponent {
  readonly previewJson$: Observable<string | null>;

  constructor(private editorState: EditorStateService) {
    this.previewJson$ = this.editorState.currentDoc$.pipe(
      map((doc) => (doc ? JSON.stringify(doc, null, 2) : null))
    );
  }
}
