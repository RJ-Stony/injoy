/**
 * Mermaid 다이어그램 공용 렌더러.
 * 글 상세([slug].astro)와 /write 실시간 미리보기가 같은 테마 설정을 공유해
 * 어디서 보든 다이어그램이 Injoy 톤(디자인 토큰 팔레트)으로 그려진다.
 * mermaid 본체는 CDN에서 지연 로드한다(다이어그램 없는 페이지는 비용 0).
 */
const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

let seq = 0;

/** 현재 적용 중인 테마 — 수동 토글(data-theme)이 시스템 설정보다 우선 */
export const effectiveTheme = (): 'light' | 'dark' => {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'light' || explicit === 'dark') return explicit;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/**
 * 시퀀스 다이어그램 소스인지 판별한다 - %% 주석과 앞 공백을 걷어내고 첫 키워드를 본다.
 * (Task 2가 시퀀스 전용 후처리를 걸 때도 이 판별을 재사용한다.)
 */
export function isSequenceSource(source: string): boolean {
  return /^\s*sequenceDiagram/.test(source.replace(/^\s*%%.*$/gm, '').trimStart());
}

/**
 * 시퀀스 노트·액터 텍스트를 박스 실측 중앙으로 보정한다.
 * mermaid의 wrap 배치와 dominant-baseline 처리가 브라우저(특히 iOS Safari)에 따라
 * 텍스트를 박스 위/아래로 치우치게 잡는 것을, 렌더 후 bbox 차이만큼 되돌린다.
 * 브라우저 실측 기준이라 원인(wrap이든 baseline이든)과 무관하게 결정적이고,
 * 어긋남이 없는 환경(Chromium 등)에서는 1px 미만이라 손대지 않는다(no-op).
 *
 * DOM 구조(Step 1 실측): 노트/액터는 각각 자기 <g> 안에 rect + text 형제로 들어간다.
 * - 노트: <g> > rect.note + text.noteText (긴 노트는 줄마다 text.noteText 가 여러 개)
 * - 액터: <g> > rect.actor + text.actor
 * 여러 줄 노트는 줄 간격을 유지해야 하므로, 줄 묶음(block)의 중앙을 기준으로
 * 모든 줄을 같은 delta로 옮긴다(줄마다 따로 중앙에 맞추면 줄이 겹친다).
 */
