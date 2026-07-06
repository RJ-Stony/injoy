# 5회차+ 시퀀스 재생과 읽기 모션 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시퀀스 다이어그램 텍스트 정렬 수정 + 스텝 재생 트랜스포트 + 위키링크/각주 하버카드 + 인라인 미니그래프 + 본문 fade-up + 플로차트 스태거 + 목차 마커.

**Architecture:** 다이어그램 기능은 공용 렌더 레이어(`mermaid-render.ts` + 신규 `sequence-player.ts`)에, 팝오버는 신규 `hover-card.ts`에, 미니그래프는 빌드 타임 SSR 컴포넌트(`MiniGraph.astro`)에 둔다. 마크다운 문법 변경 0 (Milkdown 왕복 위험 없음).

**Tech Stack:** Astro 5 정적 사이트, mermaid 11(CDN), 클라이언트 TS, remark 플러그인. 새 의존성 0.

**Spec:** `docs/superpowers/specs/2026-07-06-round5-motion-design.md`

## Global Constraints

- 엠대시(—) 금지: UI 카피·커밋 메시지·코드 주석·prose 전부. `-`나 `·` 사용.
- 커밋에 `Co-Authored-By: Claude` 트레일러 금지.
- JS로 생성한 DOM에는 Astro 스코프 CSS가 안 붙는다. 전역 스타일(`global.css` 또는 `<style is:global>`)로.
- `import.meta.env.BASE_URL` = `/injoy` (끝 슬래시 없음). 경로 합성은 `withBase()` 사용.
- button 안 요소의 `em`은 버튼 기본 글꼴(~13px) 기준. 크기는 `rem`으로.
- 모든 모션은 `prefers-reduced-motion: reduce`에서 비활성 또는 즉시 완료.
- 헤드리스 preview에서 CSS transition·WAAPI는 스로틀된다. 종결 상태는 `*{transition:none!important}` 주입 후 계측. 모션 자체는 라이브 확인 몫.
- preview_resize는 preset 금지, `width`/`height` 명시(데스크톱 1280, 모바일 390). `.claude/launch.json`: dev 4321.
- 커밋은 태스크마다 로컬로 하되 push는 마지막에 1회(Pages 배포 throttle). push 전 `git fetch` 필수.
- mermaid SVG 내부 클래스는 버전 종속. 셀렉터는 반드시 실제 렌더 DOM을 계측해 확정하고, 못 찾은 요소는 "항상 표시" 폴백.
- `[slug].astro`의 mermaid 처리: `pre.astro-code[data-language="mermaid"]` → `.diagram-wrap`(래퍼) > `.mermaid-diagram[data-source]` + `.diagram-expand`(형제). `renderMermaidDiagrams`가 `.mermaid-diagram`의 innerHTML을 통째로 갈아끼우므로, 살아남아야 하는 UI는 전부 `.mermaid-diagram`의 형제로.

---

### Task 1: 시퀀스 텍스트 정렬 수정

**Files:**
- Modify: `src/scripts/mermaid-render.ts` (doRender 끝부분)
- Modify(필요 시): `src/styles/global.css`

**Interfaces:**
- Produces: `doRender` 내부에서 렌더 직후 호출되는 보정 함수 `recenterSequenceText(container: HTMLElement)`. 외부 공개 없음.

- [ ] **Step 1: 증상 계측 (dev 서버 + preview MCP)**

`preview_start`(dev, 4321) 후 `/injoy/posts/singleton-pattern/` 접속, 모바일 390으로 resize. 다이어그램 렌더 대기 후 preview_eval:

```js
(() => {
  const svg = document.querySelector('.mermaid-diagram svg');
  if (!svg) return 'no svg yet';
  const out = [];
  // 노트: mermaid 11은 <g><rect class="note"/><text class="noteText">…</text></g> 구조.
  // 실제 구조가 다르면 여기서 확인해 이후 셀렉터를 맞춘다.
  svg.querySelectorAll('text.noteText').forEach((t) => {
    const g = t.closest('g');
    const rect = g?.querySelector('rect.note') ?? g?.querySelector('rect');
    if (!rect) return;
    const tr = t.getBoundingClientRect();
    const rr = rect.getBoundingClientRect();
    out.push({
      kind: 'note', text: t.textContent.slice(0, 20),
      dyCenter: +((tr.top + tr.height / 2) - (rr.top + rr.height / 2)).toFixed(1),
      dxCenter: +((tr.left + tr.width / 2) - (rr.left + rr.width / 2)).toFixed(1),
    });
  });
  // 액터 박스도 같은 방식으로 (rect.actor + text 구조 확인)
  svg.querySelectorAll('g rect.actor, rect.actor-man, rect[class*="actor"]').forEach((rect) => {
    const t = rect.parentElement?.querySelector('text');
    if (!t) return;
    const tr = t.getBoundingClientRect();
    const rr = rect.getBoundingClientRect();
    out.push({ kind: 'actor', text: t.textContent.slice(0, 12),
      dyCenter: +((tr.top + tr.height / 2) - (rr.top + rr.height / 2)).toFixed(1) });
  });
  return out;
})()
```

기대: dyCenter가 음수(위로 뜸)로 수 px 이상. 실제 클래스명·구조를 기록해 둔다.

- [ ] **Step 2: wrap 원인 확인**

preview_eval로 임시 재렌더 비교는 어려우니 코드로: `mermaid-render.ts`의 `sequence: { wrap: true }`를 잠시 주석 처리하고 dev 리로드 → 같은 계측. wrap을 꺼서 dyCenter가 0 근처면 wrap의 텍스트 배치가 원인으로 확정. 계측 후 wrap은 반드시 되돌린다(긴 노트 줄바꿈은 유지해야 함).

- [ ] **Step 3: 보정 구현**

`mermaid-render.ts`의 `doRender` 루프에서 `container.innerHTML = svg;` 직후에 시퀀스 한정 보정을 추가한다. 브라우저가 실측한 bbox 기준이라 원인(wrap이든 폰트든)과 무관하게 결정적이다:

```ts
// 시퀀스 다이어그램 소스 판별 - %%주석·공백을 걷어내고 첫 키워드 확인
export function isSequenceSource(source: string): boolean {
  return /^\s*sequenceDiagram/.test(
    source.replace(/^\s*%%.*$/gm, '').trimStart(),
  );
}

// 시퀀스 노트·액터 텍스트를 박스 실측 중앙으로 보정한다.
// mermaid의 wrap 배치가 tspan 기준선을 위로 치우치게 잡아(특히 iOS Safari)
// 텍스트가 박스 위로 떠 보이는 것을, 렌더 후 bbox 차이만큼 transform으로 되돌린다.
function recenterSequenceText(container: HTMLElement): void {
  const svg = container.querySelector('svg');
  if (!svg) return;
  const recenter = (text: SVGTextElement, rect: SVGGraphicsElement) => {
    const tr = text.getBoundingClientRect();
    const rr = rect.getBoundingClientRect();
    if (!tr.height || !rr.height) return;
    const dy = (rr.top + rr.height / 2) - (tr.top + tr.height / 2);
    const dx = (rr.left + rr.width / 2) - (tr.left + tr.width / 2);
    // 1px 미만은 손대지 않는다(불필요한 transform 누적 방지)
    if (Math.abs(dy) < 1 && Math.abs(dx) < 1) return;
    // 화면 px -> SVG 좌표 변환 (뷰박스 스케일 반영)
    const scale = rr.width ? rect.getBBox().width / rr.width : 1;
    text.setAttribute('transform', `translate(${dx * scale}, ${dy * scale})`);
  };
  for (const t of svg.querySelectorAll<SVGTextElement>('text.noteText')) {
    const rect = t.closest('g')?.querySelector<SVGGraphicsElement>('rect.note');
    if (rect) recenter(t, rect);
  }
  for (const rect of svg.querySelectorAll<SVGGraphicsElement>('rect.actor')) {
    const t = rect.parentElement?.querySelector<SVGTextElement>('text');
    if (t) recenter(t, rect);
  }
}
```

루프 안 호출부:

```ts
      container.innerHTML = svg;
      if (isSequenceSource(source)) recenterSequenceText(container);
```

주의: Step 1에서 확인한 실제 클래스명이 다르면 셀렉터를 거기에 맞춘다. 이미 transform이 있는 요소면 덮어쓰지 말고 기존 transform 뒤에 이어 붙인다(mermaid 11 노트 텍스트에 transform이 있는지 Step 1에서 확인).

- [ ] **Step 4: 계측 재확인**

