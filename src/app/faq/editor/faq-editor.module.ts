import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { FaqEditorComponent } from './faq-editor.component';

@NgModule({
  declarations: [FaqEditorComponent],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild([{ path: '', component: FaqEditorComponent }]),
  ],
})
export class FaqEditorModule {}
