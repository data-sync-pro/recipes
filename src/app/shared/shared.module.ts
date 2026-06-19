import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LightningIconComponent } from './components/lightning-icon/lightning-icon.component';
import { SimpleZoomableDirective } from './directives/simple-zoomable.directive';
import { ContentSkeletonComponent } from './components/content-skeleton/content-skeleton.component';

@NgModule({
  declarations: [
    LightningIconComponent,
    SimpleZoomableDirective,
    ContentSkeletonComponent
  ],
  imports: [
    CommonModule
  ],
  exports: [
    LightningIconComponent,
    SimpleZoomableDirective,
    ContentSkeletonComponent
  ]
})
export class SharedModule { }
