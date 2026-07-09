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
  editorViewCtx,
  editorViewOptionsCtx,
  remarkStringifyOptionsCtx,
} from '@milkdown/kit/core';
import { commonmark, codeBlockSchema } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { history } from '@milkdown/kit/plugin/history';
import { math, katexOptionsCtx } from '@milkdown/plugin-math';
import { replaceAll, insert, getMarkdown, $prose, $markSchema } from '@milkdown/kit/utils';
import { Plugin, TextSelection } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { toggleMark } from '@milkdown/kit/prose/commands';
import { alertOptions } from '../utils/callout-config.mjs';
import { WIKI_LINK_RE } from '../plugins/wiki-link-pattern.mjs';
import '@milkdown/kit/prose/view/style/prosemirror.css';
import '@milkdown/kit/prose/tables/style/tables.css';

/**
 * Milkdown 기본 code_block 스키마는 펜스 언어 뒤 메타(`​```ts src/foo.ts`의 파일명)를 버려서,
 * 파일명을 단 코드블록을 /write에서 한 번 열었다 저장하면 파일명이 조용히 증발한다.
 * meta attr를 더해 파싱·직렬화 양쪽에서 보존한다(코드블록 헤더의 파일명 = 이 메타).
 */
const codeBlockWithMeta = codeBlockSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx);
  return {
    ...base,
    attrs: {
      ...base.attrs,
      meta: { default: '', validate: 'string' },
    },
    parseMarkdown: {
      match: base.parseMarkdown.match,
      runner: (state: any, node: any, type: any) => {
        state.openNode(type, { language: node.lang ?? '', meta: node.meta ?? '' });
        if (node.value) state.addText(node.value);
        state.closeNode();
      },
    },
    toMarkdown: {
      match: base.toMarkdown.match,
      runner: (state: any, node: any) => {
        // mdast는 lang이 빈 문자열이면 meta를 통째로 버린다(code.js: if (node.lang && node.meta)).
        // 파일명(meta)만 있고 언어가 없으면 'text'로 채워, 파일명이 조용히 증발하지 않게 한다.
        const meta = node.attrs.meta || undefined;
        state.addNode('code', undefined, node.content.firstChild?.text || '', {
          lang: node.attrs.language || (meta ? 'text' : undefined),
          meta,
        });
      },
    },
  };
});

/**
 * remark-stringify는 줄머리 `[`를 `\[`로 이스케이프한다. 그래서 위키링크
 * `[[slug]]` → `\[\[slug]]`, 콜아웃 `> [!NOTE]` → `> \[!NOTE]`가 되어 빌드
 * 파이프라인(remark-wiki-links, rehype-github-alerts)이 못 알아본다.
 * 직렬화 출력에서 이 두 가지만 키워드 화이트리스트로 정확히 되돌린다.
 * (전역 escape를 끄면 표 셀·링크의 정상 이스케이프까지 망가지므로 노드 단위만.)
 */
const CALLOUT_KEYWORDS = alertOptions.alerts.map((a: { keyword: string }) => a.keyword).join('|');
// 한 줄 단위(per-line) 콜아웃 마커 복원 — 코드 영역은 호출부에서 건너뛴다.
const CALLOUT_LINE = new RegExp(`^(\\s*>\\s*)\\\\\\[(!(?:${CALLOUT_KEYWORDS}))\\]`);

