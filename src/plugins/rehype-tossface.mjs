/**
 * 본문 텍스트의 이모지 글리프만 <span class="tossface">로 감싼다.
 * Tossface는 본문 전체가 아니라 이모지에만 적용한다는 규칙(스펙 4.1)을
 * 자동으로 지켜 주는 플러그인. 코드·스크립트 영역은 건드리지 않는다.
 */
const SKIP_TAGS = new Set(['code', 'pre', 'script', 'style']);

let EMOJI_RE;
try {
  // RGI 이모지 시퀀스(조합 이모지 포함) — Node 20+
  EMOJI_RE = new RegExp('\\p{RGI_Emoji}', 'vg');
} catch {
  EMOJI_RE = new RegExp('\\p{Extended_Pictographic}\\uFE0F?', 'gu');
}

export default function rehypeTossface() {
  return (tree) => {
    const walk = (node) => {
      if (!Array.isArray(node.children)) return;
      node.children = node.children.flatMap((child) => {
        if (child.type === 'element') {
          if (SKIP_TAGS.has(child.tagName)) return [child];
          if (child.properties?.className?.includes?.('tossface')) return [child];
          walk(child);
          return [child];
        }
        if (child.type !== 'text' || !child.value) return [child];

        EMOJI_RE.lastIndex = 0;
        if (!EMOJI_RE.test(child.value)) return [child];
        EMOJI_RE.lastIndex = 0;

        const parts = [];
        let last = 0;
        for (const match of child.value.matchAll(EMOJI_RE)) {
          if (match.index > last) {
            parts.push({ type: 'text', value: child.value.slice(last, match.index) });
          }
          parts.push({
            type: 'element',
            tagName: 'span',
            properties: { className: ['tossface'] },
            children: [{ type: 'text', value: match[0] }],
          });
          last = match.index + match[0].length;
        }
        if (last < child.value.length) {
          parts.push({ type: 'text', value: child.value.slice(last) });
        }
        return parts;
      });
    };
    walk(tree);
  };
}
