import { NgModule } from '@angular/core';
import { RouterModule, Routes, PreloadAllModules } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { PricingComponent } from './pricing/pricing.component';
import { RulesEnginesComponent } from './rules-engines/rules-engines.component';
import { SolutionsComponent } from './solutions/solutions.component';
import { SupportComponent } from './support/support.component';
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
  //{ path: 'pricing', component: PricingComponent },
  //{ path: 'home', component: HomeComponent },
  //{ path: 'rules-engines', component: RulesEnginesComponent },
  //{ path: 'solutions', component: SolutionsComponent },
  //{ path: 'support', component: SupportComponent },
  //{
  //  path: 'designer-guide',
  //  loadChildren: () => import('./designer-guide/designer-guide.module').then(m => m.DesignerGuideModule)
  //},
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
