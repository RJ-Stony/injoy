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
import { replaceAll, insert, getMarkdown, $prose } from '@milkdown/kit/utils';
import { Plugin, TextSelection } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { alertOptions } from '../utils/callout-config.mjs';
import { WIKI_LINK_RE } from '../plugins/wiki-link-pattern.mjs';
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
    .use(injoyDecorations)
    .use(calloutGuard)
    .use(makeSlashPlugin(opts.slashItems ?? [], (md) => opts.onSlashInsert?.(md)))
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
