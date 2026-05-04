import { Injectable } from '@angular/core';
import { Recipe, SearchResult, Category } from '../models/recipe.model';
import { LoggerService } from './logger.service';
import { CATEGORY_ORDER } from '../constants/recipe.constants';

@Injectable({
  providedIn: 'root'
})
export class SearchService {
  constructor(private logger: LoggerService) {}

  search(recipes: Recipe[], query: string): SearchResult[] {
    if (!query || query.trim() === '') {
      return [];
    }

    const normalizedQuery = query.toLowerCase().trim();
    const results: SearchResult[] = [];

    recipes.forEach(recipe => {
      const score = this.calculateRelevanceScore(recipe, normalizedQuery);

      if (score > 0) {
        results.push({
          ...recipe,
          relevanceScore: score
        });
      }
    });

    return results.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
  }

  filterByCategory(recipes: Recipe[], category: string): Recipe[] {
    return recipes.filter(recipe => recipe.category.includes(category));
  }

  private calculateRelevanceScore(recipe: Recipe, query: string): number {
    let score = 0;

    const title = recipe.title.toLowerCase();
    const overview = recipe.overview.toLowerCase();
    const categories = recipe.category.map(c => c.toLowerCase());
    const keywords = recipe.keywords.map(k => k.toLowerCase());

    if (title === query) {
      score += 100;
    } else if (title.includes(query)) {
      score += 50;
    }

    keywords.forEach(keyword => {
      if (keyword.includes(query) || query.includes(keyword)) {
        score += 30;
      }
    });

    if (overview.includes(query)) {
      score += 20;
    }

    // Check if any category matches the query
    if (categories.some(cat => cat.includes(query))) {
      score += 10;
    }

    return score;
  }

  generateCategories(recipes: Recipe[]): Category[] {
    const categoryMap = new Map<string, number>();

    recipes.forEach(recipe => {
      // Each category of a recipe gets counted
      recipe.category.forEach(cat => {
        if (cat) {
          const count = categoryMap.get(cat) || 0;
          categoryMap.set(cat, count + 1);
        }
      });
    });

    const categories = Array.from(categoryMap.entries())
      .filter(([_, count]) => count > 0)
      .map(([category, count]) => ({
        name: category,
        displayName: this.getCategoryDisplayName(category),
        count
      }));

    return this.sortCategories(categories);
  }

  sortCategories(categories: Category[]): Category[] {
    return [...categories].sort((a, b) => {
      const indexA = CATEGORY_ORDER.indexOf(a.name);
      const indexB = CATEGORY_ORDER.indexOf(b.name);

      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }

      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;

      return 0;
    });
  }

  sortCategoryNames(categories: string[]): string[] {
    return [...categories].sort((a, b) => {
      const indexA = CATEGORY_ORDER.indexOf(a);
      const indexB = CATEGORY_ORDER.indexOf(b);

      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }

      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;

      return 0;
    });
  }

  private getCategoryDisplayName(category: string): string {
    const mapping: Record<string, string> = {
      'action-button': 'Action Button',
      'batch': 'Batch',
      'data-list': 'Data List',
      'data-loader': 'Data Loader',
      'triggers': 'Trigger',
      'Batch': 'Batch',
      'Trigger': 'Trigger',
      'Data List': 'Data List',
      'Action Button': 'Action Button',
      'Data Loader': 'Data Loader',
      'Transformation': 'Transformation',
      'Query': 'Query'
    };

    return mapping[category] || category;
  }
}
