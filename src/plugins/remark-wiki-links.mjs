/**
 * [[슬러그]] / [[슬러그|표시 텍스트]] 위키링크를 글 링크로 변환한다.
 * - 표시 텍스트가 없으면 대상 글의 제목을 사용
 * - 존재하지 않는 슬러그는 원문 그대로 두고 빌드 로그에 경고
 * 코드(inlineCode/code) 노드는 mdast에서 별도 타입이라 자연히 제외된다.
 */
import { WIKI_LINK_RE } from './wiki-link-pattern.mjs';

export default function remarkWikiLinks(options = {}) {
  const titles = options.titles ?? {};
  const base = (options.base ?? '/').replace(/\/$/, '');

  const transform = (node, file) => {
    if (!Array.isArray(node.children)) return;

    node.children = node.children.flatMap((child) => {
      // 이미 링크인 노드 안의 [[..]]는 변환하지 않는다 (중첩 <a>는 invalid HTML)
      if (child.type === 'link' || child.type === 'linkReference') {
        return [child];
      }
      if (child.type !== 'text') {
        transform(child, file);
        return [child];
      }

      WIKI_LINK_RE.lastIndex = 0;
      if (!WIKI_LINK_RE.test(child.value)) return [child];
      WIKI_LINK_RE.lastIndex = 0;

      const parts = [];
      let last = 0;
      for (const match of child.value.matchAll(WIKI_LINK_RE)) {
        const [whole, slugRaw, labelRaw] = match;
        const slug = slugRaw.trim();
        const title = titles[slug];

        if (match.index > last) {
          parts.push({ type: 'text', value: child.value.slice(last, match.index) });
        }

        if (title === undefined) {
          console.warn(`[wiki-links] 존재하지 않는 글을 가리키는 위키링크: [[${slug}]] (${file?.path ?? ''})`);
          parts.push({ type: 'text', value: whole });
        } else {
          parts.push({
            type: 'link',
            url: `${base}/posts/${slug}/`,
            data: { hProperties: { className: ['wiki-link'] } },
            children: [{ type: 'text', value: labelRaw?.trim() || title }],
          });
        }
        last = match.index + whole.length;
      }
      if (last < child.value.length) {
        parts.push({ type: 'text', value: child.value.slice(last) });
      }
      return parts;
    });
  };

  return (tree, file) => transform(tree, file);
}
