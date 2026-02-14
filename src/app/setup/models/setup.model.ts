export interface SetupIndexItem {
  slug: string;
  title: string;
  active: boolean;
}

export type BlockType = "h2" | "h3" | "p" | "list" | "image" | "video" | "code" | "callout";

export type CalloutVariant = "info" | "warning" | "error" | "success";

export interface Block {
  type: BlockType;
  content?: string;
  children?: Block[];
  alt?: string;        // image
  src?: string;        // video (content 用于 image path)
  language?: string;   // code
  variant?: CalloutVariant; // callout
}

export interface Page {
  slug?: string;       // 加载后设置
  title: string;
  order: number;
  blocks: Block[];
}
