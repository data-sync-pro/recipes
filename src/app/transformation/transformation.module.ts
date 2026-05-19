import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TransformationRoutingModule } from './transformation-routing.module';
import { LayoutsModule } from './layouts/layouts.module';
import { SharedModule } from './shared/shared.module';

@NgModule({
  imports: [
    CommonModule,
    TransformationRoutingModule,
    LayoutsModule,
    SharedModule,
  ],
})
export class TransformationModule {}
