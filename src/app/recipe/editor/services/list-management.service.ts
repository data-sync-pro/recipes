import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { takeUntil, map } from 'rxjs/operators';
import { Recipe, RecipeData } from '../../core/models/recipe.model';
import { CacheService } from '../../core/services/cache.service';
import { StorageService } from './storage.service';
import { LoggerService } from '../../core/services/logger.service';
import { sortRecipesByCategoryAndTitle } from '../../core/utils';

export interface RecipeTitleItem {
  id: string;
  recipeId: string;
  title: string;
}

@Injectable({
  providedIn: 'root'
})
export class ListManagementService implements OnDestroy {
  private destroy$ = new Subject<void>();

  private recipesSubject = new BehaviorSubject<Recipe[]>([]);
  public readonly recipes$ = this.recipesSubject.asObservable();

  private filteredRecipesSubject = new BehaviorSubject<Recipe[]>([]);
  public readonly filteredRecipes$ = this.filteredRecipesSubject.asObservable();

  private editedRecipeIdsSubject = new BehaviorSubject<Set<string>>(new Set());
  public readonly editedRecipeIds$ = this.editedRecipeIdsSubject.asObservable();

  private recipeActiveStatesSubject = new BehaviorSubject<Map<string, boolean>>(new Map());

  constructor(
    private http: HttpClient,
    private cacheService: CacheService,
    private storageService: StorageService,
    private logger: LoggerService
  ) {
    this.initialize();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initialize(): void {
    this.loadRecipes();
    this.loadRecipeActiveStates();
    this.loadEditedRecipes();
  }

  loadRecipes(): void {
    this.cacheService.getRecipes$()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (recipes) => {
          this.recipesSubject.next(recipes);
          this.filteredRecipesSubject.next(sortRecipesByCategoryAndTitle(recipes));
          this.logger.debug('Recipes loaded for editor', { count: recipes.length });
        },
        error: (error) => {
          this.logger.error('Failed to load recipes', error);
        }
      });
  }

  loadRecipeActiveStates(): void {
    this.http.get<{recipes: {folderId: string, active: boolean}[]}>('assets/recipes/index.json')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (indexData) => {
          const stateMap = new Map<string, boolean>();

          // First, load the original active states from index.json
          indexData.recipes.forEach(item => {
            stateMap.set(item.folderId, item.active);
          });

          // Then, override with any saved states from localStorage
          const savedStates = this.storageService.getAllActiveStates();
          Object.keys(savedStates).forEach(recipeId => {
            stateMap.set(recipeId, savedStates[recipeId]);
          });

          this.recipeActiveStatesSubject.next(stateMap);
          this.logger.debug('Recipe active states loaded', { count: stateMap.size });
        },
        error: (error) => {
          this.logger.error('Failed to load recipe active states', error);
        }
      });
  }

  loadEditedRecipes(): void {
    const editedIds = this.storageService.getEditedRecipeIds();
    this.editedRecipeIdsSubject.next(new Set(editedIds));
    this.logger.debug('Edited recipes loaded', { count: editedIds.length });
  }

  filterRecipes(searchQuery: string, selectedCategory: string): void {
    const recipes = this.recipesSubject.value;

    const filtered = recipes.filter(recipe => {
      const matchesSearch = !searchQuery ||
        recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        recipe.id.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory = !selectedCategory ||
        recipe.category.includes(selectedCategory);

      return matchesSearch && matchesCategory;
    });

    this.filteredRecipesSubject.next(sortRecipesByCategoryAndTitle(filtered));
  }

  isRecipeEdited(recipeId: string): boolean {
    return this.editedRecipeIdsSubject.value.has(recipeId);
  }

  isRecipeActive(recipeId: string): boolean {
    return this.recipeActiveStatesSubject.value.get(recipeId) ?? true;
  }

  setRecipeActiveState(recipeId: string, isActive: boolean): void {
    const currentStates = new Map(this.recipeActiveStatesSubject.value);
    currentStates.set(recipeId, isActive);
    this.recipeActiveStatesSubject.next(currentStates);

    // Persist to localStorage
    this.storageService.saveRecipeActiveState(recipeId, isActive);
  }

  getAllRecipeActiveStates(): Map<string, boolean> {
    return new Map(this.recipeActiveStatesSubject.value);
  }

  getFilteredEditedRecipes(isCreated?: boolean): RecipeData[] {
    const editedRecipes = this.storageService.getAllEditedRecipes();

    if (isCreated === undefined) {
      return editedRecipes;
    }

    const originalRecipeIds = new Set(this.recipesSubject.value.map(r => r.id));

    return editedRecipes.filter(recipe => {
      if (!recipe.id) return false;
      const isNew = !originalRecipeIds.has(recipe.id);
      return isCreated ? isNew : !isNew;
    });
  }

  getCreatedCount(): number {
    return this.getFilteredEditedRecipes(true).length;
  }

  getEditedExistingCount(): number {
    return this.getFilteredEditedRecipes(false).length;
  }

  getTotalEditedCount(): number {
    return this.getFilteredEditedRecipes().length;
  }

  recipesToTitleItems(
    recipes: RecipeData[],
    maxLength: number,
    maxItems: number
  ): RecipeTitleItem[] {
    const items: RecipeTitleItem[] = recipes
      .filter(recipe => recipe.id && recipe.title)
      .map(recipe => ({
        id: recipe.id,
        recipeId: recipe.id,
        title: this.truncateTitle(recipe.title, maxLength)
      }));

    return items
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, maxItems);
  }

  getCreatedRecipeTitles(maxLength: number, maxItems: number): RecipeTitleItem[] {
    const created = this.getFilteredEditedRecipes(true);
    return this.recipesToTitleItems(created, maxLength, maxItems);
  }

  getEditedExistingRecipeTitles(maxLength: number, maxItems: number): RecipeTitleItem[] {
    const edited = this.getFilteredEditedRecipes(false);
    return this.recipesToTitleItems(edited, maxLength, maxItems);
  }

  getEditedRecipeTitles(maxLength: number, maxItems: number): RecipeTitleItem[] {
    const all = this.getFilteredEditedRecipes();
    return this.recipesToTitleItems(all, maxLength, maxItems);
  }

  private truncateTitle(title: string, maxLength: number): string {
    return title.length > maxLength
      ? title.substring(0, maxLength) + '...'
      : title;
  }
}