dev 리로드 후 Step 1 계측 재실행. 기대: 모든 dyCenter·dxCenter 절대값 < 1.5px (모바일 390 + 데스크톱 1280, 다크 + 라이트 각각). 확대 모달을 열어(`__injoyDiagramModal.open`) `#dm-diagram` 안에서도 같은 계측으로 확인(공용 렌더러라 자동 적용돼야 정상).

- [ ] **Step 5: 빌드 + 커밋**

```bash
npm run build
git add src/scripts/mermaid-render.ts src/styles/global.css
git commit -m "diagram: 시퀀스 노트·액터 텍스트가 박스 중앙에서 떠 보이던 문제 수정"
```

---

### Task 2: sequence-player.ts 재생 트랜스포트 + 본문 부착

**Files:**
- Create: `src/scripts/sequence-player.ts`
- Modify: `src/pages/posts/[slug].astro` (mermaid 부착 스크립트)
- Modify: `src/styles/global.css` (트랜스포트 바 + 스텝 전환 스타일)

**Interfaces:**
- Consumes: Task 1의 `isSequenceSource(source: string): boolean` (mermaid-render.ts에서 export).
- Produces: `attachSequencePlayer(host: HTMLElement, diagram: HTMLElement): SequencePlayer | null`. `SequencePlayer = { refresh(): void; destroy(): void }`. host = 트랜스포트 바를 append할 요소(본문은 `.diagram-wrap`, 모달은 dialog 하단 컨테이너). diagram = `.mermaid-diagram` 또는 `#dm-diagram`(svg를 품는 요소). 스텝 2개 미만이면 null(바 미부착).

- [ ] **Step 1: 스텝 구조 계측**

dev에서 singleton 글의 렌더된 시퀀스 SVG 구조를 preview_eval로 덤프:

```js
(() => {
  const svg = document.querySelector('.mermaid-diagram svg');
  return [...svg.querySelectorAll('text.messageText, line.messageLine0, line.messageLine1, path.messageLine0, path.messageLine1, rect.note, text.noteText, rect[class*="activation"]')]
    .map((el) => ({ tag: el.tagName, cls: el.getAttribute('class'), y: Math.round(el.getBoundingClientRect().top) }));
})()
```

기대: 메시지 텍스트와 그 라인이 ~12px 이내 y 밴드로 짝지어짐. 라인이 line인지 path인지, 활성화 rect 클래스명을 기록. 다르면 아래 SELECTOR를 맞춘다.

- [ ] **Step 2: sequence-player.ts 작성**

```ts
/**
 * 시퀀스 다이어그램 스텝 재생 트랜스포트.
 * 렌더된 SVG는 그대로 두고(초기 = 완성 상태), 메시지·노트·활성화 요소를
 * 시간순(y 밴드)으로 그룹핑해 재생 시 한 스텝씩 드러낸다.
 * 본문(.diagram-wrap)과 확대 모달이 공유한다. 문서 마크다운은 건드리지 않는다.
 */

const STEP_INTERVAL = 900; // ms, 스텝 간 간격
const BAND = 14; // px, 같은 스텝으로 묶는 y 허용 오차
const SELECTOR = [
  'text.messageText',
  'line.messageLine0', 'line.messageLine1',
  'path.messageLine0', 'path.messageLine1',
  'rect.note', 'text.noteText',
  'rect.activation0', 'rect.activation1', 'rect.activation2',
].join(', ');

export interface SequencePlayer {
  refresh(): void;
  destroy(): void;
}

interface Step { els: Element[] }

function collectSteps(svg: SVGSVGElement): Step[] {
  const items = [...svg.querySelectorAll(SELECTOR)].map((el) => ({
    el, y: el.getBoundingClientRect().top,
  }));
  if (items.length === 0) return [];
  items.sort((a, b) => a.y - b.y);
  const steps: Step[] = [];
  let band = -Infinity;
  for (const it of items) {
    if (it.y - band > BAND) {
      steps.push({ els: [] });
      band = it.y;
    }
    steps[steps.length - 1].els.push(it.el);
  }
  return steps;
}

const btn = (label: string, path: string, cls = '') => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `sq-btn ${cls}`.trim();
  b.setAttribute('aria-label', label);
  b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
  return b;
};

const PATHS = {
  restart: 'M4 4v6h6M4 10a8 8 0 1 1-1 6',
  prev: 'M15 6l-6 6 6 6',
  play: 'M8 5.5v13l11-6.5z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  next: 'M9 6l6 6-6 6',
};

export function attachSequencePlayer(host: HTMLElement, diagram: HTMLElement): SequencePlayer | null {
  let steps: Step[] = [];
  let cur = 0; // 표시된 스텝 수 (steps.length = 완성)
  let timer = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const svg = () => diagram.querySelector('svg');
  const first = svg();
  if (!first) return null;
  steps = collectSteps(first);
  if (steps.length < 2) return null;
  cur = steps.length;

  // ---- 트랜스포트 바 (JS DOM -> 스타일은 global.css) ----
  const bar = document.createElement('div');
  bar.className = 'sq-transport';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', '시퀀스 재생');
  const restartB = btn('처음부터 재생', PATHS.restart);
  const prevB = btn('이전 단계', PATHS.prev);
  const playB = btn('재생', PATHS.play, 'sq-play');
  const nextB = btn('다음 단계', PATHS.next);
  const dots = document.createElement('span');
  dots.className = 'sq-dots';
  dots.setAttribute('aria-hidden', 'true');
  const counter = document.createElement('span');
  counter.className = 'sq-counter';
  bar.append(restartB, prevB, playB, nextB, dots, counter);
  host.append(bar);

  const buildDots = () => {
    dots.innerHTML = '';
    // 스텝이 많으면 점은 생략하고 카운터만 (바가 다이어그램보다 넓어지는 것 방지)
    if (steps.length > 10) return;
    for (let i = 0; i < steps.length; i++) {
      const d = document.createElement('span');
      d.className = 'sq-dot';
      dots.append(d);
    }
  };

  const setPlayIcon = (playing: boolean) => {
    playB.querySelector('path')!.setAttribute('d', playing ? PATHS.pause : PATHS.play);
    playB.setAttribute('aria-label', playing ? '일시정지' : cur >= steps.length ? '다시 재생' : '재생');
  };

  const render = () => {
    steps.forEach((s, i) => {
      for (const el of s.els) el.classList.toggle('sq-hidden', i >= cur);
    });
    counter.textContent = `${cur} / ${steps.length}`;
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i < cur));
    prevB.disabled = cur <= 0;
    nextB.disabled = cur >= steps.length;
  };

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = 0;
    setPlayIcon(false);
  };

  const advance = () => {
    cur++;
    render();
    if (cur >= steps.length) stop();
  };

  const play = () => {
    if (cur >= steps.length) { cur = 0; render(); } // 완성 상태에서 재생 = 처음부터
    timer = window.setInterval(advance, reduced ? 400 : STEP_INTERVAL);
    setPlayIcon(true);
  };

  playB.addEventListener('click', () => (timer ? stop() : play()));
  restartB.addEventListener('click', () => { stop(); cur = 0; render(); play(); });
  prevB.addEventListener('click', () => { stop(); cur = Math.max(0, cur - 1); render(); });
  nextB.addEventListener('click', () => { stop(); cur = Math.min(steps.length, cur + 1); render(); });

  buildDots();
  render();

  return {
    // 테마 재렌더 등으로 svg가 갈리면: 재수집 후 완성 상태로 리셋
    refresh() {
      stop();
      const s = svg();
      steps = s ? collectSteps(s) : [];
      if (steps.length < 2) { bar.style.display = 'none'; return; }
      bar.style.display = '';
      cur = steps.length;
      buildDots();
      render();
    },
    destroy() {
      stop();
      bar.remove();
    },
  };
}
```

- [ ] **Step 3: global.css 스타일 추가**

`global.css`의 다이어그램 블록(.flow-on 규칙 근처)에:

```css
/* ---------- 시퀀스 스텝 재생 (sequence-player.ts가 만드는 DOM) ---------- */
.sq-hidden {
  opacity: 0;
}

@media (prefers-reduced-motion: no-preference) {
  .diagram-wrap svg :is(text.messageText, .messageLine0, .messageLine1, rect.note, text.noteText, [class*='activation']),
  .dm-diagram svg :is(text.messageText, .messageLine0, .messageLine1, rect.note, text.noteText, [class*='activation']) {
    transition: opacity 0.3s ease;
  }
}

.sq-transport {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding-top: 0.6rem;
  margin-top: 0.4rem;
  border-top: 1px solid var(--border);
}

.sq-btn {
  width: 2.1rem;
  height: 2.1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background-color: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.sq-btn:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--accent);
}

.sq-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.sq-btn svg {
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sq-btn.sq-play {
  width: 2.5rem;
  height: 2.5rem;
  background-color: var(--accent-weak);
  border-color: var(--accent);
  color: var(--accent);
}

.sq-btn.sq-play svg {
  fill: currentColor;
  stroke: none;
}

.sq-dots {
  display: inline-flex;
  gap: 5px;
  margin-inline: 0.3rem;
}

.sq-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--border);
  transition: background-color 0.2s ease;
}

.sq-dot.on {
  background-color: var(--accent);
}

.sq-counter {
  font-size: 0.78rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  min-width: 3.2em;
}
```

