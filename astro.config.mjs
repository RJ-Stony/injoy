// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { rehypeGithubAlerts } from 'rehype-github-alerts';
import {
  transformerNotationDiff,
  transformerNotationHighlight,
} from '@shikijs/transformers';
import rehypeTableWrap from './src/plugins/rehype-table-wrap.mjs';
import rehypeBaseLinks from './src/plugins/rehype-base-links.mjs';

// 배포 경로 — GitHub Pages 프로젝트 사이트. 다른 곳(Vercel 등)에 배포하면
// site를 해당 도메인으로 바꾸고 base를 '/'로 (또는 줄을 삭제) 하면 된다.
const SITE = 'https://rj-stony.github.io';
const BASE = '/injoy';

// GitHub 스타일 콜아웃(> [!NOTE] 등)에 한국어 라벨과 아이콘 적용.
// icon은 비워 두면 플러그인이 변환을 건너뛰므로 반드시 유효한 SVG여야 한다.
const alertIcon = (paths) =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const alertOptions = {
  alerts: [
    {
      keyword: 'NOTE',
      title: '참고',
      icon: alertIcon('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
    },
    {
      keyword: 'TIP',
      title: '팁',
      icon: alertIcon(
        '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
      ),
    },
    {
      keyword: 'IMPORTANT',
      title: '중요',
      icon: alertIcon(
        '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v4M12 14h.01"/>',
      ),
    },
    {
      keyword: 'WARNING',
      title: '주의',
      icon: alertIcon(
        '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
      ),
    },
    {
      keyword: 'CAUTION',
      title: '경고',
      icon: alertIcon(
        '<path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86L7.86 2z"/><path d="M12 8v4M12 16h.01"/>',
      ),
    },
  ],
};

// https://astro.build/config
export default defineConfig({
  site: SITE,
  base: BASE,
  output: 'static',
  integrations: [mdx(), sitemap()],
  markdown: {
    rehypePlugins: [
      [rehypeGithubAlerts, alertOptions],
      rehypeTableWrap,
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
