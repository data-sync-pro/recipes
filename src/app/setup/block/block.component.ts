import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
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

  constructor(private sanitizer: DomSanitizer) {}

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

  isYouTubeUrl(url: string | undefined): boolean {
    if (!url) return false;
    return url.includes('youtube.com') || url.includes('youtu.be');
  }

  getYouTubeEmbedUrl(url: string): SafeResourceUrl {
    let videoId = '';
    if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1]?.split(/[?#]/)[0] || '';
    } else if (url.includes('watch?v=')) {
      videoId = url.split('watch?v=')[1]?.split(/[&#]/)[0] || '';
    } else if (url.includes('/embed/')) {
      videoId = url.split('/embed/')[1]?.split(/[?#]/)[0] || '';
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(`https://www.youtube.com/embed/${videoId}`);
  }
}
