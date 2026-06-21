#!/usr/bin/env node
/**
 * 기본 공유 이미지(OG) 생성기 — 1회용. `node scripts/make-og.mjs`
 *
 * 커버 없는 글·페이지를 카카오톡·슬랙·트위터에 붙일 때 쓰는 폴백 썸네일을
 * public/og-default.png 로 굽는다(1200×630). 빌드에는 묶지 않는다 — 결과 PNG를
 * 커밋해 두면 배포·CI의 폰트 환경에 의존하지 않는다. 디자인을 바꾸려면 이 파일을
 * 고쳐 다시 실행하고 PNG를 커밋한다.
 *
 * 시안 C(그래프 모티프): 옅은 점·선 지도 위에 joy 아바타 + Injoy + 태그라인.
 * sharp는 astro(astro:assets)를 통해 이미 설치돼 있어 별도 의존성이 없다.
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AV = 150; // 아바타 지름
const AV_CX = 430;
const AV_CY = 300;

// 배경 SVG — 그래프 점·선 + 워드마크 + 태그라인 (아바타 자리는 비워 두고 뒤에서 합성)
const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#ffffff"/>
  <g stroke="#e8eaed" stroke-width="2" fill="none">
    <line x1="180" y1="120" x2="420" y2="300"/><line x1="420" y1="300" x2="240" y2="500"/>
    <line x1="420" y1="300" x2="760" y2="180"/><line x1="760" y1="180" x2="1000" y2="360"/>
    <line x1="760" y1="180" x2="980" y2="110"/><line x1="420" y1="300" x2="700" y2="470"/>
    <line x1="700" y1="470" x2="1010" y2="540"/><line x1="240" y1="500" x2="560" y2="560"/>
  </g>
  <g fill="#dbe4f3">
    <circle cx="180" cy="120" r="9"/><circle cx="240" cy="500" r="9"/>
    <circle cx="760" cy="180" r="11"/><circle cx="1000" cy="360" r="9"/><circle cx="980" cy="110" r="7"/>
    <circle cx="700" cy="470" r="10"/><circle cx="1010" cy="540" r="8"/><circle cx="560" cy="560" r="9"/>
  </g>
  <circle cx="${AV_CX}" cy="${AV_CY}" r="${AV / 2 + 8}" fill="none" stroke="#eaf1fe" stroke-width="14"/>
  <text x="540" y="300" font-family="Arial, Helvetica, sans-serif" font-size="120" font-weight="700" fill="#1a1b1e" dominant-baseline="central">Injoy</text>
  <text x="600" y="440" font-family="'Malgun Gothic', Arial, sans-serif" font-size="44" fill="#6b7178" text-anchor="middle">즐거움 안에서.</text>
</svg>`;

const circleMask = Buffer.from(
  `<svg width="${AV}" height="${AV}"><circle cx="${AV / 2}" cy="${AV / 2}" r="${AV / 2}" fill="#fff"/></svg>`,
);

const avatar = await sharp(resolve(root, 'src/assets/profile.jpg'))
  .resize(AV, AV, { fit: 'cover' })
  .composite([{ input: circleMask, blend: 'dest-in' }])
  .png()
  .toBuffer();

const bg = await sharp(Buffer.from(bgSvg)).png().toBuffer();

await sharp(bg)
  .composite([{ input: avatar, left: AV_CX - AV / 2, top: AV_CY - AV / 2 }])
  .png()
  .toFile(resolve(root, 'public/og-default.png'));

console.log('✔ public/og-default.png 생성 완료 (1200×630)');
