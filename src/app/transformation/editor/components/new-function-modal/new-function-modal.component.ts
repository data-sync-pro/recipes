import { Component, EventEmitter, Input, Output } from '@angular/core';
import { EditorStateService } from '../../services/editor-state.service';

@Component({
  selector: 'app-new-function-modal',
  templateUrl: './new-function-modal.component.html',
  styleUrls: ['./new-function-modal.component.css'],
})
export class NewFunctionModalComponent {
  @Input() availableTags: string[] = [];
  @Output() closed = new EventEmitter<void>();

  name = '';
  title = '';
  primaryTag = '';
  errorMessage = '';

  constructor(private state: EditorStateService) {}

  cancel(): void {
    this.closed.emit();
  }

  create(): void {
    this.errorMessage = '';
    if (!this.name.trim()) {
      this.errorMessage = 'Name is required.';
      return;
    }
    const result = this.state.createNewFunction(
      this.name,
      this.title,
      this.primaryTag
    );
    if (!result.ok) {
      this.errorMessage = result.reason;
      return;
    }
    this.closed.emit();
  }
}
