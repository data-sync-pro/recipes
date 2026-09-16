import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { BreadcrumbComponent } from './breadcrumb/breadcrumb.component';
import { ScrollToTopComponent } from './scroll-to-top/scroll-to-top.component';
import { ImageViewerComponent } from './image-viewer/image-viewer.component';

@NgModule({
  declarations: [
    BreadcrumbComponent,
    ScrollToTopComponent,
    ImageViewerComponent
  ],
  imports: [
    CommonModule,
    RouterModule
  ],
  exports: [
    BreadcrumbComponent,
    ScrollToTopComponent,
    ImageViewerComponent
  ]
})
export class SharedModule { }
