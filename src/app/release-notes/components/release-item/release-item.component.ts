import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ReleaseItem } from '../../models/release.model';
import { BLOCK_COMPONENTS } from '../blocks/block-registry';

/** One entry of a section: a title followed by its content blocks. */
@Component({
  selector: 'app-release-item',
  templateUrl: './release-item.component.html',
  styleUrls: ['./release-item.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleaseItemComponent {
  @Input() item!: ReleaseItem;

  readonly blockComponents = BLOCK_COMPONENTS;
}
