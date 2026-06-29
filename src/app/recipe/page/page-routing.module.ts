import { NgModule, inject } from '@angular/core';
import { CanMatchFn, Route, Router, RouterModule, Routes, UrlSegment, UrlTree } from '@angular/router';
import { RecipesComponent } from './page.component';
import { RecipeDetailPageComponent } from './detail-page/detail-page.component';
import { CATEGORY_ORDER, categoryToSlug } from '../core/constants/recipe.constants';

function decodeSegment(raw: string): string {
  try {
    return decodeURIComponent(raw).replace(/\+/g, ' ').trim();
  } catch {
    return raw;
  }
}

function findCategoryByLegacySegment(segment: string): string | null {
  const normalized = decodeSegment(segment).toLowerCase();
  const match = CATEGORY_ORDER.find(c => c.displayName.toLowerCase() === normalized);
  return match ? match.displayName : null;
}

// Redirects legacy /recipes/<DisplayName>/<slug> URLs (e.g. /recipes/Data%20List/foo)
// to the canonical /recipes/<category-slug>/<slug> form.
const legacyRedirectGuard: CanMatchFn = (_route: Route, segments: UrlSegment[]): boolean | UrlTree => {
  if (segments.length < 1) return true;
  const displayName = findCategoryByLegacySegment(segments[0].path);
  if (!displayName) return true;
  const slug = categoryToSlug(displayName);
  // If first segment already equals the canonical slug, no redirect needed.
  if (segments[0].path === slug) return true;
  const tail = segments.slice(1).map(s => s.path);
  return inject(Router).createUrlTree(['/recipes', slug, ...tail]);
};

const routes: Routes = [
  {
    path: '',
    component: RecipesComponent,
    data: { title: 'Recipes - Data Sync Pro' }
  },
  {
    path: ':category',
    canMatch: [legacyRedirectGuard],
    component: RecipesComponent,
    data: { title: 'Recipes - Data Sync Pro' }
  },
  {
    path: ':category/:recipeName',
    canMatch: [legacyRedirectGuard],
    component: RecipeDetailPageComponent,
    data: { title: 'Recipe Details - Data Sync Pro' }
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class RecipePageRoutingModule { }
