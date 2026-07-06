# 5회차+ · 시퀀스 재생과 읽기 모션 (정렬 수정 + 재생 트랜스포트 + G/J/L + 마이크로 모션 3종)

날짜: 2026-07-06
범위: 다이어그램 렌더 레이어(공용) + 글 상세 페이지 모션/팝오버 + 위키링크 빌드 파이프라인.
그래프 페이지(/graph)·에디터 저장 로직·데이터(edges)는 건드리지 않는다.
구현: Opus 4.8 에이전트에 위임, 이 설계와 구현 계획이 계약.

## 배경

- 어제 넣은 `sequence: { wrap: true }`(74196c4) 이후 모바일에서 시퀀스 노트·메시지
  텍스트가 박스 중앙이 아니라 위로 떠 보이는 증상(작성자 스크린샷, 라이브 확인됨).
- 작성자 요청: algomaster.io 방식의 시퀀스 스텝 재생(풀 트랜스포트) + 로드맵 5회차
  (G 위키링크 하버카드, J 인라인 미니그래프, L 스크롤리텔링) + 추가 모션 발굴.
- 시퀀스 다이어그램 현황: singleton-pattern, harness-3-serena-proxy,
  markdown-styleguide 각 1개. 수정·기능은 전부 공용 레이어라 앞으로 /write에서
  새로 만드는 시퀀스에도 자동 적용된다.

## 확정된 결정 (옵션 질문 결과)

1. 시퀀스 재생 컨트롤 = **풀 트랜스포트**(처음부터·이전·재생/일시정지·다음·단계 점·카운터).
2. 위키링크 하버카드 = **데스크톱 전용**(`(hover: hover) and (pointer: fine)`). 모바일은 일반 링크.
3. 인라인 미니그래프 = **정적 SVG 방사형**(물리 시뮬 없음, 빌드 타임 SSR).
4. 스크롤리텔링 = **본문 블록 은은한 fade-up**(전 글 자동, 아주 짧게).
5. 추가 채택: 각주 hover 미리보기(하버카드 인프라 공유), 플로차트 노드 스태거 등장,
   목차 인디케이터 부드러운 이동.

## 1. 시퀀스 텍스트 정렬 수정 (버그)

증상: 노트 박스("instance == null")·메시지 라벨 텍스트가 수직 중앙보다 위에 떠 보임.
모바일에서 도드라지고 확대 모달에서도 동일.

진단 사다리(구현 시 순서대로, 원인 확정 후 최소 수정):
1. `wrap: true` on/off 비교로 wrap이 원인인지 확정(어제 커밋 직후 증상이라 유력).
2. mermaid 시퀀스 설정(`sequence.*`: noteMargin, wrapPadding, messageAlign 등)으로
   해결되면 거기서 끝.
3. 안 되면 렌더 후처리: `mermaid-render.ts`의 doRender에서 렌더 직후 각 노트
   rect와 그 text의 bbox를 재서 text y를 rect 수직 중앙으로 보정
   (dominant-baseline 포함). 공용 렌더러라 본문·모달·/write 미리보기 전부 자동.
   CSS만으로 되면 global.css 우선(후처리 JS보다 싸다).

검증: preview 모바일 390 + 데스크톱 1280, 라이트·다크에서 노트 rect 중심과 text
중심의 y 오차를 getBoundingClientRect로 계측(오차 < 1~2px). 간헐 이슈 방지로
`document.fonts.ready` 이후 계측. 최종은 라이브 모바일 확인.

## 2. 시퀀스 재생 트랜스포트

새 공용 모듈 `src/scripts/sequence-player.ts`.

- 부착 조건: 컨테이너 dataset.source가 `sequenceDiagram`으로 시작할 때만
  (앞쪽 공백·주석 허용). 본문([slug].astro)과 확대 모달(DiagramModal) 둘 다.
  /write 미리보기에는 부착하지 않는다(요구는 "깨지지 않기" — 렌더러 자체는 불변).
- 스텝 추출: 렌더된 SVG에서 이벤트 요소를 수집해 시간순 그룹핑.
  - 메시지: `.messageText` + 대응 `.messageLine0/.messageLine1`
  - 노트: note rect + `.noteText`
  - 활성화 박스: `.activation0/1/2`
  - loop/alt 프레임·라벨은 등장 시점 스텝에 묶기 어려우면 항상 표시로 남긴다(안전).
  - 그룹핑 키는 y좌표 밴드(문서 순서 보조). mermaid 11 실제 출력으로 클래스명 검증
    후 구현(추측 금지).
