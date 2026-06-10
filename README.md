# Injoy

마크다운 파일 하나 추가만으로 글이 발행되는 정적 블로그입니다.
[Astro](https://astro.build) 기반이며, 순백 배경·큰 본문 타이포·절제된 블루 포인트의
정갈한 디자인을 지향합니다.

## 빠른 시작

```bash
npm install
npm run dev      # http://localhost:4321
```

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 로컬 개발 서버 (draft 글도 보임) |
| `npm run build` | 프로덕션 빌드 → `dist/` |
| `npm run preview` | 빌드 결과를 로컬에서 확인 |
| `bash scripts/verify.sh` | 빌드·산출물·발행 워크플로우 자체 점검 |

Node 18 이상이 필요합니다.

## 글 쓰는 법 ✍️

**`src/content/posts/`에 `.md` 파일을 추가하면 그게 곧 발행입니다.** 빌드 설정을
수정하거나 어딘가에 등록할 필요가 없습니다.

### 1. 파일 만들기

```text
src/content/posts/my-first-post.md  →  https://내도메인/posts/my-first-post/
```

- **파일명이 곧 주소(slug)** 가 됩니다. 영문 소문자와 하이픈을 권장합니다.
  (한글 파일명도 동작하지만 URL이 길게 인코딩됩니다.)
- 본문에 컴포넌트를 넣고 싶으면 `.mdx` 확장자를 쓰면 됩니다.

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

- GFM 문법: 표, 체크박스(`- [ ]`), 취소선(`~~`)
- 코드블록: 언어를 지정하면 Shiki 하이라이트 + 복사 버튼 (라이트/다크 자동 전환)
- `##`/`###` 제목은 글 상단 목차에 자동 수집
- 이미지: `![alt](./image.png)` — `alt`를 꼭 적어 주세요

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

### 공통: `site` 값 교체

배포 전에 [astro.config.mjs](astro.config.mjs)의 `site`를 실제 도메인으로 바꿔 주세요.
RSS·사이트맵·canonical URL이 이 값을 사용합니다.

```js
export default defineConfig({
  site: 'https://your-domain.com',  // ← placeholder(injoy.example.com)를 교체
  // ...
});
```

### 방법 1 — Vercel (권장, 가장 간단)

1. 레포를 GitHub에 푸시합니다.
2. [vercel.com](https://vercel.com)에서 **Add New → Project** 로 레포를 연결합니다.
3. 프레임워크가 **Astro로 자동 인식**됩니다. 설정 변경 없이 **Deploy**를 누르면 끝.
4. 이후에는 `main` 브랜치에 푸시할 때마다 자동 배포됩니다.

### 방법 2 — GitHub Pages

1. `https://<유저명>.github.io/<레포명>` 으로 배포한다면 `astro.config.mjs`에
   `site`와 `base`를 설정합니다.

   ```js
   export default defineConfig({
     site: 'https://<유저명>.github.io',
     base: '/<레포명>',
     // ...
   });
   ```

   사용자 페이지(`<유저명>.github.io` 레포)라면 `base`는 필요 없습니다.

2. `.github/workflows/deploy.yml`을 추가합니다.

   ```yaml
   name: Deploy to GitHub Pages

   on:
     push:
       branches: [main]
     workflow_dispatch:

   permissions:
     contents: read
     pages: write
     id-token: write

   jobs:
     build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: withastro/action@v3
     deploy:
       needs: build
       runs-on: ubuntu-latest
       environment:
         name: github-pages
         url: ${{ steps.deployment.outputs.page_url }}
       steps:
         - id: deployment
           uses: actions/deploy-pages@v4
   ```

3. 레포 **Settings → Pages → Source**를 **GitHub Actions**로 바꿉니다.
4. `main`에 푸시하면 자동으로 빌드·배포됩니다.

## 프로젝트 구조

```text
src/
├── content/posts/      ← 글은 여기에 (.md 추가 = 발행)
├── content.config.ts   ← frontmatter 스키마 (zod)
├── layouts/            ← BaseLayout, MarkdownPage
├── components/         ← PostCard, PostMeta, TableOfContents
├── pages/              ← 홈, 글 상세, about, 태그, rss.xml
├── styles/global.css   ← 디자인 토큰·본문 스타일
└── utils/post.ts       ← 글 목록·읽는 시간·날짜 유틸
scripts/verify.sh       ← 자체 점검 스크립트
```

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
