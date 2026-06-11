# DECISIONS

스펙이 위임한 결정 사항과 근거를 한 줄씩 기록한다.

- **Wanted Sans `v1.0.3` 사용** — 스펙의 폴백 값은 v1.0.1이지만, jsDelivr API로 확인한 최신 안정 태그가 v1.0.3이고 해당 태그의 CSS 경로가 유효함을 확인했다. 스펙 규칙("더 높은 안정 태그가 있으면 우선")에 따름.
- **콘텐츠 설정 파일을 `src/content.config.ts`에 배치** — Astro 5 Content Layer API의 표준 위치. 스키마 내용(zod)은 스펙 6.2와 동일하며, glob 로더로 `src/content/posts/`의 md/mdx를 수집한다.
- **glob 패턴을 `**/*.{md,mdx}`로 지정** — Astro 기본 예시 패턴(`[^_]*`)은 언더스코어 파일을 제외하는데, verify.sh가 `__verify_tmp.md`의 발행을 검증하므로 언더스코어 파일도 포함되도록 했다.
- **draft 필터는 프로덕션 빌드에서만 적용** — `npm run dev`에서는 draft 글을 미리볼 수 있고, `npm run build`에서는 제외된다(스펙 6.2 "draft: true 면 빌드에서 제외" 충족).
- **Shiki 듀얼 테마 `github-light` / `github-dark`** — 절제된 팔레트로 스펙의 미학과 맞고, prefers-color-scheme에 따라 CSS 변수로 전환된다. 코드블록 배경은 토큰 `--code-bg`로 통일.
- **태그 페이지(`/tags/[tag]`) 포함** — 스펙 5장의 선택 항목이지만 구현 비용이 낮고 글 footer의 태그 링크와 자연스럽게 이어져 포함했다.
- **404 페이지 추가** — 스펙 외 항목이지만 정적 호스팅 배포 시 기본 품질에 해당하는 한 페이지짜리 추가라 포함했다.
- **읽는 시간은 `reading-time`으로 빌드 시 계산** — CJK 글자 수를 반영하는 라이브러리. 최소 1분, 올림 처리.
- **날짜 표기는 `Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' })`** — "2026년 6월 10일" 형식. 빌드 시점에 정적으로 렌더되므로 런타임 의존 없음.
- **샘플 글 발행일을 2026-06-08 ~ 06-10으로 분산** — 홈 목록의 최신순 정렬이 눈에 보이도록.

리뷰(적대적 검증) 후 반영한 수정:

- **표 가로 스크롤을 `table`의 `display: block` 대신 rehype 래퍼(`.table-wrap`)로 처리** — table에 비-table display를 주면 일부 브라우저 접근성 트리에서 표 시맨틱(행·셀 역할)이 제거되어 스크린리더 표 탐색이 깨진다. `src/plugins/rehype-table-wrap.mjs`가 빌드 시 모든 마크다운 표를 스크롤 컨테이너로 감싼다.
- **verify.sh에 `trap` 정리 핸들러 추가** — 임시 검증 글 생성 후 빌드가 실패해도 `__verify_tmp.md`가 레포에 남아 다음 빌드에 발행되는 일이 없도록 EXIT 시 항상 삭제한다. 스펙 10장의 체크 항목·PASS 의미는 변경 없음.
- **frontmatter `cover` 필드를 실제 렌더링에 연결** — 스키마에만 존재하던 cover를 글 상세 상단 이미지(`astro:assets` Image)와 `og:image`/`twitter:card`(summary_large_image)로 연결했다. 임시 글로 빌드 검증 후 제거. 홈 카드 썸네일은 목록의 정갈함을 유지하기 위해 넣지 않았다.

2차 피드백(배포·토글·마크다운 확장·데스크톱·윤문) 반영분:

- **다크모드 수동 토글: 시스템 기본 + 명시 선택 우선** — 기본은 `prefers-color-scheme`을 따르고, 헤더 토글로 선택하면 `html[data-theme]`+localStorage가 우선한다. 첫 페인트 전 인라인 스크립트로 FOUC 방지, 토글 직후 0.25s 색 전환은 `prefers-reduced-motion`에서 비활성. 콜아웃·diff 색은 `light-dark()`로 처리해 시스템/수동 양쪽에 자동 반응(이를 위해 `color-scheme`을 테마별로 명시).
- **콜아웃은 `rehype-github-alerts`** — GitHub과 동일한 `> [!NOTE]` 문법, 한국어 라벨(참고/팁/중요/주의/경고)과 라인 아이콘 적용. 주의: 이 플러그인은 icon 옵션이 빈 문자열이면 변환을 통째로 건너뛴다(파싱 실패 시 null 반환) — 반드시 유효한 SVG를 넣어야 한다.
- **`@shikijs/transformers`는 3.23.0으로 고정** — Astro 5.18이 번들한 shiki 3.23.0과 메이저를 맞춰야 한다. 최신 4.x는 shiki 4용.
- **각주 라벨 한국어화 + 목차 누수 차단** — `remarkRehype.footnoteLabel: '각주'`, 자동 생성되는 `footnote-label` 헤딩은 TableOfContents에서 제외.
- **새 글 스캐폴드 `npm run new`** — slug 검증(영문 소문자·숫자·하이픈) 후 `draft: true`로 생성해 실수 발행을 방지.
- **데스크톱(≥1100px)은 우측 sticky 목차 사이드바** — 본문 680px 그리드 + 220px 레일. 그 미만은 기존 인라인 목차 카드. 같은 컴포넌트의 `variant`(box/rail)로 처리.
- **GitHub Pages 실배포: RJ-Stony/injoy** — `site=https://rj-stony.github.io`, `base=/injoy`. 컴포넌트 링크는 `withBase()`, 마크다운 본문 링크는 `rehype-base-links`(raw HTML의 href/src까지 처리)로 base를 일괄 적용. 데모 이미지는 `public/`에서 `src/assets`로 옮겨 Astro 이미지 파이프라인(자동 base·lazy·치수)을 태웠다. RSS 채널 링크에도 base 반영. 워크플로는 `withastro/action@v6`(릴리스 확인) + `actions/deploy-pages@v4`, Pages는 API로 build_type=workflow 활성화.
- **한국어 윤문(/humanize-korean v1.5, fast 모드)** — 글 4편 전수 점검. welcome·about은 "AI 티 임계 미달, 무수정"(A, 6/6), how-to-write·markdown-styleguide는 각 변경률 4%(연결어미 쉼표·번역투 목적절·결산 피벗 어휘 등 S1~S2만 치환, A, 6/6). frontmatter·코드·표·링크는 diff로 무변경 검수 후 반영.
- **시각 QA 실증** — 360/1440px × 라이트/다크(시스템·수동 모두), 토글 클릭, 콜아웃 5종, 사이드바 목차, 페이지 가로 오버플로 없음(코드블록 내부 스크롤만)을 preview 브라우저로 확인.

