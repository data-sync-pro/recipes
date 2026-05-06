import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy
} from '@angular/core';
import {
  DownloadFileCallout,
  PrereqObject,
  StepMedia
} from '../../core/models/recipe.model';

@Component({
  selector: 'app-recipe-prereqs',
  templateUrl: './recipe-prereqs.component.html',
  styleUrls: ['./recipe-prereqs.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecipePrereqsComponent {
  @Input() callouts: DownloadFileCallout[] | null | undefined;
  @Output() mediaClick = new EventEmitter<StepMedia>();

  // Standard Object whose prerequisites are just fields (no record types):
  // hide the object header and inline the object name into each custom field chip.
  isInlineObject(obj: PrereqObject): boolean {
    return obj.objectType === 'Standard Object'
      && !!obj.fields?.length
      && !obj.recordTypes?.length;
  }

  isCustomField(name: string): boolean {
    return name.endsWith('__c');
  }
}
