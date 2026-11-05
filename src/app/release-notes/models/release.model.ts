// Types only. These mirror the JSON under src/assets/release-notes/.

// ---- Inline text -----------------------------------------------------------

/** A run of text with optional emphasis and/or a link. */
export interface InlineSpan {
  text: string;
  bold?: boolean;
  /** Site-relative path ("/user-manual/…") or an absolute URL. */
  href?: string;
}

/**
 * Text as authors write it: a plain string, or an array mixing plain strings
 * with spans where bold or a link is needed.
 */
export type RichText = string | Array<string | InlineSpan>;

// ---- Blocks ----------------------------------------------------------------
// To add a kind of content: add an interface here, add it to ReleaseBlock,
// create its component and register it in components/blocks/block-registry.ts
// (the registry's type makes the compiler insist on that last step).

export interface ParagraphBlock {
  type: 'paragraph';
  text: RichText;
}

export interface ListBlock {
  type: 'list';
  ordered?: boolean;
  items: RichText[];
}

export interface TableBlock {
  type: 'table';
  columns: string[];
  rows: RichText[][];
}

export type ReleaseBlock = ParagraphBlock | ListBlock | TableBlock;

// ---- Release ---------------------------------------------------------------

export interface ReleaseItem {
  title: string;
  blocks: ReleaseBlock[];
}

export interface ReleaseSection {
  name: string;
  items: ReleaseItem[];
}

/** One file per release: assets/release-notes/releases/v<version>.json */
export interface ReleaseContent {
  sections: ReleaseSection[];
}

/** One entry of assets/release-notes/index.json. `date` is 'YYYY-MM-DD'. */
export interface ReleaseMeta {
  version: string;
  date: string;
}

export interface ReleaseIndex {
  releases: ReleaseMeta[];
}

export type Release = ReleaseMeta & ReleaseContent;

export interface ReleasePage {
  releases: Release[];
  page: number;
  totalPages: number;
}

/** What the page renders: the releases plus where the pager links go. */
export interface ReleasePageView {
  releases: Release[];
  newerPage: number | null;
  olderPage: number | null;
}
