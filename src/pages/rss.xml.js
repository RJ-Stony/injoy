import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const posts = (await getCollection('posts', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );

  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  return rss({
    title: 'Injoy',
    description: '마크다운으로 쓰고 즐겁게 기록하는 개인 블로그, Injoy.',
    site: new URL(`${base}/`, context.site).href,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `${base}/posts/${post.id}/`,
      categories: [post.data.category, ...post.data.tags],
    })),
    customData: '<language>ko</language>',
  });
}
