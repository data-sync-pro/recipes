import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, filter } from 'rxjs/operators';
import { SetupService } from './services/setup.service';
import { Page, Block, SetupIndexItem, NavNode } from './models/setup.model';
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

  // Legacy - kept for backward compatibility
  setupIndex: SetupIndexItem[] = [];

  // New navigation tree
  navTree: NavNode[] = [];
  expandedIds: Set<string> = new Set();

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
    this.setupService.getNavTree()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (tree) => {
          this.navTree = tree;
          this.initializeExpandedState(tree);
          this.watchRoute();
        },
        error: () => {
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private initializeExpandedState(nodes: NavNode[]): void {
    for (const node of nodes) {
      // Expand by default if has children (unless explicitly set to false)
      if (node.children?.length && node.defaultExpanded !== false) {
        this.expandedIds.add(node.id);
      }
      if (node.children) {
        this.initializeExpandedState(node.children);
      }
    }
  }

  private watchRoute(): void {
    // Handle initial route
    this.handleRouteChange();

    // Listen for navigation events (needed for wildcard routes)
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.handleRouteChange();
      });
  }

  private handleRouteChange(): void {
    const url = this.router.url;
    const match = url.match(/\/setup\/(.+)/);
    const slug = match ? match[1].split('/').pop() : null;

    if (slug && slug !== this.currentSlug) {
      this.loadSetup(slug);
      this.expandParentsOfSlug(slug);
    } else if (!slug && this.navTree.length > 0) {
      // Navigate to first item
      const firstSlug = this.getFirstPageSlug(this.navTree);
      if (firstSlug) {
        this.selectSetup(firstSlug);
      }
    } else if (!slug) {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  private getFirstPageSlug(nodes: NavNode[]): string | null {
    for (const node of nodes) {
      if (node.visible !== false) {
        return node.slug;
      }
    }
    return null;
  }

  private expandParentsOfSlug(slug: string): void {
    const path = this.setupService.getPathToNode(this.navTree, slug);
    if (path) {
      // Expand all ancestors (except the leaf node itself)
      path.slice(0, -1).forEach(node => {
        if (node.children?.length) {
          this.expandedIds.add(node.id);
        }
      });
      this.cdr.markForCheck();
    }
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
    // Build the full path for the URL
    const path = this.setupService.getPathToNode(this.navTree, slug);
    if (path && path.length > 0) {
      const slugPath = path.map(n => n.slug);
      this.router.navigate(['/setup', ...slugPath]);
    } else {
      this.router.navigate(['/setup', slug]);
    }
  }

  // Toggle expand/collapse for a node
  toggleExpand(node: NavNode, event: Event): void {
    event.stopPropagation();
    if (this.expandedIds.has(node.id)) {
      this.expandedIds.delete(node.id);
    } else {
      this.expandedIds.add(node.id);
    }
    this.cdr.markForCheck();
  }

  isExpanded(node: NavNode): boolean {
    return this.expandedIds.has(node.id);
  }

  isActive(node: NavNode): boolean {
    return node.slug === this.currentSlug;
  }

  isInActivePath(node: NavNode): boolean {
    if (!this.currentSlug) return false;
    const path = this.setupService.getPathToNode(this.navTree, this.currentSlug);
    return path?.some(n => n.id === node.id) || false;
  }

  trackByNodeId(_: number, node: NavNode): string {
    return node.id;
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
