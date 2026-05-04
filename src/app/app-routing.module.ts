import { NgModule } from '@angular/core';
import { RouterModule, Routes, PreloadAllModules } from '@angular/router';
import { FaqEditorComponent } from './faq-editor/faq-editor.component';

const routes: Routes = [
  {
    path: 'recipes',loadChildren: () => import('./recipe/page/page.module').then(m => m.RecipePageModule)
  },
  {
    path: 'setup',
    loadChildren: () => import('./setup/setup.module').then(m => m.SetupModule)
  },
  { path: 'faq-editor', component: FaqEditorComponent },
  {
    path: 'recipe-editor',
    loadChildren: () => import('./recipe/editor/editor.module').then(m => m.RecipeEditorModule)
  },
  {
    path: '', 
    loadChildren: () => import('./faq/faq.module').then(m => m.FaqModule)
  },
  // Exclude assets from Angular routing - let the browser handle them directly
  {
    path: 'assets',
    children: [] // Empty children means Angular won't handle routes starting with 'assets'
  },
  { path: '**', redirectTo: '' },
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
