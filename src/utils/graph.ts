import { z } from 'astro:content';
import edgesRaw from '../data/edges.json';
import { getPublishedPosts, type Post } from './post';
import { splitCode } from './md-text';

/**
 * 글 사이의 연결(지식 그래프) 레이어.
 * - 명시적 연결: src/data/edges.json — 타입은 아래 EDGE_TYPES로 고정
 * - 자동 연결: 본문의 [[슬러그]] 위키링크 → mentions 엣지로 수집
 * 존재하지 않는 슬러그를 가리키면 빌드가 실패한다(끊어진 연결 방지).
 */

/** 명시적 엣지 타입 (고정) — 방향: from이 to에 대해 갖는 관계 */
export const EDGE_TYPES = {
  extends: { label: '확장', out: '이 글이 확장하는 글', in: '이 글을 확장한 글' },
  supports: { label: '뒷받침', out: '이 글이 뒷받침하는 글', in: '이 글을 뒷받침하는 글' },
  refines: { label: '구체화', out: '이 글이 구체화하는 글', in: '이 글을 구체화한 글' },
  contradicts: { label: '반박', out: '이 글이 반박하는 글', in: '이 글을 반박하는 글' },
  instantiates: { label: '사례', out: '이 글이 사례로 보여주는 글', in: '이 글의 사례인 글' },
  related: { label: '관련', out: '관련 글', in: '관련 글' },
} as const;

/** 자동 수집 타입 */
export const AUTO_EDGE_TYPES = {
  mentions: { label: '언급', out: '이 글이 언급한 글', in: '이 글을 언급한 글' },
} as const;

export type ExplicitEdgeType = keyof typeof EDGE_TYPES;
export type EdgeType = ExplicitEdgeType | keyof typeof AUTO_EDGE_TYPES;

const edgeSchema = z.object({
  edges: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      type: z.enum(Object.keys(EDGE_TYPES) as [ExplicitEdgeType, ...ExplicitEdgeType[]]),
      note: z.string().optional(),
    }),
  ),
});

export interface GraphEdge {
  from: string;
  to: string;
  type: EdgeType;
  note?: string;
}

export interface GraphNode {
  id: string;
  kind: 'post' | 'tag';
  label: string;
  url: string;
  category?: string;
  /** 연결 수 — 노드 크기에 사용 */
  degree: number;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: { posts: number; tags: number; edges: number };
}

/** 본문 위키링크 패턴: [[slug]] 또는 [[slug|표시 텍스트]] */
export const WIKI_LINK_RE = /\[\[([^\[\]|\n]+?)(?:\|([^\[\]\n]+?))?\]\]/g;

/** 본문에서 [[슬러그]] 언급을 수집한다 (코드블록 내부 제외). */
function collectMentions(post: Post, validSlugs: Set<string>): GraphEdge[] {
  const { prose: body } = splitCode(post.body ?? '');
  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const match of body.matchAll(WIKI_LINK_RE)) {
    const target = match[1].trim();
    if (target === post.id || !validSlugs.has(target) || seen.has(target)) continue;
    seen.add(target);
    edges.push({ from: post.id, to: target, type: 'mentions' });
  }
  return edges;
}

/** 발행 글 전체로 그래프를 구성한다. 끊어진 엣지는 빌드 에러. */
export async function getGraph(): Promise<Graph> {
  const posts = await getPublishedPosts();
  const slugs = new Set(posts.map((p) => p.id));

  const { edges: explicit } = edgeSchema.parse(edgesRaw);
  const broken = explicit.flatMap((e) =>
    [e.from, e.to].filter((slug) => !slugs.has(slug)).map((slug) => `${e.from} -[${e.type}]-> ${e.to} (없는 슬러그: ${slug})`),
  );
  if (broken.length > 0) {
    throw new Error(
      `edges.json에 존재하지 않는 글을 가리키는 연결이 있습니다:\n  ${broken.join('\n  ')}\n` +
        `src/data/edges.json을 수정하거나 해당 글의 draft를 해제하세요.`,
    );
  }

  const mentions = posts.flatMap((p) => collectMentions(p, slugs));
  // 같은 두 글 사이에 명시적 연결이 있으면 mentions는 중복이므로 생략
  const explicitPairs = new Set(explicit.map((e) => `${e.from}→${e.to}`));
  const edges: GraphEdge[] = [
    ...explicit,
    ...mentions.filter((m) => !explicitPairs.has(`${m.from}→${m.to}`)),
  ];

  const degree = new Map<string, number>();
  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);
  edges.forEach((e) => {
    bump(e.from);
    bump(e.to);
  });

  const tagSet = new Set(posts.flatMap((p) => p.data.tags));
  posts.forEach((p) => p.data.tags.forEach(() => bump(p.id)));
  const tagNodes: GraphNode[] = [...tagSet].map((tag) => ({
    id: `tag:${tag}`,
    kind: 'tag',
    label: `#${tag}`,
    url: `/tags/${tag}/`,
    degree: posts.filter((p) => p.data.tags.includes(tag)).length,
  }));
  const tagEdges: GraphEdge[] = posts.flatMap((p) =>
    p.data.tags.map((tag) => ({ from: p.id, to: `tag:${tag}`, type: 'mentions' as const })),
  );

  const nodes: GraphNode[] = [
    ...posts.map((p) => ({
      id: p.id,
      kind: 'post' as const,
      label: p.data.title,
      url: `/posts/${p.id}/`,
      category: p.data.category,
      degree: degree.get(p.id) ?? 0,
    })),
    ...tagNodes,
  ];

  return {
    nodes,
    edges: [...edges, ...tagEdges],
    stats: { posts: posts.length, tags: tagNodes.length, edges: edges.length },
  };
}

export interface Connection {
  direction: 'out' | 'in';
  type: EdgeType;
  /** 방향을 반영한 한국어 설명 */
  phrase: string;
  slug: string;
  title: string;
  note?: string;
}

/** 특정 글의 연결 목록 (명시적 + 언급, 양방향) */
export async function getConnections(slug: string): Promise<Connection[]> {
  const graph = await getGraph();
  const titles = new Map(
    graph.nodes.filter((n) => n.kind === 'post').map((n) => [n.id, n.label]),
  );

  const phrase = (type: EdgeType, dir: 'out' | 'in') =>
    (EDGE_TYPES as Record<string, { out: string; in: string }>)[type]?.[dir] ??
    AUTO_EDGE_TYPES.mentions[dir];

  return graph.edges
    .filter((e) => !e.to.startsWith('tag:'))
    .flatMap((e): Connection[] => {
      if (e.from === slug) {
        return [
          {
            direction: 'out',
            type: e.type,
            phrase: phrase(e.type, 'out'),
            slug: e.to,
            title: titles.get(e.to) ?? e.to,
            note: e.note,
          },
        ];
      }
      if (e.to === slug) {
        return [
          {
            direction: 'in',
            type: e.type,
            phrase: phrase(e.type, 'in'),
            slug: e.from,
            title: titles.get(e.from) ?? e.from,
            note: e.note,
          },
        ];
      }
      return [];
    });
}

/** 엣지 타입의 표시 라벨 */
export function edgeLabel(type: EdgeType): string {
  return (
    (EDGE_TYPES as Record<string, { label: string }>)[type]?.label ??
    AUTO_EDGE_TYPES.mentions.label
  );
}
