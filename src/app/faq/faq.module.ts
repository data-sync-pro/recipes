import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { ScrollingModule } from '@angular/cdk/scrolling';

import { FaqRoutingModule } from './faq-routing.module';
import { FaqComponent } from './faq.component';
import { FaqSkeletonComponent } from './components/faq-skeleton.component';
import { SharedModule } from '../shared/shared.module';
@NgModule({ declarations: [
        FaqComponent,
        FaqSkeletonComponent
    ],
    exports: [
        FaqComponent
    ], imports: [CommonModule,
        FaqRoutingModule,
        FormsModule,
        MatExpansionModule,
        MatButtonModule,
        MatIconModule,
        ScrollingModule,
        SharedModule], providers: [provideHttpClient(withInterceptorsFromDi())] })
export class FaqModule {}
