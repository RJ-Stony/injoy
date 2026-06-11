/**
 * 문단에 이미지 하나만 있고 title("캡션")이 지정된 경우
 * <figure><img/><figcaption>캡션</figcaption></figure>로 변환한다.
 * 사용: ![alt](./image.png "여기에 캡션")
 */
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

        const caption = String(only.properties.title);
        delete only.properties.title;
        return {
          type: 'element',
          tagName: 'figure',
          properties: {},
          children: [
            only,
            {
              type: 'element',
              tagName: 'figcaption',
              properties: {},
              children: [{ type: 'text', value: caption }],
            },
          ],
        };
      });
    };
    walk(tree);
  };
}
