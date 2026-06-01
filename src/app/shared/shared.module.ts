import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LightningIconComponent } from './components/lightning-icon/lightning-icon.component';
import { SimpleZoomableDirective } from './directives/simple-zoomable.directive';

@NgModule({
  declarations: [
    LightningIconComponent,
    SimpleZoomableDirective
  ],
  imports: [
    CommonModule
  ],
  exports: [
    LightningIconComponent,
    SimpleZoomableDirective
  ]
})
export class SharedModule { }
