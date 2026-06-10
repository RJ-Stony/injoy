// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import rehypeTableWrap from './src/plugins/rehype-table-wrap.mjs';

// https://astro.build/config
export default defineConfig({
  // 배포 시 실제 도메인으로 교체하세요. (README의 "배포" 절 참고)
  site: 'https://injoy.example.com',
  output: 'static',
  integrations: [mdx(), sitemap()],
  markdown: {
    rehypePlugins: [rehypeTableWrap],
    shikiConfig: {
      // 라이트/다크 듀얼 테마 — prefers-color-scheme에 따라 CSS에서 전환
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    },
  },
});
