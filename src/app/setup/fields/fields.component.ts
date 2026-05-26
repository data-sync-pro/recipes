import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FieldGroup, FieldItem } from '../models/setup.model';

@Component({
  selector: 'app-setup-fields',
  templateUrl: './fields.component.html',
  styleUrls: ['./fields.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SetupFieldsComponent {
  @Input() fields: FieldItem[] = [];
  @Input() groups: FieldGroup[] = [];
  @Input() showFilter = false;
  @Input() placeholder = 'Filter fields';

  filterQuery = '';

  onFilterInput(event: Event): void {
    this.filterQuery = (event.target as HTMLInputElement).value;
  }

  private get normalizedGroups(): FieldGroup[] {
    if (this.groups?.length) return this.groups;
    if (this.fields?.length) return [{ title: '', fields: this.fields }];
    return [];
  }

  get filteredGroups(): FieldGroup[] {
    const groups = this.normalizedGroups;
    const q = this.filterQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map(g => ({
        title: g.title,
        fields: g.fields.filter(f =>
          f.name.toLowerCase().includes(q) ||
          (f.description || '').toLowerCase().includes(q)
        )
      }))
      .filter(g => g.fields.length > 0);
  }

  trackByIndex(index: number): number {
    return index;
  }
}