/** 인라인 코드(`...`) 밖에서만 위키링크 여는/닫는 괄호의 이스케이프를 되돌린다. */
function restoreWikiOutsideInlineCode(text: string): string {
  return text
    .split(/(`+[^`]*`+)/) // 홀수 인덱스 = 인라인 코드 스팬(그대로 보존)
    .map((seg, i) => (i % 2 === 1 ? seg : seg.replace(/\\\[\\\[/g, '[[').replace(/\\\]\\\]/g, ']]')))
    .join('');
}

/**
 * remark-stringify가 줄머리 `[`를 `\[`로 이스케이프한 것을 되돌리되,
 * 코드펜스·인라인 코드 안은 절대 건드리지 않는다(코드는 verbatim이라
 * 사용자가 쓴 정규식·이스케이프 예시가 손상되면 안 됨).
 */
export function normalizeMarkdown(md: string): string {
  const lines = md.split('\n');
  let fence: string | null = null;
  return lines
    .map((line) => {
      const fenceTok = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
      if (fence) {
        // 코드펜스 내부 — 닫는 펜스를 만나기 전까지 전부 그대로
        if (fenceTok && fenceTok[0] === fence[0] && fenceTok.length >= fence.length) fence = null;
        return line;
      }
      if (fenceTok) {
        fence = fenceTok;
        return line;
      }
      // 코드 밖 라인: 위키링크 복원(인라인 코드 제외) + 콜아웃 마커 복원
      return restoreWikiOutsideInlineCode(line).replace(CALLOUT_LINE, '$1[$2]');
    })
    .join('\n');
}

/**
 * 에디터 안에서 콜아웃을 박스로, 위키링크를 칩으로 "보이게" 하는 데코레이션.
 * 문서 모델(블록인용·텍스트)은 그대로 두고 시각만 입히므로 round-trip에 영향이 없다.
 * 위치 계산 오류가 에디터를 죽이지 않게 전체를 try/catch로 감싼다.
 */
const KIND_LABEL: Record<string, string> = Object.fromEntries(
  alertOptions.alerts.map((a: { keyword: string; title: string }) => [a.keyword, a.title]),
);
const CALLOUT_MARKER_RE = new RegExp(`^\\[!(${Object.keys(KIND_LABEL).join('|')})\\]`);

interface MarkerLine {
  /** NOTE·TIP 등 종류 */
  kind: string;
  /** 마커 텍스트('[!NOTE]') 길이 */
  markerLen: number;
  /** 마커 뒤에 줄바꿈(하드브레이크)이 붙어 있는가 */
  hasBreak: boolean;
}

/**
 * blockquote 첫 문단이 '온전한 콜아웃 마커 줄'이면 정보를, 아니면 null.
 * 발행(rehype-github-alerts)은 마커가 첫 '문단' 첫 줄에 단독으로 와야 콜아웃으로 본다.
 * 본문이 마커 줄에 붙으면(`[!NOTE]본문`) 강등되므로 그 경우는 마커 줄로 치지 않는다.
 * 첫 자식이 제목 등 문단이 아닌 텍스트블록이면 발행 시 무시되므로 역시 제외한다.
 * 이 함수는 '마커 줄이 깨졌는가'를 보는 가드의 기준이다(본문 유무는 보지 않는다).
 */
function markerLine(node: any): MarkerLine | null {
  if (node?.type?.name !== 'blockquote' || node.firstChild?.type?.name !== 'paragraph') return null;
  const txt: string = node.firstChild.textContent;
  const m = txt.match(CALLOUT_MARKER_RE);
  if (!m) return null;
  const after = txt.charAt(m[0].length); // 마커 바로 뒤 글자
  if (after !== '' && after !== '\n') return null; // 본문이 마커 줄에 붙음 → 강등
  return { kind: m[1], markerLen: m[0].length, hasBreak: after === '\n' };
}

/**
 * 이 blockquote가 '발행되면 실제로 콜아웃 박스가 되는가'. 마커 줄이 온전하고 본문이
 * 있어야 한다 — 빈 콜아웃(`> [!NOTE]`)은 발행 시 일반 인용으로 강등되기 때문이다
 * (rehype-github-alerts 규칙). 데코레이션(박스·마커 숨김)과 가드의 보호 대상은 이
 * 기준을 따라 'WYSIWYG가 거짓말하지 않게' 한다(보이는 박스 = 발행될 박스).
 */
function calloutInfo(node: any): MarkerLine | null {
  const info = markerLine(node);
  if (!info) return null;
  const txt: string = node.firstChild.textContent;
  const hasInlineBody = txt.length > info.markerLen + (info.hasBreak ? 1 : 0);
  const hasBlockBody = node.childCount > 1; // 마커 줄 다음에 또 다른 블록(본문 문단)
  if (!hasInlineBody && !hasBlockBody) return null; // 본문 없음 → 발행 시 강등
  return info;
}

const injoyDecorations = $prose(
  () =>
    new Plugin({
      props: {
        decorations(state) {
          const decos: any[] = [];
          try {
            state.doc.descendants((node: any, pos: number) => {
              const callout = calloutInfo(node);
              if (callout) {
                decos.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: `injoy-callout injoy-callout-${callout.kind.toLowerCase()}`,
                    'data-callout-label': KIND_LABEL[callout.kind] ?? callout.kind,
                  }),
                );
                const from = pos + 2; // blockquote(+1) → paragraph(+1) → 텍스트 시작
                decos.push(Decoration.inline(from, from + callout.markerLen, { class: 'injoy-callout-hide' }));
              }
              if (node.isText && node.text) {
                const re = new RegExp(WIKI_LINK_RE.source, 'g');
                let mm: RegExpExecArray | null;
                while ((mm = re.exec(node.text))) {
                  const from = pos + mm.index;
                  decos.push(Decoration.inline(from, from + mm[0].length, { class: 'injoy-wikilink' }));
                }
              }
              return undefined;
            });
          } catch {
            return DecorationSet.empty;
          }
          return DecorationSet.create(state.doc, decos);
        },
      },
    }),
);

/**
 * 콜아웃 마커 보호 가드.
 *
 * 콜아웃은 구조적 노드가 아니라 'blockquote + 데코레이션'이라, 마커 `[!NOTE]`가
 * 화면엔 숨었지만 문서엔 진짜 텍스트로 남는다. 박스 머리에서 Backspace를 누르면
 * 숨은 마커, 또는 마커와 본문을 가르는 줄바꿈/문단 경계가 깨져 콜아웃이 조용히
 * 일반 인용으로 강등됐다(#6). '발행되는 콜아웃'의 기준은 calloutInfo가, '마커 줄이
 * 온전한가'의 기준은 markerLine이 단일하게 가진다.
 *
 * 두 겹으로 막는다:
 *  1) filterTransaction — 발행되던 콜아웃의 blockquote가 편집 뒤에도 '온전한 마커 줄'을
 *     유지하는지만 본다(markerLine). 마커가 손상되거나 본문이 마커 줄에 붙으면(인라인
 *     병합·문단 병합 모두) 마커 줄이 깨지므로 거부한다. 마커 줄을 안 건드리는 편집
 *     (본문 입력·본문 맨 앞 입력·본문 비우기)은 그대로 허용된다. 위치가 아니라 구조로
 *     재확인하므로 견고하고, 직렬화(round-trip)는 전혀 건드리지 않는다.
 *  2) handleKeyDown — 박스 머리(마커+줄바꿈)에서 Backspace/Delete를 누르면 머리를 한
 *     번에 깔끔히 지워 콜아웃을 의도적으로 해제한다(노션식 블록 서식 제거). 가드에
 *     막혀 아무 일도 안 일어나는 막다른 길을 피하는 탈출구.
 */
interface CalloutMarker {
  /** blockquote 노드 바로 앞 위치 — 편집 뒤 같은 블록을 다시 찾는 데 쓴다. */
  blockquotePos: number;
  /** blockquote 노드 바로 뒤 위치(pos + nodeSize) — 선택이 이 콜아웃 안에 갇혔는지 판정. */
  blockquoteEnd: number;
  /** 마커 텍스트 시작 — 데코레이션과 같은 계산(blockquote+1 → paragraph+1) */
  markerFrom: number;
  /** 마커 텍스트 끝 */
  markerTo: number;
  /** 마커 뒤에 줄바꿈(하드브레이크)이 붙어 본문이 같은 문단인가. false면 본문이 다음 문단. */
  hasBreak: boolean;
}

function collectCalloutMarkers(doc: any): CalloutMarker[] {
  const out: CalloutMarker[] = [];
  doc.descendants((node: any, pos: number) => {
    const info = calloutInfo(node);
    if (info) {
      const markerFrom = pos + 2; // blockquote(+1) → paragraph(+1) → 마커 시작
      out.push({
        blockquotePos: pos,
        blockquoteEnd: pos + node.nodeSize,
        markerFrom,
        markerTo: markerFrom + info.markerLen,
        hasBreak: info.hasBreak,
      });
    }
    return undefined;
  });
  return out;
}

/** 의도적 마커 제거(아래 keymap)는 가드를 통과시키는 표식. */
const CALLOUT_BYPASS = 'injoyCalloutBypass';

const calloutGuard = $prose(
  () =>
    new Plugin({
      /**
       * 진짜 방어선. 발행되던 콜아웃마다 편집 뒤 그 blockquote가 여전히 '온전한 마커
       * 줄'을 갖는지(markerLine) 확인한다. 마커가 깨지거나 본문이 마커 줄에 붙으면
       * (인라인 병합·문단 병합 모두) 거부, 블록이 통째로 사라지거나 더 이상 blockquote가
       * 아니면 허용(깔끔한 해제). 본문 입력·본문 비우기는 마커 줄을 안 건드리므로 허용.
       */
      filterTransaction(tr, state) {
        if (tr.getMeta(CALLOUT_BYPASS)) return true; // 의도적 해제는 통과
        if (!tr.docChanged) return true;
        // 글 전체 교체(replaceAll: 글 불러오기·초기화, 또는 전체 선택 삭제)는 대상이 아니다.
        const s: any = tr.steps.length === 1 ? tr.steps[0] : null;
        if (s && s.from === 0 && s.to === state.doc.content.size) return true;
        let markers: CalloutMarker[];
        try {
          markers = collectCalloutMarkers(state.doc);
        } catch {
          return true; // 분석 실패 시 편집을 절대 잠그지 않는다
        }
        for (const mk of markers) {
          const res = tr.mapping.mapResult(mk.blockquotePos, 1);
          if (res.deleted) continue; // 블록이 통째로 지워짐 = 의도적 제거 → 허용
          const node = tr.doc.nodeAt(res.pos);
          if (!node || node.type.name !== 'blockquote') continue; // 더 이상 콜아웃 그릇 아님 → 허용
          if (!markerLine(node)) return false; // 마커 줄이 깨짐(손상·본문 병합) → 거부
        }
        return true;
      },
      props: {
        // 탈출구 — 박스 머리(마커+줄바꿈)에서의 Backspace/Delete는 콜아웃을 한 번에
        // 깔끔히 해제한다(노션식 서식 제거). 머리에서의 기본 삭제는 마커를 손상시키거나
        // (→가드가 막아 먹통) blockquote를 들어올려 마커를 노출시키므로, 수정자 키(단어·
        // 줄 삭제)든 아니든 머리에서는 해제로 바꾸는 게 가장 안전하다(맨 앞 위치 포함).
        // 머리 밖(본문)에서는 어떤 키도 가로채지 않아 단어·줄 삭제가 그대로 동작한다.
        handleKeyDown(view, event) {
          if (event.key !== 'Backspace' && event.key !== 'Delete') return false;
          if (view.composing || (event as any).isComposing) return false; // IME 조합 중엔 손대지 않는다
          let markers: CalloutMarker[];
          try {
            markers = collectCalloutMarkers(view.state.doc);
          } catch {
            return false;
          }
          if (markers.length === 0) return false;
          // 머리를 통째로 지워 일반 인용으로 깔끔히 해제. CALLOUT_BYPASS로 가드를 통과시키므로,
          // 삭제 범위가 '한 콜아웃 안'을 벗어나지 않게 호출부에서 보장한다.
          const drop = (from: number, to: number) => {
            const tr = view.state.tr.delete(from, to).setMeta(CALLOUT_BYPASS, true);
            tr.setSelection(TextSelection.create(tr.doc, from));
            view.dispatch(tr.scrollIntoView());
            return true; // 처리됨 — 기본 삭제 동작을 막는다
          };
          // 콜아웃의 '머리'(마커 줄). 본문이 같은 문단이면(hasBreak) 마커+하드브레이크를,
          // 본문이 다음 문단이면 마커 문단 전체를 지워야 빈 인용 줄 없이 깔끔히 풀린다.
          // bodyStart = 본문 진입 위치(여기서 Backspace는 마커 줄과 병합을 시도 → 해제로 전환).
          const head = (mk: CalloutMarker) => ({
            bodyStart: mk.markerTo + (mk.hasBreak ? 1 : 2),
            removeFrom: mk.hasBreak ? mk.markerFrom : mk.blockquotePos + 1,
            removeTo: mk.markerTo + 1,
          });
          const sel = view.state.selection;
          if (sel.empty) {
            const pos = sel.from;
            for (const mk of markers) {
              const { bodyStart, removeFrom, removeTo } = head(mk);
              const eatsBack = event.key === 'Backspace' && pos >= mk.markerFrom && pos <= bodyStart;
              const eatsFwd = event.key === 'Delete' && pos >= mk.markerFrom && pos < bodyStart;
              if (eatsBack || eatsFwd) return drop(removeFrom, removeTo);
            }
            return false;
          }
          // 범위 선택이 '한 콜아웃 안에 갇힌 채' 그 머리에 걸치면(예: 첫 줄 통째 선택 후
          // 삭제), 기본 삭제는 마커를 깨 가드에 막혀 먹통이 된다. 선택 + 머리를 함께 지워
          // 깔끔히 해제한다. 콜아웃 경계를 넘는 선택은 기본 동작(블록 통째 삭제)에 맡긴다.
          const { from, to } = sel;
          for (const mk of markers) {
            const { bodyStart, removeFrom, removeTo } = head(mk);
            const within = from > mk.blockquotePos && to < mk.blockquoteEnd; // 이 콜아웃 안에 갇힘
            const hitsHead = from < bodyStart && to > mk.markerFrom; // 머리와 겹침
            if (!within || !hitsHead) continue;
            const delFrom = Math.min(from, removeFrom);
            const delTo = Math.max(to, removeTo);
            // 중첩 콜아웃 보호: bypass라 가드가 못 막으므로, 삭제 범위가 다른 콜아웃을
            // 건드리면 직접 미개입(기본 동작에 위임)한다.
            const crossesOther = markers.some(
              (o) => o !== mk && delFrom < o.blockquoteEnd && delTo > o.blockquotePos,
            );
            if (!crossesOther) return drop(delFrom, delTo);
          }
          return false;
        },
      },
    }),
);

export interface SlashItem {
  /** 메뉴에 표시할 이름 */
  label: string;
  /** 라벨 외 검색 키워드 */
  keywords?: string;
  /** 선택 시 삽입할 마크다운 */
  md: string;
}

/**
 * 데스크톱 슬래시 메뉴(노션식). 빈 문단이나 공백 뒤에서 '/'를 치면 캐럿 옆에 삽입
 * 메뉴가 뜨고, 이어 타이핑하면 필터된다. ↑↓ 이동·Enter 선택·Esc 닫기. 선택하면
 * '/질의' 텍스트를 지운 뒤 항목의 마크다운을 onInsert로 삽입한다(기존 툴바 삽입과
 * 같은 경로 재사용). 모바일은 툴바를 쓰므로 이 메뉴는 데스크톱 보조 수단이다.
 * URL의 '/'(앞이 공백·줄머리가 아님)는 트리거하지 않는다.
 */
function makeSlashPlugin(items: SlashItem[], onInsert: (md: string) => void) {
  return $prose(() => {
    const menu = document.createElement('div');
    menu.className = 'injoy-slash';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    let open = false;
    let active = 0;
    let from = 0; // '/'의 절대 위치
    let filtered: SlashItem[] = [];

    const close = () => {
      if (!open) return;
      open = false;
      menu.hidden = true;
      menu.innerHTML = '';
    };

    // 현재 커서 앞에서 '/질의'(공백/슬래시 없는)를 줄머리나 공백 뒤에서만 잡는다.
    const queryAt = (view: any): { q: string; from: number } | null => {
      const sel = view.state.selection;
      if (!sel.empty || !sel.$from.parent.isTextblock) return null;
      const before = sel.$from.parent.textBetween(0, sel.$from.parentOffset, undefined, '￼');
      const m = before.match(/(?:^|\s)\/([^\s/]*)$/);
      if (!m) return null;
      return { q: m[1], from: sel.from - 1 - m[1].length };
    };

    const paintActive = () => {
      menu.querySelectorAll('.injoy-slash-item').forEach((el, i) => {
        el.setAttribute('aria-selected', String(i === active));
        if (i === active) (el as HTMLElement).scrollIntoView({ block: 'nearest' });
      });
    };

    const choose = (view: any, item: SlashItem) => {
      const to = view.state.selection.from;
      // '/질의'를 선택 상태로 둬 insertMarkdown의 replaceSelection이 그 자리를 한 트랜잭션으로
      // 치환하게 한다(삭제·삽입을 따로 dispatch하면 '삭제만 되고 삽입은 거부'되는 틈이 생긴다).
      if (to > from) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
      close();
      onInsert(item.md);
      view.focus();
    };

    const render = (view: any, q: string) => {
      const ql = q.trim().toLowerCase();
      filtered = items.filter((it) => !ql || `${it.label} ${it.keywords ?? ''}`.toLowerCase().includes(ql));
      menu.innerHTML = '';
      if (filtered.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'injoy-slash-empty';
        empty.textContent = '결과가 없어요';
        menu.appendChild(empty);
        return;
      }
      if (active >= filtered.length) active = 0;
      filtered.forEach((it, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'injoy-slash-item';
        b.setAttribute('role', 'menuitem');
        b.textContent = it.label;
        b.addEventListener('mousedown', (ev) => {
          ev.preventDefault(); // 에디터 포커스 유지
          choose(view, it);
        });
        b.addEventListener('mouseenter', () => {
          active = i;
          paintActive();
        });
        menu.appendChild(b);
      });
      paintActive();
    };

    const place = (view: any) => {
      try {
        const c = view.coordsAtPos(view.state.selection.from);
        menu.style.position = 'fixed';
        menu.style.left = `${Math.max(8, Math.min(c.left, window.innerWidth - 248))}px`;
        menu.style.top = `${c.bottom + 4}px`;
      } catch {
        /* 위치 계산 실패는 무시(메뉴는 직전 위치 유지) */
      }
    };

    return new Plugin({
      view: (editorView: any) => {
        document.body.appendChild(menu);
        // 열린 동안 스크롤/리사이즈하면 캐럿에 다시 붙인다(fixed라 그냥 두면 어긋난다).
        const reposition = () => {
          if (open) place(editorView);
        };
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
        return {
          update: (view: any) => {
            const hit = items.length ? queryAt(view) : null;
            if (!hit) {
              close();
              return;
            }
            from = hit.from;
            if (!open) {
              open = true;
              active = 0;
              menu.hidden = false;
            }
            render(view, hit.q);
            place(view);
          },
          destroy: () => {
            window.removeEventListener('scroll', reposition, true);
            window.removeEventListener('resize', reposition);
            menu.remove();
          },
        };
      },
      props: {
        // 메뉴가 열렸을 때만 방향키·Enter·Esc를 가로챈다.
        handleKeyDown: (view: any, event: KeyboardEvent) => {
          if (!open) return false;
          if (view.composing || (event as any).isComposing) return false; // IME 조합 중엔 키를 가로채지 않는다
          if (event.key === 'Escape') {
            close();
            return true;
          }
          if (filtered.length === 0) return false;
          if (event.key === 'ArrowDown') {
            active = (active + 1) % filtered.length;
            paintActive();
            return true;
          }
          if (event.key === 'ArrowUp') {
            active = (active - 1 + filtered.length) % filtered.length;
            paintActive();
            return true;
          }
          if (event.key === 'Enter' && filtered[active]) {
            choose(view, filtered[active]);
            return true;
          }
          return false;
        },
        handleDOMEvents: {
          // 에디터 밖을 클릭해 포커스를 잃으면 메뉴를 닫는다(항목 클릭은 preventDefault로 유지).
          blur: () => {
            close();
            return false;
          },
        },
      },
    });
  });
}

/**
 * 밑줄 마크 — 표준 마크다운엔 밑줄이 없어 `<u>...</u>` HTML로 직렬화한다.
 * 발행 파이프라인이 rehype-raw로 인라인 HTML을 허용하므로 그대로 밑줄로 렌더된다.
 * 에디터에선 <u> 태그로 보이고(toDOM), 붙여넣기한 <u>도 마크로 받는다(parseDOM).
 * 직렬화는 remarkStringifyOptionsCtx.handlers.underline가 <u>로 감싼다(아래 config).
 */
const underline = $markSchema('underline', () => ({
  parseDOM: [{ tag: 'u' }],
  toDOM: () => ['u', 0],
  parseMarkdown: {
    match: (node: any) => node.type === 'underline',
    runner: (state: any, node: any, markType: any) => {
      state.openMark(markType).next(node.children).closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark: any) => mark.type.name === 'underline',
    runner: (state: any, mark: any) => {
      state.withMark(mark, 'underline');
    },
  },
}));

/**
 * 인라인 서식 버블 — 노션식. 텍스트를 드래그해 선택하면 그 위에 떠서
 * 굵게(B)·기울임(I)·밑줄(U)·취소선(S)을 토글한다. 스크롤 위치와 무관하게
 * 캐럿/선택 좌표에 fixed로 붙으므로(슬래시 메뉴와 같은 패턴) 멀리 있는 툴바로
 * 올라갈 필요가 없다. 선택이 비거나 포커스를 잃으면 숨는다.
 */
const FORMAT_BUTTONS: { mark: string; label: string; cls: string; title: string }[] = [
  { mark: 'strong', label: 'B', cls: 'b', title: '굵게' },
  { mark: 'emphasis', label: 'I', cls: 'i', title: '기울임' },
  { mark: 'underline', label: 'U', cls: 'u', title: '밑줄' },
  { mark: 'strike_through', label: 'S', cls: 's', title: '취소선' },
];

function makeFormatBubble() {
  return $prose(() => {
    let view: any = null;
    const bar = document.createElement('div');
    bar.className = 'injoy-bubble';
    bar.setAttribute('role', 'toolbar');
    bar.hidden = true;

    // 마크가 현재 선택에 걸려 있는가(버튼 활성 표시용).
    const markActive = (markType: any): boolean => {
      const { from, $from, to, empty } = view.state.selection;
      if (empty) return !!markType.isInSet(view.state.storedMarks || $from.marks());
      return view.state.doc.rangeHasMark(from, to, markType);
    };

    const buttons = FORMAT_BUTTONS.map((b) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `injoy-bubble-btn bb-${b.cls}`;
      el.textContent = b.label;
      el.title = b.title;
      el.setAttribute('aria-label', b.title);
      el.addEventListener('pointerdown', (ev) => {
        ev.preventDefault(); // 선택·포커스 유지(터치에서도 키보드가 안 내려가게)
        const markType = view.state.schema.marks[b.mark];
        if (markType) toggleMark(markType)(view.state, view.dispatch);
        view.focus();
      });
      bar.appendChild(el);
      return { ...b, el };
    });

    // 버튼 활성 표시 갱신(현재 선택에 마크가 걸려 있으면 눌린 상태로).
    const updateActive = () => {
      buttons.forEach((b) => {
        const markType = view.state.schema.marks[b.mark];
        b.el.setAttribute('aria-pressed', String(markType ? markActive(markType) : false));
      });
    };

    // 터치 기기 여부. 선택 위에 떠다니면 iOS 네이티브 선택 메뉴(오려두기·복사…)와 겹치므로,
    // 터치에선 버블을 키보드 바로 위에 고정 바로 도킹한다. 데스크톱은 기존처럼 선택 위에 띄운다.
    const coarse = window.matchMedia('(pointer: coarse)');

    // 도킹 바를 키보드 위에 살짝 띄워 붙인다(플로팅 알약). 좌우 여백은 CSS(.injoy-bubble--dock)가
    // 잡으므로 여기선 top만 설정한다. 키보드가 오르내리면 visualViewport 변화에 맞춰 다시 계산.
    const DOCK_GAP = 10; // 키보드 위 여백. 브라우저 하단 UI(주소창)와 겹치지 않게
    const positionDock = () => {
      const vv = window.visualViewport;
      const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const top = Math.round(bottom - bar.offsetHeight - DOCK_GAP);
      bar.style.top = `${top}px`;
      bar.style.left = '';
      bar.style.right = '';
    };

    // 선택 상태에 따라 버블/도킹 바를 배치한다. 포커스 없음·코드 안에서는 숨긴다.
    const place = () => {
      if (!view || !view.hasFocus()) {
        bar.hidden = true;
        return;
      }
      const sel = view.state.selection;
      // 코드(인라인/블록) 안에서는 서식이 무의미.
      if (sel.$from.parent.type.spec.code) {
        bar.hidden = true;
        return;
      }
      // 터치: 포커스가 있으면 선택이 비어도(커서만) 도킹 바를 보인다("굵게 켜고 타이핑"도 된다).
      if (coarse.matches) {
        bar.classList.add('injoy-bubble--dock');
        bar.hidden = false;
        updateActive();
        positionDock();
        return;
      }
      // 데스크톱: 텍스트를 드래그 선택했을 때만 선택 위에 띄운다(노드 선택·빈 선택 제외).
      bar.classList.remove('injoy-bubble--dock');
      bar.style.right = '';
      const { from, to, empty } = sel;
      const sameTextblock = sel.$from.sameParent(sel.$to) && sel.$from.parent.isTextblock;
      if (empty || !(sel instanceof TextSelection) || !sameTextblock) {
        bar.hidden = true;
        return;
      }
      try {
        const start = view.coordsAtPos(from);
        const end = view.coordsAtPos(to);
        const mid = (Math.min(start.left, end.left) + Math.max(start.right ?? start.left, end.right ?? end.left)) / 2;
        bar.hidden = false;
        updateActive();
        const rect = bar.getBoundingClientRect();
        const top = Math.min(start.top, end.top) - rect.height - 8;
        const left = Math.max(8, Math.min(mid - rect.width / 2, window.innerWidth - rect.width - 8));
        bar.style.left = `${left}px`;
        bar.style.top = `${Math.max(8, top)}px`;
      } catch {
        bar.hidden = true;
      }
    };

    return new Plugin({
      view: (editorView: any) => {
        view = editorView;
        document.body.appendChild(bar);
        const reposition = () => {
          if (!bar.hidden) place();
        };
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
        // 터치: 키보드가 오르내리며 visualViewport가 바뀔 때 도킹 바를 다시 붙인다.
        const vv = window.visualViewport;
        vv?.addEventListener('resize', reposition);
        vv?.addEventListener('scroll', reposition);
        // 포커스만 바뀌고 선택 변화가 없으면 update가 안 오기도 한다 → 포커스/블러도 직접 듣는다.
        const onFocus = () => place();
        const onBlur = () => {
          bar.hidden = true;
        };
        editorView.dom.addEventListener('focus', onFocus);
        editorView.dom.addEventListener('blur', onBlur);
        return {
          update: () => place(),
          destroy: () => {
            window.removeEventListener('scroll', reposition, true);
            window.removeEventListener('resize', reposition);
            vv?.removeEventListener('resize', reposition);
            vv?.removeEventListener('scroll', reposition);
            editorView.dom.removeEventListener('focus', onFocus);
            editorView.dom.removeEventListener('blur', onBlur);
            bar.remove();
          },
        };
      },
    });
  });
}

export interface EditorHandle {
  /** 본문 전체를 마크다운으로 교체 (글 불러오기·초기화) */
  setMarkdown(markdown: string): void;
  /** 커서 위치에 마크다운 조각 삽입 (이미지·블록 삽입) */
  insertMarkdown(markdown: string): void;
  /** 커서에 각주 참조를, 글 끝에 각주 정의를 자동 번호로 넣는다 */
  insertFootnote(): void;
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
  /** 슬래시(/) 메뉴 항목. 비우면 메뉴가 뜨지 않는다(데스크톱 보조 삽입). */
  slashItems?: SlashItem[];
  /** 슬래시 메뉴에서 항목을 고르면 호출(마크다운 삽입). 보통 툴바와 같은 insertBlock. */
  onSlashInsert?: (markdown: string) => void;
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
        handlers: {
          ...((prev as any).handlers ?? {}),
          // 밑줄 마크('underline' mdast 노드)를 <u>...</u> HTML로 내보낸다(표준 마크다운엔 밑줄이 없음).
          underline(node: any, _parent: any, state: any, info: any) {
            const exit = state.enter('underline');
            const value = state.containerPhrasing(node, info);
            exit();
            return `<u>${value}</u>`;
          },
        },
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
          image: (node: any, editorView: any, getPos: any) => {
            // 이미지 + alt 입력칸 + 정렬 버튼을 함께 감싼다. 이미지를 누르면 바로 아래 패널이
            // 펼쳐져 alt(대체 텍스트)와 정렬을 고친다 — 노션식 인라인 편집. 값은 image 노드 attr에
            // 반영돼 마크다운에 직렬화된다. resolveImageSrc로 표시 src만 해석하고 attr은 불변.
            //
            // 정렬은 마크다운에 별도 문법이 없으므로 title 앞에 {align=left|right} 마커를 싣는다.
            // 가운데(기본)는 마커 없이 둔다. rehype-figure가 발행 시 이 마커를 figure 클래스로 바꾼다.
            const ALIGN_RE = /^\{align=(left|center|right)\}\s*/;
            const parseTitle = (raw: any) => {
              const t = typeof raw === 'string' ? raw : '';
              const m = t.match(ALIGN_RE);
              return { align: m ? m[1] : 'center', caption: m ? t.slice(m[0].length) : t };
            };
            const buildTitle = (align: string, caption: string) => {
              const marker = align === 'left' || align === 'right' ? `{align=${align}}` : '';
              const t = marker + (caption ?? '');
              return t === '' ? null : t; // 빈 title은 attr에서 빼 ![](src "") 직렬화를 피한다
            };

            const wrap = document.createElement('span');
            wrap.className = 'injoy-img';
            wrap.contentEditable = 'false';
            const img = document.createElement('img');

            const panel = document.createElement('span');
            panel.className = 'injoy-img-panel';
            panel.hidden = true;

            // 정렬 줄: 왼쪽 / 가운데 / 오른쪽
            const alignRow = document.createElement('span');
            alignRow.className = 'injoy-img-align';
            const alignHint = document.createElement('span');
            alignHint.className = 'injoy-img-hint';
            alignHint.textContent = '정렬';
            alignRow.append(alignHint);
            const alignBtns: HTMLButtonElement[] = [];
            for (const [val, label] of [['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']]) {
              const b = document.createElement('button');
              b.type = 'button';
              b.dataset.align = val;
              b.textContent = label;
              b.setAttribute('aria-label', `${label} 정렬`);
              b.addEventListener('mousedown', (ev) => {
                ev.preventDefault(); // 에디터 포커스·선택을 흔들지 않게
                const pos = typeof getPos === 'function' ? getPos() : null;
                if (pos == null) return;
                const n = editorView.state.doc.nodeAt(pos);
                if (!n || n.type.name !== 'image') return;
                const { caption } = parseTitle(n.attrs.title);
                const title = buildTitle(val, caption);
                editorView.dispatch(
                  editorView.state.tr.setNodeMarkup(pos, undefined, { ...n.attrs, title }),
                );
              });
              alignBtns.push(b);
              alignRow.append(b);
            }

            // alt 줄
            const altRow = document.createElement('span');
            altRow.className = 'injoy-img-alt';
            const hint = document.createElement('span');
            hint.className = 'injoy-img-hint';
            hint.textContent = 'alt';
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = '이미지 설명을 적어 주세요';
            altRow.append(hint, input);

            // 캡션 줄 — 그림 아래 figcaption으로 발행된다(title 마커로 왕복, 정렬과 같은 칸 공유).
            const captionRow = document.createElement('span');
            captionRow.className = 'injoy-img-caption';
            const capHint = document.createElement('span');
            capHint.className = 'injoy-img-hint';
            capHint.textContent = '캡션';
            const captionInput = document.createElement('input');
            captionInput.type = 'text';
            captionInput.placeholder = '그림 아래에 보일 설명 (선택)';
            captionRow.append(capHint, captionInput);

            panel.append(alignRow, altRow, captionRow);
            wrap.append(img, panel);

            const apply = (n: any) => {
              const src = n.attrs.src ?? '';
              img.src = (opts.resolveImageSrc?.(src) ?? null) || src;
              img.alt = n.attrs.alt ?? '';
              const { align, caption } = parseTitle(n.attrs.title);
              img.title = caption; // 툴팁엔 마커 없는 캡션만
              wrap.dataset.align = align; // 에디터 안 미리보기(정렬)
              for (const b of alignBtns) b.classList.toggle('is-active', b.dataset.align === align);
              if (document.activeElement !== input) input.value = n.attrs.alt ?? '';
              if (document.activeElement !== captionInput) captionInput.value = caption;
            };
            apply(node);

            // 이미지 클릭 → 편집 패널 펼침/접힘.
            img.addEventListener('mousedown', (ev) => {
              ev.preventDefault();
              panel.hidden = !panel.hidden;
              if (!panel.hidden) {
                input.focus();
                input.select();
              }
            });
            // 입력 → 같은 위치의 image 노드 alt attr 갱신.
            const commit = () => {
              const pos = typeof getPos === 'function' ? getPos() : null;
              if (pos == null) return;
              const n = editorView.state.doc.nodeAt(pos);
              if (!n || n.type.name !== 'image' || n.attrs.alt === input.value) return;
              editorView.dispatch(
                editorView.state.tr.setNodeMarkup(pos, undefined, { ...n.attrs, alt: input.value }),
              );
            };
            input.addEventListener('input', commit);
            input.addEventListener('keydown', (ev: KeyboardEvent) => {
              ev.stopPropagation(); // ProseMirror 단축키가 입력을 가로채지 않게
              if (ev.key === 'Enter' || ev.key === 'Escape') {
                ev.preventDefault();
                panel.hidden = true;
                editorView.focus();
              }
            });
            // 캡션 입력 → title 마커 재구성. 현재 정렬을 읽어 보존한다(가운데=마커 없음).
            const commitCaption = () => {
              const pos = typeof getPos === 'function' ? getPos() : null;
              if (pos == null) return;
              const n = editorView.state.doc.nodeAt(pos);
              if (!n || n.type.name !== 'image') return;
              const { align, caption } = parseTitle(n.attrs.title);
              if (caption === captionInput.value) return;
              const title = buildTitle(align, captionInput.value);
              editorView.dispatch(
                editorView.state.tr.setNodeMarkup(pos, undefined, { ...n.attrs, title }),
              );
            };
            captionInput.addEventListener('input', commitCaption);
            captionInput.addEventListener('keydown', (ev: KeyboardEvent) => {
              ev.stopPropagation();
              if (ev.key === 'Enter' || ev.key === 'Escape') {
                ev.preventDefault();
                panel.hidden = true;
                editorView.focus();
              }
            });

            return {
              dom: wrap,
              update: (updated: any) => {
                if (updated.type.name !== 'image') return false;
                apply(updated);
                return true;
              },
              // 패널(정렬·alt)에서 일어나는 이벤트·DOM 변화는 ProseMirror가 다루지 않게 한다.
              stopEvent: (e: any) => e.target === input || panel.contains(e.target),
              ignoreMutation: () => true,
            };
          },
          // 코드블록: 위에 파일명 입력칸 + 언어 배지를 얹는다(머리는 contentEditable=false, 코드 본문이 contentDOM).
          // 파일명은 code_block의 meta attr에 기록돼 백틱3+언어+공백+파일명으로 왕복된다(codeBlockWithMeta).
          code_block: (node: any, editorView: any, getPos: any) => {
            const wrap = document.createElement('div');
            wrap.className = 'injoy-cb';

            const head = document.createElement('div');
            head.className = 'injoy-cb-head';
            head.contentEditable = 'false';
            const langBadge = document.createElement('span');
            langBadge.className = 'injoy-cb-lang';
            const fileInput = document.createElement('input');
            fileInput.type = 'text';
            fileInput.className = 'injoy-cb-file';
            fileInput.placeholder = '파일명 (선택)';
            head.append(langBadge, fileInput);

            const pre = document.createElement('pre');
            const code = document.createElement('code');
            pre.appendChild(code);
            wrap.append(head, pre);

            const apply = (n: any) => {
              langBadge.textContent = n.attrs.language || 'text';
              if (document.activeElement !== fileInput) fileInput.value = n.attrs.meta ?? '';
            };
            apply(node);

            const commit = () => {
              const pos = typeof getPos === 'function' ? getPos() : null;
              if (pos == null) return;
              const n = editorView.state.doc.nodeAt(pos);
              if (!n || n.type.name !== 'code_block' || n.attrs.meta === fileInput.value) return;
              editorView.dispatch(
                editorView.state.tr.setNodeMarkup(pos, undefined, { ...n.attrs, meta: fileInput.value }),
              );
            };
            fileInput.addEventListener('input', commit);
            fileInput.addEventListener('keydown', (ev: KeyboardEvent) => {
              ev.stopPropagation(); // ProseMirror 단축키가 파일명 입력을 가로채지 않게
              if (ev.key === 'Enter' || ev.key === 'Escape') {
                ev.preventDefault();
                editorView.focus();
              }
            });

            return {
              dom: wrap,
              contentDOM: code, // 코드 본문은 여기로 — 타이핑·줄바꿈은 기본 code_block 그대로
              update: (updated: any) => {
                if (updated.type.name !== 'code_block') return false;
                apply(updated);
                return true;
              },
              // 파일명 입력 이벤트는 PM이 안 가로채게; 코드 본문(contentDOM) 변형만 PM이 처리.
              stopEvent: (e: any) => e.target === fileInput,
              ignoreMutation: (m: any) => !code.contains(m.target),
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
    .use(codeBlockWithMeta) // 기본 code_block을 meta(파일명) 보존 버전으로 덮어쓴다(commonmark 뒤)
    .use(underline)
    .use(math)
    .use(history)
    .use(listener)
    .use(injoyDecorations)
    .use(calloutGuard)
    .use(makeSlashPlugin(opts.slashItems ?? [], (md) => opts.onSlashInsert?.(md)))
    .use(makeFormatBubble())
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
      // insert는 동기로 dispatch되지만 listener는 200ms 디바운스라, 삽입 직후
      // 발행하면 mirror에 누락된다. setMarkdown처럼 즉시 한 번 동기화한다.
      opts.onChange(normalizeMarkdown(editor.action(getMarkdown())));
    },
    insertFootnote() {
      // gfm의 footnote_reference(인라인)·footnote_definition(블록) 노드를 직접 만든다.
      // 마크다운 조각 삽입과 달리, 참조는 커서에 인라인으로·정의는 글 맨 끝에 top-level로
      // 들어가 절대 다른 각주 정의 안에 중첩되지 않고(번호도 노드 라벨에서 안전히 계산), 직렬화는
      // gfm이 [^N] / [^N]: 로 정확히 왕복한다. 새 정의의 안내 문구를 선택해 둬 바로 덮어쓰게 한다.
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        const refType = state.schema.nodes.footnote_reference;
        const defType = state.schema.nodes.footnote_definition;
        const paraType = state.schema.nodes.paragraph;
        if (!refType || !defType || !paraType) return;
        let max = 0;
        state.doc.descendants((node: any) => {
          if ((node.type === refType || node.type === defType) && node.attrs.label) {
            const num = parseInt(node.attrs.label, 10);
            if (!Number.isNaN(num)) max = Math.max(max, num);
          }
        });
        const label = String(max + 1);
        const placeholder = '각주 내용을 적어요.';
        const refNode = refType.create({ label });
        const defNode = defType.create({ label }, paraType.create(null, state.schema.text(placeholder)));
        let tr = state.tr.insert(state.selection.to, refNode); // 참조: 커서(선택 끝) 인라인
        const defStart = tr.doc.content.size; // 정의: 글 맨 끝 top-level
        tr = tr.insert(defStart, defNode);
        const textStart = defStart + 2; // def(+1) → paragraph(+1) → 텍스트 시작
        try {
          tr = tr.setSelection(TextSelection.create(tr.doc, textStart, textStart + placeholder.length));
        } catch {
          /* 위치 계산이 어긋나면 선택만 생략(삽입은 이미 끝남) */
        }
        view.dispatch(tr.scrollIntoView());
        view.focus();
      });
      opts.onChange(normalizeMarkdown(editor.action(getMarkdown())));
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
