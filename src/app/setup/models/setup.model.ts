// Legacy interface - kept for backward compatibility during migration
export interface SetupIndexItem {
  slug: string;
  title: string;
  active: boolean;
  parent?: string;  // parent slug for nested pages
  hidden?: boolean; // hide from sidebar but keep page accessible
}

// New navigation tree structure - supports infinite nesting.
// Nodes with children but no slug behave as grouping nodes (click toggles
// expand/collapse). Nodes with children are always expanded by default.
export interface NavNode {
  id: string;                    // unique identifier
  label: string;                 // sidebar display text
  slug?: string;                 // URL path segment; omitted for grouping nodes
  children?: NavNode[];          // nested items (recursive)
  visible?: boolean;             // default true, false = hidden from sidebar
}

export type BlockType = "h2" | "h3" | "h4" | "p" | "ul" | "ol" | "image" | "video" | "code" | "callout" | "instruction" | "table" | "tabs" | "fields";

export type CalloutVariant = "info" | "warning" | "error" | "success";

export interface TableColumn {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

export type ImageSize = "small" | "medium" | "large" | "full";

export interface TabItem {
  label: string;
  children: Block[];
}

export interface FieldItem {
  name: string;
  required?: boolean;
  description: string;
}

export interface FieldGroup {
  title: string;
  fields: FieldItem[];
}


export interface Block {
  type: BlockType;
  content?: string;
  children?: Block[];
  alt?: string;        // image
  caption?: string[];  // image
  size?: ImageSize;    // image - predefined sizes: small (30%), medium (50%), large (70%), full (100%)
  src?: string;        // video
  language?: string;   // code
  variant?: CalloutVariant; // callout
  title?: string;      // callout - optional bold heading rendered above content
  steps?: string[];    // instruction - list of steps before the image
  columns?: TableColumn[];  // table
  rows?: Record<string, string>[];  // table
  items?: TabItem[];   // tabs
  fields?: FieldItem[]; // fields
  groups?: FieldGroup[]; // fields - grouped variant
  filterPlaceholder?: string; // fields - when set, shows a filter input with this placeholder
  defaultExpanded?: boolean; // h3 - start expanded instead of collapsed
}

export interface RelatedLink {
  label: string;
  url: string;
  newTab?: boolean;
}

export interface Page {
  slug?: string;
  title: string;
  order: number;
  blocks: Block[];
  // Setup slug (label auto-resolved from nav tree) or literal { label, url, newTab? }
  // for cross-module / external links (e.g. recipes).
  related?: (string | RelatedLink)[];
}
