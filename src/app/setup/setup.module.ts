import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { SetupRoutingModule } from './setup-routing.module';
import { SetupComponent } from './setup.component';
import { SetupBlockComponent } from './block/block.component';
import { SetupCardComponent } from './card/card.component';
import { FieldGroupsComponent } from './field-groups/field-groups.component';
import { SharedModule } from '../shared/shared.module';

@NgModule({
  declarations: [
    SetupComponent,
    SetupBlockComponent,
    SetupCardComponent,
    FieldGroupsComponent
  ],
  imports: [
    CommonModule,
    HttpClientModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    SetupRoutingModule,
    SharedModule
  ]
})
export class SetupModule { }
