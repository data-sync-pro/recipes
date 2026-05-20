import {
  Component,
  ViewChild,
  ElementRef,
  HostListener,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ViewEncapsulation,
  ChangeDetectionStrategy,
  ChangeDetectorRef
} from '@angular/core';
import { trigger, style, transition, animate } from '@angular/animations';
import { DomSanitizer } from '@angular/platform-browser';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, take } from 'rxjs/operators';

import { FAQItem, FAQCategory, FAQSubCategory } from './models/faq.model';
import { FAQService } from './services/faq.service';
import { FAQPreviewService, PreviewData } from './editor/services/faq-preview.service';
import { VALID_SUBCATEGORIES } from './config/faq-urls.config';

interface SearchState {
  query: string;
  isActive: boolean;
}

interface CurrentState {
  category: string;
  subCategory: string;
  faqTitle: string;
  faqItem: FAQItem | null;
}

interface UIState {
  isLoading: boolean;
  isLoadingRouteData: boolean;
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  isMobile: boolean;
  tocHidden: boolean;
}

interface TOCPaginationState {
  currentPage: number;
  itemsPerPage: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
}

@Component({
  selector: 'app-faq',
  templateUrl: './faq.component.html',
  styleUrls: ['./faq.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('slideInOut', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate('200ms ease-in', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-out', style({ opacity: 0, transform: 'translateY(-10px)' }))
      ])
    ])
  ]
})
export class FaqComponent implements OnInit, OnDestroy, AfterViewInit {
  categorySearchQuery: string = '';

  search: SearchState = {
    query: '',
    isActive: false
  };

  current: CurrentState = {
    category: '',
    subCategory: '',
    faqTitle: '',
    faqItem: null
  };

  ui: UIState = {
    isLoading: false,
    isLoadingRouteData: false,
    sidebarCollapsed: false,
    mobileSidebarOpen: false,
    isMobile: false,
    tocHidden: true
  };

  // Touch event handling
  private touchStartTime = 0;
  private touchHandled = false;

  // TOC Pagination state
  tocPagination: TOCPaginationState = {
    currentPage: 1,
    itemsPerPage: 8, // Show 8 items per page
    totalPages: 1,
    startIndex: 0,
    endIndex: 8
  };

  faqList: FAQItem[] = [];
  categories: FAQCategory[] = [];

