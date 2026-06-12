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
 * `.mermaid-diagram` 컨테이너(dataset.source에 원본 보유)들을 렌더한다.
 * 테마가 바뀌면 같은 컨테이너 목록으로 다시 호출하면 된다.
 */
export async function renderMermaidDiagrams(containers: HTMLElement[]): Promise<void> {
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
