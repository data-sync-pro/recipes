import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LightningIconComponent } from './components/lightning-icon/lightning-icon.component';
import { OfflineIndicatorComponent } from './components/offline-indicator/offline-indicator.component';
import { FaqSkeletonComponent } from './components/skeleton/faq-skeleton.component';
import { LoadingComponent } from './components/loading/loading.component';
import { SimpleZoomableDirective } from '../simple-zoomable.directive';
import { AutoLinkDirective } from './directives/auto-link.directive';
import { AutoLinkPipe } from './pipes/auto-link.pipe';
import { CodeBlockPipe } from './pipes/code-block.pipe';

@NgModule({
  declarations: [
    LightningIconComponent,
    OfflineIndicatorComponent,
    FaqSkeletonComponent,
    LoadingComponent,
    SimpleZoomableDirective,
    AutoLinkDirective,
    AutoLinkPipe,
    CodeBlockPipe
  ],
  imports: [
    CommonModule
  ],
  exports: [
    LightningIconComponent,
    OfflineIndicatorComponent,
    FaqSkeletonComponent,
    LoadingComponent,
    SimpleZoomableDirective,
    AutoLinkDirective,
    AutoLinkPipe,
    CodeBlockPipe
  ]
})
export class SharedModule { }
