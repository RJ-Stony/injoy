# AGENTS.md — Injoy 위키 유지 가이드 (LLM용)

이 파일은 Injoy를 집필·연결·정리하는 LLM 에이전트(Claude Code 등)를 위한 계약이다.
사람용 사용 설명은 [README.md](README.md), 결정의 '왜'는 [DECISIONS.md](DECISIONS.md)에 있다.
이 문서는 **어떻게 유지하는가**만 다룬다.

## Injoy는 무엇인가

Astro 5 정적 블로그이자, **사람이 소싱하고 LLM이 집필·연결·정리하는 타입 있는 지식 그래프**다.
글은 쌓이기만 하지 않고 서로 연결된다. 다른 블로그와 구분되는 핵심이 이 그래프이므로,
글을 더할 때는 늘 "이 글이 기존 글과 어떻게 연결되는가"를 함께 생각한다.

## 멘탈 모델 (3계층)

- **글(synthesis 단위)** — `src/content/posts/*.md`. 파일 추가 = 발행. frontmatter는
  `src/content.config.ts`의 zod 스키마로 검증된다(필수 필드 빠지면 빌드 실패).
- **연결(명시)** — `src/data/edges.json`. 타입 있는 엣지. 본문의 `[[위키링크]]`는 자동으로
  '언급(mentions)' 연결이 된다.
- **단일 출처** — `src/utils/graph.ts`. 엣지 타입 정의(`EDGE_TYPES`)·그래프 구성·연결 계산이
  전부 여기서 나온다. 타입 기준(criteria)을 다른 문서에 다시 쓰지 말고 이 파일을 참조하라.

## 글쓰기 관습 (엄수)

- **목소리** — 절제된 1인칭 평서문("~다/~한다"). 기존 글(`welcome`·`how-to-write`·
  `markdown-styleguide`·`slash-menu`·`wysiwyg-editor`)의 톤을 따른다. 말투의 단일 기록처는
  숨은 `/voice` 노트(`src/pages/voice.astro` — 미게시·noindex, about 맨 아래 🌱로만 닿는다).
  글이 늘거나 고쳐지면 이 노트를 함께 손봐 말투를 한 결로 유지한다.
- **카피 규칙** — 엠 대시(—)를 쓰지 않는다(쉼표·괄호·마침표로 푼다). 영문 용어는 한국어로
  풀어 쓴다. 토스급 간결·정확이 기준이다.
- **윤문** — 새 글이나 다듬을 글은 `/humanize-korean` 스킬로 AI 티를 제거한 뒤 발행한다.
- **커밋** — 의미 단위 한국어 메시지. `Co-Authored-By: Claude` 푸터를 **절대 붙이지 않는다**.
  `main`에 직접 커밋·푸시하면 GitHub Actions가 자동 배포한다.

## 연산

### 1. 집필 (새 글)

1. `src/content/posts/<slug>.md`를 만든다. slug는 영문 소문자·하이픈 권장. frontmatter 필수는
   `title`·`description`·`pubDate`·`category`(선택: `tags`·`cover`·`draft`·`updatedDate`).
2. 본문에서 관련 기존 글을 `[[slug]]` 위키링크로 자연스럽게 잇는다(자동 '언급' 연결 생성).
3. 더 강한 관계는 아래 '연결'로 명시한다.

### 2. 연결 (그래프)

- **두 글 사이 연결은 하나면 충분하다**(방향·타입 무관). 같은 쌍에 중복 엣지를 만들지 말 것.
- 타입 선택은 `EDGE_TYPES`의 `criteria`를 그대로 따른다(`src/utils/graph.ts`). 여기에 기준을
  다시 적지 않는다 — 단일 출처를 지킨다.
- 위키링크 '언급'은 명시 연결이 생기면 자동으로 생략된다. 약한 언급을 명시 타입으로
  '승격'하려면 `edges.json`에 엣지를 추가하면 된다.
- 모든 명시 엣지에는 `note`(왜 이 둘이 이 타입으로 연결되는가)를 한 줄 단다. 독자 화면의
  '연결된 글'과 `/graph`에 그대로 노출되므로, 빈 note를 남기지 않는다.
- 없는 슬러그를 가리키면 **빌드가 실패**한다(끊어진 연결 방지). 글을 지우면 그 글을 가리키던
  엣지도 함께 정리한다.

### 3. 점검 (lint)

- 발행 후·주기적으로 그래프 건강을 본다: 고아 글(연결 0), 누락된 교차참조(태그·주제가
  겹치는데 연결 없음), 낡은 주장(후속 글이 `contradicts`·`refines`), `note` 빠진 엣지,
  일방 '언급'의 명시 승격 후보.
- `contradicts`(반박)를 발견하면 **양쪽 글 모두**에 맥락을 남긴다.
- 자동 수정은 자명한 것만. 판단이 필요한 건 사람에게 묻는다.

## 검증 (발행 전 필수)

- `npm run build` → `bash scripts/verify.sh`(ALL PASS 기대) → 브라우저 미리보기로 관찰
  가능한 변경을 직접 실증한다(추측으로 "됐다" 하지 않는다).
- 데이터 정합성 코드(에디터·round-trip·그래프)는 **적대적 리뷰**로 검증한다(이 레포의 관습).

## 에디터 주의

- `/write` 본문 = Milkdown WYSIWYG. 숨은 `#fm-body` textarea가 발행·점검의 진실원이다.
- `normalizeMarkdown()`은 콜아웃·위키링크 직렬화를 복원하되 **코드펜스·인라인 코드는
  건드리지 않는다**(이걸 어기면 코드가 손상된다).
- JS로 만든 DOM엔 Astro 스코프 CSS가 적용되지 않는다 → `is:global` + `.write-root`/`.injoy-md`
  프리픽스를 쓴다.
