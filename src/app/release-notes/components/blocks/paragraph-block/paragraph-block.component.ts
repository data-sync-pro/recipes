import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ParagraphBlock } from '../../../models/release.model';

@Component({
  selector: 'app-release-paragraph-block',
  templateUrl: './paragraph-block.component.html',
  styleUrls: ['./paragraph-block.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParagraphBlockComponent {
  @Input() block!: ParagraphBlock;
}
