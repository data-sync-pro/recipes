import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ViewChild, ElementRef } from '@angular/core';
import { Recipe, Category } from '../../core/models/recipe.model';
import { categoryToSlug } from '../../core/constants/recipe.constants';

@Component({
  selector: 'app-recipe-list',
  templateUrl: './recipe-list.component.html',
  styleUrls: ['./recipe-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecipeListComponent {
  @Input() recipes: Recipe[] = [];
  @Input() categories: Category[] = [];
  /** Current category display name (empty on the home view). Drives the page title. */
  @Input() category: string = '';
  @Input() searchQuery: string = '';
  @Output() searchChange = new EventEmitter<string>();
  @Output() recipeSelect = new EventEmitter<Recipe>();
  @Output() openSearchOverlay = new EventEmitter<void>();

  @ViewChild('filterInput') filterInput!: ElementRef<HTMLInputElement>;

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchChange.emit(value);
  }

  onRecipeClick(recipe: Recipe): void {
    this.recipeSelect.emit(recipe);
  }

  /** Detail-page link for a recipe (category slug + recipe slug). */
  recipeLink(recipe: Recipe): string[] {
    return ['/recipes', categoryToSlug(recipe.category[0] || ''), recipe.slug || ''];
  }

  trackByRecipeId(_: number, recipe: Recipe): string {
    return recipe.id;
  }

  focusFilterInput(): void {
    if (this.filterInput) {
      this.filterInput.nativeElement.focus();
    }
  }
}
