import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { RecipeData, RelatedRecipe, normalizeCategory } from '../../../core/models/recipe.model';
import { TrackByUtil } from '../../../../shared/utils/trackby.util';

@Component({
  selector: 'app-basic-info',
  templateUrl: './basic-info.component.html',
  styleUrls: ['./basic-info.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BasicInfoComponent {
  @Input() recipe!: RecipeData;
  @Input() isActive: boolean = true;
  @Input() categories: string[] = [];

  @Output() recipeChange = new EventEmitter<void>();
  @Output() activeChange = new EventEmitter<boolean>();

  showCategoryDropdown = false;

  onRecipeChange(): void {
    this.recipeChange.emit();
  }

  onActiveChange(): void {
    this.activeChange.emit(this.isActive);
    this.onRecipeChange();
  }

  // Category management methods
  get recipeCategories(): string[] {
    return normalizeCategory(this.recipe?.category);
  }

  toggleCategory(category: string): void {
    let categories = this.recipeCategories;

    if (categories.includes(category)) {
      categories = categories.filter(c => c !== category);
    } else {
      categories = [...categories, category];
    }

    this.recipe.category = categories;
    this.onRecipeChange();
  }

  isCategorySelected(category: string): boolean {
    return this.recipeCategories.includes(category);
  }

  toggleCategoryDropdown(): void {
    this.showCategoryDropdown = !this.showCategoryDropdown;
  }

  closeCategoryDropdown(): void {
    this.showCategoryDropdown = false;
  }

  addDSPVersion(): void {
    this.ensureArrayAndPush('DSPVersions', '');
  }

  removeDSPVersion(index: number): void {
    this.removeFromArray('DSPVersions', index);
  }

  addKeyword(): void {
    this.ensureArrayAndPush('keywords', '');
  }

  removeKeyword(index: number): void {
    this.removeFromArray('keywords', index);
  }

  addRelatedRecipe(): void {
    const newRelated: RelatedRecipe = {
      title: '',
      url: ''
    };
    this.ensureArrayAndPush('relatedRecipes', newRelated);
  }

  removeRelatedRecipe(index: number): void {
    this.removeFromArray('relatedRecipes', index);
  }

  trackByIndex = TrackByUtil.index;

  private ensureArrayAndPush<T>(key: keyof RecipeData, item: T): void {
    if (!this.recipe) return;

    if (!(this.recipe[key] as any)) {
      (this.recipe[key] as any) = [];
    }

    (this.recipe[key] as T[]).push(item);
    this.onRecipeChange();
  }

  private removeFromArray(key: keyof RecipeData, index: number): void {
    const array = this.recipe?.[key] as any[];
    if (!array) return;

    array.splice(index, 1);
    this.onRecipeChange();
  }
}
