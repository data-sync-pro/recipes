import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { ScrollingModule } from '@angular/cdk/scrolling';

// Angular Material Modules
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatStepperModule } from '@angular/material/stepper';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';

// Routing
import { RecipePageRoutingModule } from './page-routing.module';

// Components
import { RecipesComponent } from './page.component';
import { RecipeCardComponent } from './card/card.component';
import { RecipeSearchOverlayComponent } from './search-overlay/search-overlay.component';
import { RecipeSidebarComponent } from './sidebar/sidebar.component';
import { RecipeSectionComponent } from './section/section.component';
import { RecipeDetailPageComponent } from './detail-page/detail-page.component';

// Shared Modules and Components
import { SharedModule } from '../../shared/shared.module';
import { BannerComponent } from './banner/banner.component';
import { RecipeDetailBannerComponent } from './detail-banner/detail-banner.component';
import { BreadcrumbComponent } from './breadcrumb/breadcrumb.component';
import { RecipeLayoutComponent } from './recipe-layout/recipe-layout.component';
import { CategoryListComponent } from './category-list/category-list.component';
import { RecipeListComponent } from './recipe-list/recipe-list.component';

@NgModule({
  declarations: [
    RecipesComponent,
    RecipeCardComponent,
    RecipeSearchOverlayComponent,
    RecipeSidebarComponent,
    RecipeSectionComponent,
    RecipeDetailPageComponent,
    BannerComponent,
    RecipeDetailBannerComponent,
    BreadcrumbComponent,
    RecipeLayoutComponent,
    CategoryListComponent,
    RecipeListComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    ScrollingModule,
    
    // Angular Material
    MatButtonModule,
    MatExpansionModule,
    MatIconModule,
    MatCardModule,
    MatTabsModule,
    MatChipsModule,
    MatProgressBarModule,
    MatStepperModule,
    MatBadgeModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatCheckboxModule,
    
    // Routing
    RecipePageRoutingModule,
    
    // Shared
    SharedModule
  ],
  exports: [
    RecipesComponent,
    RecipeCardComponent
  ]
})
export class RecipePageModule { }