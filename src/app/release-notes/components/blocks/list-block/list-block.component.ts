import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ListBlock } from '../../../models/release.model';

@Component({
  selector: 'app-release-list-block',
  templateUrl: './list-block.component.html',
  styleUrls: ['./list-block.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListBlockComponent {
  @Input() block!: ListBlock;
}
