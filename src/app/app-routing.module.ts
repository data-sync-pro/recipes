import { NgModule, inject } from '@angular/core';
import { CanActivateFn, Router, RouterModule, Routes, PreloadAllModules } from '@angular/router';
import { FaqEditorComponent } from './faq/editor/faq-editor.component';

// Customers have bookmarked /setup/... links from before the rename to /user-manual
const redirectSetupToUserManual: CanActivateFn = (_route, state) =>
  inject(Router).parseUrl(state.url.replace(/^\/setup/, '/user-manual'));

const routes: Routes = [
  {
    path: 'recipes',loadChildren: () => import('./recipe/page/page.module').then(m => m.RecipePageModule)
  },
  {
    path: 'user-manual',
    loadChildren: () => import('./setup/setup.module').then(m => m.SetupModule)
  },
  {
    path: 'setup',
    canActivate: [redirectSetupToUserManual],
    children: [
      { path: '**', children: [] }
    ]
  },
  { path: 'faq-editor', component: FaqEditorComponent },
  {
    path: 'recipe-editor',
    loadChildren: () => import('./recipe/editor/editor.module').then(m => m.RecipeEditorModule)
  },
  {
    path: 'transformation',
    loadChildren: () => import('./transformation/transformation.module').then(m => m.TransformationModule)
  },
  {
    path: 'faq',
    loadChildren: () => import('./faq/faq.module').then(m => m.FaqModule)
  },
  { path: '', redirectTo: 'faq', pathMatch: 'full' },
  // Exclude assets from Angular routing - let the browser handle them directly
  {
    path: 'assets',
    children: [] // Empty children means Angular won't handle routes starting with 'assets'
  },
  { path: '**', redirectTo: 'faq' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {
    
    scrollPositionRestoration: 'disabled', 
    anchorScrolling: 'disabled', 
    scrollOffset: [0, 80], 
    
    preloadingStrategy: PreloadAllModules, 
    
  })],
  exports: [RouterModule]
})
export class AppRoutingModule {}
