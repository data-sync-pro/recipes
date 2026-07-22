import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { SetupRoutingModule } from './setup-routing.module';
import { SetupComponent } from './setup.component';
import { SetupBlockComponent } from './block/block.component';
import { SetupCardComponent } from './card/card.component';
import { SetupFieldsComponent } from './fields/fields.component';
import { SetupCodeBlockComponent } from './code-block/code-block.component';
import { SetupEndpointComponent } from './endpoint/endpoint.component';
import { SharedModule } from '../shared/shared.module';

@NgModule({ declarations: [
        SetupComponent,
        SetupBlockComponent,
        SetupCardComponent,
        SetupFieldsComponent,
        SetupCodeBlockComponent,
        SetupEndpointComponent
    ], imports: [CommonModule,
        MatButtonModule,
        MatIconModule,
        MatProgressSpinnerModule,
        SetupRoutingModule,
        SharedModule], providers: [provideHttpClient(withInterceptorsFromDi())] })
export class SetupModule { }
