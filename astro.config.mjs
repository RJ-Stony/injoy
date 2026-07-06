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
import remarkBoldFix from './src/plugins/remark-bold-fix.mjs';
import { alertOptions } from './src/utils/callout-config.mjs';

// [[위키링크]] 하버카드용 글 메타 맵 (config 로드 시 1회 스캔 -
// dev 중 글을 추가하면 dev 서버 재시작 후 반영된다).
// draft 글은 제외 - 위키링크는 원문 그대로 남기고 빌드 로그에 경고만 낸다.
const fm = (src, key) =>
  src.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm'))?.[1];
const postMeta = Object.fromEntries(
  readdirSync('./src/content/posts')
    .filter((f) => /\.(md|mdx)$/.test(f))
    .flatMap((f) => {
      const src = readFileSync(`./src/content/posts/${f}`, 'utf8');
      if (/^draft:\s*true\s*$/m.test(src)) return [];
      const slug = f.replace(/\.(md|mdx)$/, '');
      return [[slug, {
        title: fm(src, 'title') ?? slug,
        description: fm(src, 'description') ?? '',
        category: fm(src, 'category') ?? '',
      }]];
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

// 코드 펜스의 언어 뒤 메타를 파일명으로 — pre에 data-title로 실어 보낸다(클라이언트 헤더가 읽음).
// 표기: 백틱3 + 언어 + 공백 + 파일명 (대괄호 금지 — Milkdown 왕복에서 이스케이프되므로).
// 줄강조 [!code]는 코드 주석에서 처리되어 펜스 메타와 다른 노드라 충돌하지 않는다.
const fenceTitle = {
  name: 'injoy-fence-title',
  pre(node) {
    const raw = (this.options.meta?.__raw ?? '').trim();
    if (raw) node.properties['data-title'] = raw;
  },
};

// [!code step:N] 마커 → 그 줄에 data-step="N"을 달고 마커 텍스트는 지운다.
// 코드 실행 순서 재생(code-step-player.ts)이 소비한다. 주석 문법은 언어를 따른다
// (파이썬 #, JS //, CSS/블록 주석 등). 마커만 있던 주석 여는 기호가 덜렁 남으면 함께 지운다.
const STEP_RE = /(?:\/\/|#|--|;|%|\/\*|<!--|"|')?\s*\[!code step:(\d{1,2})\]\s*(?:\*\/|-->)?\s*$/;
const transformerCodeSteps = () => ({
  name: 'injoy:code-steps',
  code(node) {
    for (const line of node.children) {
      if (line.type !== 'element') continue;
      // 줄 안의 텍스트 노드를 순서대로 모은다(Shiki는 토큰 span 안에 텍스트를 둔다).
      const texts = [];
      const collect = (el) => {
        for (const c of el.children ?? []) {
          if (c.type === 'text') texts.push(c);
          else if (c.type === 'element') collect(c);
        }
      };
      collect(line);
      // 마커는 줄 끝에 온다 - 마지막 텍스트 노드부터 뒤로 훑는다.
      for (let i = texts.length - 1; i >= 0; i--) {
        const m = texts[i].value.match(STEP_RE);
        if (!m) {
          // 뒤쪽에 공백만 있는 노드는 건너뛰고 더 앞을 본다.
          if (/^\s*$/.test(texts[i].value)) continue;
          break;
        }
        line.properties['data-step'] = m[1];
        texts[i].value = texts[i].value.slice(0, m.index);
        // 마커를 지운 뒤 그 줄 끝에 남은 텍스트 노드들이 공백뿐이면 함께 비워
        // 주석 여는 기호(예: 파이썬 '#')가 덜렁 남지 않게 한다.
        for (let j = i + 1; j < texts.length; j++) texts[j].value = '';
        break;
      }
    }
  },
});

// https://astro.build/config
export default defineConfig({
  site: SITE,
  base: BASE,
  output: 'static',
  integrations: [
    mdx(),
    // /voice(말투 노트)는 미게시 페이지 — 사이트맵에서 제외(noindex와 함께 검색 노출 차단)
    sitemap({ filter: (page) => !page.includes('/voice') }),
    stripAdmin,
  ],
  markdown: {
    remarkPlugins: [
      remarkMath, // $인라인$ / $$블록$$ 수식
      [remarkEmoji, { accessible: true }], // :rocket: 숏코드
      [remarkWikiLinks, { meta: postMeta, base: BASE }], // [[슬러그]] 글 연결
      remarkBoldFix, // 구두점에 막혀 깨진 **…** 굵게를 strong으로 보정
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
      transformers: [transformerNotationDiff(), transformerNotationHighlight(), fenceTitle, transformerCodeSteps()],
    },
  },
});
