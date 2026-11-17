/**
 * 책장 넘기기 — 사이트 안에서 화면을 오갈 때 뚝 바뀌지 않게 잇는다.
 *  1) 떠날 때: 내용이 위로 빠진 뒤에 이동한다. 책(목차와 글)끼리 오갈 때는 구분선([data-rule])만 남기고,
 *     책 밖(홈, 메뉴)으로 나갈 때는 구분선도 왼쪽으로 줄어든다.
 *  2) 도착했을 때: 구분선이 먼저 움직이고(src/components/Rule.astro), 그 뒤에 내용이 올라온다
 *     (올라오는 쪽은 BaseLayout의 인라인 스크립트가 붙이는 html[data-arrive]와 global.css가 맡는다).
 *  3) 뒤로/앞으로 가기: 누르는 순간을 가로챌 수 없어서 떠나는 효과는 없다. 대신 떠나는 화면이 구분선의 자리를
 *     적어 두고(pagehide), 도착한 화면이 같은 순서(줄 → 글)로 나타난다.
 * 서가에서 책을 펼칠 때의 표지 → 종이 전환은 src/components/Shelf.astro가 맡고, 같은 기록(injoy:turn)을 남긴다.
 * 브라우저의 화면 전환 기능에 기대지 않아서 어느 브라우저에서나 같게 움직인다.
 */

const KEY = 'injoy:turn';
// 글 화면에서 '나란히 읽기'(side-pane.ts)가 옆 칸에 여는 링크는 건드리지 않는다
const SIDE = '.prose a.wiki-link, .prereq a, .connections a[href*="/posts/"]';
const EASE = 'cubic-bezier(.76,0,.18,1)';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const inPane = window.self !== window.top;
const rule = () => document.querySelector<HTMLElement>('[data-rule]');

interface Turn {
  t: number;
  rule: { x: number; y: number; w: number } | null;
}

const ruleRect = () => {
  const r = rule()?.getBoundingClientRect();
  // 스크롤해서 줄이 화면 밖에 있으면 적지 않는다(다음 화면의 줄은 왼쪽에서 새로 그어진다)
  return r && r.bottom > 0 && r.top < innerHeight ? { x: r.left, y: r.top, w: r.width } : null;
};
const note = (wait: number) => sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now() + wait, rule: ruleRect() }));
const read = (): Turn | null => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
};

/** 떠날 때 빠지는 것: 책에서는 글줄들(구분선은 남는다), 그 밖의 화면에서는 내용 전체 */
const leaving = (): HTMLElement[] => {
  // 글줄만이 아니라 글 아래의 시리즈 목록, 연결된 글, 이전·다음 글, 댓글과 옆의 목차도 함께 빠진다
  // (글 맨 아래에서 다음 글을 눌렀을 때 그 자리에 보이던 것이 그대로 남았다가 뚝 끊기지 않게)
  const lines = [
    ...document.querySelectorAll<HTMLElement>(
      '.sheet .rise, .sheet .meta-stats, .toc-aside, .post > :not(.rule):not(.post-header):not(.rise):not(script):not(span)',
    ),
  ];
  if (lines.length > 0) return lines;
  const main = document.querySelector<HTMLElement>('main');
  return main ? [main] : [];
};
const isBook = (path: string) => /\/(series|posts)\//.test(path);

// 새로 뜬 화면에서 구분선을 움직이는 쪽은 src/components/Rule.astro의 인라인 스크립트다(화면이 그려지기 전에 시작해야 해서).
// 여기서는 다 쓴 기록만 지운다.
sessionStorage.removeItem(KEY);

