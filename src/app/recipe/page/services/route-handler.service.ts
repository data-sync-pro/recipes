import { Injectable, OnDestroy } from '@angular/core';
import { Router, ParamMap } from '@angular/router';
import { Observable, Subject, ReplaySubject } from 'rxjs';
import { takeUntil, map } from 'rxjs/operators';
import { Recipe, Tab } from '../../core/models/recipe.model';
import { CacheService } from '../../core/services/cache.service';
import { SearchService } from '../../core/services/search.service';
import { Store } from '../../core/store/recipe.store';
import { PreviewSyncService } from './preview-sync.service';
import { TocService } from './toc.service';
import { PreviewService } from '../../core/services/preview.service';
import { LoggerService } from '../../core/services/logger.service';
import { RECIPE_MESSAGES, RECIPE_SECTIONS } from '../../core/constants/recipe.constants';
import { sortRecipesByCategoryAndTitle } from '../../core/utils';

export interface RecipeLoadResult {
  currentRecipe: Recipe | null;
  recipeTabs: Tab[];
  recipes: Recipe[];
  filteredRecipes: Recipe[];
  needsObserverSetup: boolean;
  totalRecipeCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class RouteHandlerService implements OnDestroy {

  private destroy$ = new Subject<void>();
  private dataLoaded$ = new ReplaySubject<RecipeLoadResult>(1);
  private cachedTotalCount: number = 0;

  constructor(
    private router: Router,
    private cacheService: CacheService,
    private searchService: SearchService,
    private store: Store,
    private previewSyncService: PreviewSyncService,
    private recipeTocService: TocService,
    private previewService: PreviewService,
    private logger: LoggerService
  ) {
    this.initializeTotalCount();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getDataLoadedEvents(): Observable<RecipeLoadResult> {
    return this.dataLoaded$.asObservable();
  }

  handleRouteParams(params: ParamMap, queryParams: ParamMap): void {
    const category = params.get('category') || '';
    const recipeName = params.get('recipeName') || '';

    const isPreview = queryParams.get('preview') === 'true';
    const previewRecipeId = queryParams.get('recipeId') || undefined;

    if (isPreview && previewRecipeId) {
      this.store.setCurrentView('recipe');
      this.loadPreviewRecipe(previewRecipeId);
      this.previewSyncService.setupPreviewSync(previewRecipeId);
    } else {

      if (recipeName) {
        this.store.setCurrentView('recipe');
        this.loadRecipeDetails(category, recipeName);
      } else if (category) {
        this.store.setCurrentView('category');
        this.loadCategoryRecipes(category);
      } else {
        this.store.setCurrentView('home');
        this.loadAllRecipes();
      }
    }
  }

  private loadAllRecipes(): void {
    this.loadWithErrorHandling(
      this.cacheService.getRecipes$(),
      (recipes: Recipe[]) => {
        this.cachedTotalCount = recipes.length;

        const sortedRecipes = sortRecipesByCategoryAndTitle(recipes);

        this.dataLoaded$.next({
          currentRecipe: null,
          recipeTabs: [],
          recipes: recipes,
          filteredRecipes: sortedRecipes,
          needsObserverSetup: false,
          totalRecipeCount: recipes.length
        });
      },
      RECIPE_MESSAGES.ERROR_LOAD_RECIPES
    );
  }

  private loadCategoryRecipes(category: string): void {
    this.loadWithErrorHandling(
      this.cacheService.getRecipes$().pipe(
        map(recipes => this.searchService.filterByCategory(recipes, category))
      ),
      (recipes: Recipe[]) => {
        const sortedRecipes = sortRecipesByCategoryAndTitle(recipes);

        this.dataLoaded$.next({
          currentRecipe: null,
          recipeTabs: [],
          recipes: recipes,
          filteredRecipes: sortedRecipes,
          needsObserverSetup: false,
          totalRecipeCount: this.cachedTotalCount
        });
      },
      RECIPE_MESSAGES.ERROR_LOAD_RECIPES
    );
  }

  private loadRecipeDetails(category: string, recipeSlug: string): void {
    this.loadWithErrorHandling(
      this.cacheService.getRecipes$().pipe(
        map(recipes => {
          return recipes.find(r =>
            r.category.includes(category) &&
            r.slug === recipeSlug
          ) || null;
        })
      ),
      (recipe: Recipe | null) => {
        if (recipe) {
          this.recipeTocService.setCurrentRecipe(recipe);
          const recipeTabs = this.recipeTocService.generateRecipeTabs();

          this.store.updateUIState({ userHasScrolled: false });

          this.dataLoaded$.next({
            currentRecipe: recipe,
            recipeTabs: recipeTabs,
            recipes: [],
            filteredRecipes: [],
            needsObserverSetup: true,
            totalRecipeCount: this.cachedTotalCount
          });
        } else {
          this.dataLoaded$.next({
            currentRecipe: null,
            recipeTabs: [],
            recipes: [],
            filteredRecipes: [],
            needsObserverSetup: false,
            totalRecipeCount: this.cachedTotalCount
          });
        }
      },
      RECIPE_MESSAGES.ERROR_LOAD_RECIPE
    );
  }

  private loadPreviewRecipe(recipeId: string): void {
    this.store.setLoadingOverlay(true);

    const previewData = this.previewService.getPreviewData(recipeId);

    if (previewData) {
      const currentRecipe = this.previewSyncService.convertPreviewToRecipeItem(previewData);
      this.store.setLoadingOverlay(false);

      if (currentRecipe) {
        this.recipeTocService.setCurrentRecipe(currentRecipe);
        const recipeTabs = this.recipeTocService.generateRecipeTabs();
        this.store.updateUIState({ userHasScrolled: false });

        this.previewSyncService.setCurrentTimestamp(previewData.timestamp);

        this.dataLoaded$.next({
          currentRecipe: currentRecipe,
          recipeTabs: recipeTabs,
          recipes: [],
          filteredRecipes: [],
          needsObserverSetup: true,
          totalRecipeCount: this.cachedTotalCount
        });
      } else {
        this.dataLoaded$.next({
          currentRecipe: null,
          recipeTabs: [],
          recipes: [],
          filteredRecipes: [],
          needsObserverSetup: false,
          totalRecipeCount: this.cachedTotalCount
        });
      }
    } else {
      this.store.setLoadingOverlay(false);
      this.dataLoaded$.next({
        currentRecipe: null,
        recipeTabs: [],
        recipes: [],
        filteredRecipes: [],
        needsObserverSetup: false,
        totalRecipeCount: this.cachedTotalCount
      });
    }
  }

  private initializeTotalCount(): void {
    this.cacheService.getRecipes$().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (recipes: Recipe[]) => {
        this.cachedTotalCount = recipes.length;
      },
      error: (error: any) => {
        this.logger.error('Error initializing total recipe count', error);
        this.cachedTotalCount = 0;
      }
    });
  }

