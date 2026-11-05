import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ReleaseNotesRoutingModule } from './release-notes-routing.module';

import { ReleaseNotesPageComponent } from './pages/release-notes-page/release-notes-page.component';
import { ReleaseEntryComponent } from './components/release-entry/release-entry.component';
import { ReleaseSectionComponent } from './components/release-section/release-section.component';
import { ReleaseItemComponent } from './components/release-item/release-item.component';
import { ReleasePagerComponent } from './components/release-pager/release-pager.component';
import { ReleaseTopBarComponent } from './components/release-top-bar/release-top-bar.component';
import { InlineTextComponent } from './components/inline-text/inline-text.component';
import { ParagraphBlockComponent } from './components/blocks/paragraph-block/paragraph-block.component';
import { ListBlockComponent } from './components/blocks/list-block/list-block.component';
import { TableBlockComponent } from './components/blocks/table-block/table-block.component';

import { ReleaseAnchorPipe } from './pipes/release-anchor.pipe';
import { ReleaseDatePipe } from './pipes/release-date.pipe';

import { ReleaseNotesRepository } from './services/release-notes-repository.service';
import { HttpReleaseNotesRepository } from './services/http-release-notes-repository.service';
import { ReleaseNotesFacade } from './services/release-notes-facade.service';

@NgModule({
  declarations: [
    ReleaseNotesPageComponent,
    ReleaseEntryComponent,
    ReleaseSectionComponent,
    ReleaseItemComponent,
    ReleasePagerComponent,
    ReleaseTopBarComponent,
    InlineTextComponent,
    // Block components (one per block type; see components/blocks/block-registry.ts)
    ParagraphBlockComponent,
    ListBlockComponent,
    TableBlockComponent,
    ReleaseAnchorPipe,
    ReleaseDatePipe,
  ],
  imports: [
    CommonModule,
    ReleaseNotesRoutingModule,
  ],
  // Scoped to this lazy module, not root. HttpClient itself comes from the app.
  providers: [
    ReleaseNotesFacade,
    { provide: ReleaseNotesRepository, useClass: HttpReleaseNotesRepository },
  ],
})
export class ReleaseNotesModule {}
