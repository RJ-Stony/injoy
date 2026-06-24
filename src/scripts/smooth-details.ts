/**
 * <details>의 펼침·접힘을 부드럽게 — Web Animations API로 높이를 애니메이션한다.
 * CSS의 ::details-content는 아직 일부 모바일 브라우저(특히 iOS Safari)에서 안 먹어,
 * 데스크톱·모바일 어디서나 똑같이 동작하도록 JS로 처리한다.
 * 모션 줄이기 설정이면 손대지 않고 네이티브 즉시 토글로 둔다.
 */
const DURATION = 260;
const EASING = 'cubic-bezier(0.33, 1, 0.68, 1)';

function animateDetails(d: HTMLDetailsElement) {
  if (d.dataset.smooth) return;
  const summary = d.querySelector('summary');
  if (!summary) return;
  d.dataset.smooth = '1';
  let current: Animation | null = null;

  summary.addEventListener('click', (e: Event) => {
    // 모션 줄이기: 가로채지 않고 네이티브 토글에 맡긴다
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    e.preventDefault();
    current?.cancel();
    const start = d.offsetHeight;

    const run = (end: number, onDone?: () => void) => {
      d.style.overflow = 'hidden';
      current = d.animate([{ height: `${start}px` }, { height: `${end}px` }], {
        duration: DURATION,
        easing: EASING,
      });
      current.onfinish = () => {
        d.style.overflow = '';
        current = null;
        onDone?.();
      };
      current.oncancel = () => {
        d.style.overflow = '';
      };
    };

    if (!d.open) {
      d.open = true; // [open] 스타일(캐럿 회전 등) 즉시 적용 + 전체 높이 측정
      run(d.offsetHeight);
    } else {
      run((summary as HTMLElement).offsetHeight, () => {
        d.open = false; // 접는 애니메이션이 끝난 뒤 실제로 닫는다
      });
    }
  });
}

/** 공개 화면의 접이식 요소(시리즈 폴더·시리즈 내비·만듦새 패널)에 부드러운 펼침을 입힌다. */
export function enhanceSmoothDetails(
  selector = '.series-folder, details.series, .makeup',
): void {
  // Web Animations API 미지원(아주 오래된 브라우저)이면 네이티브 토글 그대로 둔다
  if (typeof Element === 'undefined' || !('animate' in Element.prototype)) return;
  document.querySelectorAll<HTMLDetailsElement>(selector).forEach(animateDetails);
}