function recenterSequenceText(
  container: HTMLElement,
  scaleOf: (svg: SVGSVGElement) => number,
  prependTranslate: (el: SVGGraphicsElement, dx: number, dy: number) => void,
): void {
  const svg = container.querySelector('svg');
  if (!svg) return;
  const scale = scaleOf(svg);

  // 노트: rect.note 마다 같은 <g> 안의 text.noteText 줄들을 묶어 블록 중앙을 맞춘다.
  for (const rect of svg.querySelectorAll<SVGGraphicsElement>('rect.note')) {
    const g = rect.parentElement;
    const lines = g
      ? [...g.querySelectorAll<SVGTextElement>('text.noteText')]
      : [];
    if (!lines.length) continue;
    const rr = rect.getBoundingClientRect();
    if (!rr.height) continue;
    let top = Infinity;
    let bottom = -Infinity;
    let left = Infinity;
    let right = -Infinity;
    for (const t of lines) {
      const tr = t.getBoundingClientRect();
      if (!tr.height) continue;
      top = Math.min(top, tr.top);
      bottom = Math.max(bottom, tr.bottom);
      left = Math.min(left, tr.left);
      right = Math.max(right, tr.right);
    }
    if (!isFinite(top)) continue;

    // 노트 박스는 단일 액터 위에선 액터 폭(~147px)에 고정돼, 긴 줄이 있으면 좌우 여백이 빠듯하다.
    // 텍스트 블록보다 좌우로 최소 NOTE_PAD씩은 남도록 박스를 넓힌다(중심 유지). 세로 여백은 noteMargin이 담당.
    const NOTE_PAD = 20; // 좌우 최소 여백(px, 화면 기준)
    const textW = right - left;
    const needW = textW + NOTE_PAD * 2;
    let box = rr;
    if (needW > rr.width + 1) {
      const curX = parseFloat(rect.getAttribute('x') || '0');
      const curW = parseFloat(rect.getAttribute('width') || '0');
      const newW = needW * scale; // 화면 px → SVG 단위
      rect.setAttribute('x', String(curX + (curW - newW) / 2)); // 중심 유지하며 좌우로 넓힘
      rect.setAttribute('width', String(newW));
      box = rect.getBoundingClientRect(); // 넓힌 뒤 다시 측정
    }

    // 텍스트 블록을 (넓힌) 박스 중앙에 맞춘다. 여러 줄은 같은 delta로 옮겨 줄 간격 보존.
    const dy = (box.top + box.height / 2) - (top + bottom) / 2;
    const dx = (box.left + box.width / 2) - (left + right) / 2;
    if (Math.abs(dy) < 1 && Math.abs(dx) < 1) continue;
    for (const t of lines) prependTranslate(t, dx * scale, dy * scale);
  }

  // 액터: rect.actor 마다 같은 <g> 안의 text.actor 를 박스 중앙에 맞춘다.
  // ★긴 라벨이 자동 줄바꿈되면 mermaid가 줄들을 너무 좁은 간격으로 겹쳐 놓는다
  // (예: "안내데스크 (공유기/NAT)" → 두 줄이 7px 간격으로 포개짐). 그래서 여러 줄이면
  // 겹치지 않는 줄 높이로 다시 쌓고, 줄 묶음 전체를 박스 중앙에 맞춘다.
  for (const rect of svg.querySelectorAll<SVGGraphicsElement>('rect.actor')) {
    const g = rect.parentElement;
    const texts = g ? [...g.querySelectorAll<SVGTextElement>('text.actor')] : [];
    if (!texts.length) continue;
    const rr = rect.getBoundingClientRect();
    if (!rr.height) continue;
    const cx = rr.left + rr.width / 2;
    const cy = rr.top + rr.height / 2;

    if (texts.length === 1) {
      const tr = texts[0].getBoundingClientRect();
      if (!tr.height) continue;
      const dy = cy - (tr.top + tr.height / 2);
      const dx = cx - (tr.left + tr.width / 2);
      if (Math.abs(dy) >= 1 || Math.abs(dx) >= 1) prependTranslate(texts[0], dx * scale, dy * scale);
      continue;
    }

    // 여러 줄: y로 정렬 후, 가장 큰 줄 높이를 줄 간격으로 삼아 겹치지 않게 재배치.
    const rects = texts.map((t) => t.getBoundingClientRect());
    texts.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const lineH = Math.max(...rects.map((r) => r.height)) * 1.05;
    const firstCenterY = cy - (lineH * (texts.length - 1)) / 2; // 블록을 박스 중앙에
    texts.forEach((t, i) => {
      const tr = t.getBoundingClientRect();
      const dy = firstCenterY + i * lineH - (tr.top + tr.height / 2);
      const dx = cx - (tr.left + tr.width / 2);
      prependTranslate(t, dx * scale, dy * scale);
    });
  }
}

// mermaid는 단일 인스턴스라 동시 호출이 겹치면 일부가 실패한다. 여러 컴포넌트(글 카드·시리즈 카드·
// 미리보기)가 각자 호출해도 안전하도록, 모든 호출을 모듈 단위 큐로 직렬화한다.
let renderQueue: Promise<void> = Promise.resolve();

/**
 * `.mermaid-diagram` 컨테이너(dataset.source에 원본 보유)들을 렌더한다.
 * 테마가 바뀌면 같은 컨테이너 목록으로 다시 호출하면 된다.
 * 호출은 내부 큐로 직렬화되어 동시 호출에도 안전하다.
 */
export function renderMermaidDiagrams(containers: HTMLElement[]): Promise<void> {
  const run = renderQueue.then(() => doRender(containers));
  renderQueue = run.catch(() => {}); // 한 번 실패해도 큐는 이어지게
  return run;
}

