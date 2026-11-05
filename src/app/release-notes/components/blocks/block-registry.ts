import { Type } from '@angular/core';
import { ReleaseBlock } from '../../models/release.model';
import { ListBlockComponent } from './list-block/list-block.component';
import { ParagraphBlockComponent } from './paragraph-block/paragraph-block.component';
import { TableBlockComponent } from './table-block/table-block.component';

// Every block type must map to a component whose `block` input takes exactly
// that block. Adding a type to ReleaseBlock without an entry here (or with the
// wrong component) is a compile error.
type BlockComponents = {
  [T in ReleaseBlock['type']]: Type<{ block: Extract<ReleaseBlock, { type: T }> }>;
};

/**
 * Which component renders which block type. A new kind of content is one new
 * block interface, one new component, and one line here (plus the component's
 * entry in ReleaseNotesModule's declarations).
 */
export const BLOCK_COMPONENTS: BlockComponents = {
  paragraph: ParagraphBlockComponent,
  list: ListBlockComponent,
  table: TableBlockComponent,
};
