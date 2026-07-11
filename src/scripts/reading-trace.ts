/**
 * 읽기 흔적(D13) — 방문한 글을 localStorage에 남긴다(그래프의 '읽은 글 점'이 이걸 쓴다).
 * 정적 사이트라 서버 없이 이 기기 안에서만 쌓인다(개인 정원의 발자국).
 */
const READ_KEY = 'injoy-read';

export function getVisited(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

export function markVisited(slug: string): void {
  try {
    const s = getVisited();
    if (s.has(slug)) return;
    s.add(slug);
    localStorage.setItem(READ_KEY, JSON.stringify([...s]));
  } catch {
    /* 저장 불가(사생활 모드 등) — 흔적 없이 넘어간다 */
  }
}

/** 현재 URL이 글 상세면 그 슬러그, 아니면 null */
export function currentSlug(): string | null {
  const m = location.pathname.match(/\/posts\/([^/]+)\/?/);
  return m ? decodeURIComponent(m[1]) : null;
}
