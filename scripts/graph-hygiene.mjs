#!/usr/bin/env node
/**
 * 연결 위생 감사(C22) — 지식 그래프가 썩지 않게 빌드타임에 점검한다.
 *  · 깨진 위키링크: [[대상]]이 실제 글이 아닌 경우
 *  · 깨진 엣지: edges.json의 from/to가 실제 글이 아닌 경우(tag: 제외)
 *  · 고립된 글: 엣지도 위키링크도 하나 없는 글(태그로는 이어질 수 있어 약한 경고)
 * 리포트만 하고 고치지 않는다(종료 코드 0). 실행: node scripts/graph-hygiene.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'src/content/posts';
const EDGES = 'src/data/edges.json';

function stripCode(body) {
  const out = [];
  let fence = null;
  for (const line of body.split('\n')) {
    const run = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (fence) {
      if (run && run[0] === fence[0] && run.length >= fence.length) fence = null;
      continue;
    }
    if (run) { fence = run; continue; }
    out.push(line);
  }
  return out.join('\n').replace(/`[^`\n]*`/g, ' ');
}

// 발행된 글(draft 제외)의 슬러그와 본문.
const posts = new Map();
for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.md'))) {
  const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
  if (/^draft:\s*true/m.test(raw.slice(0, raw.indexOf('\n---', 4)))) continue;
  posts.set(f.replace(/\.md$/, ''), raw);
}
const slugs = new Set(posts.keys());

const edges = JSON.parse(fs.readFileSync(EDGES, 'utf8')).edges;

const broken = []; // 깨진 위키링크
const badEdges = []; // 깨진 엣지
const referenced = new Set(); // 어디서든 언급된 글
const hasOut = new Set(); // 나가는 연결(엣지 from 또는 위키링크)이 있는 글

for (const e of edges) {
  for (const end of [e.from, e.to]) {
    if (end.startsWith('tag:')) continue;
    if (!slugs.has(end)) badEdges.push(`${e.from} →${e.type}→ ${e.to} (없는 글: ${end})`);
    else referenced.add(end);
  }
  if (!e.from.startsWith('tag:')) hasOut.add(e.from);
}

for (const [slug, raw] of posts) {
  const prose = stripCode(raw);
  for (const m of prose.matchAll(/\[\[([^\[\]|\n]+?)(?:\|[^\[\]\n]+?)?\]\]/g)) {
    const target = m[1].trim();
    hasOut.add(slug);
    if (target !== slug && !slugs.has(target)) broken.push(`${slug}: [[${target}]]`);
    else referenced.add(target);
  }
}

const orphans = [...slugs].filter((s) => !referenced.has(s) && !hasOut.has(s));

const report = (title, items) => {
  if (!items.length) return;
  console.log(`\n▸ ${title} (${items.length})`);
  for (const x of items) console.log(`    ${x}`);
};
report('깨진 위키링크', broken);
report('깨진 엣지(없는 글 가리킴)', badEdges);
report('고립된 글(엣지·위키링크 0 — 태그로는 이어질 수 있음)', orphans);

const total = broken.length + badEdges.length + orphans.length;
console.log(
  total === 0 ? '\n✓ 연결 위생: 깨끗합니다.' : `\n총 ${total}건. 깨진 링크·엣지는 고치고, 고립 글은 연결을 붙여 보세요.`,
);
