import fs from 'node:fs';
import sharp from 'sharp';
import { getPublishedPosts, getSeriesGroups, getStandalonePosts, type Post } from './post';

/**
 * 서가의 책 — 시리즈 하나가 책 한 권이고 글은 그 책의 장이다.
 * 시리즈에 속하지 않은 글은 한 장짜리 낱권이 된다. 홈 서가, 시리즈 목차, 홈 그래프의 점 색이 함께 쓴다.
 */
export interface Book {
  title: string;
  /** 책을 펼치면 가는 곳 — 시리즈는 목차(/series/…/), 낱권은 글 */
  url: string;
  /** 표지 색(광 없는 파스텔). 홈 그래프의 점도 같은 색을 쓴다 */
  cloth: string;
  single: boolean;
  chapters: Post[];
}

// 시리즈는 앞에서부터, 낱권은 뒤에서부터 색을 받는다. 책이 색 수보다 많아지면 다시 돈다.
const CLOTH = ['#c9d6ea', '#cfe0cc', '#f2d6c9', '#efe3bd', '#dad1ea', '#eecdd6', '#cedbdf', '#dee3c3'];

/** 시리즈 이름을 주소에 쓸 수 있게 — 공백만 하이픈으로 바꾼다(한글은 그대로 둔다) */
export const seriesSlug = (series: string) => series.trim().replace(/\s+/g, '-');

/** 표지 그림(public/covers/<열쇠>.webp)의 위쪽 바탕색. 책등과 윗면, 그래프의 점이 표지와 같은 색을 쓰게 한다. 그림이 없으면 null */
async function clothOfCover(url: string): Promise<string | null> {
  const file = `public/covers/${url.split('/').filter(Boolean).pop()}.webp`;
  if (!fs.existsSync(file)) return null;
  const img = sharp(file);
  const { width = 0, height = 0 } = await img.metadata();
  // 제목을 얹는 위쪽 3분의 1은 그림 없이 바탕색만 칠해져 있다
  // (stats는 잘라 낸 결과가 아니라 원본을 재므로, 잘라 낸 것을 다시 읽어서 잰다)
  const top = await img.extract({ left: 0, top: 0, width, height: Math.round(height / 3) }).png().toBuffer();
  const { channels } = await sharp(top).stats();
  return '#' + channels.slice(0, 3).map((c) => Math.round(c.mean).toString(16).padStart(2, '0')).join('');
}

let cache: Promise<Book[]> | undefined;
export function getBooks(): Promise<Book[]> {
  return (cache ??= loadBooks());
}

async function loadBooks(): Promise<Book[]> {
  const [groups, loose] = await Promise.all([getSeriesGroups(), getStandalonePosts()]);
  const books: Book[] = groups.map((g) => ({
    title: g.series,
    url: `/series/${seriesSlug(g.series)}/`,
    cloth: '',
    single: false,
    chapters: g.posts,
  }));
  for (const p of loose) {
    books.push({ title: p.data.title, url: `/posts/${p.id}/`, cloth: '', single: true, chapters: [p] });
  }
  await Promise.all(books.map(async (b, i) => (b.cloth = (await clothOfCover(b.url)) ?? CLOTH[i % CLOTH.length])));
  return books;
}

/** 글 → 그 글이 든 책의 표지 색 (홈 그래프의 점 색) */
export async function getClothOfPost(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const b of await getBooks()) for (const p of b.chapters) map.set(p.id, b.cloth);
  // 발행 글은 모두 어느 책엔가 들어 있다. 빠진 글이 있으면 여기서 드러난다.
  for (const p of await getPublishedPosts()) if (!map.has(p.id)) throw new Error(`책에 들지 않은 글: ${p.id}`);
  return map;
}
