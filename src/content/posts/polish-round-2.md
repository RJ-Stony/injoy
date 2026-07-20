---
title: "글이 쌓이기 전에 카테고리로 모아 봤다"
description: "헤더에 카테고리/햄버거 메뉴를 더하고, 읽고 쓰는 화면을 또 다듬은 과정"
pubDate: 2026-06-20
updatedDate: 2026-06-21
category: "블로그"
tags: ["에디터", "ui", "카테고리", "그래프"]
series: "블로그 다듬기 기록"
draft: false
---

글이 한 편 두 편 쌓이자, 카테고리별로 모아 볼 수 없다는 게 눈에 밟혔다. 이번엔 그쪽을 살펴보게 되었다. 카테고리별로 글을 모아 보는 기능이다. [[polish-round]]에서 한 차례 깎아낸 뒤로도 읽고 쓰는 화면에 손볼 곳이 남아 있어, 그것들도 이번에 함께 다듬었다.

## 쓰는 화면

기존 글을 고르는 드롭다운이 있다. 제목이 길면 이 칸이 화면 밖으로 삐져나갔다. 모바일에서는 특히 더 그랬다. 이제는 칸 폭 안에 가두고, 넘치는 부분은 …로 줄인다. 펼치면 전체 제목은 그대로 보인다.

연결을 다는 자리도 손봤다. 메모가 세 줄로 답답하게 쌓이던 걸, **타입/제목/빼기**를 한 줄에 두고 그 아래 메모를 한 줄로 내렸다. 그리고 하나 더. 예전엔 한 번 단 메모를 고칠 방법이 없었는데, 이제 *그 자리에서 바로* 고쳐 쓸 수 있다.

## 카테고리로 모아 보기

글이 늘면서 블로그/글쓰기/AI 같은 많은 카테고리가 생겼다. 그런데 갈래별로 모아 볼 수 있는 길이 없었다. 헤더에 카테고리 메뉴를 더했다. 누르면 갈래가 펼쳐지고, 고르면 그 갈래의 글만 모인 페이지로 간다. 카드의 카테고리 뱃지를 눌러도 같은 곳으로 간다.

새 갈래를 더하는 데엔 코드를 건드릴 필요가 없다. 글 frontmatter(글 머리에 적는 정보)의 `category`만 적으면, 메뉴도 페이지도 그 목록을 따라 자동으로 생긴다. 그 목록을 만드는 함수는 이것뿐이다.

```ts src/utils/post.ts
// 발행 글을 훑어 카테고리별 글 수를 센다(글 많은 순, 같으면 가나다순)
export async function getCategories() {
  const posts = await getPublishedPosts();
  const counts = new Map();
  for (const p of posts) counts.set(p.data.category, (counts.get(p.data.category) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
}
```

헤더 메뉴도, `/categories/블로그/` 같은 페이지도 이 함수가 돌려준 목록으로 만들어진다. 그래서 어느 글의 카테고리를 바꾸기만 해도 메뉴와 페이지가 알아서 따라온다. *실은 이 글도 얼마 전 '개발'에서 '블로그'로 옮겨졌고, 그 순간 메뉴에서 '개발'이 사라지고 '블로그'가 나타났다.*

*가장 신경 쓴 건 따로 있다.* 모바일이다. 좁은 화면에선 메뉴를 햄버거 버튼 안에 모았다. 글이 한참 늘어나도 헤더가 무너지거나 글자가 줄바꿈되지 않게, 메뉴는 화면 흐름 밖에 띄웠다.

여기서 작은 문제를 하나 맞닥뜨렸다. 메뉴 안 링크들을 가지런히 놓으려고 `display: flex`(요소를 가지런히 배치하는 CSS 규칙)를 줬는데, 이게 글쓰기 링크의 숨김(`hidden`)을 덮어써 버렸다. 토큰이 없어도 글쓰기 링크가 보이게 된 것이다.

```css src/layouts/BaseLayout.astro
.site-header .mobile-menu a {
  display: flex; /* 링크를 가지런히. 그런데 이게 hidden을 덮었다 */
}
/* display:flex가 hidden을 덮지 않도록. 글쓰기 링크는 토큰 있을 때만 보인다 */
.site-header .mobile-menu a[hidden] {
  display: none; /* [!code ++] */
}
```

