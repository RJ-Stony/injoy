/**
 * 마크다운 본문을 산문과 코드로 분리한다.
 * 정규식으로 ```쌍을 찾는 방식은 4-백틱 인라인 코드(```` ``` ````)가 섞이면
 * 짝이 어긋나므로, 펜스는 라인 단위로 추적한다.
 */
export interface SplitBody {
  /** 코드 펜스를 제외한 본문 (인라인 코드도 제거됨) */
  prose: string;
  /** 펜스 코드블록들 — 첫 줄은 ```lang 헤더 */
  codeBlocks: string[];
}

export function splitCode(body: string): SplitBody {
  const proseLines: string[] = [];
  const codeBlocks: string[] = [];
  let fence: string | null = null;
  let current: string[] = [];

  for (const line of body.split('\n')) {
    // CommonMark 펜스: 들여쓰기 3칸 이하의 ``` 또는 ~~~ (4칸 이상은 코드가 아니라 들여쓴 텍스트)
    const run = line.match(/^ {0,3}(`{3,}|~{3,})/)?.[1];
    if (fence) {
      current.push(line);
      if (run && run[0] === fence[0] && run.length >= fence.length) {
        codeBlocks.push(current.join('\n'));
        current = [];
        fence = null;
      }
      continue;
    }
    if (run) {
      fence = run;
      current = [line];
      continue;
    }
    proseLines.push(line);
  }
  // 닫히지 않은 펜스도 코드로 취급
  if (current.length > 0) codeBlocks.push(current.join('\n'));

  const prose = proseLines.join('\n').replace(/`[^`\n]*`/g, ' ');
  return { prose, codeBlocks };
}
