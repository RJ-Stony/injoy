/**
 * 마크다운 표를 <div class="table-wrap">로 감싼다.
 * table 자체에 display:block을 주면 스크린리더의 표 시맨틱이 깨지므로,
 * 가로 스크롤은 래퍼에서 처리한다.
 */
export default function rehypeTableWrap() {
  return (tree) => {
    const walk = (node) => {
      if (!Array.isArray(node.children)) return;
      node.children = node.children.map((child) => {
        if (child.type === 'element' && child.tagName === 'table') {
          return {
            type: 'element',
            tagName: 'div',
            properties: { className: ['table-wrap'] },
            children: [child],
          };
        }
        walk(child);
        return child;
      });
    };
    walk(tree);
  };
}
