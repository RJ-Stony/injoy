import { getPublishedPosts } from './post';
import { splitCode } from './md-text';
import { PATTERN, isDefinition, isKoreanDef, stripMd } from './glossary-rules';
import glossaryData from '../data/glossary.json';

/**
 * 용어집 — 본문의 voice B규칙(`**용어**(풀이)`, 전문 용어 첫 등장에 짧은 풀이)을
 * 빌드타임에 긁어 모은 온톨로지. voice 규칙이 이미 구조화된 데이터라 공짜로 얻는다.
 * 코드 블록·인라인 코드는 splitCode로 걷어 낸 뒤 산문에서만 찾는다.
 *
 * 수집 규칙(PATTERN·isDefinition·isKoreanDef)은 glossary-rules에서 공유하고,
 * 제외 목록은 src/data/glossary.json으로 옮겨(작성자가 /write에서 관리) 빌드타임에 읽는다.
 */
export interface GlossaryEntry {
  term: string;
  gloss: string;
  /** 이 용어를 풀이한 글들(가장 최근 글이 앞) */
  sources: { slug: string; title: string }[];
}

// 풀이가 아니라 문장 조각인 것들(수동 제외 — 오탐 최소화). /write에서 작성자가 관리한다.
const EXCLUDE_TERMS = new Set<string>(glossaryData.exclude);

// 스캐너가 못 잡는 용어(이미지 캡션·일부만 굵게 한 구 등)를 작성자가 손수 얹는 목록.
// 자동 스캔과 같은 온톨로지에 합쳐지며, /write 용어 패널에서 CRUD한다(glossary.json에 저장).
interface ManualTerm { term: string; gloss: string; slug?: string }
const MANUAL_TERMS: ManualTerm[] = ((glossaryData as { manual?: ManualTerm[] }).manual ?? []);

/** 용어 → 앵커 id. 용어집 페이지와 하버카드 링크가 같은 값을 써야 한다. */
export const termSlug = (t: string): string =>
  t.replace(/[^a-zA-Z0-9가-힣]+/g, '-').replace(/^-|-$/g, '');

export async function getGlossary(): Promise<GlossaryEntry[]> {
  const posts = await getPublishedPosts(); // 최신순
  const map = new Map<string, GlossaryEntry>();
  for (const post of posts) {
    const { prose } = splitCode(post.body);
    for (const m of prose.matchAll(PATTERN)) {
      const term = stripMd(m[1].trim());
      const gloss = stripMd(m[2].trim());
      if (EXCLUDE_TERMS.has(term) || !isDefinition(gloss) || !isKoreanDef(gloss)) continue;
      const src = { slug: post.id, title: post.data.title };
      const existing = map.get(term);
      if (existing) {
        if (!existing.sources.some((s) => s.slug === src.slug)) existing.sources.push(src);
      } else {
        map.set(term, { term, gloss, sources: [src] });
      }
    }
  }
  // 수동 용어를 얹는다. 작성자가 직접 정한 뜻이라 isDefinition/isKoreanDef 검사는 건너뛰고,
  // 이미 자동으로 잡힌 용어면 뜻을 작성자 값으로 덮되(명시적 의도 우선) 출처는 합친다.
  const titleBySlug = new Map(posts.map((p) => [p.id, p.data.title] as const));
  for (const { term, gloss, slug } of MANUAL_TERMS) {
    if (!term?.trim() || !gloss?.trim() || EXCLUDE_TERMS.has(term)) continue;
    const src = slug && titleBySlug.has(slug) ? { slug, title: titleBySlug.get(slug)! } : null;
    const existing = map.get(term);
    if (existing) {
      existing.gloss = gloss;
      if (src && !existing.sources.some((s) => s.slug === src.slug)) existing.sources.push(src);
    } else {
      map.set(term, { term, gloss, sources: src ? [src] : [] });
    }
  }
  return [...map.values()].sort((a, b) => a.term.localeCompare(b.term, 'ko'));
}
