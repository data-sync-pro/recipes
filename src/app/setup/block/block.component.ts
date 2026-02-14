import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { Block } from '../models/setup.model';

@Component({
  selector: 'app-setup-block',
  templateUrl: './block.component.html',
  styleUrls: ['./block.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SetupBlockComponent {
  @Input() block!: Block;
  @Input() basePath = 'assets/setups';

  trackByIndex(index: number): number {
    return index;
  }

  getImagePath(content: string): string {
    if (content.startsWith('http') || content.startsWith('/')) {
      return content;
    }
    return `${this.basePath}/${content}`;
  }

  getBlockId(content: string): string {
    return 'block-' + (content || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }
}
