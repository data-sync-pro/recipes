import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DocViewerComponent } from './doc-viewer/doc-viewer.component';
import { HomeComponent } from '../pages/home/home.component';

const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: HomeComponent },
  // In-page sections (formerly /home#text, /home#formula_elements ...) now
  // live as path segments so URLs don't carry a fragment. HomeComponent reads
  // :section and scrolls the matching anchor.
  { path: 'home/:section', component: HomeComponent },
  // Backward-compat redirects: $joiner was the original $-prefixed slug; the
  // three kebab forms (global-variables, apex-class, aggregate-general) were
  // a brief intermediate naming. Canonical is now snake_case throughout.
  { path: '$joiner', redirectTo: 'joiner', pathMatch: 'full' },
  { path: 'global-variables', redirectTo: 'global_variables', pathMatch: 'full' },
  { path: 'apex-class', redirectTo: 'apex_class', pathMatch: 'full' },
  { path: 'aggregate-general', redirectTo: 'aggregate_general', pathMatch: 'full' },
  // Canonical function URLs are category-prefixed: /text/char, /logical/if.
  // The two-segment match comes first; bare /:docName still works as a legacy
  // fallback that DocViewer upgrades to the canonical form when an
  // ?activeCategory= query param is present.
  { path: ':category/:docName', component: DocViewerComponent },
  { path: ':docName', component: DocViewerComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class DocsRoutingModule { }
