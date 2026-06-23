/**
 * CommonMark 플랭킹 규칙 때문에 굵게(**…**)가 깨지는 경우를 보정한다.
 *
 * 예: **"결과 10개"**라고 — 닫는 ** 바로 앞이 따옴표(구두점)이고 바로 뒤가
 * 한글(글자)이라 '우측 플랭킹'이 아니어서 강조가 안 잡히고, 별표가 리터럴
 * **…** 로 그대로 화면에 남는다. (여는 쪽도 글자**"… 처럼 막힌다.)
 *
 * 정상 굵게(**굵게**)는 파싱 단계에서 이미 strong 노드가 되어 text 노드에
 * 남지 않는다. 그래서 'text 노드에 아직 **…** 가 남아 있다'는 건 곧 구두점에
 * 막혀 실패한 경우뿐 → 그것만 strong 으로 바꾼다(정상 굵게엔 영향 0).
 * 코드(inlineCode/code)는 별도 노드 타입이라 자연히 제외되고, 줄바꿈을 품은
 * 정상 멀티라인 강조도 \n 제외 패턴이라 잡지 않는다.
 *
 * 단, 작성자가 별표를 일부러 이스케이프한 경우(\*\*…\*\*)도 파싱 뒤엔 똑같이
 * 리터럴 text '**…**'로 도착한다(이스케이프된 리터럴을 보이려는 의도). 이건
 * 굵게로 바꾸면 안 되므로, 원문에서 해당 text 구간에 '\*'(이스케이프된 별표)가
 * 있으면 그 노드는 건드리지 않는다.
 */

// **  비공백으로 시작·끝  ** , 가운데에 *·줄바꿈은 없음(다른 강조와 안 엉키게)
const BOLD_RE = /\*\*(\S(?:[^*\n]*\S)?)\*\*/g;

export default function remarkBoldFix() {
  const transform = (node, src) => {
    if (!Array.isArray(node.children)) return;

    node.children = node.children.flatMap((child) => {
      if (child.type !== 'text') {
        transform(child, src);
        return [child];
      }

      // 원문에서 이 텍스트가 차지하는 구간에 이스케이프된 별표(\*)가 있으면 건드리지 않는다.
      // 작성자가 \*\*…\*\* 로 일부러 리터럴 별표를 보이려 한 것을 굵게로 바꾸지 않기 위함.
      const s = child.position?.start?.offset;
      const e = child.position?.end?.offset;
      if (typeof src === 'string' && typeof s === 'number' && typeof e === 'number') {
        if (src.slice(s, e).includes('\\*')) return [child];
      }

      BOLD_RE.lastIndex = 0;
      if (!BOLD_RE.test(child.value)) return [child];
      BOLD_RE.lastIndex = 0;

      const parts = [];
      let last = 0;
      for (const match of child.value.matchAll(BOLD_RE)) {
        const [whole, inner] = match;
        if (match.index > last) {
          parts.push({ type: 'text', value: child.value.slice(last, match.index) });
        }
        parts.push({ type: 'strong', children: [{ type: 'text', value: inner }] });
        last = match.index + whole.length;
      }
      if (last < child.value.length) {
        parts.push({ type: 'text', value: child.value.slice(last) });
      }
      return parts;
    });
  };

  return (tree, file) => {
    const src = typeof file?.value === 'string' ? file.value : String(file?.value ?? '');
    transform(tree, src);
  };
}
