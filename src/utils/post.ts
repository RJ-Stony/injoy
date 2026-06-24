import { getCollection, type CollectionEntry } from 'astro:content';
import { splitCode } from './md-text';

export type Post = CollectionEntry<'posts'>;

/**
 * 발행된 글 목록 — 프로덕션 빌드에서는 draft 글을 제외하고,
 * 개발 모드에서는 미리보기를 위해 draft도 포함한다.
 */
export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', ({ data }) =>
    import.meta.env.PROD ? !data.draft : true,
  );
  // 발행일 내림차순. 같은 날이면 슬러그 내림차순으로 — pubDate는 날짜뿐이라 시각이 없어,
  // 같은 날 발행된 글(polish-round-4·5 등)은 슬러그가 큰 쪽(나중 글)을 위로 올린다.
  return posts.sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf() || b.id.localeCompare(a.id),
  );
}

/**
 * 발행된 글의 카테고리 목록 — 고유 카테고리와 글 수. 글 많은 순, 같으면 가나다순.
 * 헤더 카테고리 메뉴와 /categories/[category] 라우트가 함께 쓴다.
 */
export async function getCategories(): Promise<{ name: string; count: number }[]> {
  const posts = await getPublishedPosts();
  const counts = new Map<string, number>();
  for (const p of posts) counts.set(p.data.category, (counts.get(p.data.category) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
}

/** 같은 series로 묶인 글 그룹(읽는 순서=오래된 글 먼저). 홈 시리즈 폴더가 쓴다. */
export interface SeriesGroup {
  series: string;
  posts: Post[];
  /** 가장 최근 글의 발행 시각(그룹을 피드 상단에 정렬할 때 기준) */
  latest: number;
}

/** 글이 2편 이상인 시리즈만 그룹으로. 최근 활동 순(desc). */
export async function getSeriesGroups(): Promise<SeriesGroup[]> {
  const posts = await getPublishedPosts();
  const map = new Map<string, Post[]>();
  for (const p of posts) {
    const s = p.data.series;
    if (!s) continue;
    if (!map.has(s)) map.set(s, []);
    map.get(s)!.push(p);
  }
  return [...map.entries()]
    .filter(([, ps]) => ps.length > 1)
    .map(([series, ps]) => ({
      series,
      // 읽는 순서: 오래된 글 먼저(같은 날이면 슬러그 오름차순)
      posts: [...ps].sort(
        (a, b) => a.data.pubDate.valueOf() - b.data.pubDate.valueOf() || a.id.localeCompare(b.id),
      ),
      latest: Math.max(...ps.map((p) => p.data.pubDate.valueOf())),
    }))
    .sort((a, b) => b.latest - a.latest);
}

/** 어떤 (2편 이상) 시리즈에도 속하지 않은 글 — 홈 피드는 이들만 페이지로 나눈다(시리즈는 폴더로). */
export async function getStandalonePosts(): Promise<Post[]> {
  const groups = await getSeriesGroups();
  const inSeries = new Set(groups.flatMap((g) => g.posts.map((p) => p.id)));
  const posts = await getPublishedPosts();
  return posts.filter((p) => !inSeries.has(p.id));
}

/** 본문 통계 — 읽는 시간 계산과 '만듦새' 패널이 함께 쓰는 단일 출처 */
export interface PostStats {
  /** 읽는 시간(분) */
  minutes: number;
  /** 한글·CJK 글자 수 */
  cjkChars: number;
  /** 영문 단어 수 */
  latinWords: number;
  /** 코드(다이어그램 제외) 줄 수 */
  codeLines: number;
  /** 코드 블록 수(다이어그램 제외) */
  codeBlocks: number;
  /** mermaid 다이어그램 수 */
  diagrams: number;
  /** $$ 블록 수식 수 */
  mathBlocks: number;
  /** 인라인 수식 수 */
  inlineMath: number;
  /** 이미지 수 */
  images: number;
}

/**
 * 본문을 분해해 통계를 낸다. 읽는 시간 가중치:
 * - 한국어 산문: 분당 500자, 영문: 분당 200단어
 * - 코드: 줄당 4초 (산문보다 천천히 읽는다)
 * - 수식 블록·다이어그램: 개당 15초, 인라인 수식: 개당 3초
 * - 이미지: 개당 10초
 */
export function postStats(post: Post): PostStats {
  const { prose: proseRaw, codeBlocks } = splitCode(post.body ?? '');
  let prose = proseRaw;

  const mathBlocks = (prose.match(/\$\$[\s\S]*?\$\$/g) ?? []).length;
  prose = prose.replace(/\$\$[\s\S]*?\$\$/g, ' ');
  const inlineMath = (prose.match(/\$[^$\n]+\$/g) ?? []).length;

  const images =
    (prose.match(/!\[[^\]]*\]\(/g) ?? []).length + (prose.match(/<img[\s>]/gi) ?? []).length;

  const cjkChars = (prose.match(/[ᄀ-ᇿ　-鿿가-힯]/g) ?? []).length;
  const latinWords = (prose.replace(/[ᄀ-힯]/g, ' ').match(/[A-Za-z0-9]{2,}/g) ?? [])
    .length;

  const isMermaid = (b: string) => /^\s*`{3,}\s*mermaid/.test(b);
  const diagrams = codeBlocks.filter(isMermaid).length;
  const codeList = codeBlocks.filter((b) => !isMermaid(b));
  const codeLines = codeList.reduce((n, b) => n + Math.max(0, b.split('\n').length - 2), 0);

  const seconds =
    (cjkChars / 500) * 60 +
    (latinWords / 200) * 60 +
    codeLines * 4 +
    (mathBlocks + diagrams) * 15 +
    inlineMath * 3 +
    images * 10;

  return {
    minutes: Math.max(1, Math.round(seconds / 60)),
    cjkChars,
    latinWords,
    codeLines,
    codeBlocks: codeList.length,
    diagrams,
    mathBlocks,
    inlineMath,
    images,
  };
}

/** 읽는 시간(분) — postStats의 minutes만 꺼낸 단축 함수 */
export function readingMinutes(post: Post): number {
  return postStats(post).minutes;
}

/**
 * 본문 첫 mermaid 다이어그램의 소스(펜스 제외)를 돌려준다. 없으면 null.
 * 커버 없는 글의 카드 썸네일을 이 다이어그램으로 그릴 때 쓴다(postStats와 같은 판정).
 */
export function firstDiagram(post: Post): string | null {
  const { codeBlocks } = splitCode(post.body ?? '');
  const block = codeBlocks.find((b) => /^\s*`{3,}\s*mermaid/.test(b));
  if (!block) return null;
  const lines = block.split('\n');
  const inner = lines.slice(1); // ```mermaid 헤더 제거
  // 닫는 펜스(```/~~~)가 있으면 함께 제거 — 안쪽 소스만 남긴다
  if (inner.length > 0 && /^\s*(`{3,}|~{3,})\s*$/.test(inner[inner.length - 1])) inner.pop();
  const src = inner.join('\n').trim();
  return src || null;
}

/** 본문에 mermaid 다이어그램이 있는가 — 커버 없는 글의 대체 썸네일 판정에 쓴다 */
export function hasDiagram(post: Post): boolean {
  return firstDiagram(post) !== null;
}

/** "2026. 6. 10." 형식의 발행일 표기 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' }).format(date);
}

/** <time datetime> 속성용 ISO 날짜 (YYYY-MM-DD) */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
