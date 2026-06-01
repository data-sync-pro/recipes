import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ViewChild,
  ElementRef
} from '@angular/core';
import { Recipe, Category } from '../../core/models/recipe.model';
import { SearchService } from '../../core/services/search.service';
import { categoryToSlug } from '../../core/constants/recipe.constants';

interface CategoryGroup {
  category: Category;
  recipes: Recipe[];
  isExpanded: boolean;
}

/**
 * Recipe navigation sidebar shared by the recipes landing page and the recipe
 * detail page. The markup, styles and methods below were extracted verbatim
 * from RecipeDetailPageComponent so both hosts render an identical sidebar;
 * the only new code is the @Input wiring that feeds the existing methods.
 */
@Component({
  selector: 'app-recipe-nav-sidebar',
  templateUrl: './recipe-nav-sidebar.component.html',
  styleUrls: ['./recipe-nav-sidebar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecipeNavSidebarComponent implements OnChanges {
  /** Full recipe list used to build the category groups (not a filtered view). */
  @Input() recipes: Recipe[] = [];

  /** Categories in display order. */
  @Input() categories: Category[] = [];

  /** Slug of the recipe to highlight as active (null on the landing page). */
  @Input() activeRecipeSlug: string | null = null;

  /** Category to auto-expand on load (e.g. the active recipe's category). */
  @Input() expandCategoryName: string | null = null;

  // --- Sidebar state (extracted from RecipeDetailPageComponent) ---
  categoryGroups: CategoryGroup[] = [];
  filteredCategoryGroups: CategoryGroup[] = [];
  sidebarSearchQuery: string = '';

  // Mobile sidebar drawer
  isSidebarOpen: boolean = false;

  @ViewChild('sidebarSearchInput') sidebarSearchInput!: ElementRef<HTMLInputElement>;

  constructor(
    private searchService: SearchService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['recipes'] || changes['categories']) {
      this.buildCategoryGroups();
      if (this.expandCategoryName) {
        this.expandCategory(this.expandCategoryName);
      }
    } else if (changes['expandCategoryName'] && this.expandCategoryName) {
      this.expandCategory(this.expandCategoryName);
    }
    this.cdr.markForCheck();
  }

  private buildCategoryGroups(): void {
    this.categoryGroups = this.categories.map(category => ({
      category,
      recipes: this.recipes.filter(r => r.category.includes(category.name)),
      isExpanded: false
    }));
    this.filteredCategoryGroups = [...this.categoryGroups];
  }

  private expandCategory(categoryName: string): void {
    const group = this.categoryGroups.find(g => g.category.name === categoryName);
    if (group) {
      group.isExpanded = true;
    }
  }

  categorySlug(categoryName: string): string {
    return categoryToSlug(categoryName);
  }

  toggleCategory(categoryName: string): void {
    const group = this.filteredCategoryGroups.find(g => g.category.name === categoryName);
    if (group) {
      group.isExpanded = !group.isExpanded;
      this.cdr.markForCheck();
    }
  }

  onSidebarSearchInput(value?: string): void {
    if (typeof value === 'string') {
      this.sidebarSearchQuery = value;
    }
    const query = this.sidebarSearchQuery.trim();

    if (!query) {
      this.filteredCategoryGroups = [...this.categoryGroups];
    } else {
      // Reuse the core relevance search so sidebar matches title / overview /
      // keywords / categories just like the global search overlay.
      const matchedIds = new Set(
        this.searchService.search(this.recipes, query).map(r => r.id)
      );
      this.filteredCategoryGroups = this.categoryGroups.map(group => {
        const filteredRecipes = group.recipes.filter(r => matchedIds.has(r.id));
        return {
          ...group,
          recipes: filteredRecipes,
          isExpanded: filteredRecipes.length > 0 ? true : group.isExpanded
        };
      }).filter(group => group.recipes.length > 0);
    }

    this.cdr.markForCheck();
  }

  clearFilter(): void {
    this.sidebarSearchQuery = '';
    this.onSidebarSearchInput();
    this.sidebarSearchInput?.nativeElement.focus();
  }

  /** Focus the filter input — lets host pages wire the `/` shortcut to it. */
  focusFilter(): void {
    const el = this.sidebarSearchInput?.nativeElement;
    if (el) {
      el.focus();
      el.select();
    }
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
    this.cdr.markForCheck();
  }

  closeSidebar(): void {
    this.isSidebarOpen = false;
    this.cdr.markForCheck();
  }
}
