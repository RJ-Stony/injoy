/**
 * 마크다운 본문 안의 사이트 내부 절대경로(href/src가 '/'로 시작)에
 * 배포 base 경로를 붙인다. 글 본문에서는 '/posts/slug/'처럼 base 없이
 * 쓰는 것이 자연스럽고, 배포 경로가 바뀌어도 글을 고칠 필요가 없다.
 */
export default function rehypeBaseLinks(options = {}) {
  const base = (options.base ?? '/').replace(/\/$/, '');

  const rewrite = (value) => {
    if (base === '') return value;
    if (typeof value !== 'string') return value;
    if (!value.startsWith('/') || value.startsWith('//')) return value;
    if (value === base || value.startsWith(`${base}/`)) return value; // 이미 적용됨
    return `${base}${value}`;
  };

  return (tree) => {
    const walk = (node) => {
      if (node.type === 'element') {
        if (node.tagName === 'a' && node.properties?.href) {
          node.properties.href = rewrite(node.properties.href);
        }
        if ((node.tagName === 'img' || node.tagName === 'source') && node.properties?.src) {
          node.properties.src = rewrite(node.properties.src);
        }
      }
      // 본문에 직접 쓴 raw HTML(<img src="/...">)도 같은 규칙으로 처리
      if (node.type === 'raw' && typeof node.value === 'string') {
        node.value = node.value.replace(
          /(href|src)="(\/[^"/][^"]*)"/g,
          (match, attr, path) => `${attr}="${rewrite(path)}"`,
        );
      }
      if (Array.isArray(node.children)) node.children.forEach(walk);
    };
    walk(tree);
  };
}
