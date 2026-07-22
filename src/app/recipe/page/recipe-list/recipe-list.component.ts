import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectionStrategy, ViewChild, ElementRef } from '@angular/core';
import { Recipe, Category } from '../../core/models/recipe.model';
import { categoryToSlug, AGGREGATE_CATEGORIES } from '../../core/constants/recipe.constants';
import { CategoryOrderService } from '../../core/services/category-order.service';
import { orderRecipesWithinCategory } from '../../core/utils';

/** One subcategory section on an aggregate category page (e.g. UI → Data List / Action Button). */
interface SubcategoryGroup {
  name: string;
  recipes: Recipe[];
}

@Component({
  selector: 'app-recipe-list',
  templateUrl: './recipe-list.component.html',
  styleUrls: ['./recipe-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecipeListComponent implements OnChanges {
  @Input() recipes: Recipe[] = [];
  @Input() categories: Category[] = [];
  /** Current category display name (empty on the home view). Drives the page title. */
  @Input() category: string = '';
  @Input() searchQuery: string = '';
  @Output() searchChange = new EventEmitter<string>();
  @Output() recipeSelect = new EventEmitter<Recipe>();
  @Output() openSearchOverlay = new EventEmitter<void>();

  @ViewChild('filterInput') filterInput!: ElementRef<HTMLInputElement>;

  /**
   * Subcategory sections, populated only when the current category is an
   * aggregate (e.g. UI). Empty otherwise, in which case the flat list renders.
   */
  subcategoryGroups: SubcategoryGroup[] = [];

  constructor(private categoryOrderService: CategoryOrderService) { }

  /** True when the current page should render subcategory sections instead of a flat list. */
  get isSubcategorized(): boolean {
    return this.subcategoryGroups.length > 0;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['recipes'] || changes['category'] || changes['searchQuery']) {
      this.buildSubcategoryGroups();
    }
  }

  /**
   * Split the current recipes into subcategory sections when viewing an
   * aggregate category page (e.g. /recipes/ui → "Data List" + "Action Button").
   * Each section is ordered independently via category-order.json, so a recipe
   * that belongs to both members appears in both — at each section's own rank.
   * Disabled while searching (the grid shows flat relevance-ranked results).
   */
  private buildSubcategoryGroups(): void {
    const aggregate = AGGREGATE_CATEGORIES.find(a => a.displayName === this.category);
    if (!aggregate || this.searchQuery.trim()) {
      this.subcategoryGroups = [];
      return;
    }

    const orderMap = this.categoryOrderService.getOrderMapSync();
    this.subcategoryGroups = aggregate.members
      .map(member => ({
        name: member,
        recipes: orderRecipesWithinCategory(
          member,
          this.recipes.filter(r => r.category.includes(member)),
          orderMap
        )
      }))
      .filter(group => group.recipes.length > 0);
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchChange.emit(value);
  }

  onRecipeClick(recipe: Recipe): void {
    this.recipeSelect.emit(recipe);
  }

  /**
   * Detail-page link for a recipe. On a subcategory section we route through
   * that subcategory's slug so the URL matches the section the user clicked;
   * elsewhere we fall back to the recipe's first category.
   */
  recipeLink(recipe: Recipe, subcategory?: string): string[] {
    const category = subcategory || recipe.category[0] || '';
    return ['/recipes', categoryToSlug(category), recipe.slug || ''];
  }

  trackByRecipeId(_: number, recipe: Recipe): string {
    return recipe.id;
  }

  trackBySubcategoryName(_: number, group: SubcategoryGroup): string {
    return group.name;
  }

  focusFilterInput(): void {
    if (this.filterInput) {
      this.filterInput.nativeElement.focus();
    }
  }
}