- 상태 기계: 초기 = 완성(전부 표시, 카운터 m/m). 재생 = 전부 숨긴 뒤 스텝별
  fade-in(~800ms 간격, CSS transition opacity+살짝 translate). 일시정지 = 타이머만
  정지. 이전/다음 = 해당 스텝까지 즉시 표시/숨김. 처음부터 = 스텝 0으로 리셋 후 재생.
  끝 도달 = 재생 버튼이 다시재생으로.
- 트랜스포트 UI: 다이어그램 아래 바(목업 확정안). 버튼 4개 + 단계 점 + 카운터
  (tabular-nums). 스텝 수가 많으면(>10) 점 대신 카운터만. 디자인 토큰만 사용,
  aria-label 부여, 버튼은 rem 크기(반복 함정: button 안 em 기준).
- 테마 재렌더: svg가 갈리면 스텝 캐시 무효 → 완성 상태로 리셋하고 요소 재수집.
  기존 injoy:theme-change 리스너 흐름에 편승.
- 확대 모달: 줌 transform은 .dm-pan에 있고 스텝 토글은 svg 내부 opacity라 서로
  간섭 없음. 트랜스포트 바는 모달 하단 중앙(줌 버튼과 겹치지 않게).
- reduced-motion: transition 없이 스텝 즉시 점프(기능은 유지).
- 마크다운 문법 변경 0 → Milkdown 왕복 위험 없음.

헤드리스 한계: WAAPI/transition 스로틀 함정 그대로 적용. 검증은 시작·종결 상태
(스텝 n에서 표시 요소 집합)로 하고, 자연 재생 모션은 라이브 몫.

## 3. G 위키링크 하버카드 (데스크톱 전용)

- 데이터: `remark-wiki-links.mjs`가 이미 대상 글을 해석하므로 hProperties에
  `data-title`·`data-description`(+ `data-category`) 추가. 빌드 타임 HTML 출력만
  변경, 마크다운 원문 불변 → /write 왕복 무관.
- UI: 페이지당 팝오버 요소 1개(hovercard). `.wiki-link` hover 250ms 뒤 링크 근처에
  표시(뷰포트 밖으로 안 나가게 좌우 클램프), leave 시 닫힘. 카드 = 카테고리 라벨 +
  제목 + description(목업 확정안). 썸네일 없음(런타임 mermaid 렌더라 무거움).
- 활성 조건: `matchMedia('(hover: hover) and (pointer: fine)')`. 모바일은 기존 링크
  동작 그대로.
- JS 생성 DOM이므로 스타일은 is:global 또는 global.css(반복 함정).

## 4. F 각주 hover 미리보기

- 3번과 같은 팝오버 셸 공유. `[data-footnote-ref]` hover 시 대응
  `li#user-content-fn-*` 내용을 backref 제거하고 복제해 카드에.
- 데스크톱 전용, 3과 동일 조건. 추가 파일 없음(같은 모듈).

## 5. J 인라인 미니그래프 (빌드 타임 SSR SVG)

- 새 컴포넌트 `src/components/MiniGraph.astro`. [slug].astro의 기존
  getConnections 데이터를 받아 빌드 타임에 SVG 생성. 클라이언트 JS 0.
- 레이아웃: 현재 글 = 중심 노드(accent 채움), 이웃은 원형 배치. 선 색·대시 =
  EDGE_TYPES 토큰(graph.ts 단일 출처, mentions는 회색 대시). 노드는 <a> 링크
  (클릭 = 이동), 라벨은 제목 말줄임(전각 고려 ~12자).
- 이웃 상한 8개: '처음 3개'와 같은 우선순위(EDGE_TYPES 순 + 동순위 age desc).
  넘치면 "+N" 텍스트 노드(링크 없음).
- 배치: 글 하단 '연결된 글' 섹션 안(제목 아래). 연결 0개면 렌더 안 함.
  모바일 = 가로 100%, viewBox 비율 유지. 다크·라이트는 CSS 변수로 자동.
- withBase로 링크 경로(반복 함정: BASE_URL 끝 슬래시 없음).

## 6. L 스크롤리텔링 (본문 블록 fade-up)

- [slug].astro 스크립트에서 `.prose`의 직계 블록(문단·헤딩·리스트·인용·표 래퍼·
  코드블록·다이어그램 래퍼·figure)에 IntersectionObserver로 1회성 `.in-view` 부여,
  즉시 unobserve.
- CSS: 초기 opacity 0 + translateY(8px), `.in-view`에서 0.3s ease로 복귀.
  transform이라 레이아웃 불변 → 목차 스크롤 스파이·앵커 점프 계측 안 깨짐.
- 초기 숨김은 JS가 관찰 시작할 때 클래스로만 부여(JS 꺼짐/미지원 = 전부 즉시 표시,
  콘텐츠 유실 없음). above-the-fold 요소는 즉시 발화해 사실상 안 보임.
