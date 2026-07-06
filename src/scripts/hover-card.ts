/**
 * 데스크톱 hover 미리보기 카드.
 * - a.wiki-link: 대상 글 카테고리·제목·설명 (remark-wiki-links가 심은 data 속성)
 * - .connections .mg-node: 미니그래프 노드 — 관계 문구(카테고리 줄)·제목·설명·note
 * - 각주 참조: 대응 각주 본문 (백링크 제거)
 * 모바일(hover 없음)에서는 아무것도 하지 않는다 - 링크 기본 동작 그대로.
 */

const SHOW_DELAY = 250; // ms

export function initHoverCards(): void {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const targets = document.querySelectorAll<HTMLAnchorElement>(
    '.prose a.wiki-link[data-title], .connections .mg-node[data-title], .prose [data-footnote-ref]',
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
    // 위키링크·미니그래프 노드 — data-title이 있으면 글 미리보기 카드.
    // (각주 참조는 data-title이 없으므로 아래 각주 경로로 빠진다.)
    const el = a as unknown as HTMLElement;
    if (el.dataset.title) {
      const t = el.dataset.title;
      card.innerHTML = '';
      const cat = document.createElement('p');
      cat.className = 'hc-category';
      cat.textContent = el.dataset.category ?? '';
      const title = document.createElement('p');
      title.className = 'hc-title';
      title.textContent = t;
      const desc = document.createElement('p');
      desc.className = 'hc-desc';
      desc.textContent = el.dataset.description ?? '';
      card.append(cat, title, desc);
      if (!cat.textContent) cat.remove();
      if (!desc.textContent) desc.remove();
      const note = el.dataset.note;
      if (note) {
        const n = document.createElement('p');
        n.className = 'hc-note';
        n.textContent = note;
        card.append(n);
      }
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
    anchor.addEventListener('focus', () => {
      if (fill(anchor)) place(anchor);
    });
    anchor.addEventListener('blur', hide);
  }
  window.addEventListener('scroll', hide, { passive: true });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
}
