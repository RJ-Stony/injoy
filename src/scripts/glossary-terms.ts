/**
 * 용어 하버카드(C8) — 본문에 굵게(**...**) 쓴 텍스트가 용어집 용어와 정확히 일치하면
 * 링크로 감싸, 데스크톱은 hover로 풀이 툴팁(CSS)·모바일은 탭하면 용어집 항목으로 이동한다.
 * 임의 텍스트를 치환하지 않고 이미 굵게 강조된 것만 건드리므로 오탐·오손이 없다.
 * ponytail: 용어당 첫 등장 하나만 감싼다(도배 방지). 툴팁 위치는 화면 끝에서 살짝 넘칠 수 있다(짧은 풀이라 실사용상 무해).
 */
interface Term {
  term: string;
  gloss: string;
  url: string;
}

export async function initGlossaryTerms(): Promise<void> {
  const prose = document.querySelector('.prose');
  if (!prose) return;
  let data: Term[];
  try {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    const res = await fetch(`${base}/glossary.json`);
    if (!res.ok) return;
    data = await res.json();
  } catch {
    return;
  }
  const byTerm = new Map(data.map((d) => [d.term, d] as const));

  const seen = new Set<string>();
  for (const el of prose.querySelectorAll('strong')) {
    if (el.closest('a')) continue; // 이미 링크 안이면 건너뜀
    if (el.closest('h1, h2, h3, h4')) continue; // 제목 안 굵게는 감싸지 않음
    if (el.children.length) continue; // 순수 텍스트 굵게만
    const t = (el.textContent ?? '').trim();
    const entry = byTerm.get(t);
    if (!entry || seen.has(t)) continue;
    seen.add(t);
    const a = document.createElement('a');
    a.className = 'glossary-term';
    a.href = entry.url;
    a.dataset.gloss = entry.gloss;
    el.replaceWith(a);
    a.appendChild(el); // 굵기(strong)를 그대로 안에 품는다
  }
}
