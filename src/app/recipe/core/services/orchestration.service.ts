import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, tap, catchError } from 'rxjs/operators';
import { Store } from '../store/recipe.store';
import { DataService } from './data.service';
import { TransformService } from './transform.service';
import { CacheService } from './cache.service';
import { LoggerService } from './logger.service';
import { Recipe } from '../models/recipe.model';

@Injectable({
  providedIn: 'root'
})
export class OrchestrationService {
  constructor(
    private store: Store,
    private dataService: DataService,
    private transformService: TransformService,
    private cacheService: CacheService,
    private logger: LoggerService
  ) {
    this.logger.info('RecipeOrchestrationService initialized');
  }

  initializeRecipes(): Observable<Recipe[]> {
    this.logger.info('Initializing recipes with cache support');
    void this.loadFromCache();
    return this.loadFromServer();
  }

  private loadKicked = false;

  /**
   * Idempotently kick off recipe loading in the background. Called by the recipe
   * pages (list + detail) so recipes load only when that section is opened —
   * not at app bootstrap, which made every page (FAQ, transformation, user
   * manual) contend with ~40 recipe fetches on first load.
   */
  ensureRecipesLoaded(): void {
    if (this.loadKicked) return;
    this.loadKicked = true;
    this.initializeRecipes().subscribe();
  }

  private async loadFromCache(): Promise<void> {
    try {
      const cachedSources = await this.cacheService.getCachedSourceRecipes();

      if (cachedSources && cachedSources.length > 0) {
        this.logger.info('Loading from cache', { count: cachedSources.length });
        const recipeItems = this.transformService.transformRecipeRecords(cachedSources);
        this.store.setRecipes(recipeItems);
        this.logger.debug('Cache loaded successfully');
      }
    } catch (error) {
      this.logger.warn('Failed to load from cache', error);
    }
  }

  private loadFromServer(): Observable<Recipe[]> {
    this.logger.info('Loading recipes from server');
    this.store.setLoadingRecipes(true);

    return this.dataService.loadAllRecipes().pipe(
      map(sourceRecords => {
        this.logger.debug('Received source records', { count: sourceRecords.length });
        return this.transformService.transformRecipeRecords(sourceRecords);
      }),
      tap(recipeItems => {
        this.logger.info('Updating store and cache', { count: recipeItems.length });
        this.store.setRecipes(recipeItems);
        this.cacheService.setRecipes(recipeItems);
      }),
      tap(() => {
        this.store.setLoadingRecipes(false);
        this.logger.info('Recipes loaded successfully');
      }),
      catchError(error => {
        this.logger.error('Failed to load recipes from server', error);
        this.store.setLoadingRecipes(false);
        this.store.setRecipesLoadError(error.message || 'Failed to load recipes');
        return of([]);
      })
    );
  }
}
