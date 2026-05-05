import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { RecipeEditorComponent } from './editor.component';
import { SharedModule } from '../../shared/shared.module';

// Editor components
import { BasicInfoComponent } from './components/basic-info/basic-info.component';
import { PrerequisitesEditorComponent } from './components/prerequisites-editor/prerequisites-editor.component';
import { FileUploadComponent } from './components/file-upload/file-upload.component';
import { PreviewPanelComponent } from './components/preview-panel/preview-panel.component';
import { WalkthroughEditorComponent } from './components/walkthrough-editor/walkthrough-editor.component';
import { ImageManagerComponent } from './components/image-manager/image-manager.component';
import { DownloadFileCalloutEditorComponent } from './components/download-file-callout-editor/download-file-callout-editor.component';

// Directives
import { AutocompleteDirective } from './directives/autocomplete.directive';

const routes: Routes = [
  {
    path: '',
    component: RecipeEditorComponent
  }
];

@NgModule({
  declarations: [
    RecipeEditorComponent,
    BasicInfoComponent,
    PrerequisitesEditorComponent,
    FileUploadComponent,
    PreviewPanelComponent,
    WalkthroughEditorComponent,
    ImageManagerComponent,
    DownloadFileCalloutEditorComponent,
    AutocompleteDirective
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SharedModule,
    RouterModule.forChild(routes)
  ]
})
export class RecipeEditorModule { }