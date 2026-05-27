import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ViewEncapsulation,
  HostListener,
  ViewChild
} from '@angular/core';
import { Subject, combineLatest } from 'rxjs';
import { takeUntil, distinctUntilChanged } from 'rxjs/operators';
import { ActivatedRoute } from '@angular/router';

import {
  Recipe,
  Category,
  Filter,
  NavigationState,
  SearchState
} from '../core/models/recipe.model';
import { CacheService } from '../core/services/cache.service';
import { SearchService as CoreSearchService } from '../core/services/search.service';
import { LoggerService } from '../core/services/logger.service';
import { sortRecipesByCategoryAndTitle } from '../core/utils';
import { categoryToSlug, slugToCategoryName } from '../core/constants/recipe.constants';
import { TocService } from './services/toc.service';
import { NavigationService } from './services/navigation.service';
import { Store } from '../core/store/recipe.store';
import { UIState } from '../core/store/store.interface';
import { PreviewSyncService } from './services/preview-sync.service';
import { RouteHandlerService } from './services/route-handler.service';
import { SearchStateService } from './services/search.service';
import { RECIPE_CLASSES, RECIPE_MESSAGES } from '../core/constants/recipe.constants';
import { SelectedSuggestion } from './search-overlay/search-overlay.component';
import { RecipeLayoutComponent } from './recipe-layout/recipe-layout.component';

