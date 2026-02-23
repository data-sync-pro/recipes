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
    path: ':setupSlug',
    component: SetupComponent,
    data: { title: 'Setup - Data Sync Pro' }
  },
  {
    path: ':parentSlug/:childSlug',
    component: SetupComponent,
    data: { title: 'Setup - Data Sync Pro' }
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SetupRoutingModule { }
