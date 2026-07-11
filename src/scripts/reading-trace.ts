/**
 * 읽기 흔적(D13·E15) — 방문한 글과 스크롤 위치를 localStorage에 남긴다.
 * 정적 사이트라 서버 없이 이 기기 안에서만 쌓인다(개인 정원의 발자국).
 */
const READ_KEY = 'injoy-read';
const SCROLL_PREFIX = 'injoy-scroll:';

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

export function saveScroll(slug: string, y: number): void {
  try {
    localStorage.setItem(SCROLL_PREFIX + slug, String(Math.round(y)));
  } catch {}
}

export function readScroll(slug: string): number {
  const v = Number(localStorage.getItem(SCROLL_PREFIX + slug));
  return Number.isFinite(v) ? v : 0;
}
