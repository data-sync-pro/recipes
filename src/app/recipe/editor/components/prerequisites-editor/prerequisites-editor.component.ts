import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { PrerequisiteRecipe, QuickLink } from '../../../core/models/recipe.model';
import { TrackByUtil } from '../../../core/utils/trackby.util';

@Component({
  selector: 'app-prerequisites-editor',
  templateUrl: './prerequisites-editor.component.html',
  styleUrls: ['./prerequisites-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PrerequisitesEditorComponent {
  @Input() prerequisites: PrerequisiteRecipe[] = [];
  @Output() prerequisitesChange = new EventEmitter<void>();

  onChange(): void {
    this.prerequisitesChange.emit();
  }

  addPrerequisite(): void {
    const newPrereq: PrerequisiteRecipe = {
      description: '',
      quickLinks: []
    };

    this.prerequisites.push(newPrereq);
    this.onChange();
  }

  removePrerequisite(index: number): void {
    if (!this.prerequisites) return;

    this.prerequisites.splice(index, 1);
    this.onChange();
  }

  addQuickLink(prereqIndex: number): void {
    if (!this.prerequisites?.[prereqIndex]) return;

    const newLink: QuickLink = {
      title: '',
      url: ''
    };

    this.prerequisites[prereqIndex].quickLinks.push(newLink);
    this.onChange();
  }

  removeQuickLink(prereqIndex: number, linkIndex: number): void {
    if (!this.prerequisites?.[prereqIndex]) return;

    this.prerequisites[prereqIndex].quickLinks.splice(linkIndex, 1);
    this.onChange();
  }

  trackByIndex = TrackByUtil.index;
}