@Component({
  selector: 'app-recipes',
  templateUrl: './page.component.html',
  styleUrls: ['./page.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecipesComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  @ViewChild('recipeLayout') recipeLayout!: RecipeLayoutComponent;

  ui!: UIState;

  search: SearchState = {
    query: '',
    isActive: false,
    results: [],
    hasResults: true,
    isOverlayOpen: false
  };

  searchOverlayInitialQuery = '';

  navigation: NavigationState = {
    category: '',
    recipeName: ''
  };

  recipes: Recipe[] = [];
  categories: Category[] = [];
  filteredRecipes: Recipe[] = [];
  totalRecipeCount: number = 0;

  currentFilter: Filter = {
    categories: []
  };

  constructor(
    private route: ActivatedRoute,
    private cacheService: CacheService,
    private coreSearchService: CoreSearchService,
    private cdr: ChangeDetectorRef,
    public recipeTocService: TocService,
    public recipeNavigationService: NavigationService,
    private store: Store,
    private previewSyncService: PreviewSyncService,
    private routeHandlerService: RouteHandlerService,
    private searchService: SearchStateService,
    private logger: LoggerService
  ) { }

  ngOnInit(): void {

    this.store.ui$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        this.ui = state;
        this.cdr.markForCheck();
      });

    combineLatest([
      this.route.paramMap,
      this.route.queryParamMap
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(([params, queryParams]) => {

      const categorySlug = params.get('category') || '';
      const recipeName = params.get('recipeName') || '';
      const category = categorySlug ? (slugToCategoryName(categorySlug) || '') : '';

      this.navigation = {
        category,
        recipeName
      };

      this.routeHandlerService.handleRouteParams(params, queryParams);

      this.cdr.markForCheck();
    });

    this.routeHandlerService.getDataLoadedEvents()
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        this.recipes = result.recipes;
        this.filteredRecipes = result.filteredRecipes;
        this.totalRecipeCount = result.totalRecipeCount;
        this.cdr.markForCheck();
      });

    this.loadInitialData();

    this.recipeNavigationService.setupOptimizedScrollListener();
    this.recipeNavigationService.setupSectionObserver();

    this.recipeNavigationService.getNavigationEvents()
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        this.cdr.markForCheck();
      });

    this.searchService.getSearchState()
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        this.search = state;
        this.cdr.markForCheck();
      });

    this.searchService.getSearchResultEvents()
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        const sortedResults = sortRecipesByCategoryAndTitle(event.results);
        this.filteredRecipes = sortedResults;
        this.cdr.markForCheck();
      });

    this.searchService.getSearchOverlayInitialQuery()
      .pipe(
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(query => {
        this.searchOverlayInitialQuery = query;
        this.cdr.markForCheck();
      });

    document.body.classList.add(RECIPE_CLASSES.BODY_PAGE);
  }

  @HostListener('document:keydown./', ['$event'])
  onSlashKey(event: Event) {
    if (!this.search.isOverlayOpen && !this.searchService.isInputFocused()) {
      event.preventDefault();
      // Focus the filter input instead of opening overlay
      if (this.recipeLayout) {
        this.recipeLayout.focusFilterInput();
      }
    }
  }

  @HostListener('document:keydown.control.k', ['$event'])
  @HostListener('document:keydown.meta.k', ['$event'])
  onCtrlK(event: Event) {
    event.preventDefault();
    if (!this.search.isOverlayOpen) {
      this.openSearchOverlay();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.search.isOverlayOpen) {
      this.closeSearchOverlay();
    }
  }

  @HostListener('window:hashchange',)
  onHashChange(): void {
    this.recipeNavigationService.handleInitialHash();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    this.recipeNavigationService.cleanup();

    this.previewSyncService.cleanup();

    document.body.classList.remove(RECIPE_CLASSES.BODY_PAGE);
  }

  private loadInitialData(): void {

    this.cacheService.getRecipes$().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (recipes) => {
        this.categories = this.coreSearchService.generateCategories(recipes);
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.logger.error(RECIPE_MESSAGES.ERROR_LOAD_CATEGORIES, error);
      }
    });

  }

  goHome(): void {
    this.routeHandlerService.goHome();
  }

  goToCategory(categoryName: string): void {
    this.routeHandlerService.goToCategory(categoryName, true);
  }

  goToRecipe(recipe: Recipe): void {
    this.routeHandlerService.goToRecipe(recipe);
  }

  searchRecipes(query: string): void {
    this.searchService.searchRecipes(query, this.currentFilter, this.recipes);
  }

  clearSearch(): void {
    this.searchService.clearSearch(this.recipes);
  }

  openSearchOverlay(initialQuery = ''): void {
    this.searchService.openSearchOverlay(initialQuery);
  }

  closeSearchOverlay(): void {
    this.searchService.closeSearchOverlay();
  }

  handleSearchOverlaySelect(selectedRecipe: SelectedSuggestion): void {
    this.searchService.handleSearchOverlaySelect(selectedRecipe);
  }

  toggleSidebar(): void {
    this.store.toggleSidebar();
  }

  toggleMobileSidebar(): void {
    this.store.toggleMobileSidebar();
  }

  closeMobileSidebar(): void {
    this.store.closeMobileSidebar();
  }

  toggleCategoryFilter(categoryName: string): void {
    // Single-select: clicking the same category deselects it, clicking a different one replaces
    if (this.currentFilter.categories.includes(categoryName)) {
      // Deselect if already selected
      this.currentFilter.categories = [];
    } else {
      // Select only this category (single-select)
      this.currentFilter.categories = [categoryName];
    }

    // If search is active, re-trigger the search with the new filter
    if (this.search.isActive && this.search.query) {
      this.searchRecipes(this.search.query);
    } else {
      // Otherwise, apply the filter normally
      this.applyFilters();
    }
  }

  private applyFilters(): void {
    // Start with all recipes
    let filtered = [...this.recipes];

    // Apply category filter - recipe matches if any of its categories is in the filter
    if (this.currentFilter.categories.length > 0) {
      filtered = filtered.filter(recipe =>
        recipe.category.some(cat => this.currentFilter.categories.includes(cat))
      );
    }

    // Apply search filter if active. Search results keep their own relevance
    // ordering; otherwise we sort to match the sidebar category order.
    if (this.search.isActive && this.search.query) {
      filtered = this.coreSearchService.search(filtered, this.search.query);
    } else {
      filtered = sortRecipesByCategoryAndTitle(filtered);
    }

    this.filteredRecipes = filtered;
    this.cdr.markForCheck();
  }

  getRecipeCount(): number {
    return this.totalRecipeCount;
  }

  get breadcrumbPath(): { name: string; url: string }[] {
    const path = [{ name: 'Recipes', url: '/recipes' }];

    if (this.navigation.category) {
      const category = this.categories.find(cat => cat.name === this.navigation.category);
      const categoryName = category?.displayName || this.navigation.category;
      path.push({
        name: categoryName,
        url: `/recipes/${categoryToSlug(this.navigation.category)}`
      });
    }

    return path;
  }

  get currentRecipes(): Recipe[] {
    return this.search.isActive ? this.search.results : this.filteredRecipes;
  }

  get showHome(): boolean {
    return this.ui.currentView === 'home' && !this.search.isActive;
  }

  get showCategory(): boolean {
    return this.ui.currentView === 'category' && !this.search.isActive;
  }

  get currentCategory(): Category | null {
    return this.categories.find(cat => cat.name === this.navigation.category) || null;
  }

  trackByRecipeId(_: number, recipe: Recipe): string {
    return recipe.id;
  }

  trackByCategoryName(_: number, category: Category): string {
    return category.name;
  }

  trackByBreadcrumbUrl(_: number, crumb: { name: string; url: string }): string {
    return crumb.url;
  }

}
