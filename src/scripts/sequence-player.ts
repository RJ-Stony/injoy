/**
 * 시퀀스 다이어그램 스텝 재생 트랜스포트.
 * 렌더된 SVG는 그대로 두고(초기 = 완성 상태), 메시지·노트·활성화 요소를
 * 시간순으로 그룹핑해 재생 시 한 스텝씩 드러낸다.
 * 본문(.diagram-wrap)과 확대 모달이 공유한다. 문서 마크다운은 건드리지 않는다.
 */

const STEP_INTERVAL = 1500; // ms, 스텝 간 간격(선이 그어지는 시간을 넉넉히)
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

/**
 * 스텝 그룹핑.
 * Step 1 실측 결과: mermaid 시퀀스는 메시지 '텍스트'를 그 '라인'보다 ~35px 위에 그리고,
 * 뒤따르는 노트는 그 라인 바로 아래에 온다. 따라서 라인과 텍스트가 같은 y 밴드로 묶이지
 * 않아(약 35px 차) 순수 y밴드는 한 메시지를 여러 스텝으로 쪼갠다.
 * SVG DOM 순서도 노트를 별도 그룹으로 몰아 넣어 시간순이 아니다(실측 확인).
 * 결정적 시간순은 y좌표뿐이므로, y로 정렬한 뒤 '메시지 텍스트가 새 스텝을 연다'는
 * 규칙으로 묶는다. 메시지의 라인·활성화·뒤따르는 노트는 직전 메시지 스텝에 붙는다.
 * 첫 메시지 전에 나오는 노트(선행 노트)는 자기 스텝을 연다.
 *
 * ★줄바꿈된 라벨: 긴 메시지 라벨은 mermaid가 여러 개의 `text.messageText`로 나눠 그린다
 * (화살표는 하나뿐인데). 매 텍스트가 새 스텝을 열면 2줄 라벨이 스텝 2개로 쪼개진다.
 * 직전 메시지 텍스트와 한 줄 높이(자기 높이의 1.6배) 안쪽에 붙은 텍스트는 '같은 메시지의
 * 다음 줄'로 보고 스텝을 새로 열지 않는다. gap·height 둘 다 줌에 같이 스케일되니 비율은
 * 줌과 무관하다(모달 확대에서도 안전). 다음 메시지는 화살표+행 간격만큼 훨씬 멀어 안 겹친다.
 */
function collectSteps(svg: SVGSVGElement): Step[] {
  const items = [...svg.querySelectorAll(SELECTOR)].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      el, y: r.top, h: r.height,
      starter: el.tagName.toLowerCase() === 'text' && el.classList.contains('messageText'),
    };
  });
  if (items.length === 0) return [];
  items.sort((a, b) => a.y - b.y);
  const steps: Step[] = [];
  let prevStarterY = -Infinity;
  let prevStarterH = 0;
  for (const it of items) {
    let opensStep: boolean;
    if (it.starter) {
      // 같은 메시지의 줄바꿈된 다음 줄이면 스텝을 새로 열지 않는다.
      const sameMessage = steps.length > 0 && it.y - prevStarterY < prevStarterH * 1.6;
      opensStep = !sameMessage;
      prevStarterY = it.y;
      prevStarterH = it.h;
    } else {
      // 라인·활성화·뒤따르는 노트는 직전 스텝에 붙는다. 선행 노트 등 첫 요소만 새 스텝.
      opensStep = steps.length === 0;
    }
    if (opensStep) steps.push({ els: [] });
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

export const PLAYER_PATHS = {
  restart: 'M4 4v6h6M4 10a8 8 0 1 1-1 6',
  prev: 'M15 6l-6 6 6 6',
  play: 'M8 5.5v13l11-6.5z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  next: 'M9 6l6 6-6 6',
};

const PATHS = PLAYER_PATHS;

/** 트랜스포트 바 조각 - 시퀀스 재생과 코드 스텝 재생이 같은 시각·라벨을 쓰도록 공유한다. */
export interface TransportBar {
  bar: HTMLDivElement;
  restartB: HTMLButtonElement;
  prevB: HTMLButtonElement;
  playB: HTMLButtonElement;
  nextB: HTMLButtonElement;
  dots: HTMLSpanElement;
  counter: HTMLSpanElement;
  setPlayIcon(playing: boolean, atEnd: boolean): void;
}

/**
 * 트랜스포트 바 DOM 생성(버튼 4개 + 점 + 카운터).
 * 스타일은 global.css의 .sq-* 를 그대로 쓴다. 상태 기계는 호출부가 붙인다.
 */
export function createTransportBar(ariaLabel: string): TransportBar {
  const bar = document.createElement('div');
  bar.className = 'sq-transport';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', ariaLabel);
  const restartB = btn('처음으로 되돌리기', PATHS.restart);
  const prevB = btn('이전 단계', PATHS.prev);
  const playB = btn('재생', PATHS.play, 'sq-play');
  const nextB = btn('다음 단계', PATHS.next);
  const dots = document.createElement('span');
  dots.className = 'sq-dots';
  dots.setAttribute('aria-hidden', 'true');
  const counter = document.createElement('span');
  counter.className = 'sq-counter';
  bar.append(restartB, prevB, playB, nextB, dots, counter);

  const setPlayIcon = (playing: boolean, atEnd: boolean) => {
    playB.querySelector('path')!.setAttribute('d', playing ? PATHS.pause : PATHS.play);
    playB.setAttribute('aria-label', playing ? '일시정지' : atEnd ? '다시 재생' : '재생');
  };

  return { bar, restartB, prevB, playB, nextB, dots, counter, setPlayIcon };
}

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

  // ---- 트랜스포트 바 (공유 헬퍼로 생성 -> 스타일은 global.css) ----
  const transport = createTransportBar('시퀀스 재생');
  const { bar, restartB, prevB, playB, nextB, dots, counter } = transport;
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
    transport.setPlayIcon(playing, cur >= steps.length);
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
  restartB.addEventListener('click', () => { stop(); cur = 0; render(); }); // ↺ = 0으로 초기화(자동 재생 안 함)
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
