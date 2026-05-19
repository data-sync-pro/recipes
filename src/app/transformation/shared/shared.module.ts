import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { BreadcrumbComponent } from './breadcrumb/breadcrumb.component';
import { ScrollToTopComponent } from './scroll-to-top/scroll-to-top.component';
import { ImageViewerComponent } from './image-viewer/image-viewer.component';
import { CalloutComponent } from './callout/callout.component';

@NgModule({
  declarations: [
    BreadcrumbComponent,
    ScrollToTopComponent,
    ImageViewerComponent,
    CalloutComponent
  ],
  imports: [
    CommonModule,
    RouterModule
  ],
  exports: [
    BreadcrumbComponent,
    ScrollToTopComponent,
    ImageViewerComponent,
    CalloutComponent
  ]
})
export class SharedModule { }
