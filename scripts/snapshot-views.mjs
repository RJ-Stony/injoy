// 예전 계수기(Abacus)에 쌓인 방문 수와 글별 조회 수를 한 번 받아 src/data/view-baseline.json에 적어 둔다.
// 그 뒤의 수치는 GA4에서 받아 이 값에 더한다(src/utils/views.ts). 계수기를 옮길 때 숫자가 0으로 돌아가지 않게 하려는 것이다.
// 사용법: node scripts/snapshot-views.mjs   (옮기는 날 한 번만 돌린다. 다시 돌리면 그 사이의 방문이 두 번 세어진다)
import fs from 'node:fs';

const API = 'https://abacus.jasoncameron.dev/get/injoy-rjstony';
// 한 번도 세어지지 않은 글은 404다(0으로 적는다). 그 밖의 실패(요청이 몰려 거절된 경우 등)는 잠깐 쉬었다가 다시 묻고,
// 끝내 받지 못하면 멈춘다. 실패를 0으로 적으면 그 글의 조회 수가 사라진다.
const get = async (key) => {
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${API}/${key}`).catch(() => null);
    if (res?.ok) return (await res.json()).value ?? 0;
    if (res?.status === 404) return 0;
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw new Error(`받지 못함: ${key}`);
};

const slugs = fs
  .readdirSync('src/content/posts')
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.replace(/\.md$/, ''));
const posts = {};
for (const slug of slugs) {
  await new Promise((r) => setTimeout(r, 120));
  posts[slug] = await get(`post-${slug.replace(/[^a-zA-Z0-9_-]/g, '-')}`);
}
const out = { takenAt: new Date().toISOString().slice(0, 10), site: await get('site-visits'), posts };
fs.writeFileSync('src/data/view-baseline.json', JSON.stringify(out, null, 2) + '\n');
console.log('방문', out.site, '/ 글', slugs.length, '편 / 조회 합계', Object.values(posts).reduce((a, b) => a + b, 0));
