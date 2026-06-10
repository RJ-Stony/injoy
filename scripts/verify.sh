#!/usr/bin/env bash
set -euo pipefail
echo "== Injoy verify =="
# 빌드
npm run build
# 산출물 존재 확인
test -f dist/index.html            && echo "OK  home"            || { echo "FAIL home"; exit 1; }
test -f dist/about/index.html      && echo "OK  about"           || { echo "FAIL about"; exit 1; }
ls dist/posts/*/index.html >/dev/null 2>&1 && echo "OK  posts"   || { echo "FAIL posts"; exit 1; }
test -f dist/rss.xml               && echo "OK  rss"             || { echo "FAIL rss"; exit 1; }
ls dist/sitemap*.xml >/dev/null 2>&1 && echo "OK  sitemap"       || { echo "FAIL sitemap"; exit 1; }
# 디자인 토큰 흔적 확인 (빌드 CSS 안에 폰트·컬러)
grep -rqi "Wanted Sans" dist        && echo "OK  font(Wanted Sans)" || { echo "FAIL font"; exit 1; }
grep -rqi "2F6FED" dist             && echo "OK  accent color"      || echo "WARN accent color not found inline"
# 마크다운 발행 워크플로우 확인 (임시 글 추가 후 빌드, 정리)
cat > src/content/posts/__verify_tmp.md <<'EOF'
---
title: "verify tmp"
description: "tmp"
pubDate: 2026-06-10
category: "test"
draft: false
---
임시 검증 글.
EOF
npm run build >/dev/null
test -f dist/posts/__verify_tmp/index.html && echo "OK  md-publish workflow" || { echo "FAIL md-publish"; rm -f src/content/posts/__verify_tmp.md; exit 1; }
rm -f src/content/posts/__verify_tmp.md
npm run build >/dev/null
echo "== ALL PASS =="
