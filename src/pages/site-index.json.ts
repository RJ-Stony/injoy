import type { APIRoute } from 'astro';
import { getPublishedPosts, isoDate } from '../utils/post';
import { getGraph } from '../utils/graph';

/**
 * 발행 글·연결의 가벼운 인덱스.
 * /write 에디터가 연결 제안(유사 글 추천)·위키링크 검증·중복 슬러그 점검에 쓴다.
 */
export const GET: APIRoute = async () => {
  const posts = await getPublishedPosts();
  const graph = await getGraph();

  return new Response(
    JSON.stringify({
      posts: posts.map((p) => ({
        slug: p.id,
        title: p.data.title,
        description: p.data.description,
        category: p.data.category,
        tags: p.data.tags,
        pubDate: isoDate(p.data.pubDate),
      })),
      edges: graph.edges.filter((e) => !e.to.startsWith('tag:')),
    }),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
  );
};
