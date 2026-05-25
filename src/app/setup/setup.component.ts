import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, ElementRef, HostListener } from '@angular/core';
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

  @ViewChild('filterInput') filterInputRef?: ElementRef<HTMLInputElement>;

  // Legacy - kept for backward compatibility
  setupIndex: SetupIndexItem[] = [];

  // New navigation tree
  navTree: NavNode[] = [];
  expandedIds: Set<string> = new Set();

  // Filter
  filterQuery: string = '';
  private preFilterExpanded: Set<string> | null = null;
  private visibleNodeIds: Set<string> | null = null;
  private contentIndex: Map<string, string> | null = null;

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
          this.prefetchContentIndex();
        },
        error: () => {
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private prefetchContentIndex(): void {
    this.setupService.getContentIndex()
      .pipe(takeUntil(this.destroy$))
      .subscribe(index => {
        this.contentIndex = index;
        // If the user is already filtering, re-run with content matches now available.
        if (this.filterQuery) {
          this.visibleNodeIds = this.computeVisibleIds(
            this.navTree,
            this.filterQuery.toLowerCase()
          );
          this.expandAllInSet(this.navTree, this.visibleNodeIds);
          this.cdr.markForCheck();
        }
      });
  }

  private initializeExpandedState(nodes: NavNode[]): void {
    for (const node of nodes) {
      if (node.children?.length) {
        this.expandedIds.add(node.id);
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
      if (node.visible === false) continue;
      if (node.slug) return node.slug;
      if (node.children?.length) {
        const childSlug = this.getFirstPageSlug(node.children);
        if (childSlug) return childSlug;
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
    // Build the full path for the URL (skip grouping nodes with no slug)
    const path = this.setupService.getPathToNode(this.navTree, slug);
    if (path && path.length > 0) {
      const slugPath = path.map(n => n.slug).filter((s): s is string => !!s);
      this.router.navigate(['/setup', ...slugPath]);
    } else {
      this.router.navigate(['/setup', slug]);
    }
  }

  onNodeClick(node: NavNode): void {
    // Grouping node (no slug): click toggles expand
    if (!node.slug && node.children?.length) {
      if (this.expandedIds.has(node.id)) {
        this.expandedIds.delete(node.id);
      } else {
        this.expandedIds.add(node.id);
      }
      this.cdr.markForCheck();
      return;
    }
    if (node.slug) {
      this.selectSetup(node.slug);
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

  branchHasActive(node: NavNode): boolean {
    if (!this.currentSlug) return false;
    if (node.slug === this.currentSlug) return true;
    return node.children?.some(c => this.branchHasActive(c)) ?? false;
  }

  trackByNodeId(_: number, node: NavNode): string {
    return node.id;
  }

  // ==================== Filter ====================

  get totalPageCount(): number {
    return this.setupService.flattenSlugs(this.navTree).length;
  }

  get hasAnyMatch(): boolean {
    if (!this.filterQuery) return true;
    return (this.visibleNodeIds?.size ?? 0) > 0;
  }

  isNodeVisible(node: NavNode): boolean {
    if (!this.visibleNodeIds) return true;
    return this.visibleNodeIds.has(node.id);
  }

  onFilterChange(value: string): void {
    const previouslyEmpty = !this.filterQuery;
    this.filterQuery = value;

    if (this.filterQuery && previouslyEmpty) {
      this.preFilterExpanded = new Set(this.expandedIds);
    }

    if (!this.filterQuery) {
      this.visibleNodeIds = null;
      if (this.preFilterExpanded) {
        this.expandedIds = this.preFilterExpanded;
        this.preFilterExpanded = null;
      }
    } else {
      this.visibleNodeIds = this.computeVisibleIds(
        this.navTree,
        this.filterQuery.toLowerCase()
      );
      // Auto-expand every parent of a visible node so matches are revealed.
      this.expandAllInSet(this.navTree, this.visibleNodeIds);
    }

    this.cdr.markForCheck();
  }

  clearFilter(): void {
    this.onFilterChange('');
    this.filterInputRef?.nativeElement.focus();
  }

  /**
   * A node is visible when it matches the query, OR an ancestor matched
   * (so the user sees a matched branch in full), OR a descendant matched
   * (so the user can navigate down to the match).
   */
  private computeVisibleIds(nodes: NavNode[], q: string): Set<string> {
    const visible = new Set<string>();

    const addSubtree = (node: NavNode) => {
      visible.add(node.id);
      node.children?.forEach(addSubtree);
    };

    const walk = (list: NavNode[], ancestors: NavNode[]): boolean => {
      let any = false;
      for (const node of list) {
        const labelMatch = node.label.toLowerCase().includes(q);
        const contentMatch =
          !labelMatch &&
          !!node.slug &&
          !!this.contentIndex?.get(node.slug)?.includes(q);
        const selfMatch = labelMatch || contentMatch;
        if (selfMatch) {
          ancestors.forEach(a => visible.add(a.id));
          addSubtree(node);
          if (node.children) {
            walk(node.children, [...ancestors, node]);
          }
          any = true;
        } else if (node.children) {
          const childMatched = walk(node.children, [...ancestors, node]);
          if (childMatched) {
            visible.add(node.id);
            ancestors.forEach(a => visible.add(a.id));
            any = true;
          }
        }
      }
      return any;
    };

    walk(nodes, []);
    return visible;
  }

  private expandAllInSet(nodes: NavNode[], visible: Set<string>): void {
    for (const node of nodes) {
      if (visible.has(node.id) && node.children?.length) {
        this.expandedIds.add(node.id);
        this.expandAllInSet(node.children, visible);
      }
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    const isEditable =
      !!target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable);
    if (isEditable) return;
    event.preventDefault();
    this.filterInputRef?.nativeElement.focus();
    this.filterInputRef?.nativeElement.select();
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
