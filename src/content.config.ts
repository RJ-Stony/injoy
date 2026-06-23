import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  // 언더스코어로 시작하는 파일명도 글로 인식해야 하므로 '**/*' 패턴을 사용한다.
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      category: z.string(),
      tags: z.array(z.string()).default([]),
      // 같은 series 값을 가진 글끼리 '이 시리즈의 글'로 묶인다(선택). 없으면 시리즈 내비 미표시.
      series: z.string().optional(),
      draft: z.boolean().default(false),
      cover: image().optional(),
    }),
});

export const collections = { posts };
