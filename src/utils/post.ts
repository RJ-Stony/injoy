import { getCollection, type CollectionEntry } from 'astro:content';
import getReadingTime from 'reading-time';

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

/** 읽는 시간(분) — CJK 글자 수를 반영해 계산한다. */
export function readingMinutes(post: Post): number {
  const { minutes } = getReadingTime(post.body ?? '');
  return Math.max(1, Math.ceil(minutes));
}

/** "2026. 6. 10." 형식의 발행일 표기 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' }).format(date);
}

/** <time datetime> 속성용 ISO 날짜 (YYYY-MM-DD) */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
