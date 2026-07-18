/**
 * 용어집 수집 규칙 — 빌드타임(glossary.ts)과 클라이언트(/write 발행 화면)가
 * 같은 판정을 쓰도록 뽑아 둔 순수 모듈. astro·node 의존성이 없어 브라우저 번들에도
 * 그대로 들어간다. 코드 펜스 제거는 호출부에서 md-text.ts의 splitCode로 먼저 걷어 낸다.
 */

// **용어**(풀이). 풀이는 2~80자, 용어는 1~30자.
// 상한은 실측 기반 — 작성자 B규칙 풀이가 실제로 31~64자에 이르러(블록 32자·Dynamic Table 64자),
// 옛 상한 30자가 정성 들인 풀이일수록 사전에서 조용히 빠뜨리고 있었다.
export const PATTERN = /\*\*([^*\n]{1,30})\*\*\(([^)\n]{2,80})\)/g;

// 긁어 온 용어·뜻에서 마크다운 잔재를 걷는다 — 뜻 안의 **강조** 마커, TARGET\_LAG 같은
// 이스케이프 백슬래시. 안 걷으면 사전에 별표가 그대로 노출되고, 하버카드는 렌더된
// 본문 텍스트(이스케이프 해제됨)와 정확 일치가 깨져 못 붙는다.
export const stripMd = (s: string): string => s.replace(/\*\*|\*/g, '').replace(/\\(?=[\\`*_{}[\]()#+\-.!~])/g, '');

// 정의가 아닌 풀이(인용·'또는…'로 이어지는 문장 조각·출처 표기)를 거른다.
export function isDefinition(gloss: string): boolean {
  if (/^["'“”‘’]/.test(gloss)) return false; // 따옴표 인용
  if (/^(또는|즉|예:|예 |by )/.test(gloss)) return false; // 문장 이어짐·출처 표기
  return true;
}

// 괄호 안이 '영어 원어'(public IP)나 짧은 음차(미라이)가 아니라
// 실제 한국어 뜻풀이인지 가린다. 한글이 있으면서, 띄어쓰기가 있거나(구·문장)
// 6자 이상이어야 뜻으로 인정 — 방문자가 읽고 뜻을 알 수 있는 것만 남긴다.
export function isKoreanDef(gloss: string): boolean {
  if (!/[가-힣]/.test(gloss)) return false; // 한글이 하나도 없으면 영어 원어
  return /\s/.test(gloss) || gloss.length >= 6; // 짧은 음차(미라이) 제외
}

/**
 * 산문에서 용어·뜻 쌍을 긁는다. 같은 용어는 처음 것만 남기고(중복 term 제거),
 * isDefinition·isKoreanDef를 통과한 것만 돌려준다. 제외 목록(glossary.json)은
 * 이 함수 밖에서 얹는다 — /write는 감지된 것을 모두 보여 주고 거기서 빼야 하기 때문.
 */
export function scanGlossaryTerms(prose: string): { term: string; gloss: string }[] {
  const seen = new Set<string>();
  const out: { term: string; gloss: string }[] = [];
  // matchAll은 정규식을 내부 복제해 쓰므로 전역 PATTERN의 lastIndex를 건드리지 않는다(공유 안전).
  for (const m of prose.matchAll(PATTERN)) {
    const term = stripMd(m[1].trim());
    const gloss = stripMd(m[2].trim());
    if (seen.has(term)) continue;
    if (!isDefinition(gloss) || !isKoreanDef(gloss)) continue;
    seen.add(term);
    out.push({ term, gloss });
  }
  return out;
}
