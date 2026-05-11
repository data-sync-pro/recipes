import { NgModule } from '@angular/core';
import { RouterModule, Routes, UrlSegment, UrlMatchResult } from '@angular/router';
import { FaqComponent } from './faq.component';
import {
  VALID_CATEGORIES,
  VALID_SUBCATEGORIES,
} from '../shared/config/faq-urls.config';

const CATEGORIES: ReadonlySet<string> = new Set(VALID_CATEGORIES);
const SUBCATEGORIES: ReadonlySet<string> = new Set(VALID_SUBCATEGORIES);

// /<category>
function categoryMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length !== 1) return null;
  const cat = segments[0].path.toLowerCase();
  if (!CATEGORIES.has(cat)) return null;
  return { consumed: segments, posParams: { cat: segments[0] } };
}

// 2 segments: either /<category>/<subcategory> (TOC) or /<category>/<slug> (answer w/o sub).
// Disambiguated by whether segment[1] is a known subcategory.
function categorySubOrSlugMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length !== 2) return null;
  const cat = segments[0].path.toLowerCase();
  if (!CATEGORIES.has(cat)) return null;
  const second = segments[1].path.toLowerCase();
  if (SUBCATEGORIES.has(second)) {
    return { consumed: segments, posParams: { cat: segments[0], subCat: segments[1] } };
  }
  return { consumed: segments, posParams: { cat: segments[0], slug: segments[1] } };
}

// /<category>/<subcategory>/<slug>
function categorySubSlugMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length !== 3) return null;
  const cat = segments[0].path.toLowerCase();
  const sub = segments[1].path.toLowerCase();
  if (!CATEGORIES.has(cat) || !SUBCATEGORIES.has(sub)) return null;
  return {
    consumed: segments,
    posParams: { cat: segments[0], subCat: segments[1], slug: segments[2] },
  };
}

const routes: Routes = [
  { path: '', component: FaqComponent },
  { matcher: categoryMatcher, component: FaqComponent },
  { matcher: categorySubOrSlugMatcher, component: FaqComponent },
  { matcher: categorySubSlugMatcher, component: FaqComponent },
  // Anything else (including legacy bare /<slug> bookmarks) lands on home.
  { path: '**', redirectTo: '' },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FaqRoutingModule { }
