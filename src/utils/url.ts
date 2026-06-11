/**
 * 사이트 내부 절대경로에 배포 base 경로를 붙인다.
 * GitHub Pages 프로젝트 사이트(/injoy)처럼 하위 경로에 배포해도 링크가 깨지지 않는다.
 * 예) withBase('/posts/welcome/') → '/injoy/posts/welcome/'
 */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${path}`;
}
