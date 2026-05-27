import { Component, Input, ChangeDetectionStrategy, AfterViewChecked, OnInit, ElementRef, ViewChild, HostListener } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { Block } from '../models/setup.model';
import { SetupService } from '../services/setup.service';
import Prism from 'prismjs';
import 'prismjs/components/prism-java';

@Component({
  selector: 'app-setup-block',
  templateUrl: './block.component.html',
  styleUrls: ['./block.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SetupBlockComponent implements OnInit, AfterViewChecked {
  @Input() block!: Block;
  @Input() basePath = 'assets/setups';
  @ViewChild('codeBlock') codeBlock?: ElementRef<HTMLElement>;

  private highlighted = false;
  isCollapsed = true;
  activeTabIndex = 0;

  ngOnInit(): void {
    if (this.block?.defaultExpanded === true) {
      this.isCollapsed = false;
    }
  }

  toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
  }

  selectTab(index: number): void {
    this.activeTabIndex = index;
  }

  constructor(
    private sanitizer: DomSanitizer,
    private setupService: SetupService,
    private router: Router
  ) {}

  // Renders inline cross-page links written as [[slug]] or [[slug|Label]].
  // Unresolved slugs render as a visible broken-link span so authors notice.
  renderContent(content: string | undefined): string {
    if (!content) return '';
    return content.replace(/\[\[([^|\]]+?)(?:\|([^\]]+?))?\]\]/g, (_match, slug: string, label?: string) => {
      const tree = this.setupService.getCachedNavTree();
      const node = this.setupService.findNodeBySlug(tree, slug.trim());
      const text = (label ?? node?.label ?? slug).trim();
      if (!node) {
        return `<span class="setup-link-broken" title="Unknown setup slug: ${slug}">${text}</span>`;
      }
      const path = node.slug ? this.setupService.getPathToNode(tree, node.slug) : null;
      const href = path ? '/setup/' + path.map(n => n.slug).filter((s): s is string => !!s).join('/') : '#';
      return `<a class="setup-link" href="${href}" data-slug="${node.slug ?? ''}">${text}</a>`;
    });
  }

  @HostListener('click', ['$event'])
  onContentClick(event: MouseEvent): void {
    // Let modified clicks (new tab, new window, download) fall through to the browser.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const target = (event.target as HTMLElement | null)?.closest('a.setup-link') as HTMLAnchorElement | null;
    if (!target) return;
    const slug = target.dataset['slug'];
    if (!slug) return;
    const tree = this.setupService.getCachedNavTree();
    const path = this.setupService.getPathToNode(tree, slug);
    if (!path) return;
    event.preventDefault();
    this.router.navigate(['/setup', ...path.map(n => n.slug)]);
  }

  ngAfterViewChecked(): void {
    if (this.block.type === 'code' && this.codeBlock && !this.highlighted) {
      Prism.highlightElement(this.codeBlock.nativeElement);
      this.highlighted = true;
    }
  }

  trackByIndex(index: number): number {
    return index;
  }

  getImagePath(content: string): string {
    if (content.startsWith('http') || content.startsWith('/')) {
      return content;
    }
    return `${this.basePath}/${content}`;
  }

  getVideoPath(src: string): string {
    if (src.startsWith('https') || src.startsWith('/')) {
      return src;
    }
    return `${this.basePath}/${src}`;
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
    // Reject malformed IDs so we never trust an empty / attacker-controlled value
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
      return this.sanitizer.bypassSecurityTrustResourceUrl('about:blank');
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(`https://www.youtube.com/embed/${videoId}?rel=0`);
  }

  getPrismLanguage(language: string | undefined): string {
    const languageMap: Record<string, string> = {
      'apex': 'java',
      'soql': 'sql',
    };
    return languageMap[language || ''] || language || 'plaintext';
  }
}