주의: 일시정지 아이콘은 fill 사각형이라 `.sq-play svg`만 fill 처리. 나머지는 stroke 아이콘.

- [ ] **Step 4: [slug].astro 부착**

mermaid 부착 스크립트를 수정. 기존:

```ts
    const renderAll = () => renderMermaidDiagrams(containers);
    renderAll();
    window.addEventListener('injoy:theme-change', renderAll);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderAll);
```

변경:

```ts
    import { attachSequencePlayer, type SequencePlayer } from '../../scripts/sequence-player';
    import { isSequenceSource } from '../../scripts/mermaid-render';
    // (import는 파일 상단 기존 import 옆에)

    const players = new Map<HTMLElement, SequencePlayer>();
    const renderAll = () =>
      renderMermaidDiagrams(containers).then(() => {
        for (const c of containers) {
          if (!isSequenceSource(c.dataset.source ?? '')) continue;
          const existing = players.get(c);
          if (existing) existing.refresh();
          else {
            // 트랜스포트 바는 .mermaid-diagram의 형제(.diagram-wrap 자식)로 - innerHTML 교체에 안 지워진다
            const p = attachSequencePlayer(c.parentElement as HTMLElement, c);
            if (p) players.set(c, p);
          }
        }
      });
    renderAll();
    window.addEventListener('injoy:theme-change', () => void renderAll());
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => void renderAll());
```

- [ ] **Step 5: 상태 검증 (헤드리스)**

dev에서 singleton 글, `*{transition:none!important}` 주입 후 preview_eval:

```js
(async () => {
  const bar = document.querySelector('.sq-transport');
  if (!bar) return 'no transport';
  const hidden = () => document.querySelectorAll('.mermaid-diagram .sq-hidden').length;
  const counter = () => bar.querySelector('.sq-counter').textContent;
  const out = { initial: { hidden: hidden(), counter: counter() } };
  bar.querySelector('[aria-label="이전 단계"]').click();
  out.afterPrev = { hidden: hidden(), counter: counter() };
  bar.querySelector('[aria-label="다음 단계"]').click();
  out.afterNext = { hidden: hidden(), counter: counter() };
  return out;
})()
```

기대: initial.hidden = 0, counter = "m / m". prev 후 hidden > 0, counter = "m-1 / m". next 후 다시 0. 재생 버튼 클릭 → 900ms 간격 진행은 setInterval이라 헤드리스에서도 동작: 클릭 후 2초 대기 계측으로 counter 증가 확인. 테마 토글(`document.documentElement.dataset.theme` 전환 + injoy:theme-change 발화) 후 완성 상태 리셋 확인.

- [ ] **Step 6: 다른 다이어그램 회귀 확인**

flowchart 글(예: 아무 polish-round 글)에서 `.sq-transport`가 안 생기는지, 기존 확대 버튼·flow-on이 그대로인지 확인.

- [ ] **Step 7: 빌드 + 커밋**

```bash
npm run build
git add src/scripts/sequence-player.ts src/scripts/mermaid-render.ts "src/pages/posts/[slug].astro" src/styles/global.css
git commit -m "diagram: 시퀀스 다이어그램 스텝 재생 트랜스포트 추가"
```

---

### Task 3: 확대 모달에 재생 부착

**Files:**
- Modify: `src/components/DiagramModal.astro`

**Interfaces:**
- Consumes: `attachSequencePlayer`, `isSequenceSource` (Task 2).

- [ ] **Step 1: 모달 마크업에 트랜스포트 호스트 추가**

`<dialog>` 안, `.dm-zoom` 앞에:

```html
  <div class="dm-transport" id="dm-transport"></div>
```

스코프 스타일(모달 내 위치만, 바 자체 스타일은 global.css 공용):

```css
  .dm-transport {
    position: absolute;
    left: 50%;
    bottom: 12px;
    transform: translateX(-50%);
    z-index: 2;
  }

  /* 모달 안에서는 border-top 없이 배경 칩 형태로 */
  .dm-transport :global(.sq-transport) {
    border-top: none;
    margin-top: 0;
    padding: 0.4rem 0.7rem;
    background-color: var(--bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 1px 5px rgb(0 0 0 / 10%);
  }

  /* 모바일에서 줌 버튼(우하단 세로 스택)과 겹치지 않게 왼쪽으로 치우침 허용 */
  @media (max-width: 560px) {
    .dm-transport {
      left: 12px;
      transform: none;
      max-width: calc(100% - 76px);
    }
  }
```

- [ ] **Step 2: 스크립트에서 open/close/rerender에 연결**

```ts
import { attachSequencePlayer, type SequencePlayer } from '../scripts/sequence-player';
import { isSequenceSource } from '../scripts/mermaid-render';

// dialog 블록 안:
const transportHost = dialog.querySelector<HTMLElement>('#dm-transport')!;
let player: SequencePlayer | null = null;
```

`open`에서 `renderMermaidDiagrams([diagram])` 완료 후 `fit()` 전에:

```ts
        player?.destroy();
        player = null;
        transportHost.innerHTML = '';
        if (isSequenceSource(source)) {
          player = attachSequencePlayer(transportHost, diagram);
        }
```

`rerender`(테마 전환)에서 `apply()` 뒤에 `player?.refresh();` 추가.

`dialog.addEventListener('close', ...)`에서:

```ts
      player?.destroy();
      player = null;
```

주의: 모달 스텝 토글은 svg 내부 opacity, 줌은 `.dm-pan` transform이라 서로 간섭 없음. 스텝 y 밴드 수집은 `getBoundingClientRect` 기준인데 모달은 fit 전 scale 1 상태에서 수집되므로 밴드 왜곡 없음(수집 시점 = attach 직후, fit 전). 만약 fit 후 refresh가 필요해지면 BAND를 scale에 비례시키는 대신 svg 내부 좌표(getBBox().y + CTM)로 바꾼다. 우선은 attach 시점 보장으로 충분.

- [ ] **Step 3: 검증**

dev에서 singleton 글 확대 버튼 클릭(preview_eval로 `__injoyDiagramModal.open(...)` 직접 호출 가능) → 모달 안 `.sq-transport` 존재, Task 2 Step 5와 같은 상태 계측. 줌 인/아웃 후에도 스텝 토글 동작. 닫고 다시 열어도 중복 바 없음. flowchart 소스로 열면 바 없음.

- [ ] **Step 4: 빌드 + 커밋**

```bash
npm run build
git add src/components/DiagramModal.astro
git commit -m "diagram: 확대 모달에도 시퀀스 재생 트랜스포트 연결"
```

---

### Task 4: 위키링크에 대상 글 메타 속성 (하버카드 데이터)

**Files:**
- Modify: `astro.config.mjs` (frontmatter 스캔 확장)
- Modify: `src/plugins/remark-wiki-links.mjs`

**Interfaces:**
- Produces: 빌드된 HTML의 `a.wiki-link`에 `data-title`, `data-description`, `data-category` 속성. Task 5가 소비.

- [ ] **Step 1: astro.config.mjs 스캔 확장**

기존 `postTitles`(slug -> title)를 메타 맵으로 확장한다. 기존 코드를 다음으로 교체:

```js
// [[위키링크]] 하버카드용 글 메타 맵 (config 로드 시 1회 스캔 -
// dev 중 글을 추가하면 dev 서버 재시작 후 반영된다).
// draft 글은 제외 - 위키링크는 원문 그대로 남기고 빌드 로그에 경고만 낸다.
const fm = (src, key) =>
  src.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm'))?.[1];
const postMeta = Object.fromEntries(
  readdirSync('./src/content/posts')
    .filter((f) => /\.(md|mdx)$/.test(f))
    .flatMap((f) => {
      const src = readFileSync(`./src/content/posts/${f}`, 'utf8');
      if (/^draft:\s*true\s*$/m.test(src)) return [];
      const slug = f.replace(/\.(md|mdx)$/, '');
      return [[slug, {
        title: fm(src, 'title') ?? slug,
        description: fm(src, 'description') ?? '',
        category: fm(src, 'category') ?? '',
      }]];
    }),
);
```

플러그인 옵션 교체: `[remarkWikiLinks, { meta: postMeta, base: BASE }]`.

