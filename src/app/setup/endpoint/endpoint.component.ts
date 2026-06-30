import { Component, Input, ChangeDetectionStrategy, OnChanges } from '@angular/core';
import { Block } from '../models/setup.model';
import { splitPlaceholders, PlaceholderToken } from '../utils/placeholder.util';

/**
 * Boxed REST endpoint panel: method pill + URL header strip, then a body with
 * the endpoint name, a tag badge, a description, and arbitrary child blocks
 * (label / code / p) rendered through the recursive app-setup-block.
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
