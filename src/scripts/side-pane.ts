/**
 * 나란히 읽기 — 본문에서 다른 글로 가는 링크를 누르면 페이지를 떠나지 않고 옆 칸에 그 글을 연다.
 * 옆 칸은 같은 글 페이지를 ?pane=1로 띄운 iframe이라, 다이어그램과 코드 블록이 원래 화면과 똑같이 그려진다.
 * (칸 안에서 머리말과 꼬리말을 숨기고 링크를 다루는 쪽은 BaseLayout의 인라인 스크립트와 global.css다.)
 * Ctrl/⌘/Shift 클릭과 가운데 클릭은 건드리지 않아 새 탭으로 열 수 있다.
 */

const LINKS = '.prose a.wiki-link, .prereq a, .connections a[href*="/posts/"]';

export function initSidePane(): void {
  if (window.self !== window.top) return; // 옆 칸 안에서는 칸을 또 열지 않는다

  const root = document.documentElement;
  let pane: HTMLElement | null = null;
  let frame: HTMLIFrameElement;
  let titleEl: HTMLElement;
  let fullEl: HTMLAnchorElement;
  let opener: HTMLElement | null = null;

  const close = () => {
    if (!pane || pane.hidden) return;
    pane.hidden = true;
    delete root.dataset.side;
    frame.src = 'about:blank';
    opener?.focus({ preventScroll: true });
  };

  const build = () => {
    pane = document.createElement('aside');
    pane.className = 'side-pane';
    pane.setAttribute('aria-label', '옆에 연 글');
    pane.hidden = true;

    const bar = document.createElement('div');
    bar.className = 'side-pane-bar';
    titleEl = document.createElement('p');
    titleEl.className = 'side-pane-title';
    fullEl = document.createElement('a');
    fullEl.className = 'side-pane-full';
    fullEl.textContent = '이 글로 이동';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'side-pane-close';
    closeBtn.setAttribute('aria-label', '옆 칸 닫기');
    closeBtn.textContent = '닫기';
    closeBtn.addEventListener('click', close);
    bar.append(titleEl, fullEl, closeBtn);

    frame = document.createElement('iframe');
    frame.title = '옆에 연 글';
    // 칸 안에서 다른 글로 넘어가면 제목과 '이 글로 이동'의 주소를 따라 바꾼다
    frame.addEventListener('load', () => {
      const doc = frame.contentDocument;
      const path = frame.contentWindow?.location.pathname;
      if (!doc || !path || path === 'blank') return;
      titleEl.textContent = doc.querySelector('h1')?.textContent ?? titleEl.textContent;
      fullEl.href = path;
    });

    pane.append(bar, frame);
    document.body.append(pane);
  };

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
      return;
    }
    const link = (e.target as Element).closest<HTMLElement>(LINKS);
    const href = link?.getAttribute('href');
    if (!link || !href) return;
    const url = new URL(href, location.href);
    if (url.origin !== location.origin || url.pathname === location.pathname) return;

    e.preventDefault();
    if (!pane) build();
    opener = link;
    titleEl.textContent = link.dataset.title ?? link.textContent?.trim() ?? '';
    fullEl.href = url.pathname;
    url.searchParams.set('pane', '1');
    frame.src = url.href;
    // 머리말의 아랫줄과 옆 칸 막대의 아랫줄이 한 줄로 이어지게 높이를 맞춘다
    const header = document.querySelector<HTMLElement>('.site-header');
    if (header) pane!.style.setProperty('--bar-h', `${header.offsetHeight}px`);
    pane!.hidden = false;
    root.dataset.side = 'true';
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}
