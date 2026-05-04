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
  @Output() categoryToggle = new EventEmitter<string>();

  // Map of category names to icon paths
  categoryIcons: { [key: string]: string } = {
    'Batch': 'assets/icons/recipe/batch.svg',
    'Action Button': 'assets/icons/recipe/action-button.svg',
    'Trigger': 'assets/icons/recipe/trigger.svg',
    'Data List': 'assets/icons/recipe/data-list.svg',
    'Data Loader': 'assets/icons/recipe/data-loader.svg',
    'Transformation': 'assets/icons/recipe/transformation.svg',
    'General': 'assets/icons/recipe/general.svg'
  };

  onCategoryChange(categoryName: string): void {
    this.categoryToggle.emit(categoryName);
  }

  isCategorySelected(categoryName: string): boolean {
    return this.selectedCategories.includes(categoryName);
  }

  getCategoryIcon(categoryName: string): string {
    return this.categoryIcons[categoryName];
  }

  trackByCategoryName(_: number, category: Category): string {
    return category.name;
  }
}
