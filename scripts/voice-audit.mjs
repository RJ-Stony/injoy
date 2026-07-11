#!/usr/bin/env node
/**
 * voice 전수 감사(C11) — 발행된 글을 훑어 injoy-voice-guide 기준의 기계 판정 가능한
 * 위반을 리포트한다. 본문 엠대시·제목 콜론/붙임표·합쇼체(~습니다)를 찾는다.
 * /write의 A17 린터와 같은 규칙의 빌드타임 짝. 자동 수정은 하지 않는다 —
 * 합쇼체는 인용·before/after 표에서 의도적으로 쓰이는 등 오탐이 많아, 판단은 작성자 몫으로 남긴다.
 * 실행: node scripts/voice-audit.mjs   (리포트만, 종료 코드 0)
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'src/content/posts';

// 코드 펜스·인라인 코드를 걷어낸 산문만.
function stripCode(body) {
  const out = [];
  let fence = null;
  for (const line of body.split('\n')) {
    const run = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (fence) {
      if (run && run[0] === fence[0] && run.length >= fence.length) fence = null;
      continue;
    }
    if (run) {
      fence = run;
      continue;
    }
    out.push(line);
  }
  return out.join('\n').replace(/`[^`\n]*`/g, ' ');
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.md'));
let total = 0;

for (const f of files) {
  const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
  const fmEnd = raw.indexOf('\n---', 4);
  const frontmatter = fmEnd > 0 ? raw.slice(0, fmEnd) : '';
  const body = fmEnd > 0 ? raw.slice(fmEnd + 4) : raw;
  const prose = stripCode(body);
  const findings = [];

  // 제목 콜론·붙임표
  const title = frontmatter.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1] ?? '';
  if (/[:：]/.test(title) || /\s-\s/.test(title))
    findings.push(`제목에 콜론/붙임표: "${title}"`);

  // 본문 엠대시
  const emLines = prose.split('\n').filter((l) => l.includes('—'));
  for (const l of emLines) findings.push(`엠대시(—): ${l.trim().slice(0, 60)}`);

  // 합쇼체 (인용·표 줄 제외)
  const honLines = prose.split('\n').filter((l) => {
    const t = l.trim();
    if (/["'“”‘’|]/.test(l)) return false;
    return /니다[.!?)\]]?$/.test(t) && !/아니다[.!?)\]]?$/.test(t); // '아니다'는 평서체
  });
  for (const l of honLines) findings.push(`합쇼체(~습니다): ${l.trim().slice(0, 60)}`);

  if (findings.length) {
    total += findings.length;
    console.log(`\n▸ ${f}`);
    for (const x of findings) console.log(`    ${x}`);
  }
}

console.log(
  total === 0
    ? '\n✓ voice 감사: 위반 없음.'
    : `\n총 ${total}건. 인용·before/after 표의 합쇼체·N/A 표기 엠대시는 의도된 것일 수 있어요. 확인 후 손보세요.`,
);
