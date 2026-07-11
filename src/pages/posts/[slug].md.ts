import type { APIRoute, GetStaticPaths } from 'astro';
import { getPublishedPosts } from '../../utils/post';

/**
 * 글별 원문 마크다운(C20) — /posts/<슬러그>.md 로 각 글의 원본을 그대로 준다.
 * LLM·다른 도구가 렌더된 HTML 대신 깨끗한 마크다운을 읽기 좋게. 빌드타임 정적 산출.
 */
export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getPublishedPosts();
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
};

export const GET: APIRoute = async ({ props }) => {
  const { post } = props as { post: Awaited<ReturnType<typeof getPublishedPosts>>[number] };
  const md = `# ${post.data.title}\n\n${post.data.description}\n\n${post.body}`;
  return new Response(md, {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });
};
