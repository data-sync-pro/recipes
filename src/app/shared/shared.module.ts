import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { LightningIconComponent } from './components/lightning-icon/lightning-icon.component';
import { SimpleZoomableDirective } from './directives/simple-zoomable.directive';
import { ContentSkeletonComponent } from './components/content-skeleton/content-skeleton.component';
import { CalloutComponent } from './components/callout/callout.component';

@NgModule({
  declarations: [
    LightningIconComponent,
    SimpleZoomableDirective,
    ContentSkeletonComponent,
    CalloutComponent
  ],
  imports: [
    CommonModule,
    MatIconModule
  ],
  exports: [
    LightningIconComponent,
    SimpleZoomableDirective,
    ContentSkeletonComponent,
    CalloutComponent
  ]
})
export class SharedModule { }
