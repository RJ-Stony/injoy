---
title: "이 블로그에 글 쓰는 법"
description: "마크다운 파일 하나 추가가 곧 발행 — Injoy의 글쓰기 워크플로우 사용 설명서."
pubDate: 2026-06-09
category: "개발"
tags: ["astro", "markdown", "blog"]
draft: false
---

이 블로그의 글쓰기 워크플로우는 한 문장으로 요약된다.

> `src/content/posts/`에 마크다운 파일을 하나 추가하면, 그게 곧 발행이다.

빌드 설정을 건드릴 필요도, 어디에 등록할 필요도 없다. 이 글은 그 과정을 단계별로
설명하는 사용 설명서다. 미래의 내가 잊었을 때 다시 읽기 위해 쓴다.

## 1. 파일 만들기

`src/content/posts/` 폴더에 `.md` 파일을 만든다. **파일명이 곧 주소(slug)가 된다.**

```text
src/content/posts/my-first-post.md  →  /posts/my-first-post/
```

한글 파일명도 동작은 하지만, URL이 길게 인코딩되므로 영문 소문자와 하이픈을 권장한다.
컴포넌트를 본문에 넣고 싶다면 `.mdx` 확장자를 쓰면 된다.

직접 만들기 귀찮다면 스캐폴드 명령 한 줄로 시작할 수 있다.

```bash
npm run new -- my-first-post "첫 글입니다"
```

frontmatter가 채워진 파일이 `draft: true` 상태로 생성된다. 초안을 다듬은 뒤
`draft: false`로 바꾸면 발행된다.

## 2. frontmatter 채우기

파일 맨 위에 글의 메타 정보를 적는다. `---` 사이의 영역이 frontmatter다.

```yaml
---
title: "글 제목"
description: "목록·검색·공유 미리보기에 쓰이는 한 줄 요약"
pubDate: 2026-06-10
category: "개발"
tags: ["astro", "blog"]
draft: false
---
```

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| `title` | ✅ | 글 제목 |
| `description` | ✅ | 한 줄 요약. 홈 카드와 OG 태그에 쓰인다 |
| `pubDate` | ✅ | 발행일 (`YYYY-MM-DD`) |
| `category` | ✅ | 카테고리 라벨 (예: 개발, 회고, 데이터) |
| `tags` | — | 태그 배열. `/tags/태그명/` 페이지가 자동 생성된다 |
| `draft` | — | `true`면 프로덕션 빌드에서 제외 (기본값 `false`) |
| `cover` | — | 대표 이미지 경로 |

스키마는 `src/content.config.ts`에 zod로 정의되어 있어서, 필수 필드가 빠지면
빌드가 친절한 에러와 함께 실패한다. 오타가 배포되는 일은 없다.

## 3. 본문 쓰기

frontmatter 아래부터는 노션에서 쓰듯 마크다운으로 쓰면 된다. 제목(`##`), 목록, 인용,
표, 체크박스 같은 GFM 문법에 더해 콜아웃(`> [!NOTE]`), 각주(`[^1]`),
코드 줄 강조·diff 표기(`// [!code highlight]`)까지 지원한다. 어떻게 보이는지는
[마크다운 스타일 가이드](/posts/markdown-styleguide/)에서 확인할 수 있다.

코드블록은 언어를 지정하면 자동으로 하이라이트되고, 복사 버튼이 붙는다.

```js
// 언어를 지정하면 이렇게 하이라이트된다
const greet = (name) => `안녕하세요, ${name}님!`;
console.log(greet('Injoy'));
```

`##`(h2)와 `###`(h3) 제목은 글 상단의 목차에 자동으로 수집되므로, 글의 뼈대를
제목으로 먼저 잡고 살을 붙이면 목차가 공짜로 생긴다.

## 4. 초안은 draft로

아직 공개하고 싶지 않은 글은 frontmatter에 `draft: true`를 넣는다.

```yaml
draft: true   # 프로덕션 빌드에서 제외된다
```

`npm run dev`로 띄운 로컬 미리보기에서는 보이지만, `npm run build`로 만든 배포본에는
포함되지 않는다. 글을 다듬는 동안 커밋해 두어도 안전하다.

## 5. 확인하고 발행하기

```bash
npm run dev       # http://localhost:4321 에서 미리보기
npm run build     # 프로덕션 빌드
npm run preview   # 빌드 결과 확인
```

로컬에서 확인했다면 커밋하고 푸시한다. Vercel이나 GitHub Pages에 연결되어 있다면
푸시가 곧 배포다. RSS(`/rss.xml`)와 사이트맵도 빌드할 때마다 자동으로 갱신되므로
따로 신경 쓸 것이 없다.

---

요약하면 이렇다. **파일 하나, frontmatter 일곱 줄, 그리고 푸시.** 글쓰기를 가로막는
마찰을 줄이는 데 이 블로그 구조의 거의 전부를 걸었다. 이제 쓰는 일만 남았다.
