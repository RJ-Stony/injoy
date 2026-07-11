import { execSync } from 'node:child_process';

/**
 * 커밋 기준 활동 집계 — 글 .md 파일의 git 히스토리를 빌드타임에 읽어
 * 날짜별 발행·수정 수를 낸다. 파일별 가장 오래된 커밋이 발행, 나머지는 수정.
 * updatedDate는 글당 하나뿐이라 여러 번 고친 걸 못 세지만, 커밋은 전부 잡힌다.
 *
 * 주의: 배포(GitHub Actions)에서 checkout이 얕은 클론이면 커밋이 1개만 보여
 * 수정이 0이 된다 → deploy.yml에 fetch-depth: 0 필요.
 * 파일 rename은 --follow 없이는 히스토리가 갈려 약간 과소 집계될 수 있다(드물어 허용).
 * git이 없거나 실패하면 null을 돌려 호출부가 기존 방식으로 폴백한다(빌드 안 깨지게).
 */
export interface GitActivity {
  pubByDate: Map<string, number>;
  modByDate: Map<string, number>;
  totalPub: number;
  totalMod: number;
}

export function getGitActivity(): GitActivity | null {
  let out: string;
  try {
    // 커밋마다 'C<날짜>' 한 줄 + 그 커밋이 바꾼 파일 목록. 최신순.
    out = execSync(
      "git log --date=short --pretty=format:C%ad --name-only -- src/content/posts",
      { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
  } catch {
    return null;
  }
  if (!out.trim()) return null;

  // (파일 → [해당 파일을 바꾼 커밋 날짜들]) 을 최신순으로 모은다.
  const datesByFile = new Map<string, string[]>();
  let curDate: string | null = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('C')) {
      curDate = line.slice(1).trim();
      continue;
    }
    const f = line.trim();
    if (!curDate || !f.endsWith('.md') || !f.startsWith('src/content/posts/')) continue;
    (datesByFile.get(f) ?? datesByFile.set(f, []).get(f)!).push(curDate);
  }
  if (datesByFile.size === 0) return null;

  const pubByDate = new Map<string, number>();
  const modByDate = new Map<string, number>();
  let totalPub = 0;
  let totalMod = 0;
  const bump = (m: Map<string, number>, d: string) => m.set(d, (m.get(d) ?? 0) + 1);

  for (const dates of datesByFile.values()) {
    // 최신순이라 마지막 원소가 가장 오래된 커밋 = 발행.
    for (let i = 0; i < dates.length; i++) {
      const isPub = i === dates.length - 1;
      if (isPub) {
        bump(pubByDate, dates[i]);
        totalPub++;
      } else {
        bump(modByDate, dates[i]);
        totalMod++;
      }
    }
  }
  return { pubByDate, modByDate, totalPub, totalMod };
}
