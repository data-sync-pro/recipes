import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ReleaseNotesPageComponent } from './pages/release-notes-page/release-notes-page.component';

// Pages are part of the path (/release-notes/page/2), not a ?page= query
// parameter, because prerendering ignores query parameters.
const routes: Routes = [
  { path: '', component: ReleaseNotesPageComponent },
  // Page 1 has one address: /release-notes.
  { path: 'page/1', redirectTo: '', pathMatch: 'full' },
  { path: 'page/:page', component: ReleaseNotesPageComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ReleaseNotesRoutingModule {}
