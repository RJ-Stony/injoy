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

4차 피드백(지식 그래프) 반영분 — Second Brain 아키텍처의 개념을 정적 블로그 규모로 번역:

- **연결의 단위는 "타입 있는 엣지"** — Second Brain의 10종 엣지 중 블로그에 의미 있는 6종(extends/supports/refines/contradicts/instantiates/related)으로 고정하고 zod enum으로 강제. 중앙 파일 `src/data/edges.json` 하나가 명시적 연결의 단일 출처(엣지를 frontmatter에 분산시키면 양방향 표시·검증·CMS 편집이 모두 어려워진다).
- **위키링크 `[[슬러그]]`는 "언급(mentions)" 엣지로 자동 수집** — remark 플러그인이 렌더(제목 자동 치환)를, 빌드 유틸이 수집을 맡는다. 같은 방향의 명시적 연결이 있으면 mentions는 중복이라 생략. 존재하지 않는 슬러그는 렌더 시 경고+원문 유지, edges.json의 끊어진 연결은 빌드 실패(실측 검증 완료).
- **코드 펜스 추적은 라인 기반** — 정규식 ```쌍 매칭은 4-백틱 인라인 코드(```` ``` ````)가 섞이면 짝이 어긋나 mentions·읽기시간이 오염된다(실제 발생). `splitCode()`가 펜스를 라인 단위로 추적하고 graph·readingMinutes가 공유.
- **그래프 뷰는 의존성 없는 캔버스 force 레이아웃** — d3 없이 ~150줄 물리(반발·스프링·중심 인력). 글=액센트 노드(연결 수만큼 크게), 태그=테두리 노드, 명시 연결=실선, 언급·태그=점선. 색은 CSS 토큰을 런타임에 읽어 라이트/다크·수동 토글 모두 즉시 반영. reduced-motion이면 시뮬레이션을 동기로 수렴시켜 정적 렌더. 캔버스 대체 수단으로 "연결 목록으로 보기"(details)와 noscript 안내 제공.
- **글 상세 "연결된 글"** — 방향을 반영한 한국어 라벨("이 글을 확장한 글" vs "이 글이 확장하는 글")로 양방향 표시, 연결 메모 노출, `?focus=슬러그`로 그래프 진입.
- **CMS에서 연결 편집** — Decap relation 위젯으로 글을 제목 검색해 고르고 관계 타입을 셀렉트로 선택. 본문 위키링크는 마크다운 위젯에 힌트로 안내.
- **Second Brain의 나머지(검색·RAG 봇·신선도 등)는 비채택** — 정적 블로그에는 서버·벡터 저장소가 없고 이번 요구(그래프 뷰 + 연결 구조)의 범위를 벗어난다. 필요해지면 별도 라운드로.

5차 피드백(인-블로그 발행·Mermaid 톤) 반영분:

- **인-블로그 에디터는 "정적 페이지 + 내 브라우저의 토큰"** — 서버 없이 글쓰기·발행을 만드는 유일하게 정직한 구조. `/write/`는 빈 정적 HTML이고 권한은 전부 localStorage의 fine-grained PAT(Contents RW, 레포 한정)에서 나온다. 글쓰기 버튼도 토큰이 있는 브라우저에서만 JS로 주입된다. OAuth 앱+프록시 방식은 외부 인프라가 필요해 비채택.
- **발행은 Git Data API 단일 커밋** — contents API를 파일마다 호출하면 발행 1번에 커밋·배포가 2~3번 생긴다. blob→tree→commit→ref 경로로 글+이미지+연결을 원자적으로 묶었다. 발행 후 Actions 런을 폴링해 완료 링크까지 표시.
- **draft 글의 연결은 커밋 보류** — 그래프 검증이 발행 글만 알기 때문에, draft가 연결을 쓰면 원격 빌드가 깨진다(자체 E2E 설계 중 발견). 같은 이유로 **글 삭제 시 그 글을 가리키는 연결을 같은 커밋에서 자동 정리**한다.
- **연결 제안은 클라이언트 한글 바이그램 유사도 + 태그 겹침** — 서버 없이 site-index.json(빌드 산출물)만으로 동작. 임계 0.08, 상위 3개, 기본 타입 related. 수락한 것만 기록(자동 기록은 그래프 오염 위험).
- **에디터 미리보기는 marked 간략 렌더** — 콜아웃·수식·다이어그램까지 클라이언트에서 본 파이프라인을 재현하는 건 과한 의존. 위키링크만 site-index로 해석해 보여주고 "정확한 모습은 발행 후"로 명시.
- **E2E 실증** — 실제 GitHub 레포에 draft 글 발행→커밋·파일 확인→에디터로 재로드(파싱 복원)→삭제→404 확인까지 전 사이클 통과. 이 과정에서 resetForm이 성공 메시지를 지우는 버그, 원격에 edges.json이 없을 때 404로 죽는 문제도 잡아 수정.
- **Mermaid는 theme base + 토큰 themeVariables** — 기본 neutral/dark 테마의 흑백 톤을 버리고, 렌더 시점에 CSS 토큰(accent/accent-weak/surface/border/text)을 읽어 주입한다. 토글·시스템 테마 변경 시 재렌더라 양쪽 모두 Injoy 팔레트.
- **그래프 리뷰 후속 10건 수정** — 포인터 취소/탭 슬롭/스크롤 차단/리사이즈 재시드/버튼 검사(그래프), ~~~ 펜스/들여쓰기(파서), 중첩 링크/draft 404(위키링크), 역방향 중복(연결 표시), 패턴 단일 출처.

6차 피드백(에디터 상용화 수준 개선·엣지 기준 체계화) 반영분:

- **에디터 스타일을 전역(is:global) + `.write-root` 프리픽스로 전환** — 점검 결과·연결 제안·달력처럼 JS로 만들어지는 요소에는 Astro 스코프 클래스가 붙지 않아 스코프 스타일이 통째로 빗나가고 있었다(폰트·크기·색이 튀어 보인 근본 원인). 같은 이유로 헤더의 글쓰기 링크(JS 주입)도 `:global`로 전부 명시해 그래프·About과 동일한 모양으로 맞췄다.
- **미리보기를 marked 간략 렌더 → 빌드와 동일한 unified 파이프라인으로 교체**(5차 결정 번복) — "콜아웃·수식·다이어그램·이미지를 발행 후에야 확인"하는 흐름이 실사용에서 가장 큰 마찰이었다. remark/rehype 플러그인(콜아웃 설정 포함)을 `src/utils/callout-config.mjs`로 단일 출처화해 빌드와 미리보기가 공유한다. Shiki(웹 번들)·Mermaid는 CDN 지연 로드, 실패해도 글은 보인다. 커밋 전 첨부 이미지는 data URL, 레포 이미지는 raw.githubusercontent URL로 해석.
- **Mermaid 렌더 설정을 `src/scripts/mermaid-render.ts`로 공유** — 글 상세와 미리보기가 같은 themeVariables를 쓴다(중복 제거).
- **발행일은 커스텀 달력** — 네이티브 date 입력은 OS·로케일에 따라 "2026-06-12 ()" 같은 표기가 나온다. 숨은 hidden input이 값의 단일 출처라 기존 폼·점검 로직은 그대로. 오늘 날짜는 로컬 기준(기존 toISOString은 UTC라 한국 저녁에 하루 어긋났다).
- **엣지 타입에 판단 기준(criteria) 명문화 + 선행(requires)·계기(triggered-by) 추가** — Second Brain의 엣지 분류 중 블로그에 의미 있는 8종으로 확장. 기준 문장은 `EDGE_TYPES` 한 곳에 두고 /write 가이드·/graph 타입 안내·README 표가 공유한다. 수락한 연결의 타입은 목록에서 바로 고칠 수 있다.
- **UI 카피 규칙** — 사용자 노출 문구에서 엠 대시(—) 금지, 영문 용어 대신 한국어(lint→점검, draft→초안). 코드 주석은 제외.
- **발행·토큰 버튼은 우측 하단** — 읽기 흐름(위→아래, 좌→우)의 끝에 마무리 동작을 둔다.