- reduced-motion = 기능 통째로 비활성. 인쇄 영향 없음(클래스 기반).
- 아주 은은하게(8px, 0.3s)가 계약 — 과하면 읽기 방해.

## 7. 플로차트 노드 스태거 등장

- 기존 flowObserver(엣지 흐름 애니 IntersectionObserver) 재사용. 컨테이너 첫 진입
  시 1회, 시퀀스가 아닌 다이어그램(flowchart·classDiagram 등)의 `g.node`·
  `g.cluster`에 `animationDelay = i × 60ms` + 클래스 부여.
- 테마 재렌더로 svg가 갈려도 재생하지 않음(컨테이너에 done 마커).
- reduced-motion 제외. 시퀀스 다이어그램 제외(재생 트랜스포트가 담당).

## 8. 목차 인디케이터 부드러운 이동

- TableOfContents.astro: 활성 점 전환에 CSS transition + line 변형의 세로선을 따라
  미끄러지는 마커 1개(기존 스크롤 스파이 핸들러에서 transform으로 위치 갱신, 몇 줄).
- 헤드리스에서 transition은 스로틀돼 시작값으로 보임(반복 함정) → 종결 상태는
  `*{transition:none!important}` 주입 후 계측.

## 파일 계획

| 파일 | 작업 |
|---|---|
| `src/scripts/mermaid-render.ts` | 1(정렬: 설정 or 후처리) |
| `src/scripts/sequence-player.ts` | 신규, 2 |
| `src/pages/posts/[slug].astro` | 2 부착, 3·4 팝오버, 6 스크롤리, 7 스태거 |
| `src/components/DiagramModal.astro` | 2 부착(모달) |
| `src/plugins/remark-wiki-links.mjs` | 3 data 속성 |
| `src/components/MiniGraph.astro` | 신규, 5 |
| `src/components/TableOfContents.astro` | 8 |
| `src/styles/global.css` | 팝오버·트랜스포트·fade-up·스태거 전역 스타일 |

[slug].astro가 이미 1000줄+ — 팝오버·스크롤리 로직이 커지면 별도 스크립트 모듈로
분리(sequence-player처럼). 판단은 구현자가.

## 검증 계약

1. `npm run build` 성공 → `bash scripts/verify.sh` ALL PASS.
2. preview: 데스크톱 1280 / 모바일 390 × 다크+라이트.
   - 1: 노트 text/rect 중심 오차 계측.
   - 2: 스텝 n에서 표시 요소 집합(시작·종결 상태), 트랜스포트 버튼 동작, 모달 동일.
   - 3·4: hover 시 팝오버 내용·위치(뷰포트 클램프), 모바일 미동작.
   - 5: SVG 렌더·링크 href·이웃 상한·연결 0 글에서 미렌더.
   - 6·7·8: 종결 상태 계측(transition none 주입), 모션은 라이브 몫.
3. /write: 헤드리스 레시피(fetch 가로채기 + __injoyEditor)로 시퀀스 포함 글
   setMarkdown/getMarkdown 왕복 무손실 + 미리보기 렌더 정상.
4. grep: 새 prose·UI 카피 엠대시 0, 제목 콜론 금지 등 카피 규칙.
5. 다파일 큰 변경 → 적대적 리뷰 Workflow 필수(정합성·회귀·모션·데이터 렌즈).
   리뷰 중 커밋 금지.
6. 커밋은 모아서 push 1회(Pages 배포 throttle 대응). push 전 git fetch.

## 위험과 완화

- mermaid 11 SVG 내부 구조(클래스명)는 버전 종속 → 스텝 추출은 실제 렌더 출력을
  먼저 계측해 확정하고, 못 찾은 요소는 "항상 표시"로 폴백(깨짐 없이 기능 축소).
- 팝오버·트랜스포트는 JS 생성 DOM → 스코프 CSS 안 먹음, 전역 스타일로.
- fade-up이 다이어그램 지연 렌더(IntersectionObserver + rIC)와 겹침 → fade-up은
  래퍼(.diagram-wrap)에 걸어 내부 렌더와 독립.
- 시퀀스 wrap 정렬 후처리는 다른 다이어그램 타입에 영향 없게 시퀀스 한정 셀렉터.

## 비목표 (이번 회차 제외)

- 스크롤 고정형 스텝 연출(지정 섹션 스크롤리텔링) — fade-up으로 축소 확정.
- 하버카드 모바일 탭 동작, 카드 썸네일.
- 미니그래프 물리 시뮬·2-hop.
- M(그래프 노드 → 글 점프)·N-b(스포트라이트)·P(읽기 설정) — 기존 보류 유지.
