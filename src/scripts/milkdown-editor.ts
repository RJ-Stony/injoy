/**
 * /write 노션식 본문 에디터 (Milkdown = ProseMirror + remark).
 *
 * 설계: 이 에디터가 본문 편집 표면이고, 내용이 바뀔 때마다 마크다운을
 * "숨은 mirror textarea(#fm-body)"로 흘려보낸다. 그러면 기존 발행 파이프라인
 * (buildFile·runLint·suggestEdges)이 textarea.value만 읽으므로 한 줄도 안 고치고
 * 그대로 동작한다. ProseMirror는 document에 의존하므로 이 모듈은 반드시
 * 클라이언트에서 dynamic import로만 로드한다(SSR 회피).
 *
 * Phase 1: commonmark + gfm + history + listener (기본 마크다운 왕복).
 * 콜아웃·위키링크 등 비표준 구문의 안전한 왕복은 Phase 2~3에서 추가한다.
 */
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewOptionsCtx,
  remarkStringifyOptionsCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { history } from '@milkdown/kit/plugin/history';
import { math, katexOptionsCtx } from '@milkdown/plugin-math';
import { replaceAll, insert, getMarkdown } from '@milkdown/kit/utils';
import { alertOptions } from '../utils/callout-config.mjs';
import '@milkdown/kit/prose/view/style/prosemirror.css';
import '@milkdown/kit/prose/tables/style/tables.css';

/**
 * remark-stringify는 줄머리 `[`를 `\[`로 이스케이프한다. 그래서 위키링크
 * `[[slug]]` → `\[\[slug]]`, 콜아웃 `> [!NOTE]` → `> \[!NOTE]`가 되어 빌드
 * 파이프라인(remark-wiki-links, rehype-github-alerts)이 못 알아본다.
 * 직렬화 출력에서 이 두 가지만 키워드 화이트리스트로 정확히 되돌린다.
 * (전역 escape를 끄면 표 셀·링크의 정상 이스케이프까지 망가지므로 노드 단위만.)
 */
const CALLOUT_KEYWORDS = alertOptions.alerts.map((a: { keyword: string }) => a.keyword).join('|');
const CALLOUT_ESCAPED = new RegExp(`^(\\s*>\\s*)\\\\\\[(!(?:${CALLOUT_KEYWORDS}))\\]`, 'gm');

export function normalizeMarkdown(md: string): string {
  return md
    .replace(/\\\[\\\[/g, '[[') // 위키링크 여는 괄호 복원
    .replace(/\\\]\\\]/g, ']]') // (혹시 닫는 괄호도 이스케이프된 경우)
    .replace(CALLOUT_ESCAPED, '$1[$2]'); // 콜아웃 마커 복원
}

export interface EditorHandle {
  /** 본문 전체를 마크다운으로 교체 (글 불러오기·초기화) */
  setMarkdown(markdown: string): void;
  /** 커서 위치에 마크다운 조각 삽입 (이미지·블록 삽입) */
  insertMarkdown(markdown: string): void;
  /** 현재 본문 마크다운 */
  getMarkdown(): string;
  /** 편집 포커스 */
  focus(): void;
  destroy(): Promise<void>;
}

export interface MountOptions {
  /** 마크다운이 바뀔 때마다 호출 (mirror textarea 동기화에 사용) */
  onChange: (markdown: string) => void;
  /** 초기 본문 */
  initialValue?: string;
  /** 이미지 파일을 스테이징하고 본문에 넣을 경로(./_images/...)를 돌려준다. */
  onImageFile?: (file: File) => Promise<string | null>;
  /** 에디터에서 이미지를 보여 줄 때 src를 해석한다(./_images/ → dataURL/raw URL). 직렬화 src는 그대로. */
  resolveImageSrc?: (src: string) => string | null;
}

export async function mountEditor(root: HTMLElement, opts: MountOptions): Promise<EditorHandle> {
  // 붙여넣기·드롭한 이미지 파일을 스테이징한 뒤 커서 위치에 image 노드로 삽입한다.
  const insertImageFiles = (view: any, files: FileList | File[]): boolean => {
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (images.length === 0 || !opts.onImageFile) return false;
    (async () => {
      for (const file of images) {
        const path = await opts.onImageFile!(file);
        if (!path) continue;
        const { state } = view;
        const imageType = state.schema.nodes.image;
        if (!imageType) continue;
        const node = imageType.create({ src: path, alt: '설명을 적어 주세요' });
        view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
      }
    })();
    return true; // 기본 붙여넣기/드롭 동작은 막는다
  };

  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, opts.initialValue ?? '');
      // 직렬화 형식을 블로그 글 관습에 맞춘다 — 불릿 '-', 구분선 '---'
      // (기존 글을 다시 저장할 때 마커가 바뀌어 생기는 불필요한 diff를 줄인다).
      ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,
        bullet: '-',
        rule: '-',
        listItemIndent: 'one',
        fences: true,
        emphasis: '*',
        strong: '*',
      }));
      ctx.update(editorViewOptionsCtx, (prev) => ({
        ...prev,
        attributes: { class: 'injoy-md ProseMirror', spellcheck: 'false' },
        handlePaste: (view: any, event: ClipboardEvent) => {
          const files = event.clipboardData?.files;
          if (files && files.length > 0) return insertImageFiles(view, files);
          return false;
        },
        handleDrop: (view: any, event: DragEvent) => {
          const files = event.dataTransfer?.files;
          if (files && files.length > 0) return insertImageFiles(view, files);
          return false;
        },
        // 이미지 노드의 표시 src만 해석(./_images/ → dataURL/raw). 노드 attr(직렬화)는 불변.
        nodeViews: {
          ...((prev as any).nodeViews ?? {}),
          image: (node: any) => {
            const dom = document.createElement('img');
            const apply = (n: any) => {
              const src = n.attrs.src ?? '';
              dom.src = (opts.resolveImageSrc?.(src) ?? null) || src;
              dom.alt = n.attrs.alt ?? '';
              if (n.attrs.title) dom.title = n.attrs.title;
            };
            apply(node);
            return {
              dom,
              update: (updated: any) => {
                if (updated.type.name !== 'image') return false;
                apply(updated);
                return true;
              },
            };
          },
        },
      }));
      // 잘못된 LaTeX가 에디터를 죽이지 않게 (붉은 에러 표시로 대체)
      ctx.set(katexOptionsCtx.key, { throwOnError: false });
      ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, prevMarkdown) => {
        if (markdown !== prevMarkdown) opts.onChange(normalizeMarkdown(markdown));
      });
    })
    .use(commonmark)
    .use(gfm)
    .use(math)
    .use(history)
    .use(listener)
    .create();

  const view = () => editor.ctx.get(rootCtx) && editor;

  return {
    setMarkdown(markdown: string) {
      editor.action(replaceAll(markdown));
      // replaceAll이 listener를 못 깨우는 경우를 대비해 한 번 더 동기화 (idempotent)
      opts.onChange(normalizeMarkdown(editor.action(getMarkdown())));
    },
    insertMarkdown(markdown: string) {
      editor.action(insert(markdown));
    },
    getMarkdown() {
      return normalizeMarkdown(editor.action(getMarkdown()));
    },
    focus() {
      void view();
      root.querySelector<HTMLElement>('.ProseMirror')?.focus();
    },
    async destroy() {
      await editor.destroy();
    },
  };
}
