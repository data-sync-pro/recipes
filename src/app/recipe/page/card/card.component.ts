import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy
} from '@angular/core';
import { Recipe } from '../../core/models/recipe.model';
import { Category } from '../../core/models/recipe.model';


@Component({
  selector: 'app-recipe-card',
  templateUrl: './card.component.html',
  styleUrls: ['./card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecipeCardComponent {
  @Input() recipe!: Recipe;
  @Input() categories: Category[] = [];
  @Output() recipeSelect = new EventEmitter<Recipe>();

  categoryIcons: { [key: string]: string } = {
    'Batch': 'assets/icons/recipe/batch.svg',
    'Action Button': 'assets/icons/recipe/action-button.svg',
    'Trigger': 'assets/icons/recipe/trigger.svg',
    'Data List': 'assets/icons/recipe/data-list.svg',
    'Data Loader': 'assets/icons/recipe/data-loader.svg',
    'Transformation': 'assets/icons/recipe/transformation.svg',
    'General': 'assets/icons/recipe/general.svg'
  };

  get recipeLink(): string[] {
    return ['/recipes', this.recipe.category[0] || '', this.recipe.slug || ''];
  }

  onRecipeClick(): void {
    this.recipeSelect.emit(this.recipe);
  }

  getCategoryIcon(categoryName: string): string {
    return this.categoryIcons[categoryName] || '';
  }

  /**
   * Get all category icons for the current recipe
   */
  get recipeIcons(): { icon: string; displayName: string }[] {
    if (!this.recipe?.category) return [];

    return this.recipe.category
      .map(categoryName => {
        const icon = this.categoryIcons[categoryName] || '';
        const category = this.categories.find(cat => cat.name === categoryName);
        const displayName = category?.displayName || categoryName || '';
        return { icon, displayName };
      })
      .filter(item => item.icon); // Only include categories with icons
  }
}