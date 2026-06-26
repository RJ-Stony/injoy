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

/**
 * 명시적 엣지 타입 (고정) — 방향: from이 to에 대해 갖는 관계.
 * criteria는 "어떤 글을 이 타입으로 연결하는가"의 판단 기준 —
 * /write 에디터의 연결 가이드와 /graph의 타입 안내가 같은 문장을 공유한다.
 */
export const EDGE_TYPES = {
  extends: {
    label: '확장',
    out: '이 글이 확장하는 글',
    in: '이 글을 확장한 글',
    criteria: '대상 글의 주장을 이어받아 한 걸음 더 나아간 글. "그 글의 다음 이야기"에 해당해요.',
  },
  supports: {
    label: '뒷받침',
    out: '이 글이 뒷받침하는 글',
    in: '이 글을 뒷받침하는 글',
    criteria: '대상 글의 주장에 근거·데이터·구현 경험을 보태는 글. "그 글이 맞다는 증거"예요.',
  },
  refines: {
    label: '구체화',
    out: '이 글이 구체화하는 글',
    in: '이 글을 구체화한 글',
    criteria: '대상 글의 주장을 더 정밀하게 다듬은 글. "같은 주장의 더 날카로운 버전"이에요.',
  },
  instantiates: {
    label: '사례',
    out: '이 글이 사례로 보여주는 글',
    in: '이 글의 사례인 글',
    criteria: '대상 글의 일반 원칙이 실제 상황에 적용된 모습을 보여 주는 글이에요.',
  },
  requires: {
    label: '선행',
    out: '먼저 읽으면 좋은 글',
    in: '이 글을 전제로 하는 글',
    criteria: '대상 글을 먼저 읽어야 이 글이 제대로 이해돼요. "읽기 전 준비물"인 관계예요.',
  },
  'triggered-by': {
    label: '계기',
    out: '이 글의 계기가 된 글',
    in: '이 글에서 시작된 글',
    criteria: '대상 글에서 다룬 경험이나 사건이 이 글을 쓰게 된 출발점이에요.',
  },
  contradicts: {
    label: '반박',
    out: '이 글이 반박하는 글',
    in: '이 글을 반박하는 글',
    criteria: '대상 글의 주장에 동의하지 않거나 결론을 뒤집는 글. 두 글의 긴장 관계를 드러내요.',
  },
  related: {
    label: '관련',
    out: '관련 글',
    in: '관련 글',
    criteria: '어느 타입에도 딱 맞지 않지만 함께 읽으면 좋은 글. 마지막 선택지로만 써요.',
  },
} as const;

/** 자동 수집 타입 */
export const AUTO_EDGE_TYPES = {
  mentions: {
    label: '언급',
    out: '이 글이 언급한 글',
    in: '이 글을 언급한 글',
    criteria: '본문의 [[위키링크]]에서 자동으로 수집돼요. 직접 고를 일은 없어요.',
  },
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
  /** 글 노드의 발행 나이(0=가장 옛, 1=최신) — 캔버스가 색 진하기로 쓴다. 태그 노드엔 없음. */
  age?: number;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: { posts: number; tags: number; edges: number };
}

