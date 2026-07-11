import type { APIRoute } from 'astro';
import { getPublishedPosts } from '../utils/post';
import { withBase } from '../utils/url';

/**
 * llms.txt(C20) — llmstxt.org 표준. 다른 LLM이 이 위키를 읽기 좋게 사이트 구조와
 * 글 목록을 한 파일로 준다. 각 글은 원문 마크다운(.md)으로 링크한다.
 */
export const GET: APIRoute = async ({ site }) => {
  const posts = await getPublishedPosts();
  const origin = site ? site.origin : '';
  const abs = (p: string) => origin + withBase(p);

  const lines: string[] = [
    '# Injoy',
    '',
    '> 노준석의 개발·AI·글쓰기 학습 기록. 글은 쌓이기만 하지 않고 서로 연결되어 지식 그래프로 자랍니다.',
    '',
    '각 글은 원문 마크다운으로도 볼 수 있습니다(글 주소 끝에 `.md`).',
    '',
    '## 글',
    '',
    ...posts.map((p) => `- [${p.data.title}](${abs(`/posts/${p.id}.md`)}): ${p.data.description}`),
    '',
    '## 안내',
    '',
    `- [용어집](${abs('/glossary/')}): 글에 나온 전문 용어와 짧은 풀이`,
    `- [연결 스키마](${abs('/schema/')}): 글을 잇는 관계 타입(확장·뒷받침·선행 등)의 뜻`,
    `- [그래프](${abs('/graph/')}): 글과 태그의 연결 지도`,
    '',
  ];
  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
