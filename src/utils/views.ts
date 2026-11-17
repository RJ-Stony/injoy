import baseline from '../data/view-baseline.json';
import { getLifetime } from './ga';

/**
 * 꼬리말의 방문 수와 글의 조회 수 — 예전 계수기에 쌓였던 값(view-baseline.json, 옮긴 날에 한 번 적어 둔 것)에
 * 그 뒤로 GA4가 센 값을 더한다. 빌드할 때 계산하므로 화면에는 숫자가 처음부터 박혀 있다(하루에 한 번 갱신).
 * GA4에서 받지 못하면 적어 둔 값만 보여 준다.
 */
export async function getViews() {
  const life = await getLifetime();
  const before = baseline.posts as Record<string, number>;
  return {
    site: baseline.site + (life?.sessions ?? 0),
    post: (slug: string) => (before[slug] ?? 0) + (life?.views.get(slug) ?? 0),
  };
}