3차 피드백(CMS·마크다운 풀세트·메타 기능·디자인 고정) 반영분:

- **글쓰기 CMS는 "로컬 전용 Decap"** — 정적 GitHub Pages를 유지하면서 "나만 쓸 수 있는" 요구를 충족하는 구조. `npm run write`가 dev 서버 + decap-server(fs 모드)를 함께 띄우고, 에디터는 레포 파일을 직접 CRUD한다. 프로덕션 빌드는 `strip-admin` 통합이 dist/admin을 제거(verify.sh가 회귀 검증)하므로 방문자 쪽엔 글쓰기 진입점 자체가 없다. 클라우드 에디터(Decap GitHub OAuth)는 OAuth 앱·프록시 등 사용자 계정 작업이 필요해 보류 — 필요해지면 sveltia-cms-auth 워커 추가로 확장 가능.
- **decap-server는 fs 모드** — git 모드는 저장할 때마다 자동 커밋이 생겨 의도치 않은 히스토리를 만든다. fs 모드는 파일만 쓰므로 "에디터로 쓰고, 검토 후 직접 커밋·푸시"라는 기존 발행 흐름과 일치. CRUD 사이클(생성→읽기→수정→삭제)을 API 레벨로 검증 완료.
- **CMS 업로드 이미지는 `src/content/posts/_images/`** — 글에서 `./_images/...` 상대 경로로 참조되어 Astro 이미지 파이프라인(최적화·lazy·base)을 타고, 콘텐츠 글로브(`*.{md,mdx}`)에는 걸리지 않는다.
- **수식은 remark-math + rehype-katex** — KaTeX CSS는 BaseLayout에서 전역 로드(수식 없는 페이지에도 ~20KB 추가되지만 단순함 우선). 긴 수식은 `.katex-display`에 가로 스크롤.
- **다이어그램은 Mermaid 클라이언트 렌더** — 빌드 타임 렌더(rehype-mermaid)는 Playwright 의존이 무거워 CDN ESM 지연 로드를 선택. 다이어그램이 있는 글에서만 로드되고, 테마 토글·시스템 다크 변경 시 `injoy:theme-change` 이벤트로 재렌더된다.
- **이모지는 remark-emoji(숏코드) + rehype-tossface(글리프 래핑)** — 본문 텍스트의 이모지만 `span.tossface`로 감싸 "Tossface는 이모지에만" 규칙을 빌드 타임에 강제. 코드 블록 내부는 제외.
- **이미지 캡션은 title 문법** — `![alt](src "캡션")` → figure/figcaption 변환(rehype-figure).
- **읽기 시간은 자체 계산식** — 한글 500자/분 + 영문 200단어/분 + 코드 줄당 4초 + 수식·다이어그램 개당 15초 + 이미지 개당 10초. reading-time 패키지 제거(난이도 가중을 표현 못 함).
- **조회수는 Abacus(무가입 카운터)** — 글별 조회(헤더 메타)와 전체 방문(푸터, 세션당 1회). 로컬에선 get만 하고 hit하지 않아 수치 오염 방지, 실패 시 조용히 숨김. 계정 기반 분석(GoatCounter 등)은 사용자 가입이 필요해 비채택 — README에 교체 경로 안내.
- **헤더는 sticky 고정** — 블러 반투명 배경, wide 페이지(글 상세)에서는 헤더·푸터 내부 폭을 본문 그리드(1080px)와 정렬. 목차 사이드바 top도 헤더 높이만큼 보정.
- **이전/다음 글 내비게이션** — 발행 글 최신순 배열에서 양옆 글을 props로 전달. 540px 이하에서는 세로 스택.
- **메타 라인 줄바꿈 다듬기** — 구분점(·)과 항목을 inline-flex로 묶어, 좁은 화면에서 구분점이 줄 끝에 홀로 남지 않게 했다.
- **robots.txt 추가** — sitemap 절대 URL 포함.
- **콘텐츠 캐시 주의** — decap-server로 워처 없이 파일을 만들었다 지우면 `.astro` 콘텐츠 스토어에 잔재가 남아 중복 id 경고가 날 수 있다. `.astro` 삭제 후 재빌드로 해소.
