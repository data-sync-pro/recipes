export interface SetupIndexItem {
  slug: string;
  title: string;
  active: boolean;
  parent?: string;  // parent slug for nested pages
}

export type BlockType = "h2" | "h3" | "p" | "ul" | "ol" | "image" | "video" | "code" | "callout";

export type CalloutVariant = "info" | "warning" | "error" | "success";

export interface Block {
  type: BlockType;
  content?: string;
  children?: Block[];
  alt?: string;        // image
  caption?: string[];  // image
  src?: string;        // video
  language?: string;   // code
  variant?: CalloutVariant; // callout
}

export interface Page {
  slug?: string;     
  title: string;
  order: number;
  blocks: Block[];
}