- [ ] **Step 2: remark-wiki-links.mjs 수정**

`titles` 대신 `meta`를 받고 hProperties에 데이터 속성 추가:

```js
export default function remarkWikiLinks(options = {}) {
  const meta = options.meta ?? {};
  const base = (options.base ?? '/').replace(/\/$/, '');
```

매치 처리부:

```js
        const m = meta[slug];

        if (m === undefined) {
          console.warn(`[wiki-links] 존재하지 않는 글을 가리키는 위키링크: [[${slug}]] (${file?.path ?? ''})`);
          parts.push({ type: 'text', value: whole });
        } else {
          parts.push({
            type: 'link',
            url: `${base}/posts/${slug}/`,
            data: {
              hProperties: {
                className: ['wiki-link'],
                // 하버카드(데스크톱 hover 미리보기)가 읽는 대상 글 메타
                'data-title': m.title,
                'data-description': m.description,
                'data-category': m.category,
              },
            },
            children: [{ type: 'text', value: labelRaw?.trim() || m.title }],
          });
        }
```

- [ ] **Step 3: 빌드 확인**

```bash
npm run build
grep -o 'class="wiki-link"[^>]*data-title="[^"]*"' dist/posts/*/index.html | head -5
```

기대: data-title·data-description·data-category가 붙은 wiki-link 앵커. 위키링크가 있는 글(예: singleton-pattern → welcome 링크 등)에서 확인. `grep -c "wiki-link" dist` 결과 개수가 수정 전과 동일(링크 자체 증감 없음).

- [ ] **Step 4: /write 왕복 무관 확인**

이 변경은 빌드 HTML 출력만 바꾼다. 마크다운 원문·Milkdown 파서는 손대지 않음을 diff로 확인(`git diff --stat`이 astro.config.mjs와 remark-wiki-links.mjs 2개 파일뿐).

- [ ] **Step 5: 커밋**

```bash
git add astro.config.mjs src/plugins/remark-wiki-links.mjs
git commit -m "wiki: 위키링크에 대상 글 제목·설명·카테고리 데이터 속성 추가"
```

---

### Task 5: 하버카드 모듈 (위키링크 + 각주 미리보기, 데스크톱 전용)

**Files:**
- Create: `src/scripts/hover-card.ts`
- Modify: `src/pages/posts/[slug].astro` (스크립트에서 init 호출)
- Modify: `src/styles/global.css` (카드 스타일 - JS DOM이라 전역)

**Interfaces:**
- Consumes: Task 4의 `a.wiki-link[data-title]`, 기존 각주 마크업 `[data-footnote-ref]`(sup 안 a, href="#user-content-fn-N") + `li#user-content-fn-N`.
- Produces: `initHoverCards(): void`. 부수효과로 body에 `.hover-card` 팝오버 1개.

- [ ] **Step 1: hover-card.ts 작성**

```ts
/**
 * 데스크톱 hover 미리보기 카드.
 * - a.wiki-link: 대상 글 카테고리·제목·설명 (remark-wiki-links가 심은 data 속성)
 * - 각주 참조: 대응 각주 본문 (백링크 제거)
 * 모바일(hover 없음)에서는 아무것도 하지 않는다 - 링크 기본 동작 그대로.
 */

const SHOW_DELAY = 250; // ms

export function initHoverCards(): void {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const targets = document.querySelectorAll<HTMLAnchorElement>(
    '.prose a.wiki-link[data-title], .prose [data-footnote-ref]',
  );
  if (targets.length === 0) return;

  const card = document.createElement('div');
  card.className = 'hover-card';
  card.setAttribute('role', 'tooltip');
  card.hidden = true;
  document.body.append(card);

  let timer = 0;
  const hide = () => {
    if (timer) clearTimeout(timer);
    timer = 0;
    card.hidden = true;
  };

  const fill = (a: HTMLAnchorElement): boolean => {
    if (a.classList.contains('wiki-link')) {
      const t = a.dataset.title ?? '';
      if (!t) return false;
      card.innerHTML = '';
      const cat = document.createElement('p');
      cat.className = 'hc-category';
      cat.textContent = a.dataset.category ?? '';
      const title = document.createElement('p');
      title.className = 'hc-title';
      title.textContent = t;
      const desc = document.createElement('p');
      desc.className = 'hc-desc';
      desc.textContent = a.dataset.description ?? '';
      card.append(cat, title, desc);
      if (!cat.textContent) cat.remove();
      if (!desc.textContent) desc.remove();
      return true;
    }
    // 각주: href="#user-content-fn-N" -> li 내용을 복제해 백링크 제거
    const id = decodeURIComponent(a.hash.slice(1));
    const li = document.getElementById(id);
    if (!li) return false;
    const clone = li.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.data-footnote-backref').forEach((b) => b.remove());
    card.innerHTML = '';
    const body = document.createElement('div');
    body.className = 'hc-footnote';
    body.append(...clone.childNodes);
    card.append(body);
    return true;
  };

  const place = (a: HTMLElement) => {
    const r = a.getBoundingClientRect();
    card.hidden = false; // 크기를 재려면 먼저 보여야 한다
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const margin = 12;
    let x = r.left + r.width / 2 - cw / 2;
    x = Math.max(margin, Math.min(x, innerWidth - cw - margin));
    // 기본 링크 아래, 공간이 없으면 위
    let y = r.bottom + 8;
    if (y + ch > innerHeight - margin) y = r.top - ch - 8;
    card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };

  for (const anchor of targets) {
    anchor.addEventListener('mouseenter', () => {
      if (timer) clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (fill(anchor)) place(anchor);
      }, SHOW_DELAY);
    });
    anchor.addEventListener('mouseleave', hide);
    anchor.addEventListener('focus', () => { if (fill(anchor)) place(anchor); });
    anchor.addEventListener('blur', hide);
  }
  window.addEventListener('scroll', hide, { passive: true });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
}
```

주의: `[data-footnote-ref]`는 remark-gfm이 a 요소에 직접 붙인다(global.css `.prose [data-footnote-ref]` 셀렉터 참고). dev에서 각주 있는 글(markdown-styleguide)의 실제 DOM으로 확인 후 필요하면 셀렉터 보정.

- [ ] **Step 2: global.css 카드 스타일**

```css
/* ---------- hover 미리보기 카드 (hover-card.ts가 만드는 DOM) ---------- */
.hover-card {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 60;
  width: max-content;
  max-width: 320px;
  padding: 0.75rem 0.9rem;
  background-color: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
  pointer-events: none;
  will-change: transform;
}

.hover-card .hc-category {
  margin: 0 0 0.15rem;
  font-size: 0.72rem;
  color: var(--text-muted);
}

.hover-card .hc-title {
  margin: 0 0 0.25rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
}

.hover-card .hc-desc {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.hover-card .hc-footnote {
  font-size: 0.8rem;
  color: var(--text);
  line-height: 1.6;
}

.hover-card .hc-footnote p {
  margin: 0;
}
```

- [ ] **Step 3: [slug].astro에서 초기화**

mermaid 스크립트 블록 안(또는 인접 스크립트)에서:

```ts
import { initHoverCards } from '../../scripts/hover-card';
initHoverCards();
```

- [ ] **Step 4: 검증**

dev 데스크톱 1280: 위키링크 있는 글에서 preview_eval로 mouseenter 디스패치:

```js
(async () => {
  const a = document.querySelector('.prose a.wiki-link[data-title]');
  if (!a) return 'no wiki-link in this post';
  a.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
  await new Promise((r) => setTimeout(r, 400));
  const card = document.querySelector('.hover-card');
  const vis = !card.hidden;
  const r = card.getBoundingClientRect();
  const inViewport = r.left >= 0 && r.right <= innerWidth;
  a.dispatchEvent(new MouseEvent('mouseleave'));
  return { vis, inViewport, text: card.textContent.slice(0, 60), hiddenAfterLeave: card.hidden };
})()
```

기대: vis=true, inViewport=true, leave 후 hidden=true. 각주 글(markdown-styleguide)에서도 각주 ref 대상으로 동일 계측. 모바일 390 + touch 에뮬은 헤드리스 한계가 있으니 코드 가드(`hover: hover` matchMedia)를 직접 확인하고, 라이브 모바일에서 카드가 안 뜨는 것만 확인.

- [ ] **Step 5: 빌드 + 커밋**

```bash
npm run build
git add src/scripts/hover-card.ts "src/pages/posts/[slug].astro" src/styles/global.css
git commit -m "post: 위키링크·각주 hover 미리보기 카드 추가"
```

---

### Task 6: 인라인 미니그래프 (빌드 타임 SSR SVG)

