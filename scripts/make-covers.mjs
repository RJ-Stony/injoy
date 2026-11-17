// 책 그림(원본 PNG)을 서가에서 쓰는 크기의 webp로 줄여 public/covers/에 넣는다.
// 그림은 표지와 책등을 한 장에 담은 정사각형이다. 오른쪽이 표지, 그 왼쪽으로 이어지는 부분이 책등에 감긴다(Shelf.astro).
// 사용법: node scripts/make-covers.mjs <원본 폴더>
//   원본 폴더의 파일 이름은 서가의 순서(01.png, 02.png, …)다. 순서와 열쇠(시리즈 주소나 글 슬러그)는
//   빌드된 홈(dist/index.html)의 서가 자료에서 읽으므로, 먼저 npm run build를 한 번 돌려 둔다.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const src = process.argv[2];
if (!src) throw new Error('원본 폴더를 적어 주세요: node scripts/make-covers.mjs <폴더>');
const home = fs.readFileSync('dist/index.html', 'utf8');
const data = JSON.parse(home.match(/id="shelf-data"[^>]*>([\s\S]*?)<\/script>/)[1]);
fs.mkdirSync('public/covers', { recursive: true });
for (const [i, book] of data.entries()) {
  const file = path.join(src, `${String(i + 1).padStart(2, '0')}.png`);
  if (!fs.existsSync(file)) {
    console.log('없음', file);
    continue;
  }
  // 열쇠: 책 주소의 마지막 마디(시리즈는 /series/<이름>/, 낱권은 /posts/<슬러그>/)
  const key = decodeURIComponent(book.url.replace(/\/$/, '').split('/').pop());
  await sharp(file).resize(1200, 1200, { fit: 'cover', position: 'right top' }).webp({ quality: 82 }).toFile(`public/covers/${key}.webp`);
  // 휴대폰용 작은 그림. 책이 작게 그려지는 화면에서 큰 그림을 받아 줄여 그리지 않게 한다
  await sharp(file).resize(640, 640, { fit: 'cover', position: 'right top' }).webp({ quality: 78 }).toFile(`public/covers/${key}-s.webp`);
  console.log('만듦', `public/covers/${key}.webp`, '←', book.title);
}