  private destroy$ = new Subject<void>();
  private pendingFragment?: string;
  private scrollTimeout: any;
  private activeScrollElement: string = '';
  private userHasScrolled: boolean = false;
  private isProcessingAnswerPath = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private sanitizer: DomSanitizer,
    private faqService: FAQService,
    private meta: Meta,
    private title: Title,
    private cdr: ChangeDetectorRef,
    private previewService: FAQPreviewService
  ) {}

  
  handleTouchStart(): void {
    this.touchStartTime = Date.now();
    this.touchHandled = true;
    
    setTimeout(() => {
      this.touchHandled = false;
    }, 50); 
  }


  ngOnInit(): void {
    // Initialize FAQ data first to ensure it's available for routing
    this.initFaqData();
    
    // Check for preview mode first and handle it separately
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const isPreview = params['preview'] === 'true';
      const previewFaqId = params['faqId'];
      
      if (isPreview && previewFaqId) {
        this.setupPreviewMode(previewFaqId);
        // Skip normal FAQ initialization for preview mode
        return;
      }
    });
    
    this.cleanupFavoriteData();
    this.loadSidebarState();
    this.checkMobileView();
    this.setupFooterObserver();
    this.setupOptimizedScrollListener();
    this.setupNavLinkHandler();

    // Delay route parameter processing to ensure FAQ data is loading
    this.route.paramMap.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      // Skip route param processing in preview mode
      if (this.isPreviewMode()) {
        return;
      }

      const catParam = params.get('cat');
      const subCatParam = params.get('subCat');
      const slugParam = params.get('slug');

      if (slugParam) {
        // Answer mode — slug present in the URL, no heuristic needed.
        this.isProcessingAnswerPath = true;
        const decodedSlug = this.safeDecodeURIComponent(slugParam);
        // catParam is guaranteed by every route matcher that emits a slug.
        const urlCat = catParam ?? '';
        const urlSubCat = subCatParam;
        this.ensureFaqsLoaded(() =>
          this.handleAnswerPathNavigation(decodedSlug, urlCat, urlSubCat, true)
        );
      } else if (catParam) {
        const decodedCat = this.safeDecodeURIComponent(catParam);
        this.ensureFaqsLoaded(() => this.setCategoryFromRoute(decodedCat, subCatParam));
      } else {
        // Root path
        this.current.category = '';
        this.current.subCategory = '';
      }

      // Update TOC pagination when navigation changes
      this.updateTOCPaginationIndices();
      this.cdr.detectChanges();

      this.updatePageMetadata();
    });

    this.route.fragment.pipe(
      takeUntil(this.destroy$)
    ).subscribe(fragment => {
      if (fragment) {
        this.pendingFragment = fragment;
        // Process fragment immediately, don't wait for router scroll
        this.handlePendingFragment();
      } else {
        // If no fragment, ensure page scrolls to top
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'auto' });
        }, 50);
      }
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.refreshFaqElementsCache();
      
      // Only highlight if user has actually scrolled AND there's a scroll position
      // This prevents auto-highlighting the first item on page load
      if (this.userHasScrolled && window.pageYOffset > 0) {
        this.updateActiveScrollElementOptimized(window.pageYOffset);
      }
    }, 100);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    // Clean up timeouts
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }
    
    // Clean up intersection observer (no longer needed without expansion panels)
    
    // Clean up footer observer
    this.cleanupFooterObserver();
    
    // Clean up nav link handler
    this.cleanupNavLinkHandler();
  }

  private initFaqData(): void {
    this.updateUIState({ isLoading: true });

    this.faqService.getFAQs().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (faqs) => {
        this.faqList = faqs;
        this.updateUIState({ isLoading: false });

        // Warn if any folderId collides with a known subcategory name — the
        // 2-segment route matcher would route it to the TOC instead of the FAQ.
        this.assertNoFolderIdSubcategoryCollision(faqs);

        // Initialize TOC pagination when data is loaded
        this.updateTOCPaginationIndices();

        // Clear cached elements when FAQ data changes
        this.cachedFaqElements = null;
        this.cachedQuestionTexts.clear();

        // Note: Answer-based URL handling is ONLY done through route parameter processing
        // to avoid race conditions. Do not add URL handling logic here.

        this.handlePendingFragment();
        // Set up preloading observers
        this.setupPreloadingObservers();
        // Warm cache for popular FAQs
        this.warmCacheForPopularFAQs();

        // Preload answer-body text for ranked search; OnPush requires
        // markForCheck so filteredFAQ re-runs once the cache fills in.
        this.faqService.loadAllAnswerTexts()
          .pipe(takeUntil(this.destroy$))
          .subscribe(() => this.cdr.markForCheck());
      },
      error: (error) => {
        console.error('Failed to load FAQ data:', error);
        this.updateUIState({ isLoading: false });
      }
    });

    this.faqService.getCategories().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (categories) => {
        this.categories = categories;
      },
      error: (error) => {
        console.error('Failed to load categories:', error);
      }
    });
  }

  // Category name mapping for URL conversion (lowercase URL ↔ original name)
  private categoryMapping: { [key: string]: string } = {
    'general': 'General',
    'rules-engines': 'Rules Engines',
    'processes': 'Processes',
    'process-steps': 'Process Steps', 
    'transformation': 'Transformation',
    'executables': 'Executables',
    'connections': 'Connections',
    'query-manager': 'Query Manager'
  };

  // Reverse mapping (original name → lowercase URL)
  private reverseCategoryMapping: { [key: string]: string } = {
    'General': 'general',
    'Rules Engines': 'rules-engines',
    'Processes': 'processes',
    'Process Steps': 'process-steps',
    'Transformation': 'transformation',
    'Executables': 'executables', 
    'Connections': 'connections',
    'Query Manager': 'query-manager'
  };

  private encode = (s: string) => {
    const trimmed = s.trim();
    // Check if this is a known category, if so use lowercase mapping
    const lowercaseUrl = this.reverseCategoryMapping[trimmed];
    if (lowercaseUrl) {
      return encodeURIComponent(lowercaseUrl);
    }
    // For subcategories or other strings, convert to lowercase and replace spaces with hyphens
    return encodeURIComponent(trimmed.toLowerCase().replace(/\s+/g, '-'));
  };

  
  goHome(): void {
    this.resetState();
    this.router.navigate(['/faq']);
  }

  goCategory(cat: string): void {
    this.resetState();
    this.router.navigate(['/faq', this.encode(cat)]);
  }

  goSubCategory(categoryName: string, subCategoryName: string): void {
    this.resetState();
    this.router.navigate(['/faq', this.encode(categoryName), this.encode(subCategoryName)]);
  }

  private navLinkHandler = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    
    // Handle FAQ navigation links in sidebar
    if (target && target.classList.contains('faq-nav-link')) {
      event.preventDefault();
      const category = target.getAttribute('data-category');
      const subcategory = target.getAttribute('data-subcategory');
      
      if (category && subcategory) {
        this.goSubCategory(category, subcategory);
      }
    }
    
    // Handle auto-generated FAQ content links - open in new window
    if (target && target.classList.contains('rules-engine-link')) {
      const href = target.getAttribute('href');
      
      if (href) {
        // Open in new window/tab instead of same window navigation
        window.open(href, '_blank', 'noopener,noreferrer');
        event.preventDefault();
      }
    }
    
    // Handle clicks on Lightning icon inside rules-engine-link
    if (target && (target.classList.contains('slds-icon') || target.closest('.slds-icon'))) {
      const linkElement = target.closest('a.rules-engine-link') as HTMLElement;
      if (linkElement) {
        const href = linkElement.getAttribute('href');
        
        if (href) {
          window.open(href, '_blank', 'noopener,noreferrer');
          event.preventDefault();
        }
      }
    }
  };

  private setupNavLinkHandler(): void {
    // Use setTimeout to ensure the DOM is ready
    setTimeout(() => {
      document.addEventListener('click', this.navLinkHandler);
    }, 100);
  }

  private cleanupNavLinkHandler(): void {
    document.removeEventListener('click', this.navLinkHandler);
  }

  private resetState(): void {
    this.categorySearchQuery = '';
    this.updateSearchState({
      query: '',
      isActive: false
    });
    
    this.updateCurrentState({
      faqTitle: '',
      faqItem: null
    });
    
    // Reset TOC pagination to first page
    this.tocPagination.currentPage = 1;
    
    // Clear active scroll element to prevent incorrect highlighting
    this.activeScrollElement = '';
    
    // Reset user interaction flag when navigating between categories
    // This ensures TOC doesn't auto-highlight when switching categories
    this.userHasScrolled = false;
    this.updateTOCPaginationIndices();
    
    this.cdr.markForCheck();
    
    // Clear cached FAQ elements when state changes
    this.cachedFaqElements = null;
  }

  // State update helpers for immutability and OnPush optimization
  private updateSearchState(updates: Partial<SearchState>): void {
    this.search = { ...this.search, ...updates };
    this.cdr.markForCheck();
  }

  private updateCurrentState(updates: Partial<CurrentState>): void {
    this.current = { ...this.current, ...updates };
    this.cdr.markForCheck();
  }

  private updateUIState(updates: Partial<UIState>): void {
    this.ui = { ...this.ui, ...updates };
    this.cdr.markForCheck();
  }

  private setupPreloadingObservers(): void {
    // Wait for FAQ items to be rendered in the DOM
    setTimeout(() => {
      const faqElements = document.querySelectorAll('.faq-item');
      faqElements.forEach((element, index) => {
        const faqItem = this.filteredFAQ[index];
        if (faqItem && faqItem.folderId) {
          this.faqService.observeForPreloading(element, faqItem.id, faqItem.folderId);
        }
      });
    }, 100);
  }

  private warmCacheForPopularFAQs(): void {
    // Use the trending questions IDs for cache warming
    const popularFaqIds = [
      'a0oEc000005JohNIAS',
      'a0oEc000005JohOIAS',
      'a0oEc000005JohSIAS',
      'a0oEc000005JohTIAS'
    ];
    
    this.faqService.warmCacheForPopularFAQs(popularFaqIds);
  }



  // Computed properties for better OnPush performance
  get allFaqList(): FAQItem[] {
    return this.faqList;
  }

  get isLoadingState(): boolean {
    return this.ui.isLoading;
  }

  get isSidebarCollapsed(): boolean {
    return this.ui.sidebarCollapsed;
  }

  private _cachedTrendingQuestions?: FAQItem[];
  private _lastFaqListLength?: number;

  get trendingQuestions(): FAQItem[] {
    if (!this._cachedTrendingQuestions || this._lastFaqListLength !== this.faqList.length) {
      const trendingIds = [
        'a0oEc000005JohNIAS',
        'a0oEc000005JohOIAS',
        'a0oEc000005JohSIAS',
        'a0oEc000005JohTIAS',
        'a0oEc000005JohUIAS',
        'a0oEc000005JohVIAS',
        'a0oEc000005JohWIAS',
        'a0oEc000005JohXIAS'
      ];

      this._cachedTrendingQuestions = trendingIds
        .map(id => this.faqList.find(faq => faq.id === id))
        .filter(Boolean) as FAQItem[];
      
      this._lastFaqListLength = this.faqList.length;
    }
    
    return this._cachedTrendingQuestions;
  }

  get currentFAQList(): FAQItem[] {
    return this.filteredFAQ || [];
  }

  get previousFAQ(): FAQItem | null {
    return this.getAdjacentFAQ(-1);
  }

  get nextFAQ(): FAQItem | null {
    return this.getAdjacentFAQ(1);
  }

  private getAdjacentFAQ(direction: 1 | -1): FAQItem | null {
    const faq = this.current.faqItem;
    if (!faq) return null;

    // Use the FAQ's own scope (not current.category/subCategory) so navigation
    // stays correct while the route update is in flight after a cross-category jump.
    const scope = this.faqList.filter(item =>
      item.category === faq.category &&
      (item.subCategory || '') === (faq.subCategory || '')
    );
    const index = scope.findIndex(item => item.id === faq.id);
    const adjacent = index + direction;
    if (index >= 0 && adjacent >= 0 && adjacent < scope.length) {
      return scope[adjacent];
    }

    return this.findFAQInAdjacentScope(faq.category, faq.subCategory || '', direction);
  }

  private findFAQInAdjacentScope(
    fromCategory: string,
    fromSubCategory: string,
    direction: 1 | -1,
  ): FAQItem | null {
    const catIdx = this.categories.findIndex(c => c.name === fromCategory);
    if (catIdx < 0) return null;

    // First try an adjacent subCategory inside the same category.
    if (fromSubCategory) {
      const subs = this.categories[catIdx].subCategories;
      const subIdx = subs.findIndex(s => s.name === fromSubCategory);
      const targetSubIdx = subIdx + direction;
      if (subIdx >= 0 && targetSubIdx >= 0 && targetSubIdx < subs.length) {
        return this.edgeFAQInScope(fromCategory, subs[targetSubIdx].name, direction);
      }
    }

    // Otherwise hop to the adjacent category and enter its edge subCategory.
    const targetCatIdx = catIdx + direction;
    if (targetCatIdx < 0 || targetCatIdx >= this.categories.length) return null;

    const targetCat = this.categories[targetCatIdx];
    const subs = targetCat.subCategories;
    if (subs.length > 0) {
      const edgeSub = direction > 0 ? subs[0] : subs[subs.length - 1];
      return this.edgeFAQInScope(targetCat.name, edgeSub.name, direction);
    }
    return this.edgeFAQInScope(targetCat.name, '', direction);
  }

  private edgeFAQInScope(
    category: string,
    subCategory: string,
    direction: 1 | -1,
  ): FAQItem | null {
    const faqs = this.faqList.filter(item => {
      if (item.category !== category) return false;
      const itemSub = item.subCategory || '';
      return subCategory ? itemSub === subCategory : !itemSub;
    });
    if (faqs.length === 0) return null;
    return direction > 0 ? faqs[0] : faqs[faqs.length - 1];
  }

  get shouldShowTOC(): boolean {
    if (this.ui.isMobile) {
      return false;
    }

    if (this.showHome) {
      return this.trendingQuestions.length > 0;
    }

    return (!!this.current.category || !!this.current.subCategory) &&
           this.currentFAQList.length > 1;
  }

  get filteredFAQ(): FAQItem[] {
    const sidebarQ = this.search.query.trim().toLowerCase();
    if (sidebarQ) {
      return this.rankFAQsGlobal(this.faqList, sidebarQ);
    }

    const scopedList = this.faqList.filter(item => {
      if (this.current.category && item.category !== this.current.category) return false;
      if (this.current.subCategory && item.subCategory !== this.current.subCategory) return false;
      return true;
    });

    const catQ = this.categorySearchQuery.trim().toLowerCase();
    return catQ ? this.rankFAQsScoped(scopedList, catQ) : scopedList;
  }

  // Global sidebar ranking: 4 tiers — question > category > subCategory > answer.
  // Tiebreaker sort: category alpha, then subCategory alpha, then question alpha.
  private rankFAQsGlobal(items: FAQItem[], kw: string): FAQItem[] {
    return items
      .map(item => {
        const matchQuestion = item.question.toLowerCase().includes(kw);
        const matchCategory = item.category.toLowerCase().includes(kw);
        const matchSubCategory = !!item.subCategory && item.subCategory.toLowerCase().includes(kw);
        const matchAnswer = this.faqService.getAnswerText(item.id).includes(kw);

        let priority = 999;
        if (matchQuestion) priority = 1;
        else if (matchCategory) priority = 2;
        else if (matchSubCategory) priority = 3;
        else if (matchAnswer) priority = 4;

        return { item, priority };
      })
      .filter(entry => entry.priority !== 999)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (a.item.category !== b.item.category) {
          return a.item.category.localeCompare(b.item.category);
        }
        const aSub = a.item.subCategory || '';
        const bSub = b.item.subCategory || '';
        if (aSub !== bSub) return aSub.localeCompare(bSub);
        return a.item.question.localeCompare(b.item.question);
      })
      .map(entry => entry.item);
  }

  // Scoped breadcrumb ranking: results are already filtered to the current
  // category/subCategory, so category-related tiers are degenerate. Only
  // question > answer matters here. Tiebreaker is question alpha.
  private rankFAQsScoped(items: FAQItem[], kw: string): FAQItem[] {
    return items
      .map(item => {
        const matchQuestion = item.question.toLowerCase().includes(kw);
        const matchAnswer = this.faqService.getAnswerText(item.id).includes(kw);

        let priority = 999;
        if (matchQuestion) priority = 1;
        else if (matchAnswer) priority = 2;

        return { item, priority };
      })
      .filter(entry => entry.priority !== 999)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.item.question.localeCompare(b.item.question);
      })
      .map(entry => entry.item);
  }




  clearSearch(): void {
    this.search.query = '';
    this.search.isActive = false;
    this.cdr.markForCheck();
  }

  onSearchInput(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.search.query = query;
    this.search.isActive = query.trim().length > 0;
    if (this.search.isActive) {
      this.updateCurrentState({
        category: '',
        subCategory: '',
        faqTitle: '',
        faqItem: null
      });
    }
    this.cdr.markForCheck();
  }

  onCategorySearchInput(event: Event): void {
    this.categorySearchQuery = (event.target as HTMLInputElement).value;
    this.cdr.markForCheck();
  }

  clearCategorySearch(): void {
    this.categorySearchQuery = '';
    this.cdr.markForCheck();
  }




  onFaqOpened(item: FAQItem): void {
    // Update current FAQ title for breadcrumb
    this.updateCurrentState({
      faqTitle: item.question,
      faqItem: item
    });

    // Update browser URL
    this.updateBrowserURL(item);

    // Track FAQ view
    this.trackFAQView(item);



    // Load FAQ content
    if (!item.safeAnswer && item.folderId) {
      item.isLoading = true;
      this.cdr.markForCheck(); 

      this.faqService.getFAQContent(item.folderId).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: (content) => {
          item.safeAnswer = content;
          item.isLoading = false;
          this.cdr.markForCheck(); 
        },
        error: (error) => {
          console.error('Failed to load FAQ content:', error);
          item.isLoading = false;
          item.safeAnswer = this.sanitizer.bypassSecurityTrustHtml(
            '<p class="error-message">Failed to load content, please try again later</p>'
          );
          this.cdr.markForCheck();
        }
      });
    }
  }

  navigateToFAQ(item: FAQItem, event?: Event): void {
    
    // Only prevent default for actual click/touch events, not keyboard events
    if (event && event.type !== 'keydown') {
      event.stopPropagation();
      // Don't preventDefault as we want the navigation to happen
    }
    // Mark that user has interacted - this enables TOC highlighting
    this.userHasScrolled = true;
    
    if (!item.viewCount) {
      item.viewCount = 0;
    }
    item.viewCount++;

    
    // Clear search state so the detail view template condition is satisfied
    this.clearSearch();

    this.updateCurrentState({
      faqTitle: item.question,
      faqItem: item
    });

    this.refreshFaqElementsCache();

    this.updateBrowserURL(item);

    this.trackFAQView(item);

    this.onFaqOpened(item);

    // Scroll to top instead of FAQ item for better navigation experience
    this.scrollToTop();
    
    
    if (this.ui.isMobile && this.ui.mobileSidebarOpen) {
      this.closeMobileSidebar();
    }
  }

  /**
   * Show FAQ detail without URL navigation (for direct URL access)
   */
  showFAQDetail(item: FAQItem): void {
    // Mark that user has interacted - this enables TOC highlighting
    this.userHasScrolled = true;
    
    if (!item.viewCount) {
      item.viewCount = 0;
    }
    item.viewCount++;

    // Set current FAQ state
    this.updateCurrentState({
      faqTitle: item.question,
      faqItem: item
    });

    // Navigate TOC to the page containing this FAQ item
    this.navigateToFAQPage(item);

    this.trackFAQView(item);

    // Load FAQ content directly (without URL navigation)
    this.loadFAQContent(item);

    // Update page metadata
    this.updatePageMetadata();

    // Scroll to top for better user experience
    this.scrollToTop();
  }

  /**
   * Pure content loading method without URL navigation or panel expansion
   */
  private loadFAQContent(item: FAQItem): void {
    // Load FAQ content if not already loaded
    if (!item.safeAnswer && item.folderId) {
      item.isLoading = true;
      this.cdr.markForCheck(); // Trigger change detection to show loading state

      this.faqService.getFAQContent(item.folderId).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: (content) => {
          item.safeAnswer = content;
          item.isLoading = false;
          this.cdr.markForCheck(); 
        },
        error: (error) => {
          console.error('Failed to load FAQ content:', error);
          item.isLoading = false;
          item.safeAnswer = this.sanitizer.bypassSecurityTrustHtml(
            '<p class="error-message">Failed to load content, please try again later</p>'
          );
          this.cdr.markForCheck(); // Ensure error state is also updated in UI
        }
      });
    }
  }

  private scrollToElement(elementId: string): void {
    setTimeout(() => {
      const element = document.getElementById(elementId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 200);
  }


  private updateBrowserURL(item: FAQItem): void {
    this.router.navigate(this.buildAnswerUrlSegments(item));
  }

  // Build router segments for an answer URL. Shape is /faq/<cat>/<sub?>/<slug>.
  private buildAnswerUrlSegments(item: FAQItem): string[] {
    const segs = ['/faq', this.encode(item.category)];
    if (item.subCategory) {
      segs.push(this.encode(item.subCategory));
    }
    segs.push(this.getAnswerSlug(item.folderId));
    return segs;
  }

  // The 2-segment route matcher disambiguates /<cat>/<sub> from /<cat>/<slug>
  // by checking the second segment against VALID_SUBCATEGORIES. A FAQ whose
  // folderId equals a known subcategory would shadow the subcategory TOC route.
  private assertNoFolderIdSubcategoryCollision(faqs: FAQItem[]): void {
    const subs: ReadonlySet<string> = new Set<string>(VALID_SUBCATEGORIES);
    const collisions = faqs
      .map(f => f.folderId)
      .filter(id => subs.has(id.toLowerCase()));
    if (collisions.length > 0) {
      console.warn(
        '[FAQ] folderId collides with a subcategory name — the FAQ URL would be ' +
        'shadowed by the subcategory TOC route:',
        collisions,
      );
    }
  }

  // Reload FAQ data if the list is empty, then run the callback. Shared by
  // the route-param subscription for both category and answer-mode navigation.
  private ensureFaqsLoaded(cb: () => void): void {
    if (this.faqList.length > 0) {
      cb();
      return;
    }

    this.updateUIState({ isLoadingRouteData: true });
    this.faqService.reloadFAQs().pipe(take(1)).subscribe({
      next: (faqs) => {
        this.faqList = faqs;
        if (faqs.length > 0) {
          cb();
        } else {
          this.router.navigate(['/faq']);
        }
        this.updateUIState({ isLoadingRouteData: false });
      },
      error: (error) => {
        console.error('Failed to load FAQ data:', error);
        this.updateUIState({ isLoadingRouteData: false });
        this.router.navigate(['/faq']);
      }
    });
  }

  private trackFAQView(_item: FAQItem): void {
    // Analytics removed; placeholder kept for future tracking integration.
  }





  private cleanupFavoriteData(): void {
    localStorage.removeItem('faqFavorites');
  }

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  slugify(s: string): string {
    return s.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
  }

  /**
   * Extract answer slug from folderId. Now an identity since folderId IS
   * the slug (no .html suffix). Kept as a helper for call-site clarity.
   */
  getAnswerSlug(folderId: string): string {
    return folderId;
  }

  /**
   * Handle navigation based on answer path URL parameter
   */
  private handleAnswerPathNavigation(
    answerSlug: string,
    urlCat: string,
    urlSubCat: string | null,
    fromRouteHandler: boolean = false,
  ): void {
    // Prevent duplicate processing, unless explicitly called from route handler
    if (this.isProcessingAnswerPath && !fromRouteHandler) {
      return;
    }

    // Set processing flag
    this.isProcessingAnswerPath = true;

    // At this point, FAQ data should already be loaded from route param handler
    if (this.faqList.length === 0) {
      this.isProcessingAnswerPath = false;
      return;
    }

    // Match by (category, subCategory, folderId) — the canonical inverse of
    // buildAnswerUrlSegments.
    const faqItem = this.faqList.find(item => {
      if (this.encode(item.category) !== urlCat) return false;
      const itemSub = item.subCategory ? this.encode(item.subCategory) : '';
      if (itemSub !== (urlSubCat ?? '')) return false;
      return this.getAnswerSlug(item.folderId) === answerSlug;
    });
    
    if (faqItem) {
      // Set category and subcategory based on found FAQ but don't trigger intermediate renders
      this.current.category = faqItem.category;
      this.current.subCategory = faqItem.subCategory || '';
      
      // Mark processing as complete before showing FAQ detail
      this.isProcessingAnswerPath = false;

      // Show FAQ detail directly without delay to prevent category flash
      this.showFAQDetail(faqItem);
      
      // Update TOC pagination after FAQ is shown
      this.updateTOCPaginationIndices();
    } else {
      // Reset processing flag on failure
      this.isProcessingAnswerPath = false;

      // If FAQ not found, redirect to home to avoid broken state
      this.router.navigate(['/faq']);
    }
  }

  /**
   * Set category and subcategory from route parameters
   */
  private setCategoryFromRoute(catParam: string, subCatParam: string | null): void {
    // Map lowercase URL back to original category name
    const originalCategory = this.categoryMapping[catParam] || catParam;
    this.current.category = originalCategory;
    
    const decodedSubCat = subCatParam ? this.safeDecodeURIComponent(subCatParam) : '';
    // For subcategories, convert to title case (capitalize each word)
    if (decodedSubCat) {
      const normalizedSubCat = decodedSubCat.replace(/-/g, ' ');
      this.current.subCategory = normalizedSubCat.replace(/\b\w/g, l => l.toUpperCase());
    } else {
      this.current.subCategory = '';
    }
  }

  /**
   * Safe URL decoding that handles double-encoded parameters
   */
  private safeDecodeURIComponent(encoded: string): string {
    try {
      let decoded = decodeURIComponent(encoded);
      
      // Check if still encoded (double-encoded case)
      if (decoded.includes('%') && decoded !== encoded) {
        try {
          // Try to decode again
          const doubleDecoded = decodeURIComponent(decoded);
          // Only use double decoded if it successfully created something different
          if (doubleDecoded !== decoded) {
            decoded = doubleDecoded;
          }
        } catch (e) {
          // If second decode fails, use first decode result
          console.warn('Double decode failed, using single decode:', decoded);
        }
      }
      
      return decoded;
    } catch (error) {
      console.warn('Failed to decode URI component:', encoded, error);
      return encoded; // Return original if decoding fails
    }
  }


  
  get showHome(): boolean {
    return (
      !this.current.category && !this.current.subCategory
    );
  }

  private updatePageMetadata(): void {
    let pageTitle = 'FAQs - Data Sync Pro';
    let pageDescription = 'Frequently Asked Questions about Data Sync Pro';

    if (this.current.category) {
      pageTitle = `${this.current.category} FAQs - Data Sync Pro`;
      pageDescription = `Frequently Asked Questions about ${this.current.category}`;

      if (this.current.subCategory) {
        pageTitle = `${this.current.subCategory} FAQs - Data Sync Pro`;
        pageDescription = `Frequently Asked Questions about ${this.current.subCategory}`;
      }
    }

    this.title.setTitle(pageTitle);
    this.meta.updateTag({ name: 'description', content: pageDescription });
    this.meta.updateTag({ property: 'og:title', content: pageTitle });
    this.meta.updateTag({ property: 'og:description', content: pageDescription });
    this.meta.updateTag({ property: 'og:url', content: window.location.href });
  }

  private handlePendingFragment(): void {
    if (this.pendingFragment && this.faqList.length > 0) {
      setTimeout(() => {
        this.scrollToAndExpandFAQ(this.pendingFragment!);
        this.pendingFragment = undefined;
        this.cdr.detectChanges();
      }, 100);
    }
  }




  private scrollToAndExpandFAQ(fragment: string): void {
    // When in a specific subcategory, search within filtered FAQ first to avoid confusion with duplicate questions
    const searchList = this.current.category ? this.filteredFAQ : this.faqList;
    
    // Try to find FAQ by slugified question in the current context
    let faqItem = searchList.find(item => this.slugify(item.question) === fragment);
    
    // If not found, try with the original fragment (might be already decoded)
    if (!faqItem) {
      faqItem = searchList.find(item => this.slugify(item.question) === this.slugify(fragment));
    }
    
    // If still not found, try finding by question text directly
    if (!faqItem) {
      faqItem = searchList.find(item => 
        item.question.toLowerCase().replace(/[^a-z0-9]+/g, '-') === fragment.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      );
    }
    
    // If still not found and we were searching in filtered list, try in the full list as fallback
    if (!faqItem && this.current.category) {
      faqItem = this.faqList.find(item => this.slugify(item.question) === fragment);
    }
    
    if (!faqItem) {
      this.scrollToElement(fragment);
      return;
    }

    if (this.current.category !== faqItem.category ||
        (faqItem.subCategory && this.current.subCategory !== faqItem.subCategory)) {
      const answerSlug = this.getAnswerSlug(faqItem.folderId);
      this.router.navigate(['/faq', answerSlug]);
      return;
    }

    // Navigate to the TOC page containing this FAQ
    this.navigateToFAQPage(faqItem);
    
    // Set current FAQ state
    this.current.faqItem = faqItem;
    this.current.faqTitle = faqItem.question;
    this.activeScrollElement = faqItem.question;

    this.showFAQDetail(faqItem);
    this.updateFAQMetadata(faqItem);
    this.scrollToElement(this.slugify(faqItem.question));
  }

  private updateFAQMetadata(faqItem: FAQItem): void {
    const pageTitle = `${faqItem.question} - FAQs - Data Sync Pro`;
    const pageDescription = faqItem.answer.substring(0, 160) + '...';

    this.title.setTitle(pageTitle);
    this.meta.updateTag({ name: 'description', content: pageDescription });
    this.meta.updateTag({ property: 'og:title', content: pageTitle });
    this.meta.updateTag({ property: 'og:description', content: pageDescription });
    this.meta.updateTag({ property: 'og:url', content: window.location.href });
  }

  getFAQShareUrl(faqItem: FAQItem): string {
    const answerSlug = this.getAnswerSlug(faqItem.folderId);
    const baseUrl = window.location.origin;
    return `${baseUrl}/${answerSlug}`;
  }

  toggleSocialShare(faqItem: FAQItem): void {
    faqItem.showSocialShare = !faqItem.showSocialShare;

    this.faqList.forEach(item => {
      if (item.id !== faqItem.id) {
        item.showSocialShare = false;
      }
    });
  }

  copyFAQLink(faqItem: FAQItem): void {
    const shareUrl = this.getFAQShareUrl(faqItem);

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(shareUrl).catch(() => {
        this.fallbackCopyToClipboard(shareUrl);
      });
    } else {
      this.fallbackCopyToClipboard(shareUrl);
    }
  }

  private fallbackCopyToClipboard(text: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }

    document.body.removeChild(textArea);
  }

  shareToSocial(platform: string, faqItem: FAQItem): void {
    const shareUrl = this.getFAQShareUrl(faqItem);
    const shareText = `Check out this FAQ: ${faqItem.question}`;

    let socialUrl = '';

    switch (platform) {
      case 'twitter':
        socialUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
        break;
      case 'facebook':
        socialUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
        break;
      case 'linkedin':
        socialUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
        break;
      case 'email':
        socialUrl = `mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(shareUrl)}`;
        break;
    }

    if (socialUrl) {
      window.open(socialUrl, '_blank', 'width=600,height=400');
    }
  }

  // Sidebar navigation methods
  selectCategory(categoryName: string, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    
    if (this.ui.isMobile) {
      const category = this.categories.find(c => c.name === categoryName);
      
      
      if (category && category.subCategories.length > 0) {
        
        if (this.current.category !== categoryName) {
          this.current.category = categoryName;
          this.current.subCategory = '';
          this.cdr.markForCheck();
          return; 
        }
        
      }
    }
    
    
    this.resetState();
    this.router.navigate(['/faq', this.encode(categoryName)]);

    if (this.ui.isMobile) {
      this.closeMobileSidebar();
    }
  }

  selectSubCategory(subCategoryName: string, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.resetState();

    if (this.current.category) {
      this.router.navigate(['/faq', this.encode(this.current.category), this.encode(subCategoryName)]);
    }
    
    if (this.ui.isMobile) {
      this.closeMobileSidebar();
    }
  }

  toggleTOC(): void {
    const hidden = !this.ui.tocHidden;
    this.updateUIState({ tocHidden: hidden });
    // Save state to localStorage for persistence
    localStorage.setItem('faq-toc-hidden', hidden.toString());
    // Force change detection to ensure icon updates immediately
    this.cdr.detectChanges();
  }


  // Load sidebar and TOC state from localStorage
  private loadSidebarState(): void {
    const savedState = localStorage.getItem('faq-sidebar-collapsed');
    if (savedState !== null) {
      this.updateUIState({ sidebarCollapsed: savedState === 'true' });
    }
    
    const tocState = localStorage.getItem('faq-toc-hidden');
    if (tocState !== null) {
      this.updateUIState({ tocHidden: tocState === 'true' });
    }
  }

  // Mobile functionality
  private checkMobileView(): void {
    this.updateUIState({ isMobile: window.innerWidth <= 768 });
  }

  toggleMobileSidebar(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const willOpen = !this.ui.mobileSidebarOpen;
    // When opening mobile sidebar, always expand it to show full content
    if (willOpen) {
      this.updateUIState({
        mobileSidebarOpen: true,
        sidebarCollapsed: false
      });
    } else {
      this.updateUIState({ mobileSidebarOpen: false });
    }
  }

  closeMobileSidebar(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.updateUIState({ mobileSidebarOpen: false });
  }

  @HostListener('window:resize', ['$event'])
  onResize(_event: any): void {
    this.checkMobileView();
    // Close mobile sidebar when switching to desktop
    if (!this.ui.isMobile) {
      this.updateUIState({ mobileSidebarOpen: false });
    }
  }

  // Keyboard shortcut for search overlay
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const activeElement = document.activeElement;
    const isInputActive = activeElement && (
      activeElement.tagName === 'INPUT' || 
      activeElement.tagName === 'TEXTAREA' || 
      activeElement.getAttribute('contenteditable') === 'true'
    );

    // Ctrl+K / Cmd+K to focus the sidebar search input
    if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
      event.preventDefault();
      this.searchInput?.nativeElement.focus();
    }

    if (event.key === '/' && !isInputActive) {
      event.preventDefault();
      this.searchInput?.nativeElement.focus();
    }
  }

  // ==================== TOC Pagination Methods ====================

  /**
   * Check if previous page is available
   */
  get hasPreviousTOCPage(): boolean {
    return this.tocPagination.currentPage > 1;
  }

  /**
   * Check if next page is available
   */
  get hasNextTOCPage(): boolean {
    return this.tocPagination.currentPage < this.tocPagination.totalPages;
  }

  /**
   * Get current pagination info text
   */
  get tocPaginationInfo(): string {
    const totalItems = this.showHome ? this.trendingQuestions.length : this.currentFAQList.length;
    if (totalItems === 0) return '';
    
    const start = this.tocPagination.startIndex + 1;
    const end = Math.min(this.tocPagination.endIndex, totalItems);
    return `${start}-${end} of ${totalItems}`;
  }

  // ==================== TOC Pagination Methods ====================
  
  /**
   * Navigate to previous page in TOC pagination
   */
  goToPreviousTOCPage(): void {
    if (this.tocPagination.currentPage > 1) {
      this.tocPagination.currentPage--;
      this.updateTOCPaginationIndices();
      this.cdr.markForCheck();
    }
  }

  /**
   * Navigate to next page in TOC pagination
   */
  goToNextTOCPage(): void {
    if (this.tocPagination.currentPage < this.tocPagination.totalPages) {
      this.tocPagination.currentPage++;
      this.updateTOCPaginationIndices();
      this.cdr.markForCheck();
    }
  }

  /**
   * Update TOC pagination indices and total pages
   */
  private updateTOCPaginationIndices(): void {
    const totalItems = this.showHome ? this.trendingQuestions.length : this.currentFAQList.length;
    
    this.tocPagination.totalPages = Math.ceil(totalItems / this.tocPagination.itemsPerPage);
    this.tocPagination.startIndex = (this.tocPagination.currentPage - 1) * this.tocPagination.itemsPerPage;
    this.tocPagination.endIndex = this.tocPagination.startIndex + this.tocPagination.itemsPerPage;
  }

  /**
   * Get paginated trending questions for current page
   */
  get paginatedTrendingQuestions(): FAQItem[] {
    return this.trendingQuestions.slice(this.tocPagination.startIndex, this.tocPagination.endIndex);
  }

  /**
   * Get paginated current FAQ list for current page
   */
  get paginatedCurrentFAQList(): FAQItem[] {
    return this.currentFAQList.slice(this.tocPagination.startIndex, this.tocPagination.endIndex);
  }

  /**
   * Navigate to the TOC page containing the specified FAQ item
   */
  private navigateToFAQPage(faqItem: FAQItem): void {
    const faqList = this.showHome ? this.trendingQuestions : this.currentFAQList;
    const index = faqList.findIndex(item => item.id === faqItem.id);
    
    if (index >= 0) {
      const targetPage = Math.floor(index / this.tocPagination.itemsPerPage) + 1;
      if (targetPage !== this.tocPagination.currentPage) {
        this.tocPagination.currentPage = targetPage;
        this.updateTOCPaginationIndices();
        this.cdr.markForCheck();
      }
    }
  }

  // ==================== Debug Methods ====================
  
  // ==================== Table of Contents Methods ====================

  /**

   */
  /**

   */
  private updateActiveScrollElementOptimized(scrollPosition: number): void {
    const offset = scrollPosition + 150; 
    
    // Cache FAQ elements and their positions to avoid repeated queries
    if (!this.cachedFaqElements || this.cachedFaqElements.length === 0) {
      this.refreshFaqElementsCache();
    }
    
    let activeElement = '';
    let closestDistance = Infinity;

    
    if (!this.cachedFaqElements) return;
    
    for (let i = 0; i < this.cachedFaqElements.length; i++) {
      const element = this.cachedFaqElements[i];
      const rect = element.getBoundingClientRect();
      const absoluteTop = rect.top + scrollPosition;
      const absoluteBottom = absoluteTop + rect.height;
      
      
      if (absoluteTop <= offset + 100 && absoluteBottom >= offset - 100) {
        const distance = Math.abs(absoluteTop - offset);
        
        
        if (distance < closestDistance) {
          closestDistance = distance;
          
          const cachedText = this.cachedQuestionTexts.get(i);
          if (cachedText) {
            activeElement = cachedText;
          } else {
            
            const questionElement = element.querySelector('.faq-question');
            if (questionElement) {
              activeElement = questionElement.textContent || '';
              this.cachedQuestionTexts.set(i, activeElement);
            }
          }
        }
      }
    }

    
    if (activeElement && activeElement !== this.activeScrollElement) {
      this.activeScrollElement = activeElement;
      
      
      Promise.resolve().then(() => {
        this.cdr.markForCheck();
        
        
        this.scrollActiveTOCItemIntoView();
      });
    }
  }
  
  /**

   */
  private scrollActiveTOCItemIntoView(): void {
    
    const activeTOCItem = document.querySelector('.faq-toc .toc-item.active');
    if (activeTOCItem) {
      
      activeTOCItem.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest', 
        inline: 'nearest'
      });
    }
  }

  /**

   */
  private refreshFaqElementsCache(): void {
    this.cachedFaqElements = Array.from(document.querySelectorAll('.faq-item'));
    
    
    this.cachedQuestionTexts = new Map();
    this.cachedFaqElements.forEach((element, index) => {
      const questionElement = element.querySelector('.faq-question');
      if (questionElement) {
        this.cachedQuestionTexts.set(index, questionElement.textContent || '');
      }
    });
    
    // Only check for active element if user has scrolled
    // This prevents auto-highlighting on initial page load
    if (this.userHasScrolled) {
      requestAnimationFrame(() => {
        this.updateActiveScrollElementOptimized(window.pageYOffset);
      });
    }
  }

  // Cache FAQ elements to avoid repeated queries
  private cachedFaqElements: Element[] | null = null;
  private cachedQuestionTexts: Map<number, string> = new Map();

  /**

   */
  isCurrentFAQ(item: FAQItem): boolean {
    
    if (this.current.faqTitle === item.question) {
      return true;
    }
    
    
    const footerStatus = this.checkFooterProximity();
    if (footerStatus.inFooterZone) {
      return false; 
    }
    
    
    if (this.activeScrollElement === item.question) {
      return true;
    }
    
    return false;
  }

  /**

   */
  scrollToFAQ(item: FAQItem, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    // Mark that user has interacted - this enables TOC highlighting
    this.userHasScrolled = true;
    
    // Navigate to the TOC page containing this FAQ
    this.navigateToFAQPage(item);
    
    
    this.current.faqItem = item;
    this.current.faqTitle = item.question;
    this.activeScrollElement = item.question; 

    
    this.updateBrowserURL(item);

    
    this.trackFAQView(item);

    // Display FAQ content directly
    this.showFAQDetail(item);

    // Scroll to top instead of FAQ item for better navigation experience
    this.scrollToTop();

    
    if (!item.safeAnswer && item.folderId) {
      item.isLoading = true;

      this.faqService.getFAQContent(item.folderId).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: (content) => {
          item.safeAnswer = content;
          item.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Failed to load FAQ content:', error);
          item.safeAnswer = this.sanitizer.bypassSecurityTrustHtml(
            '<p class="error-message">Failed to load content, please try again later</p>'
          );
          item.isLoading = false;
          this.cdr.markForCheck();
        }
      });
    }
  }

  /**

   */
  private scrollToTop(): void {
    window.scrollTo({
      top: 0,
      behavior: 'auto' 
    });
  }

  selectTrendingQuestion(item: FAQItem, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    // Mark that user has interacted - this enables TOC highlighting
    this.userHasScrolled = true;
    
    // Navigate to the TOC page containing this FAQ
    this.navigateToFAQPage(item);
    
    
    this.current.faqTitle = item.question;
    this.current.faqItem = item;
    this.activeScrollElement = item.question; 

    
    this.updateBrowserURL(item);

    
    this.trackFAQView(item);

    // Display FAQ content directly
    this.showFAQDetail(item);

    // Scroll to top instead of FAQ item for better navigation experience
    this.scrollToTop();
  }

  /**


   */
  trackByFAQ(_index: number, item: FAQItem): string {
    return item.id;
  }

  // ==================== Footer Interaction Methods ====================

  private footerObserver?: IntersectionObserver;
  private footerAnimationFrame?: number;
  private optimizedScrollListener?: () => void;
  private lastScrollPosition = 0;
  private scrollTicking = false;

  /**
   * Setup optimized footer intersection observer
   */
  private setupFooterObserver(): void {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return;
    }

    // Clean up existing observer
    if (this.footerObserver) {
      this.footerObserver.disconnect();
    }

    this.footerObserver = new IntersectionObserver(
      (entries) => {
        // Simplified with fewer thresholds for better performance
        if (this.footerAnimationFrame) {
          cancelAnimationFrame(this.footerAnimationFrame);
        }
        
        this.footerAnimationFrame = requestAnimationFrame(() => {
          entries.forEach(entry => {
            this.handleFooterVisibility(entry);
          });
        });
      },
      {
        root: null,
        rootMargin: '50px 0px 0px 0px', // Reduced margin for less frequent triggering
        threshold: [0, 0.1, 0.5, 1.0] // Simplified thresholds - 4 instead of 101
      }
    );

    // Observe footer element with retry logic
    this.observeFooterWithRetry();
    
    // Setup single optimized scroll listener
    this.setupOptimizedScrollListener();
    
    // Initial check for footer position
    setTimeout(() => {
      this.checkFooterPositionDirectly();
    }, 100);
  }

  /**
   * Handle footer visibility changes with smooth upward movement
   */
  private handleFooterVisibility(entry: IntersectionObserverEntry): void {
    const footerRect = entry.boundingClientRect;
    const viewportHeight = window.innerHeight;
    
    // Calculate how much footer is visible from the bottom of viewport
    let footerOffset = 0;
    
    if (entry.isIntersecting) {
      // Footer is intersecting with viewport
      const footerTopInViewport = footerRect.top;
      
      if (footerTopInViewport < viewportHeight) {
        // Footer is visible, calculate how much space it needs
        footerOffset = Math.max(0, viewportHeight - footerTopInViewport);
        // Cap the offset to prevent excessive movement
        footerOffset = Math.min(footerOffset, footerRect.height);
      }
    }
    
    // Use the unified update method for consistency
    this.updateFooterOffsetOptimized(footerOffset);
  }

  /**
   * Setup single optimized scroll listener for all scroll-related functionality
   */
  private setupOptimizedScrollListener(): void {
    if (typeof window === 'undefined') return;
    
    this.optimizedScrollListener = () => {
      // Mark that user has scrolled - this enables TOC highlighting
      if (!this.userHasScrolled) {
        this.userHasScrolled = true;
      }
      
      if (!this.scrollTicking) {
        requestAnimationFrame(() => {
          const currentScrollPosition = window.pageYOffset;
          
          // Only process if scroll position changed (reduced threshold for better responsiveness)
          if (Math.abs(currentScrollPosition - this.lastScrollPosition) > 1) {
            this.handleOptimizedScroll(currentScrollPosition);
            this.lastScrollPosition = currentScrollPosition;
          }
          
          this.scrollTicking = false;
        });
        this.scrollTicking = true;
      }
    };
    
    window.addEventListener('scroll', this.optimizedScrollListener, { passive: true });
  }

  /**
   * Handle all scroll-related updates in one optimized function
   */
  private handleOptimizedScroll(scrollPosition: number): void {
    
    const footerStatus = this.checkFooterProximity();
    
    
    if (!footerStatus.inFooterZone) {
      this.updateActiveScrollElementOptimized(scrollPosition);
    } else {
      
      this.clearActiveStateInFooterZone();
    }
    
    
    this.updateTOCFooterState(footerStatus);
    
    // Update breadcrumb sticky behavior
    
    
    if (scrollPosition % 3 === 0) {
      this.updateFooterOffsetOptimized(footerStatus.footerOffset);
    }
  }

  /**
   * Direct footer position check for immediate response
   */
  private checkFooterPositionDirectly(): void {
    const footerElement = document.querySelector('app-footer');
    if (!footerElement) return;
    
    const footerRect = footerElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    
    let footerOffset = 0;
    
    if (footerRect.top < viewportHeight) {
      // Footer is visible, calculate offset
      footerOffset = Math.max(0, viewportHeight - footerRect.top);
      footerOffset = Math.min(footerOffset, footerRect.height);
    }
    
    // Apply immediate offset update
    this.updateFooterOffsetOptimized(footerOffset);
  }

  /**

   */
  private checkFooterProximity(): { inFooterZone: boolean; approaching: boolean; footerOffset: number } {
    
    const now = Date.now();
    if (this.lastFooterStatus && (now - this.footerCheckDebounce) < 50) {
      return this.lastFooterStatus;
    }
    
    const footerElement = document.querySelector('app-footer') as HTMLElement;
    if (!footerElement) {
      const fallback = { inFooterZone: false, approaching: false, footerOffset: 0 };
      this.lastFooterStatus = fallback;
      this.footerCheckDebounce = now;
      return fallback;
    }
    
    const footerRect = footerElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const footerThreshold = 200; 
    
    let footerOffset = 0;
    if (footerRect.top < viewportHeight) {
      footerOffset = Math.max(0, viewportHeight - footerRect.top);
      footerOffset = Math.min(footerOffset, footerRect.height);
    }
    
    const inFooterZone = footerRect.top < viewportHeight * 0.8; 
    const approaching = footerRect.top < viewportHeight + footerThreshold;
    
    const result = { inFooterZone, approaching, footerOffset };
    this.lastFooterStatus = result;
    this.footerCheckDebounce = now;
    
    return result;
  }
  
  /**

   */
  private updateTOCFooterState(footerStatus: { inFooterZone: boolean; approaching: boolean; footerOffset: number }): void {
    const tocElement = document.querySelector('.faq-toc.desktop-toc') as HTMLElement;
    if (!tocElement) return;
    
    
    tocElement.classList.toggle('in-footer-zone', footerStatus.inFooterZone);
    tocElement.classList.toggle('footer-approaching', footerStatus.approaching);
    
    
    if (footerStatus.approaching && footerStatus.footerOffset > 0) {
      document.documentElement.style.setProperty('--footer-overlap', `${footerStatus.footerOffset}px`);
    } else {
      document.documentElement.style.setProperty('--footer-overlap', '0px');
    }
  }
  
  /**

   */
  private clearActiveStateInFooterZone(): void {
    if (this.activeScrollElement) {
      this.activeScrollElement = '';
      this.cdr.markForCheck();
    }
  }

  /**

   */
  private updateFooterOffsetOptimized(footerOffset: number): void {
    
    const isFooterVisible = footerOffset > 20;
    document.documentElement.style.setProperty('--footer-visible', isFooterVisible ? '1' : '0');
  }

  // Cache DOM elements to avoid repeated queries
  private lastFooterStatus: { inFooterZone: boolean; approaching: boolean; footerOffset: number } | null = null;
  private footerCheckDebounce: number = 0;

  /**
   * Observe footer with retry logic to ensure it's found
   */
  private observeFooterWithRetry(retries: number = 0): void {
    const maxRetries = 10;
    const delay = 200;
    
    const tryObserve = () => {
      const footerElement = document.querySelector('app-footer');
      if (footerElement && this.footerObserver) {
        this.footerObserver.observe(footerElement);
        return;
      }
      
      if (retries < maxRetries) {
        setTimeout(() => {
          this.observeFooterWithRetry(retries + 1);
        }, delay);
      }
    };
    
    tryObserve();
  }

  /**
   * Clean up footer observer and optimized scroll listener
   */
  private cleanupFooterObserver(): void {
    if (this.footerObserver) {
      this.footerObserver.disconnect();
      this.footerObserver = undefined;
    }
    
    if (this.footerAnimationFrame) {
      cancelAnimationFrame(this.footerAnimationFrame);
      this.footerAnimationFrame = undefined;
    }
    
    if (this.optimizedScrollListener) {
      window.removeEventListener('scroll', this.optimizedScrollListener);
      this.optimizedScrollListener = undefined;
    }
    
    // Clear cached elements
    this.cachedFaqElements = null;
    this.cachedQuestionTexts.clear();
  }

  // ========================
  // Preview Mode Methods
  // ========================


  /**
   * Setup preview mode with content from editor
   */
  private setupPreviewMode(faqId: string): void {
    
    // Get preview data from storage
    const previewData = this.previewService.getPreviewData(faqId);
    
    if (previewData) {
      
      // Update page title to indicate preview mode
      this.title.setTitle(`[Preview] ${previewData.question} - Data Sync Pro FAQ`);
      
      // Create virtual FAQ item for preview
      const previewFAQ: FAQItem = {
        id: previewData.faqId,
        question: previewData.question,
        category: previewData.category,
        subCategory: previewData.subCategory,
        folderId: '', // No path needed for preview
        answer: '',
        safeAnswer: this.sanitizer.bypassSecurityTrustHtml(previewData.htmlContent)
      };
      
      // Set this as the current FAQ
      this.current.faqItem = previewFAQ;
      this.current.category = previewData.category;
      this.current.subCategory = previewData.subCategory || '';
      this.current.faqTitle = previewData.question;
      
      // Initialize FAQ list with preview item to avoid "no FAQ" message
      this.faqList = [previewFAQ];
      
      // Hide sidebar search results since we're showing preview
      this.search.isActive = false;
      
      // Set UI state to show content
      this.ui.isLoading = false;
      
      // Force change detection
      this.cdr.markForCheck();
      
      
      // Setup storage listener for real-time updates
      this.setupPreviewUpdateListener(faqId);
    } else {
      console.error('❌ No preview data found in SessionStorage for faqId:', faqId);
      this.handleMissingPreviewData(faqId);
    }
  }

  /**
   * Handle case when preview data is not found
   */
  private handleMissingPreviewData(faqId: string): void {
    // Update page title
    this.title.setTitle('[Preview Error] Preview data not found - Data Sync Pro FAQ');
    
    // Create error FAQ item
    const errorFAQ: FAQItem = {
      id: faqId,
      question: 'Preview Data Not Found',
      category: 'Error',
      subCategory: '',
      folderId: '',
      answer: '',
      safeAnswer: this.sanitizer.bypassSecurityTrustHtml(`
        <div style="text-align: center; padding: 2rem; border: 2px dashed #f0ad4e; border-radius: 8px; background: #fdf6e3;">
          <h3 style="color: #f0ad4e; margin-bottom: 1rem;">⚠️ Preview Data Not Found</h3>
          <p style="margin-bottom: 1rem; color: #666;">Unable to find preview data for FAQ ID <code>${faqId}</code> in session storage.</p>
          <p style="margin-bottom: 1.5rem; color: #666;">Please return to the editor and open preview again.</p>
          <button onclick="window.close()" style="background: #5bc0de; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; margin-right: 0.5rem;">Close Preview</button>
          <button onclick="window.opener?.focus(); window.close();" style="background: #5cb85c; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;">Back to Editor</button>
        </div>
      `)
    };
    
    // Set the error FAQ as current
    this.current.faqItem = errorFAQ;
    this.current.category = 'Error';
    this.current.subCategory = '';
    this.current.faqTitle = 'Preview Data Not Found';
    
    // Set single item list to avoid "no FAQ" message
    this.faqList = [errorFAQ];
    
    this.ui.isLoading = false;
    this.cdr.markForCheck();
  }

  /**
   * Listen for preview content updates from editor
   */
  private setupPreviewUpdateListener(faqId: string): void {
    
    // Enhanced storage event listener
    const handleStorageEvent = (event: StorageEvent) => {
      const sessionKey = `faq-preview-${faqId}`;
      const backupKey = `backup-faq-preview-${faqId}`;
      // Check both sessionStorage and localStorage keys
      if ((event.key === sessionKey || event.key === backupKey) && event.newValue) {
        try {
          const updatedData: PreviewData = JSON.parse(event.newValue);
          
          this.updatePreviewContent(updatedData);
        } catch (error) {
          console.error('❌ Error parsing preview update data:', error);
        }
      }
    };

    // Listen for storage events (cross-tab communication)
    window.addEventListener('storage', handleStorageEvent);
    
    // Enhanced periodic check for updates (fallback mechanism)
    const updateInterval = setInterval(() => {
      this.checkForPreviewUpdates(faqId);
    }, 1000); // Increased frequency to 1 second for better responsiveness
    
    // Clean up interval on destroy
    this.destroy$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      clearInterval(updateInterval);
      window.removeEventListener('storage', handleStorageEvent);
    });
  }

  /**
   * Update preview content with new data
   */
  private updatePreviewContent(updatedData: PreviewData): void {
    if (!this.current.faqItem) return;

    
    // Update the current FAQ item with new content
    this.current.faqItem.question = updatedData.question;
    this.current.faqItem.safeAnswer = this.sanitizer.bypassSecurityTrustHtml(updatedData.htmlContent);
    
    // Update page title
    this.title.setTitle(`[Preview] ${updatedData.question} - Data Sync Pro FAQ`);
    
    // Update timestamp
    this.setPreviewTimestamp(updatedData.timestamp);
    
    // Trigger change detection
    this.cdr.markForCheck();
    
    // Force DOM update
    this.cdr.detectChanges();
    
  }

  /**
   * Check for preview updates (fallback mechanism)
   */
  private checkForPreviewUpdates(faqId: string): void {
    const currentData = this.previewService.getPreviewData(faqId);
    if (!currentData || !this.current.faqItem) return;

    const currentTimestamp = this.getPreviewTimestamp();
    
    if (currentData.timestamp > currentTimestamp) {
      this.updatePreviewContent(currentData);
    }
  }

  /**
   * Get preview timestamp for comparison
   */
  private getPreviewTimestamp(): number {
    return (this.current.faqItem as any)?._previewTimestamp || 0;
  }

  /**
   * Set preview timestamp
   */
  private setPreviewTimestamp(timestamp: number): void {
    if (this.current.faqItem) {
      (this.current.faqItem as any)._previewTimestamp = timestamp;
    }
  }

  /**
   * Check if currently in preview mode
   */
  isPreviewMode(): boolean {
    return this.route.snapshot.queryParams['preview'] === 'true';
  }



}

