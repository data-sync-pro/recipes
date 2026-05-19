import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { Category } from '../../core/models/recipe.model';

@Component({
  selector: 'app-category-list',
  templateUrl: './category-list.component.html',
  styleUrls: ['./category-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CategoryListComponent {
  @Input() categories: Category[] = [];
  @Input() selectedCategories: string[] = [];
  @Input() totalRecipeCount: number = 0;
  @Output() categoryToggle = new EventEmitter<string>();

  onCategoryClick(categoryName: string): void {
    this.categoryToggle.emit(categoryName);
  }

  onAllRecipesClick(): void {
    const current = this.selectedCategories[0];
    if (current) {
      this.categoryToggle.emit(current);
    }
  }

  isCategorySelected(categoryName: string): boolean {
    return this.selectedCategories.includes(categoryName);
  }

  get isAllSelected(): boolean {
    return this.selectedCategories.length === 0;
  }

  trackByCategoryName(_: number, category: Category): string {
    return category.name;
  }
}
