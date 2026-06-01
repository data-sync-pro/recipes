import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { Recipe, Category } from '../../core/models/recipe.model';
import { RecipeListComponent } from '../recipe-list/recipe-list.component';
import { RecipeNavSidebarComponent } from '../recipe-nav-sidebar/recipe-nav-sidebar.component';

@Component({
  selector: 'app-recipe-layout',
  templateUrl: './recipe-layout.component.html',
  styleUrls: ['./recipe-layout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecipeLayoutComponent {
  @Input() recipes: Recipe[] = [];
  /** Full recipe list for the navigation sidebar (recipes is the filtered grid view). */
  @Input() allRecipes: Recipe[] = [];
  @Input() categories: Category[] = [];
  @Input() searchQuery: string = '';

  @Output() searchChange = new EventEmitter<string>();
  @Output() recipeSelect = new EventEmitter<Recipe>();
  @Output() openSearchOverlay = new EventEmitter<void>();

  @ViewChild(RecipeListComponent) recipeListComponent!: RecipeListComponent;
  @ViewChild(RecipeNavSidebarComponent) navSidebar?: RecipeNavSidebarComponent;

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
    this.navSidebar?.focusFilter();
  }
}