**Files:**
- Create: `src/components/MiniGraph.astro`
- Modify: `src/pages/posts/[slug].astro` (연결된 글 섹션에 배치)

**Interfaces:**
- Consumes: `getConnections(slug)`의 `Connection[]` (이미 [slug].astro가 보유: `connections` 변수, EDGE_TYPES 우선순위 + age desc 정렬 완료 상태).
- Produces: `<MiniGraph title={string} connections={Connection[]} />`. 연결 0개면 아무것도 렌더하지 않는다.

- [ ] **Step 1: MiniGraph.astro 작성**

```astro
---
/**
 * 글 하단 '연결된 글'의 인라인 미니그래프.
 * 현재 글을 중심에, 연결 글(최대 8개)을 원형 배치한 빌드 타임 SVG.
 * 선 색 = 엣지 타입 토큰(--edge-*), mentions는 회색 대시.
 * 클라이언트 JS 0 - hover 강조는 CSS만.
 */
import type { Connection } from '../utils/graph';
import { withBase } from '../utils/url';

interface Props {
  title: string;
  connections: Connection[];
}

const { title, connections } = Astro.props;

const MAX = 8;
const shown = connections.slice(0, MAX);
const extra = connections.length - shown.length;

const W = 560;
const H = 240;
const CX = W / 2;
const CY = H / 2;
const RX = 210;
const RY = 78;

// 위쪽부터 시계방향 균등 배치. 이웃이 적을 때도 좌우로 퍼지게 시작각을 -90도로.
const nodes = shown.map((c, i) => {
  const angle = (-90 + (360 / shown.length) * i) * (Math.PI / 180);
  return {
    ...c,
    x: CX + RX * Math.cos(angle),
    y: CY + RY * Math.sin(angle),
    labelAbove: Math.sin(angle) < 0,
  };
});

const truncate = (s: string, n = 14) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
// mentions는 EDGE_TYPES 밖(자동 수집)이라 related 색을 쓴다
const edgeVar = (type: string) => `var(--edge-${type === 'mentions' ? 'related' : type})`;
---

{
  shown.length > 0 && (
    <figure class="mini-graph" aria-label="이 글의 연결 관계도">
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        <title>{`${title}의 연결 관계도`}</title>
        {nodes.map((n) => (
          <line
            x1={CX}
            y1={CY}
            x2={n.x}
            y2={n.y}
            stroke={edgeVar(n.type)}
            stroke-width="1.5"
            stroke-dasharray={n.type === 'mentions' ? '4 4' : undefined}
            opacity="0.75"
          />
        ))}
        {nodes.map((n) => (
          <a href={withBase(`/posts/${n.slug}/`)} class="mg-node">
            <circle cx={n.x} cy={n.y} r="7" />
            <text x={n.x} y={n.labelAbove ? n.y - 14 : n.y + 22} text-anchor="middle">
              {truncate(n.title)}
            </text>
          </a>
        ))}
        <g class="mg-center">
          <circle cx={CX} cy={CY} r="10" />
          <text x={CX} y={CY + 28} text-anchor="middle">
            {truncate(title, 18)}
          </text>
        </g>
        {extra > 0 && (
          <text class="mg-extra" x={W - 8} y={H - 8} text-anchor="end">{`+${extra}`}</text>
        )}
      </svg>
    </figure>
  )
}

<style>
  .mini-graph {
    margin: 0 0 1rem;
  }

  .mini-graph svg {
    display: block;
    width: 100%;
    height: auto;
  }

  .mg-node circle {
    fill: var(--accent-weak);
    stroke: var(--accent);
    stroke-width: 1.5;
    transition: stroke-width 0.15s ease;
  }

  .mg-node text {
    font-size: 11px;
    fill: var(--text-muted);
    transition: fill 0.15s ease;
  }

  .mg-node:hover circle,
  .mg-node:focus-visible circle {
    stroke-width: 3;
  }

  .mg-node:hover text,
  .mg-node:focus-visible text {
    fill: var(--accent);
  }

  .mg-center circle {
    fill: var(--accent);
  }

  .mg-center text {
    font-size: 12px;
    font-weight: 600;
    fill: var(--text);
  }

  .mg-extra {
    font-size: 11px;
    fill: var(--text-muted);
  }
</style>
```

주의: 노드가 1~2개면 원형 배치가 위쪽 쏠림이 된다. 1개 = 오른쪽(-90도 시작이라 12시 방향에 1개) - 시작각을 shown.length가 2 이하일 때 180/0도(좌우)로 바꾸는 분기 한 줄 추가:

```ts
const startDeg = shown.length <= 2 ? 180 : -90;
const angle = (startDeg + (360 / shown.length) * i) * (Math.PI / 180);
```

- [ ] **Step 2: [slug].astro 배치**

import 추가(`import MiniGraph from '../../components/MiniGraph.astro';`) 후, 연결된 글 섹션의 `.connections-head` 바로 다음에:

```astro
          <MiniGraph title={post.data.title} connections={connections} />
```

- [ ] **Step 3: 검증**

```bash
npm run build
```

dev preview에서 연결 많은 글(singleton-pattern 또는 welcome)과 연결 적은 글 각각:
- `.mini-graph svg` 존재, `a.mg-node` href가 `/injoy/posts/<slug>/` 형태(withBase 확인).
- 노드 수 = min(연결 수, 8), 초과분 `+N` 텍스트.
- 라벨이 viewBox 밖으로 안 나감: preview_eval로 각 text의 getBBox와 svg getBoundingClientRect 비교.
- 모바일 390에서 svg가 가로 100%로 축소돼도 라벨 겹침이 심하지 않은지 스크린샷 1장.
- 다크·라이트 모두 색 토큰 정상.
- 연결 0개 글(있다면)에서 미렌더.

- [ ] **Step 4: 커밋**

```bash
git add src/components/MiniGraph.astro "src/pages/posts/[slug].astro"
git commit -m "post: 연결된 글에 인라인 미니그래프 추가"
```

---

### Task 7: 본문 블록 fade-up (스크롤리텔링)

**Files:**
- Modify: `src/pages/posts/[slug].astro` (스크립트)
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces: `.prose.scrolly > *`에 `.in-view` 클래스 (CSS 전환 트리거). 다른 태스크 의존 없음.

- [ ] **Step 1: 스크립트 추가 ([slug].astro)**

기존 스크립트 블록에:

```ts
  // 본문 블록 은은한 등장 - 스크롤로 새 블록이 들어올 때 살짝 fade-up (1회성).
  // 처음부터 뷰포트 안에 있는 블록은 숨기지 않는다(로드 플래시 방지).
  // reduced-motion 또는 IO 미지원이면 통째로 건너뛴다(전부 즉시 표시).
  if (
    !matchMedia('(prefers-reduced-motion: reduce)').matches &&
    'IntersectionObserver' in window
  ) {
    const prose = document.querySelector<HTMLElement>('.prose');
    if (prose) {
      const blocks = [...prose.children] as HTMLElement[];
      const fold = innerHeight * 1.15;
      const below = blocks.filter((b) => b.getBoundingClientRect().top > fold);
      if (below.length > 0) {
        const io = new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (!e.isIntersecting) continue;
              e.target.classList.add('in-view');
              io.unobserve(e.target);
            }
          },
          { rootMargin: '0px 0px -4% 0px' },
        );
        for (const b of below) {
          b.classList.add('scrolly-block');
          io.observe(b);
        }
      }
    }
  }
```

주의: `.prose` 전체에 클래스를 걸지 않고 fold 아래 블록에만 `scrolly-block`을 단다. 위쪽 블록은 DOM 변화 자체가 없어 어떤 환경에서도 플래시가 없다.

- [ ] **Step 2: global.css**

```css
/* ---------- 본문 블록 은은한 등장 ([slug].astro 스크립트가 부여) ---------- */
.prose > .scrolly-block {
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.prose > .scrolly-block.in-view {
  opacity: 1;
  transform: none;
}
```

- [ ] **Step 3: 검증**

dev에서 긴 글(singleton-pattern):
- 로드 직후 preview_eval: 첫 화면 블록엔 `scrolly-block` 없음(플래시 0), fold 아래 블록엔 있음.
- `window.scrollTo(0, document.body.scrollHeight)` 후 300ms 대기 → 모든 `.scrolly-block`이 `.in-view` (IO는 헤드리스에서도 발화).
- 앵커 점프: `location.hash = '#<중간 헤딩 slug>'` 후 해당 섹션 블록 `.in-view` 확인.
- 목차 스크롤 스파이 active가 스크롤 위치와 일치(transform이 레이아웃을 안 바꾸는지 회귀 확인).
- 다이어그램 래퍼(.diagram-wrap)가 블록으로 취급돼도 내부 mermaid 렌더·확대 버튼 정상.

