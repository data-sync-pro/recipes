import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FieldGroup } from '../models/setup.model';

@Component({
  selector: 'app-field-groups',
  templateUrl: './field-groups.component.html',
  styleUrls: ['./field-groups.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FieldGroupsComponent {
  @Input() groups: FieldGroup[] = [];
  @Input() placeholder = 'Filter fields';

  filterQuery = '';

  onFilterInput(event: Event): void {
    this.filterQuery = (event.target as HTMLInputElement).value;
  }

  get filteredGroups(): FieldGroup[] {
    const q = this.filterQuery.trim().toLowerCase();
    if (!q) return this.groups;
    return this.groups
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
