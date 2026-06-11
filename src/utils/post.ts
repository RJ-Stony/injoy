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
  return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/**
 * 읽는 시간(분) — 글자 수에 글의 난이도를 반영해 계산한다.
 * - 한국어 산문: 분당 500자, 영문: 분당 200단어
 * - 코드: 줄당 4초 (산문보다 천천히 읽는다)
 * - 수식 블록·다이어그램: 개당 15초, 인라인 수식: 개당 3초
 * - 이미지: 개당 10초
 */
export function readingMinutes(post: Post): number {
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
  const mermaidCount = codeBlocks.filter(isMermaid).length;
  const codeLines = codeBlocks
    .filter((b) => !isMermaid(b))
    .reduce((n, b) => n + Math.max(0, b.split('\n').length - 2), 0);

  const seconds =
    (cjkChars / 500) * 60 +
    (latinWords / 200) * 60 +
    codeLines * 4 +
    (mathBlocks + mermaidCount) * 15 +
    inlineMath * 3 +
    images * 10;

  return Math.max(1, Math.round(seconds / 60));
}

/** "2026. 6. 10." 형식의 발행일 표기 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' }).format(date);
}

/** <time datetime> 속성용 ISO 날짜 (YYYY-MM-DD) */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
