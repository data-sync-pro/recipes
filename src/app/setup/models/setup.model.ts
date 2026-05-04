// Legacy interface - kept for backward compatibility during migration
export interface SetupIndexItem {
  slug: string;
  title: string;
  active: boolean;
  parent?: string;  // parent slug for nested pages
  hidden?: boolean; // hide from sidebar but keep page accessible
}

// New navigation tree structure - supports infinite nesting
export interface NavNode {
  id: string;                    // unique identifier
  label: string;                 // sidebar display text
  slug: string;                  // URL path segment, all items have pages
  children?: NavNode[];          // nested items (recursive)
  visible?: boolean;             // default true, false = hidden from sidebar
  defaultExpanded?: boolean;     // for items with children: start expanded?
}

export type BlockType = "h2" | "h3" | "h4" | "p" | "ul" | "ol" | "image" | "video" | "code" | "callout" | "instruction" | "table";

export type CalloutVariant = "info" | "warning" | "error" | "success";

export interface TableColumn {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

export type ImageSize = "small" | "medium" | "large" | "full";

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
  steps?: string[];    // instruction - list of steps before the image
  columns?: TableColumn[];  // table
  rows?: Record<string, string>[];  // table
}

export interface Page {
  slug?: string;     
  title: string;
  order: number;
  blocks: Block[];
}
