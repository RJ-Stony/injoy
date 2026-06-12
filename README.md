# Injoy

마크다운 파일 하나 추가만으로 글이 발행되는 정적 블로그입니다.
[Astro](https://astro.build) 기반이며, 순백 배경·큰 본문 타이포·절제된 블루 포인트의
정갈한 디자인을 지향합니다.

**라이브:** https://rj-stony.github.io/injoy/ (GitHub Pages, `main` 푸시마다 자동 배포)

주요 기능

- **블로그 안에서 글쓰기·발행(CRUD)** — 내 브라우저에만 보이는 **글쓰기** 버튼 →
  마크다운 에디터에서 쓰고 **발행** 버튼 한 번이면 lint 점검·연결 제안을 거쳐
  GitHub에 커밋되고 자동 배포 (방문자에겐 버튼도 권한도 없음)
- 마크다운 파일 추가 = 발행 (frontmatter는 zod로 검증)
- 마크다운 풀세트: GFM(표·체크리스트), 콜아웃, 각주, **수식(KaTeX)**,
  **다이어그램(Mermaid)**, 이모지 숏코드(Tossface), 이미지 캡션, 코드 줄 강조/diff
- 라이트/다크 자동(시스템) + 헤더 토글로 수동 전환
- 난이도 반영 읽기 시간(코드·수식·다이어그램 가중), 글별 조회수·전체 방문 수
- 카드 썸네일(cover), 이전/다음 글 내비게이션, 태그 페이지
- **지식 그래프** — `[[위키링크]]`와 타입 있는 연결(확장·뒷받침·반박 등)로 글을 잇고,
  `/graph/`에서 연결 지도를 한눈에 (글 하단에 "연결된 글" 자동 표시)
- 자동 목차 — 좁은 화면은 본문 상단 카드, 와이드 화면은 우측 sticky 사이드바
- RSS·사이트맵·robots.txt 자동, 반응형(360px~)·접근성 기본기, 고정 헤더

## 빠른 시작

```bash
npm install
npm run write    # 블로그 + 글쓰기 에디터가 함께 열림
```

| 명령 | 설명 |
| --- | --- |
| `npm run write` | **글쓰기 모드** — dev 서버 + 에디터(`/admin/`) 동시 실행 |
| `npm run dev` | 로컬 개발 서버만 (draft 글도 보임) |
| `npm run new -- <slug> "제목"` | 새 글 스캐폴드 (draft 상태로 생성) |
| `npm run build` | 프로덕션 빌드 → `dist/` |
| `npm run preview` | 빌드 결과를 로컬에서 확인 |
| `bash scripts/verify.sh` | 빌드·산출물·발행 워크플로우 자체 점검 |

Node 18 이상이 필요합니다.

## 글 쓰는 법 ✍️

### 방법 1 — 블로그에서 바로 쓰기 (권장)

배포된 블로그의 **글쓰기** 버튼(또는 `/write/`)을 누르면 에디터가 열립니다.

- **새 글 작성 · 기존 글 수정 · 삭제** 전부 브라우저에서 — 제목·요약·카테고리·태그·
  대표 이미지(썸네일)·초안 여부를 폼으로, 본문은 마크다운으로(우측 간략 미리보기).
- **발행 버튼 한 번이면 끝**: 점검(lint — 필수 필드·슬러그·위키링크 대상·이미지 alt 등)
  → GitHub에 커밋(이미지·연결 포함 단일 커밋) → Actions가 자동 배포 → 완료되면
  글 링크가 떠요. 1~2분이면 라이브에 반영됩니다.
- **연결 제안**: 쓰고 있는 글과 비슷한 기존 글을 자동으로 찾아 제안하고, 수락하면
  발행 커밋에 그래프 연결(edges.json)이 함께 기록됩니다. 글을 지우면 그 글을
  가리키던 연결도 자동으로 정리됩니다.

**처음 한 번 — 발행 토큰 설정**

1. [GitHub fine-grained 토큰 만들기](https://github.com/settings/personal-access-tokens/new)
   — Repository access를 `RJ-Stony/injoy`로 제한, Permissions는 `Contents: Read and write`만.
2. `/write/`에 붙여넣고 "이 기기에 저장".

> [!IMPORTANT]
> **나만 쓸 수 있는 이유**: `/write/` 페이지는 빈 정적 HTML일 뿐이고, 모든 권한은
> 내 브라우저 localStorage의 토큰에서 나옵니다. 토큰이 없는 방문자에겐 글쓰기 버튼
> 자체가 보이지 않고, 페이지를 직접 열어도 아무것도 할 수 없습니다.
> 토큰은 GitHub API 호출 외엔 어디로도 전송되지 않습니다. 공용 PC에서는 저장하지
> 마시고, 필요하면 페이지 하단 "토큰 지우기"로 제거하세요.

### 방법 2 — 로컬 CMS

```bash
npm run write   # dev 서버 + Decap 에디터(/admin/) — 인터넷 없이도 동작
```

저장하면 로컬 파일로 기록되고, 커밋·푸시하면 발행됩니다.
(`/admin/`은 프로덕션 빌드에서 제거되어 배포본에 존재하지 않습니다.)

### 방법 3 — 파일로 직접 쓰기

```bash
npm run new -- my-first-post "첫 글입니다"   # 스캐폴드 한 줄로 시작
```

또는 `src/content/posts/`에 `.md` 파일을 직접 만들어도 됩니다.

```text
src/content/posts/my-first-post.md  →  https://rj-stony.github.io/injoy/posts/my-first-post/
```

- **파일명이 곧 주소(slug)** 가 됩니다. 영문 소문자와 하이픈을 권장합니다.
  (한글 파일명도 동작하지만 URL이 길게 인코딩됩니다.)
- 본문에 컴포넌트를 넣고 싶으면 `.mdx` 확장자를 쓰면 됩니다.
- `npm run new`로 만든 글은 `draft: true` 상태라 dev에서만 보입니다.
  발행할 때 `draft: false`로 바꾸세요.

### 2. frontmatter 작성

파일 맨 위 `---` 사이에 글 정보를 적습니다.

```yaml
---
title: "글 제목"
description: "목록·메타·OG에 쓰는 한 줄 요약"
pubDate: 2026-06-10
category: "개발"          # 자유 문자열 (예: 개발, 회고, 데이터)
tags: ["astro", "blog"]   # 선택
draft: false              # true면 프로덕션 빌드에서 제외
cover: "./cover.png"      # 선택, 대표 이미지
---

여기부터 마크다운 본문. 제목(##), 목록, 코드블록, 인용, 표, 이미지 모두 지원.
```

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| `title` | ✅ | 글 제목 |
| `description` | ✅ | 한 줄 요약 — 홈 카드, meta description, OG 태그에 쓰임 |
| `pubDate` | ✅ | 발행일 `YYYY-MM-DD` |
| `category` | ✅ | 카테고리 라벨 (메타 라인에 표시) |
| `tags` | 선택 | 태그 배열 — `/tags/태그명/` 페이지 자동 생성 |
| `draft` | 선택 | `true`면 프로덕션 빌드에서 제외 (기본 `false`) |
| `cover` | 선택 | 대표 이미지 (글 파일 기준 상대 경로) |

스키마는 [src/content.config.ts](src/content.config.ts)에 zod로 정의되어 있어,
필수 필드가 빠지면 빌드가 명확한 에러로 실패합니다.

### 3. draft로 초안 관리

```yaml
draft: true
```

- `npm run dev` 미리보기에는 **보입니다** (초안 확인용).
- `npm run build` 배포본에서는 **제외됩니다.** 안심하고 커밋해 두세요.

### 4. 본문에서 쓸 수 있는 것

- GFM 문법: 표, 체크박스(`- [ ]`), 취소선(`~~`), 자동 링크
- 콜아웃: `> [!NOTE]` `[!TIP]` `[!IMPORTANT]` `[!WARNING]` `[!CAUTION]` (한국어 라벨로 렌더)
- 각주: 본문에 `[^1]`, 아무 곳에나 `[^1]: 내용`
- 수식: 인라인 `$E=mc^2$`, 블록 `$$ ... $$` (KaTeX)
- 다이어그램: ```` ```mermaid ```` 코드블록 (플로차트·시퀀스 등, 다크 테마 연동)
- 이모지: `:rocket:` 숏코드 → 🚀 (모든 이모지가 Tossface 글꼴로 표시)
- 코드블록: 언어를 지정하면 Shiki 하이라이트 + 복사 버튼 (라이트/다크 자동 전환)
  - 줄 끝에 `// [!code highlight]` `// [!code ++]` `// [!code --]`로 줄 강조·diff 표기
- `##`/`###` 제목은 목차에 자동 수집 (와이드 화면에선 우측 sticky 사이드바)
- 이미지: `![alt](../../assets/image.png)` — 글 기준 상대 경로면 자동 최적화 + lazy 로딩.
  경로 뒤 `"따옴표"` 텍스트는 캡션이 됩니다. `alt`를 꼭 적어 주세요

샘플은 발행되어 있는 세 글
([welcome](src/content/posts/welcome.md),
[how-to-write](src/content/posts/how-to-write.md),
[markdown-styleguide](src/content/posts/markdown-styleguide.md))을 참고하세요.

## 빌드와 확인

```bash
npm run build     # dist/ 에 정적 산출물 생성
npm run preview   # 빌드 결과를 로컬에서 확인
```

RSS(`/rss.xml`)와 사이트맵(`/sitemap-index.xml`)은 빌드할 때마다 자동 생성됩니다.

## 배포

### 현재 상태 — GitHub Pages (운영 중)

이 레포는 이미 GitHub Pages로 배포되어 있습니다.

- **주소:** https://rj-stony.github.io/injoy/
- **방식:** [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
  (`withastro/action@v6` + `actions/deploy-pages@v4`)이 `main` 푸시마다 빌드·배포
- **설정:** 레포 Settings → Pages → Source = GitHub Actions (이미 설정됨)

즉, **글을 커밋하고 `main`에 푸시하면 그게 곧 배포**입니다.

### 도메인을 바꾸려면

배포 주소는 [astro.config.mjs](astro.config.mjs) 상단의 상수 두 개가 결정합니다.

```js
const SITE = 'https://rj-stony.github.io'; // 배포 도메인
const BASE = '/injoy';                     // 하위 경로 (루트 배포면 '/')
```

- **다른 GitHub Pages 레포**: `SITE`/`BASE`를 새 주소에 맞게 수정
- **사용자 페이지(`<유저명>.github.io` 레포)나 커스텀 도메인**: `SITE`만 바꾸고 `BASE = '/'`
- RSS·사이트맵·canonical·내부 링크가 전부 이 값을 따라가므로 다른 파일은 손댈 필요 없습니다.
  (컴포넌트는 `withBase()` 헬퍼, 마크다운 본문 링크는 `rehype-base-links` 플러그인이 처리)

### 다른 곳에 배포하려면 — Vercel

1. [vercel.com](https://vercel.com)에서 **Add New → Project**로 이 레포를 연결합니다.
2. 프레임워크가 **Astro로 자동 인식**됩니다. 그대로 **Deploy**.
3. `astro.config.mjs`에서 `SITE`를 Vercel 도메인으로 바꾸고 `BASE = '/'`로 수정합니다.
4. 이후 `main` 푸시마다 자동 배포됩니다. (GitHub Pages 워크플로가 같이 돌지 않게 하려면
   `.github/workflows/deploy.yml`을 삭제하세요.)

## 프로젝트 구조

```text
src/
├── content/posts/      ← 글은 여기에 (.md 추가 = 발행, _images/는 업로드 이미지)
├── content.config.ts   ← frontmatter 스키마 (zod)
├── assets/             ← 글에서 쓰는 이미지 (자동 최적화)
├── layouts/            ← BaseLayout, MarkdownPage
├── components/         ← PostCard, PostMeta, TableOfContents, ThemeToggle, ViewCount
├── pages/              ← 홈, 글 상세, about, 태그, rss.xml, 404
├── plugins/            ← rehype 플러그인 (표 래퍼, base 링크, 캡션, Tossface)
├── styles/global.css   ← 디자인 토큰·본문 스타일
└── utils/              ← 글 목록·읽는 시간·날짜·withBase
public/admin/           ← 글쓰기 에디터 (npm run write 전용, 배포 시 제거)
scripts/new-post.mjs    ← 새 글 스캐폴드 (npm run new)
scripts/verify.sh       ← 자체 점검 스크립트
.github/workflows/      ← GitHub Pages 자동 배포
```

## 글 연결과 그래프 🕸️

글은 쌓이기만 하지 않고 서로 연결됩니다. 연결하는 방법은 두 가지입니다.

### 본문에서 — `[[위키링크]]`

```text
구체적인 방법은 [[how-to-write]]에 정리해 두었다.
표시 텍스트를 바꾸려면: [[how-to-write|글쓰기 가이드]]
```

- 대상 글의 **제목이 자동으로** 링크 텍스트가 됩니다.
- 그래프에 **"언급" 연결**로 자동 수집되고, 양쪽 글 하단 "연결된 글"에 나타납니다.
- 존재하지 않는 슬러그면 빌드 로그에 경고가 남고 원문 그대로 표시됩니다.

### 명시적으로 — 타입 있는 연결

더 강한 관계는 [src/data/edges.json](src/data/edges.json)에 기록합니다.
글쓰기 화면(`npm run write`)의 **연결(그래프)** 메뉴에서 글을 검색해 고르고
관계 종류를 선택하면 됩니다.

| 타입 | 이름 | 이런 글일 때 골라요 |
| --- | --- | --- |
| `extends` | 확장 | 대상 글의 주장을 이어받아 한 걸음 더 나아간 글. "그 글의 다음 이야기" |
| `supports` | 뒷받침 | 대상 글의 주장에 근거·데이터·구현 경험을 보태는 글. "그 글이 맞다는 증거" |
| `refines` | 구체화 | 대상 글의 주장을 더 정밀하게 다듬은 글. "같은 주장의 더 날카로운 버전" |
| `instantiates` | 사례 | 대상 글의 일반 원칙이 실제 상황에 적용된 모습을 보여 주는 글 |
| `requires` | 선행 | 대상 글을 먼저 읽어야 이해되는 글. "읽기 전 준비물"인 관계 |
| `triggered-by` | 계기 | 대상 글에서 다룬 경험·사건이 이 글을 쓰게 된 출발점 |
| `contradicts` | 반박 | 대상 글의 주장에 동의하지 않거나 결론을 뒤집는 글 |
| `related` | 관련 | 어느 타입에도 딱 맞지 않지만 함께 읽으면 좋은 글. 마지막 선택지 |

같은 기준 문장이 `/write` 에디터의 "어떤 타입을 골라야 할까요?" 가이드와
`/graph`의 "연결 타입 안내"에 그대로 나오므로, 셋이 어긋날 일이 없습니다
(단일 출처: [src/utils/graph.ts](src/utils/graph.ts)의 `EDGE_TYPES`).

존재하지 않는 글을 가리키는 연결은 **빌드가 실패**하므로(에러에 문제 슬러그 명시),
끊어진 연결이 배포될 일이 없습니다.

### 보기 — `/graph/`

헤더의 **그래프** 메뉴에서 전체 연결 지도를 볼 수 있습니다. 노드를 끌어서 배치하고,
누르면 그 글로 이동합니다. 글 하단 "그래프에서 보기 →"는 해당 글에 포커스된
그래프(`/graph/?focus=슬러그`)를 엽니다. 라이트/다크, `prefers-reduced-motion`을
모두 따릅니다.

## 조회수에 대하여

글별 조회수와 전체 방문 수는 [Abacus](https://abacus.jasoncameron.dev)(무가입 카운터 API)로
집계합니다. 로컬 미리보기에서는 수치를 올리지 않으며, API가 응답하지 않으면 표시 자체가
조용히 생략되어 글 읽기에는 영향이 없습니다. 본격적인 방문 분석이 필요해지면
GoatCounter·Cloudflare Analytics 같은 도구로 교체하는 것을 권합니다.

## 폰트 라이선스 주의 ⚠️

이 블로그는 CDN으로 다음 폰트를 사용합니다. 모두 상업적 사용이 가능하지만,
**운영(특히 상업적 운영) 전에 각 공식 라이선스 페이지를 한 번 더 확인하는 것을 권장**합니다.

- **Wanted Sans** — [SIL OFL 1.1](https://github.com/wanteddev/wanted-sans?tab=OFL-1.1-1-ov-file).
  자유롭게 사용·수정·재배포할 수 있으나, **폰트 단독 판매와 라이선스 변경은 금지**됩니다.
- **Tossface** — 토스 공식 안내([toss.im/tossface](https://toss.im/tossface)) 참고.
  본문 전체가 아닌 이모지 글리프에만 부분 적용하고 있습니다(`.tossface` 클래스).
- **JetBrains Mono** — [SIL OFL 1.1](https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt).

## 의사결정 기록

구축 과정의 결정 사항과 근거는 [DECISIONS.md](DECISIONS.md)에 정리되어 있습니다.
