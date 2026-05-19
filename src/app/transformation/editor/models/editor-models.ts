// Accurate runtime shape of a tip — DocData.tips is declared as string[]
// in DocsService but every existing JSON uses this object form.
export interface Tip {
  text: string;
  code?: string;
  children?: Tip[];
}
