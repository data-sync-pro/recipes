import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { TableBlock } from '../../../models/release.model';

@Component({
  selector: 'app-release-table-block',
  templateUrl: './table-block.component.html',
  styleUrls: ['./table-block.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableBlockComponent {
  @Input() block!: TableBlock;
}
