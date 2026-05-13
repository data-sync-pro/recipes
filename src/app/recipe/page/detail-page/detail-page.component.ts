import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ViewChild,
  ElementRef,
  HostListener
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject, combineLatest, fromEvent } from 'rxjs';
import { takeUntil, throttleTime } from 'rxjs/operators';

import { Recipe, Category } from '../../core/models/recipe.model';
import { CacheService } from '../../core/services/cache.service';
import { SearchService } from '../../core/services/search.service';
import { BreadcrumbItem } from '../detail-banner/detail-banner.component';
import { categoryToSlug, slugToCategoryName } from '../../core/constants/recipe.constants';

interface CategoryGroup {
  category: Category;
  recipes: Recipe[];
  isExpanded: boolean;
}

interface TocItem {
  id: string;
  label: string;
  children?: TocItem[];
  tabIndex?: number;
  indent?: boolean;
}

interface SectionConfig {
  id: string;
  label: string;
  templateRef: string;
  isVisible: (recipe: Recipe, component: RecipeDetailPageComponent) => boolean;
}

@Component({
  selector: 'app-recipe-detail-page',
  templateUrl: './detail-page.component.html',
  styleUrls: ['./detail-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecipeDetailPageComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  currentRecipe: Recipe | null = null;
  breadcrumbs: BreadcrumbItem[] = [];

  // Section configuration - single source of truth for section order
  readonly SECTION_CONFIG: SectionConfig[] = [
    {
      id: 'overview',
      label: 'Overview',
      templateRef: 'overview',
      isVisible: (r) => !!(r.overview && r.overview.length > 0)
    },
    {
      id: 'use-case',
      label: 'General Use Case',
      templateRef: 'useCase',
      isVisible: (r) => !!(r.generalUseCase && r.generalUseCase.split('\n').filter(item => item.trim()).length > 0)
    },
    {
      id: 'video-demo',
      label: 'Video Demo',
      templateRef: 'videoDemo',
      isVisible: (_r, c) => c.cachedYouTubeVideos.length > 0
    },
    {
      id: 'prerequisites',
      label: 'Prerequisites',
      templateRef: 'prerequisites',
      isVisible: (r) => !!(r.downloadFileCallout && r.downloadFileCallout.length > 0)
    },
    {
      id: 'download-file',
      label: 'Downloadable Executables',
      templateRef: 'downloadFile',
      isVisible: (r) => !!(r.downloadableExecutables && r.downloadableExecutables.length > 0)
    },
    {
      id: 'direction',
      label: 'Direction',
      templateRef: 'direction',
      isVisible: (r) => !!(r.direction && r.direction.trim().length > 0)
    },
    {
      id: 'pipeline',
      label: 'Pipeline',
      templateRef: 'pipeline',
      isVisible: (r) => !!(r.pipeline && r.pipeline.trim().length > 0)
    },
    {
      id: 'walkthrough',
      label: 'Walkthrough',
      templateRef: 'walkthrough',
      isVisible: (r) => !!(r.walkthrough && r.walkthrough.length > 0)
    }
  ];

  // Get visible sections based on current recipe
  get visibleSections(): SectionConfig[] {
    if (!this.currentRecipe) return [];
    return this.SECTION_CONFIG.filter(section => section.isVisible(this.currentRecipe!, this));
  }

  // Sidebar category groups
  categoryGroups: CategoryGroup[] = [];
  filteredCategoryGroups: CategoryGroup[] = [];
  sidebarSearchQuery: string = '';
  allRecipes: Recipe[] = [];
  allCategories: Category[] = [];

  // Active TOC section
  activeTocSection: string = 'overview';
  private isScrollingToSection: boolean = false;
  tocItems: TocItem[] = [];

  // Currently displayed walkthrough tab (index into currentRecipe.walkthrough)
  activeWalkthroughTabIndex: number = 0;

  // Media preview modal
  isMediaModalOpen: boolean = false;
  previewMedia: { type: string; url: string; alt: string } | null = null;

  // Search overlay
  isSearchOverlayOpen: boolean = false;

  // Mobile sidebar drawer
  isSidebarOpen: boolean = false;

  // YouTube URL cache to prevent flickering on scroll
  private youtubeUrlCache = new Map<string, SafeResourceUrl>();

  // Cached YouTube videos from generalImages to prevent re-rendering on scroll
  cachedYouTubeVideos: { url: string; alt: string }[] = [];

  @ViewChild('sidebarSearchInput') sidebarSearchInput!: ElementRef<HTMLInputElement>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cacheService: CacheService,
    private searchService: SearchService,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) { }

  ngOnInit(): void {
    // Get route params and load recipe
    combineLatest([
      this.route.paramMap,
      this.cacheService.getRecipes$()
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(([params, recipes]) => {
      const categorySlug = params.get('category');
      const recipeName = params.get('recipeName');
      const category = categorySlug ? slugToCategoryName(categorySlug) : null;

      this.allRecipes = recipes;
      this.allCategories = this.searchService.generateCategories(recipes);

      // Build category groups
      this.buildCategoryGroups();

      if (category && recipeName) {
        // Find the recipe by category and slug
        const recipe = recipes.find(r =>
          r.category.includes(category) && r.slug === recipeName
        );

        if (recipe) {
          // Scroll to top when switching to a different recipe via an
          // imperative navigation (sidebar click, search, etc.). On
          // popstate (browser back/forward) we leave the scroll alone
          // so the browser's native restoration can return the user to
          // where they were.
          const isDifferentRecipe = !!this.currentRecipe && this.currentRecipe.id !== recipe.id;
          const isPopstate = this.router.getCurrentNavigation()?.trigger === 'popstate';
          if (isDifferentRecipe && !isPopstate) {
            window.scrollTo({ top: 0, behavior: 'auto' });
          }

          this.currentRecipe = recipe;

          // Reset to first walkthrough tab whenever the recipe changes
          this.activeWalkthroughTabIndex = 0;

          // Build breadcrumb path (use first category or matched category)
          const breadcrumbCategory = recipe.category.includes(category) ? category : recipe.category[0];
          this.breadcrumbs = [
            { name: 'Recipes', url: '/recipes' },
            { name: breadcrumbCategory, url: `/recipes/${categoryToSlug(breadcrumbCategory)}` }
          ];

          // Expand the current category
          this.expandCategory(breadcrumbCategory);

          // Cache YouTube videos first (before building TOC which depends on it)
          this.buildYouTubeVideosCache();

          // Build TOC items dynamically
          this.buildTocItems();

          this.cdr.markForCheck();

          // Setup scroll listener for TOC after a short delay to ensure DOM is ready
          setTimeout(() => this.setupScrollListener(), 100);
        } else {
          // Recipe not found, redirect to recipes list
          this.router.navigate(['/recipes']);
        }
      }
    });
  }

  private buildCategoryGroups(): void {
    this.categoryGroups = this.allCategories.map(category => ({
      category,
      recipes: this.allRecipes.filter(r => r.category.includes(category.name)),
      isExpanded: false
    }));
    this.filteredCategoryGroups = [...this.categoryGroups];
  }

  private expandCategory(categoryName: string): void {
    const group = this.categoryGroups.find(g => g.category.name === categoryName);
    if (group) {
      group.isExpanded = true;
    }
  }

  categorySlug(categoryName: string): string {
    return categoryToSlug(categoryName);
  }

  toggleCategory(categoryName: string): void {
    const group = this.filteredCategoryGroups.find(g => g.category.name === categoryName);
    if (group) {
      group.isExpanded = !group.isExpanded;
      this.cdr.markForCheck();
    }
  }

  onSidebarSearchInput(): void {
    const query = this.sidebarSearchQuery.toLowerCase().trim();

    if (!query) {
      this.filteredCategoryGroups = [...this.categoryGroups];
    } else {
      // Filter recipes and expand categories with matching recipes
      this.filteredCategoryGroups = this.categoryGroups.map(group => {
        const filteredRecipes = group.recipes.filter(recipe =>
          recipe.title.toLowerCase().includes(query)
        );
        return {
          ...group,
          recipes: filteredRecipes,
          isExpanded: filteredRecipes.length > 0 ? true : group.isExpanded
        };
      }).filter(group => group.recipes.length > 0);
    }

    this.cdr.markForCheck();
  }

  @HostListener('document:keydown./', ['$event'])
  onSlashKey(event: Event) {
    event.preventDefault();
    this.openSearchOverlay();
  }

  openSearchOverlay(): void {
    this.isSearchOverlayOpen = true;
    this.cdr.markForCheck();
  }

  closeSearchOverlay(): void {
    this.isSearchOverlayOpen = false;
    this.cdr.markForCheck();
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
    this.cdr.markForCheck();
  }

  closeSidebar(): void {
    this.isSidebarOpen = false;
    this.cdr.markForCheck();
  }

  handleSearchSelect(selectedItem: any): void {
    this.closeSearchOverlay();
    // Navigate using the route provided by the search overlay
    if (selectedItem.slug && selectedItem.category) {
      this.router.navigate(['/recipes', categoryToSlug(selectedItem.category), selectedItem.slug]);
    }
  }

  scrollToSection(event: Event, sectionId: string, tabIndex?: number): void {
    event.preventDefault();

    this.activeTocSection = sectionId;
    // Suppress the scroll listener for a short window so it can't overwrite
    // the just-clicked item with whatever section the viewport calculation
    // picks during the programmatic scroll.
    this.isScrollingToSection = true;
    this.cdr.markForCheck();

    const doScroll = () => {
      // Tab parents (id === 'walkthrough-tab-N', no '-step-N' suffix) represent
      // the whole walkthrough for that tab. Scrolling to the panel element
      // would land at the first substep and hide the section heading + tab
      // switcher. Redirect to the walkthrough section so the user sees the
      // section title and the tabs together.
      const isTabParent = /^walkthrough-tab-\d+$/.test(sectionId);
      const targetId = isTabParent ? 'walkthrough' : sectionId;
      const element = document.getElementById(targetId);
      if (!element) return;
      element.scrollIntoView({ block: 'start', behavior: 'auto' });
      window.scrollBy(0, -80);
    };

    const releaseGuard = () => {
      setTimeout(() => {
        this.isScrollingToSection = false;
        this.cdr.markForCheck();
      }, 300);
    };

    // If the target lives in a non-active walkthrough tab, switch tabs first
    // and wait for the browser to lay out the newly-mounted panel before we
    // scroll. detectChanges() commits the DOM synchronously, but layout/paint
    // happens later — measuring before that gives positions from the previous
    // tab and the page appears not to scroll. Two rAFs guarantee we run after
    // the next layout+paint cycle.
    if (typeof tabIndex === 'number' && tabIndex !== this.activeWalkthroughTabIndex) {
      this.setActiveWalkthroughTab(tabIndex);
      this.cdr.detectChanges();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        doScroll();
        releaseGuard();
      }));
    } else {
      doScroll();
      releaseGuard();
    }
  }

  getDownloadFileName(file: any): string {
    // Extract filename from filePath, keeping underscores for safe file downloads
    const filePath = file.filePath || file.url || '';
    const fileName = filePath.split('/').pop() || 'download.json';

    // Ensure .json extension is present
    return fileName.endsWith('.json') ? fileName : fileName + '.json';
  }

  getDownloadDisplayName(file: any): string {
    // If title exists, return it
    if (file.title) {
      return file.title;
    }

    // Extract filename from filePath
    const filePath = file.filePath || file.url || '';
    const fileName = filePath.split('/').pop() || 'Download File';

    // Remove .json extension and replace underscores with spaces for display
    return fileName.replace('.json', '').replace(/_/g, ' ');
  }

  getDownloadUrl(file: any): string {
    return file.url || file.filePath || '';
  }

  getGeneralUseCaseItems(): string[] {
    if (!this.currentRecipe?.generalUseCase) {
      return [];
    }
    // Split by \n and filter out empty strings
    return this.currentRecipe.generalUseCase
      .split('\n')
      .map(item => item.trim())
      .filter(item => item.length > 0);
  }

  // shouldShowRulesEngine(): boolean {
  //   if (!this.currentRecipe) {
  //     return false;
  //   }
  //   // Show Rules Engine section if category does not include 'Transformation'
  //   return !this.currentRecipe.category.some(c => c.toLowerCase() === 'transformation');
  // }

  private buildTocItems(): void {
    if (!this.currentRecipe) {
      this.tocItems = [];
      return;
    }

    const items: TocItem[] = [];

    // Build TOC items from visible sections (using SECTION_CONFIG as single source of truth)
    for (const section of this.visibleSections) {
      const tocItem: TocItem = { id: section.id, label: section.label };

      // Walkthrough: enumerate every tab as a parent entry plus its steps as
      // indented children, regardless of which tab is currently active. This
      // gives the TOC the full hierarchy at once. Clicking a child whose
      // tabIndex differs from the active tab triggers a tab-switch in
      // scrollToSection before scrolling. Single-tab recipes skip the parent
      // entry to keep the previous flat-TOC look unchanged.
      if (section.id === 'walkthrough' && this.currentRecipe.walkthrough.length > 0) {
        const tabs = this.currentRecipe.walkthrough;
        const isMultiTab = tabs.length > 1;
        if (isMultiTab) {
          // Multi-tab: real two-level tree so the template can wrap each
          // parent + its substeps in a single group card (highlighted as a
          // unit when something inside is active).
          tocItem.children = tabs.map((tab, ti) => ({
            id: `walkthrough-tab-${ti}`,
            label: `${ti + 1}. ${tab.tab || `Tab ${ti + 1}`}`,
            tabIndex: ti,
            children: (tab.steps ?? []).map((step, si) => ({
              id: `walkthrough-tab-${ti}-step-${si + 1}`,
              label: step.step,
              tabIndex: ti,
              indent: true
            }))
          }));
        } else {
          // Single-tab (legacy / non-grouped): flat numbered list of steps,
          // unchanged from before this change.
          tocItem.children = (tabs[0]?.steps ?? []).map((step, si) => ({
            id: `walkthrough-tab-0-step-${si + 1}`,
            label: `${si + 1}. ${step.step}`,
            tabIndex: 0
          }));
        }
      }

      items.push(tocItem);
    }

    this.tocItems = items;
  }

  setActiveWalkthroughTab(index: number): void {
    if (!this.currentRecipe || index < 0 || index >= this.currentRecipe.walkthrough.length) {
      return;
    }
    if (this.activeWalkthroughTabIndex === index) return;

    this.activeWalkthroughTabIndex = index;
    this.cdr.markForCheck();
  }

  private setupScrollListener(): void {
    fromEvent(window, 'scroll')
      .pipe(
        throttleTime(100),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.updateActiveTocSection();
      });

    // Initial check
    this.updateActiveTocSection();
  }

  private updateActiveTocSection(): void {
    if (!this.currentRecipe || this.isScrollingToSection) return;

    // Build sections list from visible sections (using SECTION_CONFIG as single source of truth)
    const sections: string[] = [];
    for (const section of this.visibleSections) {
      sections.push(section.id);
      // Add walkthrough step IDs for the currently active tab only — only those
      // steps are present in the DOM.
      if (section.id === 'walkthrough' && this.currentRecipe.walkthrough.length > 0) {
        const tabIdx = this.activeWalkthroughTabIndex;
        const activeTab = this.currentRecipe.walkthrough[tabIdx];
        if (activeTab) {
          activeTab.steps.forEach((_, si) => {
            sections.push(`walkthrough-tab-${tabIdx}-step-${si + 1}`);
          });
        }
      }
    }

    // Find which section is currently most visible in the viewport
    const viewportMiddle = window.scrollY + window.innerHeight / 3;
    let activeSection = 'overview';
    let closestDistance = Infinity;

    for (const sectionId of sections) {
      const element = document.getElementById(sectionId);
      if (element) {
        const rect = element.getBoundingClientRect();
        const elementTop = window.scrollY + rect.top;
        const elementBottom = elementTop + rect.height;

        // Check if section is in viewport
        if (elementTop <= viewportMiddle && elementBottom >= window.scrollY) {
          const distance = Math.abs(elementTop - window.scrollY);
          if (distance < closestDistance) {
            closestDistance = distance;
            activeSection = sectionId;
          }
        }
      }
    }

    // If scrolled to bottom, activate the last TOC item that's currently in
    // the DOM. The walkthrough TOC may be either a flat list (single-tab or
    // legacy) or a two-level tree (multi-tab parent groups → substeps). We
    // walk into the active tab's group when present and pick its last
    // substep, otherwise fall back to the last flat child.
    const scrolledToBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 50);
    if (scrolledToBottom && this.tocItems.length > 0) {
      const lastItem = this.tocItems[this.tocItems.length - 1];
      if (lastItem.children?.length) {
        const isMultiTab = lastItem.children.some(c => c.children?.length);
        if (isMultiTab) {
          const activeParent = lastItem.children.find(
            c => c.tabIndex === this.activeWalkthroughTabIndex
          );
          if (activeParent?.children?.length) {
            activeSection = activeParent.children[activeParent.children.length - 1].id;
          } else {
            activeSection = activeParent?.id ?? lastItem.id;
          }
        } else {
          activeSection = lastItem.children[lastItem.children.length - 1].id;
        }
      } else {
        activeSection = lastItem.id;
      }
    }

    // When we're anywhere in the walkthrough section but the closest match is
    // the bare top-level "walkthrough" header (panel/substeps not yet the
    // dominant viewport block), prefer the active tab's parent group so the
    // right-side TOC always shows which tab the user is reading.
    if (
      activeSection === 'walkthrough' &&
      this.currentRecipe.walkthrough &&
      this.currentRecipe.walkthrough.length > 1
    ) {
      activeSection = `walkthrough-tab-${this.activeWalkthroughTabIndex}`;
    }

    if (this.activeTocSection !== activeSection) {
      this.activeTocSection = activeSection;
      this.cdr.markForCheck();
    }
  }

  openMediaPreview(media: any): void {
    this.previewMedia = {
      type: media.type,
      url: media.displayUrl || media.url,
      alt: media.alt || ''
    };
    this.isMediaModalOpen = true;
    this.cdr.markForCheck();
  }

  closeMediaPreview(): void {
    this.isMediaModalOpen = false;
    this.previewMedia = null;
    this.cdr.markForCheck();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isMediaModalOpen) {
      this.closeMediaPreview();
    }
  }

  isYouTubeUrl(url: string): boolean {
    return url?.includes('youtu.be') || url?.includes('youtube.com');
  }

  hasNonYouTubeGeneralImages(): boolean {
    if (!this.currentRecipe?.generalImages?.length) return false;
    return this.currentRecipe.generalImages.some(
      media => !(media.type === 'video' && this.isYouTubeUrl(media.url))
    );
  }

  getYouTubeVideosFromGeneralImages(): { url: string; alt: string }[] {
    // Return cached result to prevent iframe re-rendering on scroll
    return this.cachedYouTubeVideos;
  }

  private buildYouTubeVideosCache(): void {
    if (!this.currentRecipe?.generalImages?.length) {
      this.cachedYouTubeVideos = [];
      return;
    }
    this.cachedYouTubeVideos = this.currentRecipe.generalImages
      .filter(media => media.type === 'video' && this.isYouTubeUrl(media.url))
      .map(media => ({ url: media.url, alt: media.alt }));
  }

  getYouTubeEmbedUrl(url: string): SafeResourceUrl {
    // Return cached URL to prevent iframe flickering on scroll
    if (this.youtubeUrlCache.has(url)) {
      return this.youtubeUrlCache.get(url)!;
    }

    let videoId = '';

    if (url.includes('youtu.be/')) {
      // Format: https://youtu.be/VIDEO_ID
      videoId = url.split('youtu.be/')[1]?.split('?')[0] || '';
    } else if (url.includes('youtube.com/watch')) {
      // Format: https://www.youtube.com/watch?v=VIDEO_ID
      const urlParams = new URL(url).searchParams;
      videoId = urlParams.get('v') || '';
    } else if (url.includes('youtube.com/embed/')) {
      // Already embed format
      videoId = url.split('youtube.com/embed/')[1]?.split('?')[0] || '';
    }

    const embedUrl = `https://www.youtube.com/embed/${videoId}?rel=0`;
    const safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl);
    this.youtubeUrlCache.set(url, safeUrl);
    return safeUrl;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