- [ ] **Step 4: 빌드 + 커밋**

```bash
npm run build
git add "src/pages/posts/[slug].astro" src/styles/global.css
git commit -m "post: 본문 블록이 스크롤에 맞춰 은은하게 등장"
```

---

### Task 8: 플로차트 노드 스태거 등장

**Files:**
- Modify: `src/pages/posts/[slug].astro` (flowObserver 확장)
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `isSequenceSource` (Task 1), 기존 flowObserver.
- Produces: 첫 노출 시 `.mermaid-diagram`에 `.stagger-in`(1회), 각 노드에 inline `animation-delay`.

- [ ] **Step 1: flowObserver 콜백 확장 ([slug].astro)**

기존:

```ts
          for (const e of entries) e.target.classList.toggle('flow-on', e.isIntersecting);
```

변경:

```ts
          for (const e of entries) {
            e.target.classList.toggle('flow-on', e.isIntersecting);
            // 플로차트류 노드 스태거 등장 - 첫 노출 1회만. 시퀀스는 재생 트랜스포트 담당이라 제외.
            const el = e.target as HTMLElement;
            if (
              e.isIntersecting &&
              !el.dataset.staggered &&
              !isSequenceSource(el.dataset.source ?? '')
            ) {
              const nodes = el.querySelectorAll<SVGGElement>('svg g.node, svg g.cluster');
              if (nodes.length > 0) {
                el.dataset.staggered = '1';
                nodes.forEach((n, i) => { n.style.animationDelay = `${i * 60}ms`; });
                el.classList.add('stagger-in');
                // 애니가 끝나면 잠근다 - 테마 재렌더로 svg가 갈려도 재생하지 않게
                setTimeout(() => el.classList.replace('stagger-in', 'stagger-done'),
                  nodes.length * 60 + 500);
              } else {
                // svg가 아직(지연 렌더) - 다음 교차 때 다시 시도하도록 마크하지 않는다
              }
            }
          }
```

- [ ] **Step 2: global.css**

```css
/* ---------- 플로차트 노드 스태거 등장 (첫 노출 1회) ---------- */
@media (prefers-reduced-motion: no-preference) {
  .mermaid-diagram.stagger-in :is(g.node, g.cluster) {
    animation: injoy-node-pop 0.4s ease backwards;
  }
}

@keyframes injoy-node-pop {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
```

`stagger-done`은 규칙 없음(애니 없음 = 잠금).

- [ ] **Step 3: svg 없는 시점 문제 확인**

mermaid는 지연 렌더(CDN)라 IO 첫 발화 때 svg가 없을 수 있다. 위 코드는 그 경우 dataset을 안 찍으므로 스크롤로 다시 교차하면 재시도된다. 하지만 계속 화면 안에 있으면 IO가 재발화하지 않는다. 보강: Task 2에서 만든 `renderAll().then(...)` 안에서, 렌더 완료 후 화면 안에 있는(getBoundingClientRect로 판단) 미스태거 컨테이너에 같은 로직을 1회 적용한다. 중복 방지는 `dataset.staggered` 가드가 담당. 스태거 적용 로직을 로컬 함수 `applyStagger(el: HTMLElement)`로 빼서 두 곳(IO 콜백, renderAll 후)에서 호출한다.

- [ ] **Step 4: 검증**

dev에서 flowchart 있는 글:
- 렌더 후 컨테이너에 `stagger-in` 또는 `stagger-done`, 노드들에 순차 animation-delay.
- 500ms+ 후 `stagger-done`으로 전환.
- 테마 토글 후 재렌더돼도 다시 `stagger-in`으로 돌아가지 않음.
- 시퀀스 다이어그램 컨테이너엔 dataset.staggered 없음.
- reduced-motion 에뮬(preview_emulate 또는 CSS 미디어 확인)에서 애니 규칙 자체가 미적용.

- [ ] **Step 5: 빌드 + 커밋**

```bash
npm run build
git add "src/pages/posts/[slug].astro" src/styles/global.css
git commit -m "diagram: 플로차트 노드가 첫 노출에 순차 등장"
```

---

### Task 9: 목차 rail 인디케이터 슬라이드

**Files:**
- Modify: `src/components/TableOfContents.astro`

**Interfaces:**
- 없음 (자기 완결). line 변형의 점 전환은 기존 CSS transition이 이미 있음 - rail 변형에만 마커 추가.

- [ ] **Step 1: 마커 요소 추가**

rail 변형에만 마커를 렌더한다. 마크업 부분:

```astro
    <nav class:list={['toc', variant]} aria-label={variant === 'line' ? '섹션 바로가기' : '목차'}>
      {variant === 'rail' && <span class="toc-marker" aria-hidden="true" />}
      {variant !== 'line' && <p class="toc-title">목차</p>}
```

- [ ] **Step 2: 스타일**

```css
  .toc.rail {
    position: relative;
    border-inline-start: 2px solid var(--border);
    padding-inline-start: 1.1rem;
    font-size: 0.85rem;
  }

  /* 활성 항목 위치를 따라 세로선을 미끄러지는 마커 */
  .toc-marker {
    position: absolute;
    left: -2px;
    top: 0;
    width: 2px;
    height: 0;
    border-radius: 2px;
    background-color: var(--accent);
    transition: transform 0.25s ease, height 0.25s ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .toc-marker {
      transition: none;
    }
  }
```

(기존 `.toc.rail` 규칙에 `position: relative`만 추가하는 형태로.)

- [ ] **Step 3: 스크롤 스파이에서 마커 이동**

`initToc`의 `update()` 마지막에:

```ts
      for (const { a } of entries) a.classList.toggle('active', a === active.a);
      // rail 변형: 마커를 활성 항목 위치로 (transform이라 레이아웃 영향 0)
      const marker = nav.querySelector<HTMLElement>('.toc-marker');
      if (marker) {
        const ar = active.a.getBoundingClientRect();
        const nr = nav.getBoundingClientRect();
        marker.style.height = `${ar.height}px`;
        marker.style.transform = `translateY(${ar.top - nr.top}px)`;
      }
```

- [ ] **Step 4: 검증**

dev 데스크톱 1280(rail은 1100px+에서만 보임):
- `*{transition:none!important}` 주입 후 스크롤 위치 2곳에서 marker의 transform translateY가 활성 링크 offset과 일치.
- 모바일 390: rail 미표시, line 변형 기존 동작 그대로(회귀 없음).
- box 변형(본문 상단): 마커 없음.

- [ ] **Step 5: 빌드 + 커밋**

```bash
npm run build
git add src/components/TableOfContents.astro
git commit -m "toc: 데스크톱 목차 활성 마커가 세로선을 따라 미끄러지게"
```

---

### Task 10: 통합 검증 + 적대적 리뷰 + 배포

**Files:**
- 없음(검증·리뷰·수정·배포). 리뷰 지적 수정은 해당 파일.

- [ ] **Step 1: 전체 빌드 + verify**

```bash
npm run build && bash scripts/verify.sh
```

기대: ALL PASS.

- [ ] **Step 2: /write 라운드트립**

dev에서 `/injoy/write/` 헤드리스 레시피(메모리 참조: fetch 가로채기로 `api.github.com`·`site-index`·`/contents/` 200 목 + `#token-input`·`#token-save` -> `window.__injoyEditor`):
- singleton-pattern.md 원문을 `setMarkdown` -> `getMarkdown` 왕복 diff 0 (시퀀스 코드블록·위키링크 보존).
- 미리보기에 mermaid 렌더 정상(트랜스포트 바는 없어야 정상 - /write엔 부착 안 함).

- [ ] **Step 3: 카피 점검**

```bash
grep -rn "—" src/scripts/sequence-player.ts src/scripts/hover-card.ts src/components/MiniGraph.astro || true
git log --format=%B be91b84..HEAD | grep -c "Co-Authored-By" || true
```

기대: 엠대시 0, Co-Authored-By 0.

- [ ] **Step 4: preview 매트릭스 최종 확인**

데스크톱 1280 / 모바일 390 x 다크 / 라이트에서 singleton-pattern 글 1회씩: 정렬 보정치, 트랜스포트, 미니그래프, fade-up 종결 상태, 콘솔 에러 0 (`preview_console_logs` error 필터).

- [ ] **Step 5: 적대적 리뷰 (Workflow, 필수)**

다파일 대형 변경이므로 배포 전 Workflow 다중 렌즈 리뷰: 정합성(테마 재렌더 x 플레이어/스태거 상호작용), 회귀(기존 확대·flow-on·복사 버튼·스크롤 스파이), 좌표 수학(미니그래프 배치·하버카드 클램프·정렬 보정 scale 변환), 모션(reduced-motion 전 경로). HIGH/MED는 수정 후 재검증. **리뷰 도는 중 커밋 금지.**

