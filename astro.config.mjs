// @ts-check
import { rm } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { rehypeGithubAlerts } from 'rehype-github-alerts';
import remarkMath from 'remark-math';
import remarkEmoji from 'remark-emoji';
import rehypeKatex from 'rehype-katex';
import {
  transformerNotationDiff,
  transformerNotationHighlight,
} from '@shikijs/transformers';
import rehypeTableWrap from './src/plugins/rehype-table-wrap.mjs';
import rehypeBaseLinks from './src/plugins/rehype-base-links.mjs';
import rehypeFigure from './src/plugins/rehype-figure.mjs';
import rehypeTossface from './src/plugins/rehype-tossface.mjs';
import remarkWikiLinks from './src/plugins/remark-wiki-links.mjs';
import { alertOptions } from './src/utils/callout-config.mjs';

// [[위키링크]]의 표시 텍스트로 쓸 글 제목 맵 (config 로드 시 1회 스캔 —
// dev 중 글을 추가하면 dev 서버 재시작 후 제목이 반영된다).
// draft 글은 제외 — 프로덕션에서 404가 되는 링크를 만들지 않기 위해
// 위키링크는 원문 그대로 남기고 빌드 로그에 경고만 낸다.
const postTitles = Object.fromEntries(
  readdirSync('./src/content/posts')
    .filter((f) => /\.(md|mdx)$/.test(f))
    .flatMap((f) => {
      const src = readFileSync(`./src/content/posts/${f}`, 'utf8');
      if (/^draft:\s*true\s*$/m.test(src)) return [];
      const title = src.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1];
      return [[f.replace(/\.(md|mdx)$/, ''), title ?? f]];
    }),
);

// 배포 경로 — GitHub Pages 프로젝트 사이트. 다른 곳(Vercel 등)에 배포하면
// site를 해당 도메인으로 바꾸고 base를 '/'로 (또는 줄을 삭제) 하면 된다.
const SITE = 'https://rj-stony.github.io';
const BASE = '/injoy';

// 글쓰기 화면(/admin)은 npm run write 로컬 전용 — 배포 산출물에서는 제거한다.
// 방문자는 글을 읽을 수만 있고, 쓰기는 레포 접근 권한이 있는 나만 가능하다.
const stripAdmin = {
  name: 'strip-admin-from-build',
  hooks: {
    /** @param {{ dir: URL }} options */
    'astro:build:done': async ({ dir }) => {
      await rm(new URL('admin/', dir), { recursive: true, force: true });
    },
  },
};

// https://astro.build/config
export default defineConfig({
  site: SITE,
  base: BASE,
  output: 'static',
  integrations: [mdx(), sitemap(), stripAdmin],
  markdown: {
    remarkPlugins: [
      remarkMath, // $인라인$ / $$블록$$ 수식
      [remarkEmoji, { accessible: true }], // :rocket: 숏코드
      [remarkWikiLinks, { titles: postTitles, base: BASE }], // [[슬러그]] 글 연결
    ],
    rehypePlugins: [
      [rehypeGithubAlerts, alertOptions],
      rehypeTableWrap,
      rehypeKatex, // 수식 → KaTeX HTML (CSS는 BaseLayout에서 로드)
      rehypeFigure, // ![alt](src "캡션") → figure/figcaption
      rehypeTossface, // 이모지 글리프만 Tossface 적용
      [rehypeBaseLinks, { base: BASE }],
    ],
    remarkRehype: {
      footnoteLabel: '각주',
      footnoteBackLabel: '본문으로 돌아가기',
      footnoteLabelProperties: { className: ['footnotes-title'] },
    },
    shikiConfig: {
      // 라이트/다크 듀얼 테마 — 시스템 설정·수동 토글에 따라 CSS에서 전환
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      // 코드블록 주석 표기: [!code highlight], [!code ++], [!code --]
      transformers: [transformerNotationDiff(), transformerNotationHighlight()],
    },
  },
});
