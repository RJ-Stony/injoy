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
