/** 위키링크 패턴: [[slug]] 또는 [[slug|표시 텍스트]] — graph.ts와 동일해야 한다 */
export const WIKI_LINK_RE = /\[\[([^\[\]|\n]+?)(?:\|([^\[\]\n]+?))?\]\]/g;