// ---- 떠날 때(링크를 눌렀을 때) ----
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  const link = (e.target as Element).closest<HTMLAnchorElement>('a[href]');
  const href = link?.getAttribute('href');
  if (!link || !href || reduce) return;
  if (link.hasAttribute('download') || (link.getAttribute('target') ?? '_self') !== '_self') return;
  if (link.closest('.shelf-hero, .write-root')) return; // 서가는 제 전환을 쓰고, 글쓰기 화면은 건드리지 않는다
  // (옆 칸 안에서는 그런 링크도 칸 안에서 넘어가므로 여기서 다룬다)
  if (!inPane && document.querySelector('.post') && link.matches(SIDE)) return;
  const url = new URL(href, location.href);
  if (url.origin !== location.origin || url.pathname === location.pathname) return;
  if (/\.(xml|json|md|txt|png|jpe?g|webp|pdf)$/i.test(url.pathname)) return;

  e.preventDefault();
  note(400);
  // 책을 펼쳤다는 표시는 책 안에서만 이어진다. 다른 화면을 거쳐 홈에 가면 서가는 처음 모습으로 뜬다
  if (!inPane && !isBook(location.pathname)) sessionStorage.removeItem('injoy:opened');
  // 책에서 서가(홈)로 나갈 때는 펼칠 때의 거꾸로다. 글이 올라왔던 자리로 다시 내려가며 사라지고,
  // 그 뒤에 홈에서 종이가 표지로 접힌다. 그 밖의 이동은 위로 빠진다.
  const home = document.querySelector<HTMLAnchorElement>('.site-header .logo');
  const toShelf = !!home && url.pathname === new URL(home.href).pathname && !!document.querySelector('.sheet');
  leaving().forEach((el, k) =>
    el.animate(
      [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: toShelf ? 'translateY(20px)' : 'translateY(-14px)' },
      ],
      { duration: 230, delay: Math.min(k, 8) * 16, easing: 'ease-in', fill: 'forwards' },
    ),
  );
  // 책 밖으로 나갈 때는 구분선도 왼쪽으로 줄어들며 사라진다(책 안에서는 남아서 다음 화면의 줄로 이어진다)
  if (!isBook(url.pathname)) {
    rule()?.animate(
      [
        { transformOrigin: '0 0', transform: 'scaleX(1)' },
        { transformOrigin: '0 0', transform: 'scaleX(0)' },
      ],
      { duration: 300, delay: 60, easing: EASE, fill: 'forwards' },
    );
  }
  window.setTimeout(() => (location.href = url.href), isBook(url.pathname) ? 290 : 380);
});

// ---- 떠날 때(뒤로/앞으로 가기 포함): 구분선의 자리를 적어 두고, 저장될 화면은 글을 감춘 채로 둔다 ----
window.addEventListener('pagehide', (e) => {
  if (inPane || reduce) return;
  const turn = read();
  // 링크를 눌러 떠나는 중이면 위에서 이미 적었다(줄이 줄어드는 도중의 길이를 다시 적지 않는다)
  if (!turn || turn.t < Date.now() - 1500) note(0);
  // 이 화면이 그대로 저장됐다가 뒤로 가기로 다시 뜰 때, 글이 먼저 보이고 줄이 뒤늦게 움직이지 않게 한다
  if (e.persisted) for (const el of leaving()) el.style.opacity = '0';
});

// ---- 뒤로/앞으로 와서 저장된 화면이 그대로 다시 뜰 때: 줄이 먼저 움직이고, 감춰 둔 내용이 올라온다 ----
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  const turn = read();
  sessionStorage.removeItem(KEY);
  document.documentElement.dataset.arrive = 'page';
  const line = rule();
  if (line && !reduce) {
    line.getAnimations().forEach((a) => a.cancel());
    const r = line.getBoundingClientRect();
    const from = turn?.rule
      ? `translate(${turn.rule.x - r.left}px, ${turn.rule.y - r.top}px) scaleX(${turn.rule.w / r.width})`
      : 'scaleX(0)';
    line.animate(
      [
        { transformOrigin: '0 0', transform: from },
        { transformOrigin: '0 0', transform: 'none' },
      ],
      { duration: 480, easing: EASE },
    );
  }
  for (const el of document.querySelectorAll<HTMLElement>('.sheet .rise, .sheet .meta-stats, .post > *, .toc-aside, main, main > *')) {
    el.getAnimations().forEach((a) => a.cancel());
    el.style.opacity = '';
    el.style.animation = 'none';
    void el.offsetWidth; // CSS 애니메이션을 처음부터 다시 돌린다
    el.style.animation = '';
  }
});
