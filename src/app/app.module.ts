import { BrowserModule } from '@angular/platform-browser';
import { NgModule, isDevMode, APP_INITIALIZER } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { OrchestrationService } from './recipe/core/services/orchestration.service';

import { HeaderComponent } from './core/header/header.component';
import { FooterComponent } from './core/footer/footer.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { ScrollToTopComponent } from './core/scroll-to-top/scroll-to-top.component';
import { SharedModule } from './shared/shared.module';
import { ServiceWorkerModule } from '@angular/service-worker';
import { FaqEditorComponent } from './faq/editor/faq-editor.component';

/**
 * Recipe initialization factory function
 * Called during app bootstrap to load recipe data before app starts
 */
export function initializeRecipes(recipeOrchestration: OrchestrationService) {
  return () => firstValueFrom(recipeOrchestration.initializeRecipes());
}

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    FooterComponent,
    ScrollToTopComponent,
    FaqEditorComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    AppRoutingModule,
    MatSnackBarModule,
    FormsModule,
    BrowserAnimationsModule,
    SharedModule,
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: !isDevMode(),
      // Register the ServiceWorker as soon as the application is stable
      // or after 30 seconds (whichever comes first).
      registrationStrategy: 'registerWhenStable:30000'
    })
  ],
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: initializeRecipes,
      deps: [OrchestrationService],
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