// 본문 위키링크 패턴 — remark 플러그인과 단일 출처 공유
export { WIKI_LINK_RE } from '../plugins/wiki-link-pattern.mjs';
import { WIKI_LINK_RE } from '../plugins/wiki-link-pattern.mjs';

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
  // 두 글 사이에 명시적 연결이 있으면(방향 무관) mentions는 약한 중복이므로 생략 —
  // 안 그러면 글 상세 "연결된 글"에 같은 글이 두 번 나타난다
  const explicitPairs = new Set(
    explicit.flatMap((e) => [`${e.from}→${e.to}`, `${e.to}→${e.from}`]),
  );
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

  // posts는 최신순(index 0 = 최신). 나이를 0~1로: 가장 옛 글=0, 최신=1(글이 하나뿐이면 1).
  const lastIdx = posts.length - 1;
  const nodes: GraphNode[] = [
    ...posts.map((p, i) => ({
      id: p.id,
      kind: 'post' as const,
      label: p.data.title,
      url: `/posts/${p.id}/`,
      category: p.data.category,
      degree: degree.get(p.id) ?? 0,
      age: lastIdx > 0 ? (lastIdx - i) / lastIdx : 1,
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

  // 정렬 기준: 타입 우선순위(EDGE_TYPES 정의 순 → mentions 마지막), 같은 타입이면 최신 글 먼저.
  // age는 노드에 실린 발행 나이(1=최신). '처음 3개 + 더 보기'가 이 순서를 그대로 따른다.
  const typeOrder = [...Object.keys(EDGE_TYPES), 'mentions'];
  const rank = (t: EdgeType) => {
    const i = typeOrder.indexOf(t);
    return i < 0 ? typeOrder.length : i;
  };
  const ageOf = new Map(
    graph.nodes.filter((n) => n.kind === 'post').map((n) => [n.id, n.age ?? 0]),
  );

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
    })
    .sort(
      (a, b) => rank(a.type) - rank(b.type) || (ageOf.get(b.slug) ?? 0) - (ageOf.get(a.slug) ?? 0),
    );
}

/** 엣지 타입의 표시 라벨 */
export function edgeLabel(type: EdgeType): string {
  return (
    (EDGE_TYPES as Record<string, { label: string }>)[type]?.label ??
    AUTO_EDGE_TYPES.mentions.label
  );
}

/** 읽기 순서를 만드는 방향 엣지 — '선행(requires)'·'확장(extends)'만 순서를 가진다 */
const READING_ORDER_TYPES = new Set<EdgeType>(['requires', 'extends']);

export interface ReadingStep {
  slug: string;
  title: string;
}

export interface ReadingPathData {
  /** 먼저 읽을 글 — 이른 순서대로 */
  before: ReadingStep[];
  /** 이어 읽을 글 — 가까운 순서대로 */
  after: ReadingStep[];
}

/**
 * requires·extends만으로 '읽기 경로'(선형)를 만든다.
 * P -[requires|extends]-> Q 는 'Q를 먼저 읽어야/이어받아'의 관계라 Q가 P보다 앞선다.
 * 따라서 나가는 엣지의 to는 before, 들어오는 엣지의 from은 after.
 * 경로가 없으면 before·after 모두 빈 배열을 돌려준다(컴포넌트가 안 그림).
 */
export async function getReadingPath(slug: string): Promise<ReadingPathData> {
  const graph = await getGraph();
  const titles = new Map(
    graph.nodes.filter((n) => n.kind === 'post').map((n) => [n.id, n.label]),
  );
  const order = graph.edges.filter(
    (e) => !e.to.startsWith('tag:') && READING_ORDER_TYPES.has(e.type),
  );

  // 현재 데이터는 분기 없는 선형 사슬이라 글마다 앞/뒤 하나씩만 잇는다.
  // 분기(한 글에 나가는 requires 2개 등)가 생기면 마지막 엣지만 남으므로,
  // 그때 정렬로 결정하거나 트리로 확장하도록 바꾼다.
  const prevOf = new Map<string, string>(); // 글 -> 바로 앞(선행) 글
  const nextOf = new Map<string, string>(); // 글 -> 바로 뒤(후행) 글
  for (const e of order) {
    prevOf.set(e.from, e.to); // e.to가 e.from보다 앞
    nextOf.set(e.to, e.from); // e.from이 e.to보다 뒤
  }

  const walk = (step: Map<string, string>): ReadingStep[] => {
    const out: ReadingStep[] = [];
    const seen = new Set<string>([slug]); // 순환 가드
    let cur = step.get(slug);
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      out.push({ slug: cur, title: titles.get(cur) ?? cur });
      cur = step.get(cur);
    }
    return out;
  };

  return {
    before: walk(prevOf).reverse(), // 가까운→먼 순으로 모은 뒤 뒤집어 '이른 순서'로
    after: walk(nextOf), // 가까운→먼 = 읽기 순서 그대로
  };
}
