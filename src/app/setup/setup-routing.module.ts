import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SetupComponent } from './setup.component';

const routes: Routes = [
  {
    path: '',
    component: SetupComponent,
    data: { title: 'Setup - Data Sync Pro' }
  },
  {
    // Wildcard route to support any depth of nesting
    // e.g., /setup/permissions, /setup/setup/connection/oauth, etc.
    path: '**',
    component: SetupComponent,
    data: { title: 'Setup - Data Sync Pro' }
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SetupRoutingModule { }
