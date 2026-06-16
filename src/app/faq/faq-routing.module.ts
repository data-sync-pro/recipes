import { NgModule } from '@angular/core';
import { RouterModule, Routes, UrlSegment, UrlMatchResult } from '@angular/router';
import { FaqComponent } from './faq.component';
import {
  VALID_CATEGORIES,
  VALID_SUBCATEGORIES,
} from './config/faq-urls.config';

const CATEGORIES: ReadonlySet<string> = new Set(VALID_CATEGORIES);
const SUBCATEGORIES: ReadonlySet<string> = new Set(VALID_SUBCATEGORIES);

// One matcher for every FAQ URL shape: home (no segments), /<category>,
// /<category>/<subcategory>, /<category>/<slug>, /<category>/<subcategory>/<slug>.
//
// This used to be three separate matcher functions (one per segment count),
// which made them three distinct Route config nodes. Angular's default route
// reuse keys on `future.routeConfig === curr.routeConfig`, so navigating across
// them (e.g. category → subcategory) destroyed and recreated FaqComponent,
// wiping its in-memory state (sidebar expansion, scroll position, …). Folding
// them into a single route node — the same shape the User Manual sidebar uses —
// lets the router reuse one FaqComponent for all FAQ navigation, so that state
// survives without any external store.
function faqUrlMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  // Home (/faq) — match the empty URL so it shares this one route node too.
  if (segments.length === 0) {
    return { consumed: segments, posParams: {} };
  }

  if (segments.length > 3) return null;

  const cat = segments[0].path.toLowerCase();
  if (!CATEGORIES.has(cat)) return null;

  // /<category>
  if (segments.length === 1) {
    return { consumed: segments, posParams: { cat: segments[0] } };
  }

  // /<category>/<subcategory> (TOC) or /<category>/<slug> (answer w/o sub),
  // disambiguated by whether segment[1] is a known subcategory.
  if (segments.length === 2) {
    const second = segments[1].path.toLowerCase();
    if (SUBCATEGORIES.has(second)) {
      return { consumed: segments, posParams: { cat: segments[0], subCat: segments[1] } };
    }
    return { consumed: segments, posParams: { cat: segments[0], slug: segments[1] } };
  }

  // /<category>/<subcategory>/<slug>
  const sub = segments[1].path.toLowerCase();
  if (!SUBCATEGORIES.has(sub)) return null;
  return {
    consumed: segments,
    posParams: { cat: segments[0], subCat: segments[1], slug: segments[2] },
  };
}

const routes: Routes = [
  { matcher: faqUrlMatcher, component: FaqComponent },
  // Anything else (including legacy bare /<slug> bookmarks) lands on home.
  { path: '**', redirectTo: '' },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FaqRoutingModule { }