  private loadWithErrorHandling<T>(
    observable$: Observable<T>,
    processFn: (data: T) => void,
    errorMessage: string
  ): void {
    this.store.setLoadingOverlay(true);

    observable$.pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (data) => {
        processFn(data);
        this.store.setLoadingOverlay(false);
      },
      error: (error) => this.handleLoadError(error, errorMessage)
    });
  }

  private handleLoadError(error: any, message: string): void {
    this.logger.error(message, error);
    this.store.setLoadingOverlay(false);
  }

  goHome(): void {
    this.router.navigate(['/recipes']);
  }

  goToCategory(categoryName: string, closeMobileSidebar = false): void {
    this.router.navigate(['/recipes', categoryName]);

    if (closeMobileSidebar && this.store.getUIState().isMobile) {
      this.store.closeMobileSidebar();
    }
  }

  goToRecipe(
    recipe: Recipe,
    currentRecipeId?: string,
    currentRecipeCategory?: string
  ): void {
    const firstCategory = recipe.category[0] || '';
    const isSameRecipe = currentRecipeId &&
                        currentRecipeCategory &&
                        currentRecipeId === recipe.id &&
                        recipe.category.includes(currentRecipeCategory);

    this.router.navigate(['/recipes', firstCategory, recipe.slug]);

    if (!isSameRecipe) {
      this.store.setActiveSectionId(RECIPE_SECTIONS.RECIPE_OVERVIEW);
    }
  }
}
