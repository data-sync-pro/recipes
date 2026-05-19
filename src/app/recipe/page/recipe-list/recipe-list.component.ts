import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ViewChild, ElementRef } from '@angular/core';
import { Recipe, Category } from '../../core/models/recipe.model';

@Component({
  selector: 'app-recipe-list',
  templateUrl: './recipe-list.component.html',
  styleUrls: ['./recipe-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecipeListComponent {
  @Input() recipes: Recipe[] = [];
  @Input() categories: Category[] = [];
  @Input() searchQuery: string = '';
  @Output() searchChange = new EventEmitter<string>();
  @Output() recipeSelect = new EventEmitter<Recipe>();
  @Output() openSearchOverlay = new EventEmitter<void>();

  @ViewChild('filterInput') filterInput!: ElementRef<HTMLInputElement>;

  // Pagination
  currentPage = 1;
  itemsPerPage = 10;

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchChange.emit(value);
  }

  onRecipeClick(recipe: Recipe): void {
    this.recipeSelect.emit(recipe);
  }

  get paginatedRecipes(): Recipe[] {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    return this.recipes.slice(startIndex, endIndex);
  }

  get totalPages(): number {
    return Math.ceil(this.recipes.length / this.itemsPerPage);
  }

  get pageNumbers(): number[] {
    const pages: number[] = [];
    const total = this.totalPages;

    if (total <= 7) {
      // Show all pages if 7 or fewer
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      // Show smart pagination: 1, 2, 3, ..., 10
      pages.push(1);
      if (this.currentPage > 3) {
        pages.push(-1); // Ellipsis marker
      }

      const start = Math.max(2, this.currentPage - 1);
      const end = Math.min(total - 1, this.currentPage + 1);

      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) {
          pages.push(i);
        }
      }

      if (this.currentPage < total - 2) {
        pages.push(-1); // Ellipsis marker
      }

      if (!pages.includes(total)) {
        pages.push(total);
      }
    }

    return pages;
  }

  goToPage(page: number): void {
    if (page > 0 && page <= this.totalPages) {
      this.currentPage = page;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  goToFirstPage(): void {
    this.goToPage(1);
  }

  goToLastPage(): void {
    this.goToPage(this.totalPages);
  }

  goToPreviousPage(): void {
    this.goToPage(this.currentPage - 1);
  }

  goToNextPage(): void {
    this.goToPage(this.currentPage + 1);
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
