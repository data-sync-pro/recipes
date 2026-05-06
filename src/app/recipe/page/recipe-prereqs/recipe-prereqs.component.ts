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
  PrereqSection,
  StepMedia
} from '../../core/models/recipe.model';

interface InlineCustomField {
  name: string;
  type: string;
  length?: number;
  isIndex: boolean;
}

interface SectionForDisplay {
  label?: string;
  description?: string;
  inlineCustomFields: InlineCustomField[];
  objectCards: PrereqObject[];
  media?: StepMedia[];
}

interface CalloutForDisplay {
  sections: SectionForDisplay[];
}

@Component({
  selector: 'app-recipe-prereqs',
  templateUrl: './recipe-prereqs.component.html',
  styleUrls: ['./recipe-prereqs.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecipePrereqsComponent {
  @Input() set callouts(value: DownloadFileCallout[] | null | undefined) {
    this.renderedCallouts = (value ?? []).map(c => ({
      sections: (c.sections ?? []).map(s => this.toSectionForDisplay(s))
    }));
  }

  @Output() mediaClick = new EventEmitter<StepMedia>();

  renderedCallouts: CalloutForDisplay[] = [];

  private toSectionForDisplay(section: PrereqSection): SectionForDisplay {
    const inlineCustomFields: InlineCustomField[] = [];
    const objectCards: PrereqObject[] = [];

    for (const obj of section.objects ?? []) {
      if (this.shouldInline(obj)) {
        for (const field of obj.fields) {
          inlineCustomFields.push({
            name: this.isCustomField(field.name) ? `${obj.name}.${field.name}` : field.name,
            type: field.type,
            length: field.length,
            isIndex: !!obj.indexFields?.includes(field.name)
          });
        }
      } else {
        objectCards.push(obj);
      }
    }

    return {
      label: section.label,
      description: section.description,
      inlineCustomFields,
      objectCards,
      media: section.media
    };
  }

  // Standard Object whose prerequisites are just fields (no record types):
  // its custom fields get flattened into the section's inline chip row.
  private shouldInline(obj: PrereqObject): boolean {
    return obj.objectType === 'Standard Object'
      && !!obj.fields?.length
      && !obj.recordTypes?.length;
  }

  private isCustomField(name: string): boolean {
    return name.endsWith('__c');
  }
}
