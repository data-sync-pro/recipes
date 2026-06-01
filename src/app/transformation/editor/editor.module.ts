import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EditorRoutingModule } from './editor-routing.module';
import { EditorComponent } from './editor.component';
import { FunctionListComponent } from './components/function-list/function-list.component';
import { PreviewPanelComponent } from './components/preview-panel/preview-panel.component';
import { BasicInfoSectionComponent } from './components/basic-info-section/basic-info-section.component';
import { DescriptionSectionComponent } from './components/description-section/description-section.component';
import { ParametersSectionComponent } from './components/parameters-section/parameters-section.component';
import { ExamplesSectionComponent } from './components/examples-section/examples-section.component';
import { TipsSectionComponent } from './components/tips-section/tips-section.component';
import { RelatedFormulasSectionComponent } from './components/related-formulas-section/related-formulas-section.component';
import { ImagesSectionComponent } from './components/images-section/images-section.component';
import { ImageUploaderComponent } from './components/image-uploader/image-uploader.component';
import { CalloutsSectionComponent } from './components/callouts-section/callouts-section.component';
import { RawJsonSectionComponent } from './components/raw-json-section/raw-json-section.component';
import { NewFunctionModalComponent } from './components/new-function-modal/new-function-modal.component';
import { TagsSectionComponent } from './components/tags-section/tags-section.component';
import { AutosizeDirective } from './directives/autosize.directive';
import { EditorStateService } from './services/editor-state.service';
import { EditorStorageService } from './services/editor-storage.service';
import { ImageCacheService } from './services/image-cache.service';
import { ImageDbService } from './services/image-db.service';
import { EditorExportService } from './services/editor-export.service';

@NgModule({
  declarations: [
    EditorComponent,
    FunctionListComponent,
    PreviewPanelComponent,
    BasicInfoSectionComponent,
    DescriptionSectionComponent,
    ParametersSectionComponent,
    ExamplesSectionComponent,
    TipsSectionComponent,
    RelatedFormulasSectionComponent,
    ImagesSectionComponent,
    ImageUploaderComponent,
    CalloutsSectionComponent,
    RawJsonSectionComponent,
    NewFunctionModalComponent,
    TagsSectionComponent,
    AutosizeDirective,
  ],
  imports: [
    CommonModule,
    FormsModule,
    EditorRoutingModule,
  ],
  providers: [
    EditorStateService,
    EditorStorageService,
    ImageCacheService,
    ImageDbService,
    EditorExportService,
  ],
})
export class EditorModule {}