`display: flex`가 `hidden` 속성보다 우선이라 생긴 일이라, `a[hidden]`에 `display: none`을 더 구체적인 규칙으로 다시 못 박았다. 빌드는 멀쩡히 통과하던, 눈으로만 잡히는 부류의 문제였다.

## 읽는 화면

홈 목록에서도 글마다 읽는 시간 옆에 조회수를 보이게 했다. 다만 목록에선 수를 올리지 않고 보기만 한다. 둘러보는 것만으로 숫자가 부풀면 곤란하니까.

글 안에선 조회수가 늦게 떠서 줄이 한 번씩 출렁였다. 자리를 미리 잡아 두고 숫자만 채우게 바꾸니, 이제 들어오자마자 제자리에 앉는다.

자리를 미리 잡는다는 건, 응답이 오기 전에 숫자 폭만큼 빈 칸을 먼저 그려 둔다는 뜻이다.

```html
<!-- 응답 전: 숫자 폭만큼 잔잔히 반짝이는 자리표시 -->
<span class="value"><span class="vc-skeleton"></span></span>
```

```ts
fetch(`https://abacus.../${mode}/injoy-rjstony/${key}`)
  .then((res) => res.json())
  .then((data) => { value.textContent = data.value.toLocaleString('ko-KR'); }) // [!code highlight]
  .catch(() => { el.hidden = true; }); // 카운터가 죽으면 그 칩만 조용히 감춘다
```

칸이 처음부터 있으니 줄 높이가 고정되고, 강조한 줄에서 응답이 오면 자리표시를 실제 숫자로 갈아 끼운다. 그래서 숫자가 늦게 와도 화면이 출렁이지 않는다. 응답이 영영 안 오면(`catch`) 그 칩만 감춰, 빈 자리표시가 영원히 반짝이지 않게 했다. 홈 목록에서 수를 올리지 않는 것도 같은 컴포넌트가 한다. `mode`를 `hit`(올리고 조회)이 아닌 `get`(조회만)으로 두면, 둘러보는 것만으로 숫자가 부풀지 않는다.

태그라인도 바꿨다. *즐거움 안에서.* In joy, Injoy다.

## 조용히 묻혀 있던 것들

그래프에서 태그로 잇는 점선이 너무 연해 거의 안 보였다(정말 있긴 한 걸까 싶을 만큼). 색은 그대로 두되 회색으로 살짝 올리니, 이제 흐릿하게라도 이어진 게 보인다.

태그선만 따로 거의 흰색에 가까운 토큰을 쓰고 있던 게 원인이었다.

```ts src/pages/graph.astro
const faint = isTag || isMention; // 태그·언급 연결선은 약하게 그린다
const stroke = isTag ? colors.border : isMention ? colors.muted : colors.edge[e.type]; // [!code --]
const stroke = faint ? colors.muted : colors.edge[e.type] || colors.accent; // [!code ++]
const alpha = base * (faint ? 0.55 : 0.95); // [!code --]
const alpha = base * (faint ? 0.7 : 0.95); // [!code ++]
```

태그선이 쓰던 `colors.border`는 거의 흰색이라 흰 배경 위에선 있으나 마나였다. 이걸 한 단계 진한 `colors.muted`로 바꾸고(`faint`면 무조건 muted), 투명도도 0.55에서 0.7로 살짝 올렸다. 색 계열은 회색 그대로 두되, 흰 배경에서도 '이어져 있다'가 보일 만큼만 끌어올린 것이다.

모바일 목차도 손봤다. 위에 있던 목차 카드는 스크롤하면 사라져서, 지금 어느 자리인지 알 수 없었다. 조용한 부류의 문제였다. 오른쪽 가장자리에 세로 라인을 띄워 지금 섹션을 진하게 짚어 준다. 라인을 누르면 그 자리로 가고, 본문은 가리지 않는다.

## 남은 것

발행은 예전 그대로다. 카테고리 하나로 글이 한결 정리돼 보이니, 쌓이는 재미가 조금 더 붙었다. 🌱
