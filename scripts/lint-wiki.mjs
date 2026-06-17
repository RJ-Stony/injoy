#!/usr/bin/env node
/**
 * 지식 그래프 건강 점검 (자문용).
 * 사용법:  npm run lint:wiki
 *
 * 빌드를 막지 않는다 — 경고만 내고 항상 정상 종료(exit 0)한다.
 * graph.ts는 astro:content에 의존해 .mjs에서 import할 수 없으므로,
 * 글(src/content/posts)과 연결(src/data/edges.json)을 직접 파싱한다.
 * 멘션(언급) 판정은 graph.ts와 같은 규칙을 그대로 옮겨 둔다:
 *   - 코드·인라인 코드 영역의 [[..]]는 제외(md-text.ts splitCode 포팅)
 *   - 초안(draft)·자기 자신·없는 슬러그로 가는 링크는 버림
 *   - 같은 글에서 같은 대상은 한 번으로 모음
 *   - 명시 연결이 (방향 무관) 이미 있으면 멘션은 가림
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative, sep } from 'node:path';
import { WIKI_LINK_RE } from '../src/plugins/wiki-link-pattern.mjs';

// edges.json에 쓸 수 있는 명시 타입 — graph.ts의 EDGE_TYPES 키 집합(단일 출처).
// 'mentions'는 자동 타입이라 edges.json에 직접 쓰면 안 된다.
const EXPLICIT_TYPES = new Set([
  'extends',
  'supports',
  'refines',
  'instantiates',
  'requires',
  'triggered-by',
  'contradicts',
  'related',
]);

const POSTS_DIR = resolve(process.cwd(), 'src/content/posts');
const EDGES_FILE = resolve(process.cwd(), 'src/data/edges.json');

/** src/utils/md-text.ts splitCode의 prose 부분 포팅 — 코드 영역을 걷어낸 산문만 반환. */
function proseOf(body) {
  const proseLines = [];
  let fence = null; // 여는 펜스 런(예: ``` 또는 ~~~~)
  for (const line of body.split('\n')) {
    // CommonMark 펜스: 들여쓰기 3칸 이하의 ``` 또는 ~~~ (4칸 이상은 코드가 아니라 들여쓴 텍스트)
    const run = (line.match(/^ {0,3}(`{3,}|~{3,})/) || [])[1];
    if (fence) {
      if (run && run[0] === fence[0] && run.length >= fence.length) fence = null;
      continue; // 펜스 안의 줄은 모두 버린다
    }
    if (run) {
      fence = run;
      continue;
    }
    proseLines.push(line);
  }
  // 인라인 코드 제거 — `[[..]]`처럼 코드로 적은 예시가 멘션으로 잡히지 않게
  return proseLines.join('\n').replace(/`[^`\n]*`/g, ' ');
}

/** 프런트매터 블록과 본문을 분리한다(외부 의존성 없이). */
function splitFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { frontmatter: '', body: raw };
  return { frontmatter: m[1], body: raw.slice(m[0].length) };
}

/** posts 디렉터리를 재귀로 훑어 .md/.mdx 파일 경로를 모은다(글로브 '**\/*' 대응). */
function collectPostFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...collectPostFiles(full));
    else if (/\.(md|mdx)$/.test(name)) files.push(full);
  }
  return files;
}

/** Astro 컬렉션 id(=슬러그) 도출: posts 기준 상대경로에서 확장자만 뺀다. */
function slugOf(file) {
  return relative(POSTS_DIR, file).replace(/\.(md|mdx)$/, '').split(sep).join('/');
}

function parsePosts() {
  const posts = new Map(); // slug -> { slug, title, draft, body }
  for (const file of collectPostFiles(POSTS_DIR)) {
    const raw = readFileSync(file, 'utf8');
    const { frontmatter, body } = splitFrontmatter(raw);
    const slug = slugOf(file);
    const draft = /^draft:\s*true\s*$/m.test(frontmatter);
    const title = frontmatter.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1] ?? slug;
    posts.set(slug, { slug, title, draft, body });
  }
  return posts;
}

function parseEdges() {
  try {
    const json = JSON.parse(readFileSync(EDGES_FILE, 'utf8'));
    return Array.isArray(json.edges) ? json.edges : [];
  } catch (e) {
    return { error: String(e) };
  }
}

/** graph.ts와 같은 규칙으로 살아있는 멘션(언급)을 도출한다. */
function deriveMentions(posts, published, explicitPairs) {
  const mentions = []; // { from, to }
  for (const slug of published) {
    const post = posts.get(slug);
    const prose = proseOf(post.body);
    const seen = new Set();
    for (const m of prose.matchAll(WIKI_LINK_RE)) {
      const target = m[1].trim();
      if (target === slug) continue; // 자기 자신
      if (!published.has(target)) continue; // 없는 글·초안
      if (seen.has(target)) continue; // 한 글에서 중복
      seen.add(target);
      if (explicitPairs.has(`${slug}|${target}`)) continue; // 명시 연결이 가린다(방향 무관)
      mentions.push({ from: slug, to: target });
    }
  }
  return mentions;
}

