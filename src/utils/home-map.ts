import { getGraph, getConnections } from './graph';
import { getPublishedPosts, getSeriesGroups, readingMinutes, formatDateShort } from './post';
import { getClothOfPost } from './books';

export const MAP_W = 1000;
export const MAP_H = 600;

export interface MapNode {
  id: string;
  x: number;
  y: number;
  r: number;
  /** 이 글이 든 책의 표지 색 */
  hue: string;
  title: string;
  description: string;
  category: string;
  date: string;
  minutes: number;
  conns: { id: string; phrase: string; type: string; note?: string }[];
}

/**
 * 홈 지도의 자리를 빌드할 때 한 번 계산한다(브라우저에서 물리 계산을 돌리지 않는다).
 * 난수를 쓰지 않아 같은 글과 연결이면 늘 같은 그림이 나온다.
 */
export async function getHomeMap() {
  const [graph, posts, groups, cloth] = await Promise.all([
    getGraph(),
    getPublishedPosts(),
    getSeriesGroups(),
    getClothOfPost(),
  ]);
  const groupOf = new Map<string, number>();
  groups.forEach((g, gi) => g.posts.forEach((p) => groupOf.set(p.id, gi)));
  const loose = groups.length; // 시리즈 밖의 글 묶음
  const groupCount = groups.length + (posts.some((p) => !groupOf.has(p.id)) ? 1 : 0);

  const ids = new Set(posts.map((p) => p.id));
  const edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }

  // 묶음의 중심을 타원 위에 고르게 놓고, 글은 제 묶음 중심 둘레에서 출발한다.
  const centers = Array.from({ length: groupCount }, (_, g) => {
    const a = -Math.PI / 2 + (2 * Math.PI * g) / groupCount;
    return {
      x: MAP_W / 2 + Math.cos(a) * MAP_W * 0.33,
      y: MAP_H / 2 + Math.sin(a) * MAP_H * 0.3,
    };
  });
  const seen = new Map<number, number>();
  const pts = posts.map((p) => {
    const g = groupOf.get(p.id) ?? loose;
    const k = seen.get(g) ?? 0;
    seen.set(g, k + 1);
    const a = k * 2.399963; // 황금각: 겹치지 않게 나선으로 놓는다
    const r = 14 * Math.sqrt(k + 1);
    return { id: p.id, g, x: centers[g].x + Math.cos(a) * r, y: centers[g].y + Math.sin(a) * r };
  });
  const index = new Map(pts.map((p, i) => [p.id, i]));

  const STEPS = 320;
  for (let step = 0; step < STEPS; step++) {
    const alpha = 1 - step / STEPS;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[j].x - pts[i].x;
        const dy = pts[j].y - pts[i].y;
        const d2 = Math.max(dx * dx + dy * dy, 36);
        const d = Math.sqrt(d2);
        const f = (9000 / d2) * alpha;
        pts[i].x -= (dx / d) * f;
        pts[i].y -= (dy / d) * f;
        pts[j].x += (dx / d) * f;
        pts[j].y += (dy / d) * f;
      }
    }
    for (const e of edges) {
      const a = pts[index.get(e.from)!];
      const b = pts[index.get(e.to)!];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(Math.hypot(dx, dy), 1);
      const f = (d - 96) * 0.05 * alpha;
      a.x += (dx / d) * f;
      a.y += (dy / d) * f;
      b.x -= (dx / d) * f;
      b.y -= (dy / d) * f;
    }
    for (const p of pts) {
      p.x += (centers[p.g].x - p.x) * 0.022 * alpha;
      p.y += (centers[p.g].y - p.y) * 0.022 * alpha;
      p.x = Math.min(MAP_W - 28, Math.max(28, p.x));
      p.y = Math.min(MAP_H - 28, Math.max(34, p.y));
    }
  }

  // 계산이 끝난 자리를 지도 전체에 꽉 차게 편다(한쪽에 몰려 빈 곳이 남지 않게).
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (const p of pts) {
    p.x = 60 + ((p.x - x0) / (x1 - x0 || 1)) * (MAP_W - 120);
    p.y = 64 + ((p.y - y0) / (y1 - y0 || 1)) * (MAP_H - 110);
  }

  const nodes: MapNode[] = await Promise.all(
    posts.map(async (p, i) => ({
      id: p.id,
      x: Math.round(pts[i].x * 10) / 10,
      y: Math.round(pts[i].y * 10) / 10,
      r: Math.round((6 + Math.sqrt(degree.get(p.id) ?? 0) * 2.2) * 10) / 10,
      hue: cloth.get(p.id)!,
      title: p.data.title,
      description: p.data.description,
      category: p.data.category,
      date: formatDateShort(p.data.pubDate),
      minutes: readingMinutes(p),
      conns: (await getConnections(p.id)).map((c) => ({
        id: c.slug,
        phrase: c.phrase,
        type: c.type,
        note: c.note,
      })),
    })),
  );

  // 묶음 이름은 그 묶음의 둘레(위, 아래, 양옆, 네 귀퉁이) 가운데 다른 점과 가장 멀리 떨어진 자리에 적는다.
  // 점 위에 겹쳐 글자가 가려지지 않게 하려는 것이다.
  const taken: { x: number; y: number; w: number }[] = [];
  const labels = groups.map((g) => {
    const gi = groups.indexOf(g);
    const mine = pts.filter((p) => p.g === gi);
    const half = g.series.length * 9; // 글자 폭의 절반쯤(15px 굵은 글씨 기준)
    const [ax, bx] = [Math.min(...mine.map((p) => p.x)), Math.max(...mine.map((p) => p.x))];
    const [ay, by] = [Math.min(...mine.map((p) => p.y)), Math.max(...mine.map((p) => p.y))];
    const cx = (ax + bx) / 2;
    const cy = (ay + by) / 2;
    const spots = [
      [cx, ay - 26], [cx, by + 34], [ax - half - 18, cy], [bx + half + 18, cy],
      [ax, ay - 26], [bx, ay - 26], [ax, by + 34], [bx, by + 34],
    ].map(([x, y]) => ({
      x: Math.min(MAP_W - half - 8, Math.max(half + 8, x)),
      y: Math.min(MAP_H - 12, Math.max(22, y)),
    }));
    // 글자가 차지하는 가로 띠와 점 사이의 거리(가로는 글자 폭만큼 빼고 잰다)
    const clear = (s: { x: number; y: number }) =>
      Math.min(
        ...pts.map((p) => Math.hypot(Math.max(0, Math.abs(p.x - s.x) - half), p.y - s.y + 5)),
        ...taken.map((t) => Math.hypot(Math.max(0, Math.abs(t.x - s.x) - half - t.w), (t.y - s.y) * 2)),
      );
    const best = spots.reduce((a, b) => (clear(b) > clear(a) ? b : a));
    taken.push({ ...best, w: half });
    // half: 이름표의 반 폭, hue: 그 책의 색(이름표 앞의 색 점)
    return { name: g.series, x: Math.round(best.x), y: Math.round(best.y), half, hue: cloth.get(g.posts[0].id)! };
  });

  return {
    nodes,
    labels,
    edges: edges.map((e) => ({ from: e.from, to: e.to, type: e.type })),
    edgeCount: edges.length,
  };
}