- [ ] **Step 6: 메모리 갱신 + push 1회**

<!-- Task 11·14는 세션 중 사용자 요청으로 편입. Task 10보다 먼저 실행한다. -->

---

### Task 14: 코드 블록 스텝 재생 (작성자 마커 기반)

**Files:**
- Modify: `astro.config.mjs` (커스텀 Shiki transformer)
- Create: `src/scripts/code-step-player.ts`
- Modify: `src/scripts/sequence-player.ts` (트랜스포트 바 생성부를 export 헬퍼로 추출)
- Modify: `src/pages/posts/[slug].astro` (코드 블록 셋업 루프에서 부착)
- Modify: `src/styles/global.css` (스텝 강조 스타일)
- Modify: `src/content/posts/markdown-styleguide.md` (기능 문서화 한 절 - 작성자 글이지만 스타일가이드는 기능 매뉴얼이라 추가가 관례)

**Interfaces:**
- Consumes: Task 2의 트랜스포트 바 시각(.sq-* 클래스 재사용).
- Produces: 펜스 코드 주석 마커 `[!code step:N]`(언어별 주석 문법 준수, N=1~99). 빌드가 해당 줄에 `data-step="N"`을 달고 마커 텍스트는 제거. `attachCodeStepPlayer(codeBlock: HTMLElement): CodeStepPlayer | null` - `.code-block` 안 `[data-step]` 줄이 2개 스텝 이상일 때만 바 부착.
- 자동 순서 추론은 하지 않는다(불가능이 정직한 답). 작성자가 마커로 순서를 지정한 블록에만 등장.

- [ ] **Step 1: Shiki transformer (빌드)**

astro.config.mjs의 기존 shiki transformers 배열에 커스텀 transformer 추가. 기존 `[!code highlight]`류가 어떻게 등록돼 있는지 먼저 확인하고 같은 자리에:

```js
// [!code step:N] 마커 -> 그 줄에 data-step="N" 부여하고 마커 텍스트는 지운다.
// 코드 실행 순서 재생(code-step-player.ts)이 소비한다. 주석 문법은 언어를 따른다.
const transformerCodeSteps = () => ({
  name: 'injoy:code-steps',
  code(node) {
    for (const line of node.children) {
      if (line.type !== 'element') continue;
      const texts = [];
      const collect = (el) => {
        for (const c of el.children ?? []) {
          if (c.type === 'text') texts.push(c);
          else if (c.type === 'element') collect(c);
        }
      };
      collect(line);
      for (const t of texts) {
        const m = t.value.match(/\s*(?:\/\/|#|--|\/\*|<!--)?\s*\[!code step:(\d+)\]\s*(?:\*\/|-->)?\s*$/);
        if (!m) continue;
        line.properties['data-step'] = m[1];
        t.value = t.value.slice(0, m.index);
        // 마커만 있던 주석 여는 기호가 덜렁 남으면 그것도 지운다(예: 파이썬 '#')
        break;
      }
    }
  },
});
```

주의: 실제 hast 구조(Shiki 줄 span 안 토큰 span)는 빌드해서 확인 후 조정. `dist`에 `[!code step` 누출 0이 수용 기준. 마커 뒤 잔여 주석 기호(`#`만 남는 줄 등)는 빌드 산출물을 보고 정리 로직 보강.

- [ ] **Step 2: sequence-player.ts에서 바 생성부 추출**

Task 2가 만든 트랜스포트 바 DOM 생성(버튼 4개+점+카운터)을 `export function createTransportBar()`로 추출하고 sequence-player 내부도 그걸 쓰도록 리팩터(동작 불변). code-step-player가 같은 헬퍼를 소비해 시각·접근성 라벨이 한 결로 유지된다.

- [ ] **Step 3: code-step-player.ts**

```ts
/**
 * 코드 블록 스텝 재생 - 작성자가 [!code step:N] 마커로 지정한 실행 순서를
 * 트랜스포트 바로 재생한다. 재생 중 현재 스텝 줄만 강조(.cs-on),
 * 지나간 스텝은 옅은 잔상(.cs-past). 초기/종료 상태는 강조 없음(평소 코드 그대로).
 */
```

- 스텝 수집: `pre .line[data-step]`을 스텝 번호로 그룹핑(같은 번호 여러 줄 허용), 번호 오름차순.
- 상태: 초기 = 강조 없음, 카운터 `- / N`. 재생 -> 스텝 1부터 interval 1200ms. 현재 스텝 줄 `.cs-on`, 지나간 줄 `.cs-past`. 일시정지/이전/다음/처음부터 = 시퀀스 플레이어와 동일 상태 기계. 종료 -> 강조 전부 해제(초기 상태 복귀).
- 현재 스텝 줄이 코드 블록 내부 스크롤 밖이면 `scrollIntoView({ block: 'nearest' })`(pre 내부 스크롤 컨테이너 기준, 페이지 스크롤은 건드리지 않게 확인).
- 부착 지점: [slug].astro의 기존 코드 블록 셋업 루프(헤더 바 만드는 곳)에서 `.code-block`마다 호출, 스텝 2개 미만이면 null. 바는 코드 블록 하단(내부 스크롤 영역 밖).
- reduced-motion: transition 없이 즉시 전환.

- [ ] **Step 4: global.css**

```css
/* ---------- 코드 스텝 재생 (code-step-player.ts) ---------- */
.code-block .line.cs-on {
  background-color: var(--accent-weak);
  box-shadow: inset 2px 0 0 var(--accent);
}

.code-block .line.cs-past {
  background-color: color-mix(in srgb, var(--accent-weak) 40%, transparent);
}

@media (prefers-reduced-motion: no-preference) {
  .code-block .line {
    transition: background-color 0.25s ease;
  }
}
```

기존 Shiki `.highlighted` 스타일과 겹치지 않는지 확인(스텝 강조가 이기게 특이도 조정).

- [ ] **Step 5: 스타일가이드 문서화**

markdown-styleguide.md 코드 블록 절에 짧은 소절 추가: 마커 문법(`# [!code step:1]`), 언어별 주석 문법 주의(CSS는 `/* [!code step:1] */`), 스텝 2개부터 바가 뜬다는 것, 예시 블록 1개(실제 마커 넣어 도그푸딩). 작성자 말투(injoy-voice-guide) 준수, 엠대시 0.

- [ ] **Step 6: 검증**

- `npm run build` 후 `grep -r "\[!code step" dist/` 0건(스타일가이드가 문법을 인라인 코드로 언급하는 것은 `<code>` 안이라 정상 - 기존 `[!code` 언급 예외 규칙과 동일).
- dev에서 스타일가이드 글: 예시 블록에 바 존재, 재생 상태 기계 계측(transition none 주입, 스텝 n에서 .cs-on 줄 집합), 마커 없는 블록엔 바 없음.
- /write 왕복: 스타일가이드 원문 setMarkdown/getMarkdown diff 0(마커는 코드 내용이라 보존).
- 복사 버튼이 마커 없는 깨끗한 코드를 복사하는지(렌더된 텍스트 기준인지 원문 기준인지 확인 - 원문 기준이면 마커가 섞이므로 렌더 텍스트로 교체하거나 마커 strip).

- [ ] **Step 7: 커밋**

```bash
git add astro.config.mjs src/scripts/code-step-player.ts src/scripts/sequence-player.ts "src/pages/posts/[slug].astro" src/styles/global.css src/content/posts/markdown-styleguide.md
git commit -m "code: 코드 블록에 실행 순서 스텝 재생 추가 (step 마커)"
```

---

### Task 15: 기존 글 코드 블록 스텝 마커 선별 주입

**Files:**
- Modify: `src/content/posts/*.md` (선별된 블록만)

**Interfaces:**
- Consumes: Task 14의 `[!code step:N]` 마커 문법과 transformer.

원칙(선별 기준, 사용자 확정):
- **넣는다**: 실행 흐름·순서가 이해를 돕는 블록 - 알고리즘(싱글톤 구현 5종), 이벤트 흐름 로직(ts/js 함수), 단계적 처리 코드. 스텝은 3~6개가 적당(줄마다 아니라 의미 단위).
- **뺀다**: 설정(json/yaml/toml)·CSS 규칙 나열·1~3줄 블록·`text` 블록·마크다운 예시·**diff 근거 블록(`[!code ++/--]` 포함 - 이미 이야기가 있음)**·`[!code highlight]`가 이미 핵심을 짚는 블록은 신중히(스텝이 더 나은 경우만 교체 말고 공존 없이 스텝만).
- 언어별 주석 문법 준수: py/sh는 `# [!code step:1]`, ts/js는 `// [!code step:1]`, css는 `/* [!code step:1] */`.
- 글 본문 텍스트는 한 글자도 건드리지 않는다(코드 블록 내 마커 추가만). 작성자 글(singleton 등)도 대상이나 추가는 보수적으로.

