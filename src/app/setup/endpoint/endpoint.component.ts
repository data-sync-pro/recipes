import { Component, Input, ChangeDetectionStrategy, OnChanges } from '@angular/core';
import { Block } from '../models/setup.model';
import { splitPlaceholders, PlaceholderToken } from '../utils/placeholder.util';

/**
 * Standalone REST endpoint header: a method pill + URL strip. The endpoint's
 * name, description, and section content are authored as plain sibling blocks
 * (h2 / p / table / code), not wrapped by this component.
 */
@Component({
  selector: 'app-setup-endpoint',
  templateUrl: './endpoint.component.html',
  styleUrls: ['./endpoint.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SetupEndpointComponent implements OnChanges {
  @Input() block!: Block;
  @Input() basePath = 'assets/setups';

  urlTokens: PlaceholderToken[] = [];

  ngOnChanges(): void {
    this.urlTokens = splitPlaceholders(this.block?.url);
  }
}
