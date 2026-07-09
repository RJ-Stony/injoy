/**
 * 코드 블록 스텝 재생 - 작성자가 [!code step:N] 마커로 지정한 실행 순서를
 * 트랜스포트 바로 재생한다. 재생 중 현재 스텝 줄만 강조(.cs-on),
 * 지나간 스텝은 옅은 잔상(.cs-past). 초기/종료 상태는 강조 없음(평소 코드 그대로).
 *
 * 순서는 작성자가 마커로 지정한 것만 쓴다 - 자동 추론은 하지 않는다.
 * 트랜스포트 바 시각·라벨은 시퀀스 플레이어와 같은 헬퍼(createTransportBar)를 공유한다.
 */
import { createTransportBar } from './sequence-player';

const STEP_INTERVAL = 1200; // ms, 스텝 간 간격

export interface CodeStepPlayer {
  destroy(): void;
}

/**
 * 코드 블록(.code-block)에 스텝 재생 바를 붙인다.
 * pre 안 [data-step] 줄을 번호로 그룹핑해 스텝 2개 이상일 때만 바를 만든다.
 * 그 외에는 null(마커 없는 평범한 블록엔 아무것도 안 붙는다).
 */
export function attachCodeStepPlayer(codeBlock: HTMLElement): CodeStepPlayer | null {
  const pre = codeBlock.querySelector('pre');
  const scroll = codeBlock.querySelector<HTMLElement>('.code-scroll');
  if (!pre || !scroll) return null;

  // [data-step] 줄을 번호(1~99)로 그룹핑 - 같은 번호 여러 줄 허용, 번호 오름차순.
  const byStep = new Map<number, HTMLElement[]>();
  for (const line of pre.querySelectorAll<HTMLElement>('.line[data-step]')) {
    const n = Number(line.dataset.step);
    if (!Number.isFinite(n)) continue;
    (byStep.get(n) ?? byStep.set(n, []).get(n)!).push(line);
  }
  const stepNums = [...byStep.keys()].sort((a, b) => a - b);
  if (stepNums.length < 2) return null;

  const total = stepNums.length;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const transport = createTransportBar('코드 실행 순서 재생');
  const { bar, restartB, prevB, playB, nextB, dots, counter } = transport;
  bar.classList.add('cs-transport');
  // 바는 코드 블록 하단, 내부 스크롤 영역 밖에 둔다.
  codeBlock.append(bar);

  let cur = 0; // 0 = 초기(강조 없음), 1..total = 해당 스텝 재생 중, cur는 재생 위치
  let timer = 0;

  // 점은 스텝 수가 적을 때만(바가 넓어지는 것 방지) - 시퀀스 플레이어와 같은 정책.
  if (total <= 10) {
    for (let i = 0; i < total; i++) {
      const d = document.createElement('span');
      d.className = 'sq-dot';
      dots.append(d);
    }
  }

  const clearHighlight = () => {
    for (const nums of byStep.values()) {
      for (const el of nums) el.classList.remove('cs-on', 'cs-past');
    }
  };

  const render = () => {
    clearHighlight();
    // cur === 0: 초기/종료 상태 = 강조 없음. counter는 '0 / N'(다이어그램 카운터와 같은 결).
    if (cur > 0 && cur <= total) {
      for (let i = 0; i < cur; i++) {
        const isCurrent = i === cur - 1;
        for (const el of byStep.get(stepNums[i])!) {
          el.classList.add(isCurrent ? 'cs-on' : 'cs-past');
        }
      }
      // 현재 스텝 줄이 내부 스크롤 밖이면 pre 내부 스크롤만 조정(페이지 스크롤은 안 건드림).
      const onLine = byStep.get(stepNums[cur - 1])![0];
      scrollLineIntoView(onLine, scroll);
    }
    counter.textContent = `${cur} / ${total}`;
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i < cur));
    prevB.disabled = cur <= 0;
    nextB.disabled = cur >= total;
    transport.setPlayIcon(!!timer, cur >= total);
  };

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = 0;
    transport.setPlayIcon(false, cur >= total);
  };

  const advance = () => {
    if (cur >= total) { stop(); return; } // 마지막 스텝에서 멈춰 유지(자동 초기화 안 함)
    cur++;
    render();
    if (cur >= total) stop(); // 마지막 도달 = 그 상태로 정지(강조 유지, ↺ 눌러야 0)
  };

  const reset = () => { cur = 0; render(); };

  const play = () => {
    if (cur >= total) cur = 0; // 마지막(종료) 상태에서 재생 = 처음부터 다시
    cur++;
    render();
    if (cur < total) {
      timer = window.setInterval(advance, reduced ? 400 : STEP_INTERVAL);
      transport.setPlayIcon(true, cur >= total);
    } else {
      stop(); // 스텝이 하나뿐인 경우 등: 마지막에서 정지 유지
    }
  };

  playB.addEventListener('click', () => (timer ? stop() : play()));
  restartB.addEventListener('click', () => { stop(); reset(); }); // ↺ = 0으로 초기화(자동 재생 안 함)
  prevB.addEventListener('click', () => { stop(); cur = Math.max(0, cur - 1); render(); });
  nextB.addEventListener('click', () => { stop(); cur = Math.min(total, cur + 1); render(); });

  render();

  return {
    destroy() {
      stop();
      clearHighlight();
      bar.remove();
    },
  };
}

/** pre 내부 스크롤 컨테이너 안에서만 줄이 보이도록 스크롤(페이지 스크롤은 건드리지 않는다). */
function scrollLineIntoView(line: HTMLElement, scroll: HTMLElement) {
  const lr = line.getBoundingClientRect();
  const sr = scroll.getBoundingClientRect();
  if (lr.top < sr.top) {
    scroll.scrollTop += lr.top - sr.top;
  } else if (lr.bottom > sr.bottom) {
    scroll.scrollTop += lr.bottom - sr.bottom;
  }
}
