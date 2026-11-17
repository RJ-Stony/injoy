/**
 * 검색 결과에서 글로 넘어왔을 때 — 찾던 말이 있는 자리로 내려가 잠깐 밝혔다가 사라지게 한다.
 * 검색 화면이 글 주소에 ?hl=<검색어>를 붙여 보낸다(src/pages/search.astro). 주소에 소제목(#id)이 있으면 그 뒤에서 찾는다.
 * 표시는 한 번만 한다. 주소의 ?hl은 바로 지워서 새로 고치거나 주소를 복사해도 다시 뜨지 않는다.
 */
export function flashSearchTerm(): void {
  const url = new URL(location.href);
  const term = url.searchParams.get('hl')?.trim();
  if (!term) return;
  url.searchParams.delete('hl');
  history.replaceState(history.state, '', url);

  const prose = document.querySelector('.prose');
  if (!prose) return;
  const from = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
  // 검색어 전체를 먼저 찾고, 없으면 낱말 하나씩 찾는다(검색은 낱말이 떨어져 있어도 잡기 때문이다)
  const needles = [term, ...term.split(/\s+/)].map((t) => t.toLowerCase()).filter(Boolean);

  const find = (needle: string): Range | null => {
    const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      // 소제목에서 왔으면 그 소제목보다 뒤에 있는 글에서만 찾는다
      if (from && !(from.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) && !from.contains(node)) continue;
      const at = (node.nodeValue ?? '').toLowerCase().indexOf(needle);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + needle.length);
      return range;
    }
    return null;
  };

  let range: Range | null = null;
  for (const needle of needles) if ((range = find(needle))) break;
  if (!range) return;

  const mark = document.createElement('mark');
  mark.className = 'search-flash';
  range.surroundContents(mark); // 한 글자 덩어리 안에서만 잡았으므로 감쌀 수 있다

  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 글이 올라오는 움직임이 끝난 뒤에 내려간다(먼저 내려가면 올라오는 글과 겹쳐 어지럽다)
  window.setTimeout(() => {
    mark.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
    mark.classList.add('is-on');
    window.setTimeout(() => {
      mark.classList.remove('is-on');
      // 빛이 다 빠지면 표시를 걷어 글을 원래대로 돌려놓는다
      window.setTimeout(() => mark.replaceWith(...mark.childNodes), 1400);
    }, 2600);
  }, 950);
}