- [ ] **Step 1: 후보 조사**

전 글 코드 블록을 훑어 후보 목록(글/블록/언어/예상 스텝 수)을 만들고 위 기준으로 컷. 예상 35~45개 대상이나 실제 판단 우선(억지 스텝 금지 - 확신 없으면 뺀다).

- [ ] **Step 2: 주입**

글 단위로 마커 추가. 스텝 번호는 실행·이해 순서(등장 순서와 다를 수 있음 - 예: 이중 검사 잠금은 첫 검사 1, 잠금 2, 재검사 3, 생성 4).

- [ ] **Step 3: 검증**

- `npm run build` + `grep -r "\[!code step" dist/` 0건(styleguide 인라인 코드 언급 예외).
- 주입 글 중 3편(singleton 포함) /write 왕복 diff 0.
- dev에서 주입 블록 2~3개 바 등장·스텝 수 확인, 제외 블록엔 바 없음.
- 엠대시 0(마커 주변).

- [ ] **Step 4: 커밋**

```bash
git add src/content/posts/
git commit -m "post: 실행 흐름이 있는 코드 블록에 스텝 마커 주입"
```

---

### Task 11: 그래프 초기 화면맞춤 + 타임랩스 컨트롤

**Files:**
- Modify: `src/pages/graph.astro`

**Interfaces:**
- 없음(자기 완결). `window.__injoyGraph` 테스트 훅(`_play`, `_state`)은 유지하되 `_state()`에 `paused` 필드 추가.

배경(코드 실측):
- 초기 뷰: `restart()`가 시뮬을 돌리고 `loop()`가 정착(alpha < ALPHA_MIN 또는 maxFrames)했을 때에야 `pendingFit`으로 `fitToBbox()`가 한 번 불린다(graph.astro:592). 그래서 정착 전까지 축소된 기본 뷰가 보인다.
- 타임랩스: `#gt-play` 하나로 토글(graph.astro:919), `revealOf`가 `performance.now() - playStart`로 진행도 계산(graph.astro:316). 일시정지·초기화 없음, 버튼에 "재생" 텍스트 라벨.
- **주의(메모리 실증 함정): 루프 안 매 프레임 fitToBbox는 과거에 그래프 흔들림을 만들었다. 매 프레임 fit 금지.**

- [ ] **Step 1: 초기 화면맞춤(사전 정착)**

`restart()` 호출 직후(또는 restart 내부 마지막)에, 첫 페인트 전에 시뮬을 동기로 미리 돌려 near-정착 상태로 만들고 fit한다. `wake()`의 reduceMotion 분기(graph.astro:602-606, 320틱 동기 정착)와 같은 수법:

```js
    // 첫 화면부터 그래프가 화면에 꼭 맞게 - 정착을 기다리지 않고 미리 동기로 식힌 뒤 fit.
    // (루프 안 매 프레임 fit은 흔들림을 만들었던 전력이 있어, fit은 여기서 한 번만)
    const prewarm = () => {
      for (let i = 0; i < 300 && alpha >= ALPHA_MIN; i++) tick();
      fitToBbox();
      pendingFit = false;
      draw();
    };
```

`restart()` 뒤 최초 1회만 호출(테마 재시작 등 재호출 경로에서 뷰를 덮지 않게 플래그 가드). 잔여 미세 정착은 기존 loop가 이어 간다(추가 fit 없음).

주의:
- `?focus=슬러그` 경로: focus 노드 강조·센터링 로직이 있으면 prewarm 후에도 그 동작이 유지되는지 확인하고, focus가 뷰를 잡는 경우 prewarm의 fit이 그걸 덮지 않게 순서를 조정한다(focus 처리가 나중에 오도록).
- 모바일(isSmall)과 데스크톱 모두 확인. reduceMotion 경로는 이미 동기 정착이므로 이중 정착이 되지 않게(중복 tick 무해하나 확인).

- [ ] **Step 2: 타임랩스 컨트롤 3버튼(아이콘 전용)**

마크업(graph.astro:42-47) 교체:

```html
    <div class="graph-tools">
      <button type="button" class="gt-btn" id="gt-play" aria-label="글이 쌓인 순서대로 재생">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z"></path></svg>
      </button>
      <button type="button" class="gt-btn" id="gt-reset" aria-label="재생 초기화" hidden>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v6h6M4 10a8 8 0 1 1-1 6"></path></svg>
      </button>
    </div>
```

`.gt-label` 스팬 제거(아이콘 전용). 초기화 버튼은 재생 시작 전엔 `hidden`, 재생·일시정지 중에만 노출(평소 도구 바 미니멀 유지).

스크립트: 일시정지는 경과시간 누적으로.

```js
    let playPaused = false;
    let playElapsed = 0; // 일시정지 때까지 누적된 경과(ms)
```

`revealOf`의 진행도 계산을 교체:

```js
    const playProgress = () =>
      (playElapsed + (playPaused ? 0 : performance.now() - playStart)) / playMs;
    const revealOf = (id) => {
      if (!playing) return 1;
      const p = playProgress();
      return Math.max(0, Math.min(1, p * nodes.length - appearIndex.get(id)));
    };
```

`#gt-play` 클릭 핸들러 교체 - 상태 3분기(정지 -> 재생 시작 / 재생 중 -> 일시정지 / 일시정지 -> 재개):

```js
    const playIcon = (playing활성) => { /* path d를 재생(M7 5l12 7-12 7z) <-> 일시정지(M7 5h4v14H7zM13 5h4v14h-4z)로 교체 + aria-label 갱신 */ };
```

- 재생 시작: 기존 준비 로직(필터 해제·fitToBbox 등) 그대로 + `playElapsed = 0; playPaused = false;` + reset 버튼 `hidden = false`.
- 일시정지: `playElapsed += performance.now() - playStart; playPaused = true; draw();` (rAF step은 playPaused면 draw 없이 대기하거나 중단 후 재개 시 재시작).
- 재개: `playStart = performance.now(); playPaused = false;` step 루프 재시작.
- 종료(진행도 >= 1 + 1/N): 기존대로 playing=false + 아이콘을 재생으로 + reset 버튼 hidden.
- `#gt-reset` 클릭: `playing = false; playPaused = false; playElapsed = 0;` 아이콘 재생으로, reset 버튼 hidden, `draw()`(전체 표시 상태로 복귀).
- step 루프의 종료 판정도 `playProgress() >= 1 + 1 / nodes.length`로 교체(일시정지 반영).
- reduceMotion 경로(애니 없이 전체 표시)는 기존 유지.
- `__injoyGraph._state()`에 `paused: playPaused` 추가.

- [ ] **Step 3: 검증**

dev 데스크톱 1280 + 모바일 390:
- 로드 직후(정착 애니 전) `__injoyGraph.view.scale`이 `baseView.scale`과 일치하고 노드 bbox가 캔버스 안에 들어옴(축소 기본 뷰 아님).
- `_play()` 후 `_state().playing === true`, 일시정지 클릭 -> `paused: true`이고 `revealOf` 진행도가 두 시점 계측에서 동일(멈춤 확인), 재개 -> 진행 재개, 초기화 -> `playing: false` + 전체 표시.
- `?focus=` 붙여 로드해도 focus 강조 동작 유지.
- 캔버스 페이지 스크린샷은 stall 위험(메모리) -> 계측은 전부 `preview_eval`로.
- 그래프 물리·모션의 최종 체감은 라이브 몫.

- [ ] **Step 4: 빌드 + 커밋**

```bash
npm run build
git add src/pages/graph.astro
git commit -m "graph: 첫 화면부터 화면맞춤, 타임랩스에 일시정지·초기화 추가"
```

- `injoy-project-state.md`에 회차 항목(커밋 해시·비자명 함정) 추가.
- push는 세션 전체 커밋을 모아 1회:

```bash
git fetch origin && git rebase --autostash origin/main
git push origin main
gh run list --branch main --json databaseId,headSha --limit 5
gh run watch <새 커밋 SHA와 매칭된 id> --exit-status
```

- 실패 시 즉시 재시도 금지: build 성공 확인 후 10-15분 뒤 `gh run rerun <id> --failed` 1회.
- success 후 라이브 확인(curl로 `injoy:build` sha + 글 페이지 트랜스포트 마크업 존재).
- 라이브 모바일 확인은 사용자 몫으로 안내(정렬·모션 체감).
