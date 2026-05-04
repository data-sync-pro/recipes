import { Injectable, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { Recipe, Filter, SearchState } from '../../core/models/recipe.model';
import { SearchService as CoreSearchService } from '../../core/services/search.service';
import { Store } from '../../core/store/recipe.store';
import { LoggerService } from '../../core/services/logger.service';
import { SelectedSuggestion } from '../search-overlay/search-overlay.component';

export interface SearchResultEvent {
  query: string;
  results: Recipe[];
  hasResults: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class SearchStateService implements OnDestroy {

  private destroy$ = new Subject<void>();

  private searchOverlayInitialQuery$ = new BehaviorSubject<string>('');

  private searchResult$ = new Subject<SearchResultEvent>();

  constructor(
    private coreSearchService: CoreSearchService,
    private store: Store,
    private router: Router,
    private logger: LoggerService
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getSearchState(): Observable<SearchState> {
    return this.store.data$.pipe(
      map(data => ({
        query: data.searchQuery,
        isActive: data.searchIsActive,
        results: data.searchResults.map(r => {
          const { relevanceScore, ...recipeItem } = r;
          return recipeItem as Recipe;
        }),
        hasResults: data.searchHasResults,
        isOverlayOpen: data.searchOverlayOpen
      }))
    );
  }

  getSearchOverlayInitialQuery(): Observable<string> {
    return this.searchOverlayInitialQuery$.asObservable();
  }

  getSearchResultEvents(): Observable<SearchResultEvent> {
    return this.searchResult$.asObservable();
  }

  searchRecipes(query: string, currentFilter: Filter, allRecipes: Recipe[]): void {
    if (query.trim().length > 0) {
      try {
        let filteredRecipes = allRecipes;
        if (currentFilter.categories && currentFilter.categories.length > 0) {
          filteredRecipes = allRecipes.filter(recipe =>
            recipe.category.some(cat => currentFilter.categories.includes(cat))
          );
        }

        const searchResults = this.coreSearchService.search(filteredRecipes, query);

        const results: Recipe[] = searchResults.map(result => {
          const { relevanceScore, ...recipeItem } = result;
          return recipeItem as Recipe;
        });

        this.store.updateDataState({
          searchQuery: query,
          searchIsActive: true,
          searchResults: searchResults,
          searchHasResults: results.length > 0
        });

        this.searchResult$.next({
          query: query,
          results: results,
          hasResults: results.length > 0
        });
      } catch (error) {
        this.logger.error('Search failed', error);

        this.store.updateDataState({
          searchQuery: query,
          searchIsActive: true,
          searchResults: [],
          searchHasResults: false
        });
      }
    } else {
      this.store.clearSearch();

      this.searchResult$.next({
        query: '',
        results: allRecipes,
        hasResults: true
      });
    }
  }

  clearSearch(allRecipes: Recipe[]): void {
    this.store.clearSearch();

    this.searchResult$.next({
      query: '',
      results: allRecipes,
      hasResults: true
    });
  }

  openSearchOverlay(initialQuery = ''): void {
    this.searchOverlayInitialQuery$.next(initialQuery);
    this.store.openSearchOverlay();
  }

  closeSearchOverlay(): void {
    this.store.closeSearchOverlay();
  }

  handleSearchOverlaySelect(selectedRecipe: SelectedSuggestion): void {
    this.router.navigate(['/recipes', selectedRecipe.category, selectedRecipe.slug]);

    this.closeSearchOverlay();
  }

  isInputFocused(): boolean {
    const activeElement = document.activeElement;
    return !!(activeElement instanceof HTMLInputElement ||
           activeElement instanceof HTMLTextAreaElement ||
           (activeElement && activeElement.tagName === 'INPUT') ||
           (activeElement && activeElement.tagName === 'TEXTAREA'));
  }

}