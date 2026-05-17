import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LightningIconComponent } from './components/lightning-icon/lightning-icon.component';
import { OfflineIndicatorComponent } from './components/offline-indicator/offline-indicator.component';
import { LoadingComponent } from './components/loading/loading.component';
import { SimpleZoomableDirective } from '../simple-zoomable.directive';
import { CodeBlockPipe } from './pipes/code-block.pipe';

@NgModule({
  declarations: [
    LightningIconComponent,
    OfflineIndicatorComponent,
    LoadingComponent,
    SimpleZoomableDirective,
    CodeBlockPipe
  ],
  imports: [
    CommonModule
  ],
  exports: [
    LightningIconComponent,
    OfflineIndicatorComponent,
    LoadingComponent,
    SimpleZoomableDirective,
    CodeBlockPipe
  ]
})
export class SharedModule { }
