import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FunctionPageMainLayoutComponent } from './layouts/function-page-main-layout/function-page-main-layout.component';

const routes: Routes = [
  {
    path: 'editor',
    loadChildren: () => import('./editor/editor.module').then(m => m.EditorModule),
  },
  {
    path: '',
    component: FunctionPageMainLayoutComponent,
    loadChildren: () => import('./docs/docs.module').then(m => m.DocsModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TransformationRoutingModule {}
