import { getPublishedPosts } from './post';
import { splitCode } from './md-text';

/**
 * 용어집 — 본문의 voice B규칙(`**용어**(풀이)`, 전문 용어 첫 등장에 짧은 풀이)을
 * 빌드타임에 긁어 모은 온톨로지. voice 규칙이 이미 구조화된 데이터라 공짜로 얻는다.
 * 코드 블록·인라인 코드는 splitCode로 걷어 낸 뒤 산문에서만 찾는다.
 */
export interface GlossaryEntry {
  term: string;
  gloss: string;
  /** 이 용어를 풀이한 글들(가장 최근 글이 앞) */
  sources: { slug: string; title: string }[];
}

// **용어**(풀이). 풀이는 2~30자, 용어는 1~24자.
const PATTERN = /\*\*([^*\n]{1,24})\*\*\(([^)\n]{2,30})\)/g;

// 풀이가 아니라 문장 조각인 것들(수동 제외 — 오탐 최소화, 작성자가 늘려도 됨).
const EXCLUDE_TERMS = new Set([
  '생성자는 private',
  '지어낸 기능',
  '이미 정해진 제약',
  '시스템 전역 동작 조정', // 용어가 아니라 문장 조각
  '공유 자원 관리', // 뜻이 아니라 예시 나열
  '상태 관리', // 뜻이 아니라 예시 나열
]);

// 정의가 아닌 풀이(인용·'또는…'로 이어지는 문장 조각·출처 표기)를 거른다.
function isDefinition(gloss: string): boolean {
  if (/^["'“”‘’]/.test(gloss)) return false; // 따옴표 인용
  if (/^(또는|즉|예:|예 |by )/.test(gloss)) return false; // 문장 이어짐·출처 표기
  return true;
}

// 괄호 안이 '영어 원어'(public IP)나 짧은 음차(미라이)가 아니라
// 실제 한국어 뜻풀이인지 가린다. 한글이 있으면서, 띄어쓰기가 있거나(구·문장)
// 6자 이상이어야 뜻으로 인정 — 방문자가 읽고 뜻을 알 수 있는 것만 남긴다.
function isKoreanDef(gloss: string): boolean {
  if (!/[가-힣]/.test(gloss)) return false; // 한글이 하나도 없으면 영어 원어
  return /\s/.test(gloss) || gloss.length >= 6; // 짧은 음차(미라이) 제외
}

/** 용어 → 앵커 id. 용어집 페이지와 하버카드 링크가 같은 값을 써야 한다. */
export const termSlug = (t: string): string =>
  t.replace(/[^a-zA-Z0-9가-힣]+/g, '-').replace(/^-|-$/g, '');

export async function getGlossary(): Promise<GlossaryEntry[]> {
  const posts = await getPublishedPosts(); // 최신순
  const map = new Map<string, GlossaryEntry>();
  for (const post of posts) {
    const { prose } = splitCode(post.body);
    for (const m of prose.matchAll(PATTERN)) {
      const term = m[1].trim();
      const gloss = m[2].trim();
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
  return [...map.values()].sort((a, b) => a.term.localeCompare(b.term, 'ko'));
}
