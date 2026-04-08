import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SetupService } from './services/setup.service';
import { Page, Block, SetupIndexItem } from './models/setup.model';
import { CardItem } from './card/card.component';

@Component({
  selector: 'app-setup',
  templateUrl: './setup.component.html',
  styleUrls: ['./setup.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SetupComponent implements OnInit, OnDestroy, AfterViewInit {
  private destroy$ = new Subject<void>();
  private observer: IntersectionObserver | null = null;

  setupIndex: SetupIndexItem[] = [];
  currentSetup: Page | null = null;
  currentSlug: string | null = null;
  isLoading = true;
  activeBlockId: string | null = null;

  // Lightning Web Components cards
  lwcCards: CardItem[] = [
    { title: 'Pipeline Data Lists', slug: 'data-lists', image: 'image/lightning-page/data_lists.png' },
    { title: 'Pipeline Quick Links', slug: 'quick-links', image: 'image/lightning-page/quick_links.png' },
    { title: 'Pipeline Action Buttons', slug: 'action-buttons', image: 'image/lightning-page/action_buttons.png' },
    { title: 'Executable Data List', slug: 'data-list', image: 'image/lightning-page/data_list.png' },
    { title: 'Executable Action Button', slug: 'action-button', image: 'image/lightning-page/action_button.png' }
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private setupService: SetupService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadIndex();
  }

  ngAfterViewInit(): void {
    this.setupScrollObserver();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.observer?.disconnect();
  }

  private setupScrollObserver(): void {
    this.observer?.disconnect();

    this.observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries.filter(entry => entry.isIntersecting);
        if (visibleEntries.length > 0) {
          // Get the topmost visible entry
          const topEntry = visibleEntries.reduce((prev, curr) =>
            prev.boundingClientRect.top < curr.boundingClientRect.top ? prev : curr
          );
          this.activeBlockId = topEntry.target.id;
          this.cdr.markForCheck();
        }
      },
      {
        rootMargin: '-80px 0px -60% 0px',
        threshold: 0
      }
    );

    // Observe all H2 and H3 block elements after content loads
    setTimeout(() => {
      [...this.h2Blocks, ...this.h3Blocks].forEach(block => {
        const id = this.getBlockId(block.content || '');
        const element = document.getElementById(id);
        if (element) {
          this.observer?.observe(element);
        }
      });
    });
  }

  private loadIndex(): void {
    this.setupService.getSetupIndex()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (index) => {
          this.setupIndex = index.filter(item => item.active);
          this.watchRoute();
        },
        error: () => {
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private watchRoute(): void {
    this.route.paramMap
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const parentSlug = params.get('parentSlug');
        const childSlug = params.get('childSlug');
        const setupSlug = params.get('setupSlug');

        // Find the matching item from index
        let slug: string | null = null;
        if (parentSlug && childSlug) {
          // Nested route: find item with this slug and matching parent
          const item = this.setupIndex.find(
            i => i.slug === childSlug && i.parent === parentSlug
          );
          slug = item?.slug || null;
        } else if (setupSlug) {
          slug = setupSlug;
        }

        if (slug) {
          this.loadSetup(slug);
        } else if (this.setupIndex.length > 0) {
          this.selectSetup(this.parentItems[0].slug);
        } else {
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private loadSetup(slug: string): void {
    this.currentSlug = slug;
    this.isLoading = true;
    this.cdr.markForCheck();

    this.setupService.getSetupBySlug(slug)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (setup) => {
          this.currentSetup = setup;
          this.isLoading = false;
          this.activeBlockId = null;
          this.cdr.markForCheck();
          this.setupScrollObserver();
        },
        error: () => {
          this.currentSetup = null;
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  get h2Blocks(): Block[] {
    if (!this.currentSetup?.blocks) return [];
    return this.currentSetup.blocks.filter(b => b.type === 'h2');
  }

  // Get h3 blocks (children of h2 or top-level steps)
  get h3Blocks(): Block[] {
    if (!this.currentSetup?.blocks) return [];
    const h3s: Block[] = [];
    for (const block of this.currentSetup.blocks) {
      if (block.type === 'h3') {
        h3s.push(block);
      } else if (block.type === 'h2' && block.children) {
        h3s.push(...block.children.filter(c => c.type === 'h3'));
      }
    }
    return h3s;
  }

  // Get TOC items: h2 with their h3 children
  get tocItems(): { block: Block; children: Block[] }[] {
    if (!this.currentSetup?.blocks) return [];
    const items: { block: Block; children: Block[] }[] = [];

    for (const block of this.currentSetup.blocks) {
      if (block.type === 'h2') {
        const h3Children = block.children?.filter(c => c.type === 'h3') || [];
        items.push({ block, children: h3Children });
      } else if (block.type === 'h3') {
        // Top-level h3 (not under h2)
        items.push({ block, children: [] });
      }
    }
    return items;
  }

  get shouldShowToc(): boolean {
    const items = this.tocItems;
    const h2Items = items.filter(item => item.block.type === 'h2');
    const topLevelH3Items = items.filter(item => item.block.type === 'h3');

    // Show TOC when: multiple H2, or H2 has H3 children, or multiple top-level H3
    return h2Items.length > 1
      || h2Items.some(item => item.children.length > 0)
      || topLevelH3Items.length > 1;
  }

  selectSetup(slug: string): void {
    // Find the item to get its parent
    const item = this.setupIndex.find(i => i.slug === slug);
    if (item?.parent) {
      // Nested route: /setup/parent/child
      this.router.navigate(['/setup', item.parent, slug]);
    } else {
      // Top-level route: /setup/slug
      this.router.navigate(['/setup', slug]);
    }
  }

  scrollToBlock(content: string): void {
    const id = this.getBlockId(content);
    const element = document.getElementById(id);
    if (element) {
      const headerOffset = 80;
      const elementPosition = element.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: elementPosition - headerOffset, behavior: 'smooth' });
    }
  }

  getBlockId(content: string): string {
    return 'block-' + (content || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  trackBySlug(_: number, item: SetupIndexItem): string {
    return item.slug;
  }

  trackByIndex(index: number): number {
    return index;
  }

  // Get only parent items (items without a parent field)
  get parentItems(): SetupIndexItem[] {
    return this.setupIndex.filter(item => !item.parent);
  }

  // Get children of a specific parent (excluding hidden items)
  getChildren(parentSlug: string): SetupIndexItem[] {
    return this.setupIndex.filter(item => item.parent === parentSlug && !item.hidden);
  }

  // Check if a parent has visible children
  hasChildren(parentSlug: string): boolean {
    return this.setupIndex.some(item => item.parent === parentSlug && !item.hidden);
  }

  // Check if the current page is within a parent's hierarchy
  isParentActive(parentSlug: string): boolean {
    if (this.currentSlug === parentSlug) return true;
    return this.setupIndex.some(
      item => item.parent === parentSlug && item.slug === this.currentSlug
    );
  }

  // Check if should show LWC cards
  get showLwcCards(): boolean {
    return this.currentSlug === 'add-dsp-components-to-lightning-app-builder';
  }

  onCardClick(slug: string): void {
    this.selectSetup(slug);
  }
}
