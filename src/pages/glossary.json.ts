import type { APIRoute } from 'astro';
import { getGlossary, termSlug } from '../utils/glossary';
import { withBase } from '../utils/url';

/**
 * 용어집 데이터(C8) — 글 페이지의 용어 하버카드 스크립트가 받아 굵은 용어에 풀이를 붙인다.
 * 빌드타임 정적 산출물(정적 사이트 유지).
 */
export const GET: APIRoute = async () => {
  const entries = await getGlossary();
  const data = entries.map((e) => ({
    term: e.term,
    gloss: e.gloss,
    url: withBase(`/glossary/#${termSlug(e.term)}`),
    // 어느 글이 이 뜻을 정의했는지 — /write가 '뜻 충돌'을 경고할 때 쓴다(하버카드는 무시).
    slugs: e.sources.map((s) => s.slug),
  }));
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
