import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { Recipe, Category } from '../../core/models/recipe.model';
import { RecipeListComponent } from '../recipe-list/recipe-list.component';

@Component({
  selector: 'app-recipe-layout',
  templateUrl: './recipe-layout.component.html',
  styleUrls: ['./recipe-layout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecipeLayoutComponent {
  @Input() recipes: Recipe[] = [];
  @Input() categories: Category[] = [];
  @Input() selectedCategories: string[] = [];
  @Input() totalRecipeCount: number = 0;
  @Input() searchQuery: string = '';

  @Output() categoryToggle = new EventEmitter<string>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() recipeSelect = new EventEmitter<Recipe>();
  @Output() openSearchOverlay = new EventEmitter<void>();

  @ViewChild(RecipeListComponent) recipeListComponent!: RecipeListComponent;

  onCategoryToggle(categoryName: string): void {
    this.categoryToggle.emit(categoryName);
  }

  onSearchChange(query: string): void {
    this.searchChange.emit(query);
  }

  onRecipeSelect(recipe: Recipe): void {
    this.recipeSelect.emit(recipe);
  }

  onOpenSearchOverlay(): void {
    this.openSearchOverlay.emit();
  }

  focusFilterInput(): void {
    if (this.recipeListComponent) {
      this.recipeListComponent.focusFilterInput();
    }
  }
}
