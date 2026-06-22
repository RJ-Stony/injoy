/**
 * 문단에 이미지 하나만 있을 때 <figure>로 감싼다.
 *  · title("캡션")이 있으면 <figcaption>으로 붙인다: ![alt](./img.png "여기에 캡션")
 *  · title 앞의 {align=left|center|right} 마커는 정렬 클래스로 바꾸고 캡션에서 떼어낸다:
 *      ![alt](./img.png "{align=right}오른쪽 캡션")  → figure.img-right + 캡션
 *      ![alt](./img.png "{align=left}")             → figure.img-left  (캡션 없음)
 *    마커는 마크다운 title에 그대로 직렬화돼 에디터와 라운드트립한다.
 */
const ALIGN_RE = /^\{align=(left|center|right)\}\s*/;

export default function rehypeFigure() {
  return (tree) => {
    const walk = (node) => {
      if (!Array.isArray(node.children)) return;
      node.children = node.children.map((child) => {
        walk(child);
        if (child.type !== 'element' || child.tagName !== 'p') return child;

        const meaningful = child.children.filter(
          (c) => !(c.type === 'text' && c.value.trim() === ''),
        );
        const [only] = meaningful;
        if (
          meaningful.length !== 1 ||
          only.type !== 'element' ||
          only.tagName !== 'img' ||
          !only.properties?.title
        ) {
          return child;
        }

        const rawTitle = String(only.properties.title);
        const m = rawTitle.match(ALIGN_RE);
        const align = m ? m[1] : null;
        const caption = m ? rawTitle.slice(m[0].length) : rawTitle;
        delete only.properties.title;

        // 정렬 마커도 없고 캡션도 비면 figure로 감쌀 이유가 없다 — 원래 문단 유지.
        if (!align && !caption.trim()) return child;

        const children = [only];
        if (caption.trim()) {
          children.push({
            type: 'element',
            tagName: 'figcaption',
            properties: {},
            children: [{ type: 'text', value: caption }],
          });
        }
        return {
          type: 'element',
          tagName: 'figure',
          properties: align ? { className: [`img-${align}`] } : {},
          children,
        };
      });
    };
    walk(tree);
  };
}
