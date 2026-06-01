import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy
} from '@angular/core';
import { Recipe } from '../../core/models/recipe.model';
import { Category } from '../../core/models/recipe.model';
import { categoryToSlug } from '../../core/constants/recipe.constants';


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

  get recipeLink(): string[] {
    return ['/recipes', categoryToSlug(this.recipe.category[0] || ''), this.recipe.slug || ''];
  }

  onRecipeClick(): void {
    this.recipeSelect.emit(this.recipe);
  }
}