function main() {
  const posts = parsePosts();
  const edges = parseEdges();

  const findings = { errors: [], warnings: [], infos: [] };
  const E = (m) => findings.errors.push(m);
  const W = (m) => findings.warnings.push(m);
  const I = (m) => findings.infos.push(m);

  if (!Array.isArray(edges)) {
    E(`edges.json을 읽지 못했어요: ${edges.error}`);
    report(posts, findings);
    return;
  }

  const published = new Set([...posts.keys()].filter((s) => !posts.get(s).draft));

  // 명시 연결 쌍 — 양방향으로 담아 멘션 가림·교차참조 판정에 쓴다.
  const explicitPairs = new Set();
  for (const e of edges) {
    if (!e || typeof e.from !== 'string' || typeof e.to !== 'string') continue;
    explicitPairs.add(`${e.from}|${e.to}`);
    explicitPairs.add(`${e.to}|${e.from}`);
  }

  const seenEdge = new Set();
  for (const [i, e] of edges.entries()) {
    const at = `연결 #${i + 1}`;
    if (!e || typeof e.from !== 'string' || typeof e.to !== 'string') {
      E(`${at}: from·to 슬러그가 비었어요.`);
      continue;
    }
    const label = `${e.from} → ${e.to} (${e.type ?? '타입없음'})`;
    // 1) 타입 점검
    if (!EXPLICIT_TYPES.has(e.type)) {
      E(`${label}: 쓸 수 없는 타입이에요. 'mentions'는 자동 수집이라 edges.json에 직접 못 써요.`);
    }
    // 2) 깨진 연결(발행된 글이 아닌 슬러그)
    if (!published.has(e.from)) W(`${label}: 출발 글 '${e.from}'가 발행된 글이 아니에요(초안이거나 없음).`);
    if (!published.has(e.to)) W(`${label}: 대상 글 '${e.to}'가 발행된 글이 아니에요(초안이거나 없음).`);
    // 3) 자기 연결
    if (e.from === e.to) E(`${label}: 자기 자신으로 가는 연결이에요.`);
    // 4) 메모 없는 연결
    if (!e.note || !String(e.note).trim()) W(`${label}: 메모(note)가 비었어요. 왜 이은 연결인지 한 줄 적어 주세요.`);
    // 5) 중복 연결(같은 방향 같은 쌍)
    const key = `${e.from}|${e.to}`;
    if (seenEdge.has(key)) W(`${label}: 같은 방향의 연결이 중복돼요.`);
    seenEdge.add(key);
  }

  const mentions = deriveMentions(posts, published, explicitPairs);
  const mentionPairs = new Set(mentions.map((m) => `${m.from}|${m.to}`));

  // 6) 고아 글 — 명시 연결도, 살아있는 멘션도 닿지 않는 발행 글
  const touched = new Set();
  for (const e of edges) {
    if (!e || typeof e.from !== 'string' || typeof e.to !== 'string') continue; // 위 점검 루프와 같은 가드
    if (published.has(e.from)) touched.add(e.from);
    if (published.has(e.to)) touched.add(e.to);
  }
  for (const m of mentions) {
    touched.add(m.from);
    touched.add(m.to);
  }
  for (const slug of published) {
    if (!touched.has(slug)) W(`고아 글: '${slug}'(${posts.get(slug).title})에 들고 나는 연결이 하나도 없어요.`);
  }

  // 7) 승격 후보 — 명시 연결 없이 한쪽으로만 언급한 위키링크
  for (const m of mentions) {
    const reciprocal = mentionPairs.has(`${m.to}|${m.from}`);
    const note = reciprocal ? '(서로 언급 중)' : '(한쪽만 언급)';
    I(
      `승격 후보 ${note}: '${m.from}'가 본문에서 [[${m.to}]]를 언급하지만 명시 타입 연결이 없어요. ` +
        `의미가 있으면 edges.json에 타입을 정해 올리는 걸 권해요.`,
    );
  }

  report(posts, findings, { published, edges, mentions });
}

function report(posts, findings, ctx) {
  const { errors, warnings, infos } = findings;
  const line = '─'.repeat(48);
  console.log(line);
  console.log('  Injoy 그래프 점검 (lint:wiki)');
  console.log(line);
  if (ctx) {
    console.log(
      `  글 ${posts.size}편(발행 ${ctx.published.size}) · ` +
        `명시 연결 ${ctx.edges.length} · 살아있는 언급 ${ctx.mentions.length}`,
    );
    console.log(line);
  }

  const block = (title, items, mark) => {
    if (!items.length) return;
    console.log(`\n${mark} ${title} (${items.length})`);
    for (const it of items) console.log(`   ${mark} ${it}`);
  };

  block('짚어야 할 문제', errors, '✕');
  block('살펴볼 경고', warnings, '△');
  block('참고·제안', infos, '•');

  console.log('');
  if (!errors.length && !warnings.length) {
    console.log('✓ 큰 문제는 없어요.' + (infos.length ? ' 위 제안만 참고하세요.' : ''));
  } else {
    console.log(`정리: 문제 ${errors.length} · 경고 ${warnings.length} · 제안 ${infos.length}`);
  }
  console.log(line);
  // 자문용 — 빌드를 막지 않도록 항상 정상 종료한다.
  process.exit(0);
}

// 자문용 도구 — 어떤 입력에도 빌드를 막지 않도록, 예기치 못한 오류여도 정상 종료한다.
try {
  main();
} catch (e) {
  console.error('lint:wiki 실행 중 예기치 못한 오류:', e?.message ?? e);
  process.exit(0);
}
