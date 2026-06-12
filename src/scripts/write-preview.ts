/**
 * /write 에디터의 실시간 미리보기 파이프라인.
 * 빌드(astro.config.mjs)와 같은 remark/rehype 플러그인 구성을 클라이언트에서
 * 그대로 돌려 "발행했을 때 모습"을 발행 전에 보여 준다.
 * - 코드 하이라이트(Shiki)와 다이어그램(Mermaid)은 CDN 지연 로드, 실패해도 글은 보인다.
 * - 첨부했지만 아직 커밋 전인 이미지는 data URL로, 레포에 있는 이미지는 raw URL로 보여 준다.
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkSmartypants from 'remark-smartypants';
import remarkMath from 'remark-math';
import remarkEmoji from 'remark-emoji';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import { rehypeGithubAlerts } from 'rehype-github-alerts';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import remarkWikiLinks from '../plugins/remark-wiki-links.mjs';
import rehypeTableWrap from '../plugins/rehype-table-wrap.mjs';
import rehypeFigure from '../plugins/rehype-figure.mjs';
import rehypeTossface from '../plugins/rehype-tossface.mjs';
import { alertOptions } from '../utils/callout-config.mjs';
import { renderMermaidDiagrams } from './mermaid-render';

const SHIKI_CDN = 'https://cdn.jsdelivr.net/npm/shiki@3/bundle/web/+esm';
const SHIKI_TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@shikijs/transformers@3/+esm';

export interface PreviewOptions {
  /** 배포 base 경로 — 위키링크가 빌드와 같은 URL을 갖게 한다 */
  base: string;
  /** 슬러그 → 글 제목. 외부에서 항목을 채워 넣으면 즉시 반영된다(객체 참조 공유). */
  titles: Record<string, string>;
}

/** 마크다운 → HTML 변환기를 만든다. 빌드 파이프라인과 동일한 순서·옵션. */
export function createPreviewRenderer({ base, titles }: PreviewOptions) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkSmartypants)
    .use(remarkMath)
    .use(remarkEmoji, { accessible: true })
    .use(remarkWikiLinks, { titles, base })
    .use(remarkRehype, {
      allowDangerousHtml: true,
      footnoteLabel: '각주',
      footnoteBackLabel: '본문으로 돌아가기',
      footnoteLabelProperties: { className: ['footnotes-title'] },
    })
    .use(rehypeRaw)
    .use(rehypeGithubAlerts, alertOptions)
    .use(rehypeTableWrap)
    .use(rehypeKatex)
    .use(rehypeFigure)
    .use(rehypeTossface)
    .use(rehypeStringify);

  return async (markdown: string): Promise<string> => String(await processor.process(markdown));
}

let shikiPromise: Promise<[any, any]> | null = null;
const loadShiki = () => {
  shikiPromise ??= Promise.all([
    import(/* @vite-ignore */ SHIKI_CDN),
    import(/* @vite-ignore */ SHIKI_TRANSFORMERS_CDN),
  ]).catch((e) => {
    shikiPromise = null; // 다음 렌더에서 재시도
    throw e;
  });
  return shikiPromise;
};

async function highlightCodeBlocks(codes: Element[]): Promise<void> {
  if (codes.length === 0) return;
  let shiki: any;
  let transformers: any;
  try {
    [shiki, transformers] = await loadShiki();
  } catch {
    return; // CDN 불가 — 플레인 코드블록으로 둔다
  }
  for (const code of codes) {
    const lang =
      [...code.classList].find((c) => c.startsWith('language-'))?.slice('language-'.length) ??
      'text';
    const pre = code.closest('pre');
    if (!pre) continue;
    try {
      const html = await shiki.codeToHtml(code.textContent ?? '', {
        lang,
        themes: { light: 'github-light', dark: 'github-dark' },
        transformers: [
          transformers.transformerNotationDiff(),
          transformers.transformerNotationHighlight(),
        ],
      });
      const tpl = document.createElement('template');
      tpl.innerHTML = html;
      const highlighted = tpl.content.querySelector('pre');
      if (highlighted) {
        // 빌드 산출물과 같은 클래스 — 듀얼 테마 CSS(astro-code)가 그대로 적용된다
        highlighted.classList.add('astro-code');
        highlighted.dataset.language = lang;
        pre.replaceWith(highlighted);
      }
    } catch {
      /* 웹 번들에 없는 언어 등 — 플레인 코드로 둔다 */
    }
  }
}

export interface EnhanceOptions {
  /** 이미지 경로(./_images/.. 등)를 미리볼 수 있는 URL로 바꾼다. null이면 그대로 둔다. */
  resolveImage: (src: string) => string | null;
}

/**
 * 변환된 HTML이 들어간 컨테이너를 발행 후 모습으로 마저 끌어올린다:
 * 이미지 경로 해석 → Mermaid 렌더 → Shiki 하이라이트.
 * 컨테이너가 그 사이 교체(재렌더)되면 작업 결과는 떨어져 나간 노드에만 적용되어 무해하다.
 */
export async function enhancePreview(root: HTMLElement, opts: EnhanceOptions): Promise<void> {
  for (const img of root.querySelectorAll('img')) {
    const resolved = opts.resolveImage(img.getAttribute('src') ?? '');
    if (resolved) img.src = resolved;
  }

  const mermaidContainers: HTMLElement[] = [];
  for (const code of root.querySelectorAll('pre > code.language-mermaid')) {
    const pre = code.parentElement as HTMLElement;
    const div = document.createElement('div');
    div.className = 'mermaid-diagram';
    div.dataset.source = code.textContent ?? '';
    pre.replaceWith(div);
    mermaidContainers.push(div);
  }

  const codeBlocks = [...root.querySelectorAll('pre > code[class*="language-"]')];
  await Promise.all([
    renderMermaidDiagrams(mermaidContainers),
    highlightCodeBlocks(codeBlocks),
  ]);
}