async function doRender(containers: HTMLElement[]): Promise<void> {
  if (containers.length === 0) return;

  let mermaid: any;
  try {
    ({ default: mermaid } = await import(/* @vite-ignore */ MERMAID_CDN));
  } catch {
    for (const c of containers) c.textContent = '다이어그램 모듈을 불러오지 못했어요.';
    return;
  }

  // Injoy 디자인 토큰을 그대로 다이어그램 팔레트로 — 라이트/다크 모두 우리 톤
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    // 구문 오류 시 mermaid가 본문에 "Syntax error" 그래픽을 끼워 넣지 않게 막는다
    // (안 막으면 /write 미리보기에서 잘못된 구문이 푸터 밑에 에러 SVG로 샌다)
    suppressErrorRendering: true,
    fontFamily: getComputedStyle(document.body).fontFamily,
    theme: 'base',
    // 시퀀스 다이어그램의 노트·메시지 텍스트가 박스보다 길면 자동 줄바꿈한다.
    // (안 켜면 'Note over A,B'가 두 액터 사이 폭으로 잡히고 긴 한글 노트가 박스 밖으로 넘친다)
    // noteMargin: 노트 텍스트와 박스 사이 여백(기본 10). 여러 줄 노트가 꽉 차 보이지 않게 넉넉히.
    // 줄 수가 늘면 박스 높이가 그만큼 커지고 이 여백은 위아래로 유지된다.
    sequence: { wrap: true, noteMargin: 16 },
    themeVariables: {
      darkMode: effectiveTheme() === 'dark',
      background: v('--surface'),
      fontSize: '14px',
      textColor: v('--text'),
      lineColor: v('--text-muted'),
      // 노드(플로차트)
      primaryColor: v('--accent-weak'),
      primaryTextColor: v('--text'),
      primaryBorderColor: v('--accent'),
      secondaryColor: v('--surface'),
      secondaryBorderColor: v('--border'),
      secondaryTextColor: v('--text'),
      tertiaryColor: v('--bg'),
      tertiaryBorderColor: v('--border'),
      edgeLabelBackground: v('--surface'),
      clusterBkg: v('--bg'),
      clusterBorder: v('--border'),
      // 시퀀스
      actorBkg: v('--accent-weak'),
      actorBorder: v('--accent'),
      actorTextColor: v('--text'),
      actorLineColor: v('--text-muted'),
      signalColor: v('--text'),
      signalTextColor: v('--text'),
      labelBoxBkgColor: v('--accent-weak'),
      labelBoxBorderColor: v('--accent'),
      labelTextColor: v('--text'),
      loopTextColor: v('--text'),
      noteBkgColor: v('--accent-weak'),
      noteBorderColor: v('--accent'),
      noteTextColor: v('--text'),
      activationBkgColor: v('--accent-weak'),
      activationBorderColor: v('--accent'),
    },
  });

  // 웹폰트(Wanted Sans)가 로드되기 전에 그리면 mermaid가 폴백 폰트(system-ui) 글자 폭으로
  // 노드 박스·SVG 폭을 재서, 실제 폰트가 뒤늦게 로드되면 다이어그램이 어긋나 밀린다(간헐적 FOUT).
  // 측정 전에 폰트 로드를 기다려 항상 같은 폰트로 잰다.
  try {
    if (document.fonts?.ready) await document.fonts.ready;
  } catch {
    /* 폰트 API 미지원 등 — 그대로 진행 */
  }

  const scaleOf = (svg: SVGSVGElement): number => {
    // 화면 px 1개가 SVG 좌표계에서 몇 단위인지 (뷰박스 스케일). 보정 delta를 여기 맞춰 변환한다.
    const vb = svg.viewBox?.baseVal;
    const w = svg.getBoundingClientRect().width;
    return vb && vb.width && w ? vb.width / w : 1;
  };
  // 이미 transform이 있으면 덮어쓰지 않고 앞에 translate를 이어 붙인다 (mermaid가 박은 값 보존).
  const prependTranslate = (el: SVGGraphicsElement, dx: number, dy: number) => {
    const prev = el.getAttribute('transform');
    el.setAttribute('transform', `translate(${dx}, ${dy})${prev ? ' ' + prev : ''}`);
  };

  for (const container of containers) {
    const source = container.dataset.source ?? '';
    try {
      // parse()는 DOM을 건드리지 않고 구문만 검사한다 — 잘못된 구문이면 여기서 걸러
      // render()를 부르지 않으므로 에러 그래픽이 본문에 새어 나오지 않는다
      const valid = await mermaid.parse(source, { suppressErrors: true });
      if (!valid) {
        container.classList.add('diagram-error');
        container.textContent = '다이어그램 구문을 확인해 주세요.';
        continue;
      }
      const { svg } = await mermaid.render(`injoy-mmd-${seq++}`, source);
      container.classList.remove('diagram-error');
      container.innerHTML = svg;
      if (isSequenceSource(source)) recenterSequenceText(container, scaleOf, prependTranslate);
    } catch {
      container.classList.add('diagram-error');
      container.textContent = '다이어그램을 렌더링하지 못했어요.';
    }
  }

  // 혹시 mermaid가 남긴 임시 렌더 노드가 있으면 정리한다 (body 끝에 붙는 잔여물 방지)
  for (const orphan of document.querySelectorAll('body > [id^="dinjoy-mmd-"], body > [id^="injoy-mmd-"]')) {
    orphan.remove();
  }
}
