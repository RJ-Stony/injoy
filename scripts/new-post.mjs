#!/usr/bin/env node
/**
 * 새 글 스캐폴드.
 * 사용법:  npm run new -- <slug> "글 제목"
 * 예시:    npm run new -- my-first-post "첫 글입니다"
 *
 * draft: true 상태로 생성되므로 npm run dev에서만 보이고,
 * 발행하려면 frontmatter의 draft를 false로 바꾸면 된다.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [slug, title] = process.argv.slice(2);

if (!slug) {
  console.error('사용법: npm run new -- <slug> "글 제목"');
  console.error('예시:   npm run new -- my-first-post "첫 글입니다"');
  process.exit(1);
}

if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error(`slug는 영문 소문자·숫자·하이픈만 쓸 수 있어요: "${slug}"`);
  console.error('예시: how-to-write, weekly-retro-1');
  process.exit(1);
}

const file = resolve(process.cwd(), 'src/content/posts', `${slug}.md`);

if (existsSync(file)) {
  console.error(`이미 같은 slug의 글이 있어요: src/content/posts/${slug}.md`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);

const template = `---
title: "${title ?? slug}"
description: "목록·검색·공유 미리보기에 쓰이는 한 줄 요약"
pubDate: ${today}
category: "개발"
tags: []
draft: true
---

여기에 본문을 쓰면 된다. 제목은 \`##\`부터 시작한다.
`;

writeFileSync(file, template, 'utf8');

console.log(`✔ 새 글 생성: src/content/posts/${slug}.md`);
console.log('');
console.log('다음 단계:');
console.log('  1. frontmatter의 description·category·tags 채우기');
console.log('  2. npm run dev 로 미리보기 (draft도 보임)');
console.log('  3. 발행할 준비가 되면 draft: false 로 변경');
