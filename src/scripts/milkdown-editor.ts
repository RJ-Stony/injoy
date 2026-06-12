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
import '@milkdown/kit/prose/view/style/prosemirror.css';
import '@milkdown/kit/prose/tables/style/tables.css';

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
}

export async function mountEditor(root: HTMLElement, opts: MountOptions): Promise<EditorHandle> {
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
      }));
      // 잘못된 LaTeX가 에디터를 죽이지 않게 (붉은 에러 표시로 대체)
      ctx.set(katexOptionsCtx.key, { throwOnError: false });
      ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, prevMarkdown) => {
        if (markdown !== prevMarkdown) opts.onChange(markdown);
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
      opts.onChange(editor.action(getMarkdown()));
    },
    insertMarkdown(markdown: string) {
      editor.action(insert(markdown));
    },
    getMarkdown() {
      return editor.action(getMarkdown());
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
