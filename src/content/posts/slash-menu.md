---
title: "'/' 한 번으로 블록을 추가하는 Notion식의 슬래시 메뉴"
description: "슬래시와 툴바가 같은 기능으로 동작하도록 수정"
pubDate: 2026-06-17
updatedDate: 2026-07-22T12:22:44.430Z
category: "블로그"
tags: ["에디터", "milkdown", "notion"]
draft: false
series: "블로그 다듬기 기록"
---

지난 글 [[wysiwyg-editor]]에서 에디터를 위지윅 방식으로 바꾸고는 끝에 숙제같지 않은 숙제를 두 개 적어 두었다. 슬래시(`/`) 메뉴가 아직 없다는 것과 콜아웃 맨 앞에서 글자를 지우게 되면 숨은 마커가 동시에 지워져서 평범한 인용으로 바뀐다는 것. 이번엔 그 두 기능을 손보게 되었다.

## 슬래시 한 번이면

이제 빈 라인에서 `/`를 입력하면 작은 메뉴가 뜬다. 제목, 인용, 콜아웃, 표, 목록, 체크리스트, 구분선, 코드블록, 수식, 각주, 다이어그램 등 툴바에 있는 기능들이다. 이어서 메뉴를 치면 목록이 좁혀지고, 방향키로 고른 뒤 엔터를 누르면 그 자리에 해당 블록이 들어간다.

> [!NOTE]
> 슬래시 메뉴는 PC에서도, 모바일에서도 되지만, 모바일에서는 예전처럼 삽입 툴바 기능을 쓰는 게 조금 더 낫다. 좁은 화면에서 작은 팝업을 정확히 누르게 하느니 **큼직한 버튼**이 낫다고 본다.

## 새로운 코드를 따로 막 추가하진 않았다

슬래시로 블록 추가하는 것을 툴바가 쓰던 기능과 동일하게 두었다. 슬래시로 고른 항목은 결국 툴바의 삽입 함수로 보내진다. 메뉴는 마크다운 조각을 만들어 건넬 뿐, 삽입 로직을 따로 가지 않는다. 그래야 툴바와 슬래시가 어긋나지 않을 것 같았다.

고른 항목이 어디로 가는지는 **`choose`** **함수**에 담겨 있다.

```ts src/scripts/milkdown-editor.ts
const choose = (view, item) => {
  const to = view.state.selection.from;
  // '/질의' 글자를 선택 상태로 만들어 한 트랜잭션에 치환되게 한다
  if (to > from) {
    view.dispatch(view.state.tr.setSelection(
      TextSelection.create(view.state.doc, from, to)));
  }
  close();
  onInsert(item.md); // [!code highlight]
  view.focus();
};
```

`onInsert(item.md)`에서 메뉴는 `item.md`라는 마크다운 조각을 만들어 넘기고, `onInsert`는 **툴바가 블록을 넣을 때 쓰는 바로 그 함수**다. 삽입하는 곳이 한 군데뿐이라, 툴바에서 잘 들어가는 블록은 슬래시에서도 똑같이 들어간다.

## URL 속의 슬래시는 그냥 두기

막상 붙이고 보니 성가신 케이스가 있었다. 본문에 `https://`를 적었는데 그 슬래시마다 메뉴가 튀어나오면 곤란하다. 그래서 `/`는 줄의 맨 앞이거나 공백 바로 뒤일 때만 메뉴를 열도록 했다. URL 안의 슬래시는 앞에 글자가 붙어 있으니 조용히 지나가게 된다.

이 판단은 정규식(문자열에서 패턴을 찾는 규칙) 한 줄이 책임진다. 커서 앞의 텍스트를 보고, 조건에 맞는 `/`만 잡는다.

```ts src/scripts/milkdown-editor.ts
// 커서 앞 텍스트(before)에서 '/명령어'를 줄머리나 공백 뒤에서만 찾는다
const m = before.match(/(?:^|\s)\/([^\s/]*)$/);
if (!m) return null; // 못 찾으면 메뉴를 열지 않는다
```

정규식을 풀어 보면 이렇다. 슬래시가 **줄 맨 앞이거나 공백 바로 뒤일 때만,** 그리고 그 뒤에 이어 친 글자(검색어)를 함께 잡는다. `https://`의 슬래시는 앞에 `s`나 `:`가 붙어 있어 이 조건에 안 걸리니, 메뉴가 열리지 않는다.

> [!WARNING]
> 한글을 조합하는 중에는 메뉴가 방향키나 엔터를 가로채지 않게 했다. 이걸 빠뜨리면 글자를 만드는 도중에 메뉴가 끼어들어서 조합이 깨질 수도 있다. 콜아웃도 같은 이유로 한글 조합 중에는 나타나지 않도록 방지했다.

조합을 지키는 것도 한 줄로 구현했다. 메뉴의 키가 처리되는 맨 앞에서, 한글 조합 중이면 바로 무시한다.

```ts src/scripts/milkdown-editor.ts
handleKeyDown: (view, event) => {
  if (!open) return false;
  if (view.composing || event.isComposing) return false; // [!code highlight]
  // 여기부터 방향키·Enter·Esc 처리
}
```

`return false`는 '이 키는 내가 처리하지 않으니 그대로 보내라'는 뜻이다. ㄱ·ㅏ·ㅂ을 합쳐 '갑'을 만드는 도중이면 강조한 줄에서 무조건 빠져나가므로, 메뉴가 방향키나 엔터 때문에 이 조합을 깨뜨릴 일이 없게 되었다.

## 고친 또다른 한 문제

**콜아웃 문제**도 함께 고쳤다. 콜아웃은 화면에 박스로 보이지만 속에는 `[!NOTE]` 같은 **숨은 마커**가 들어 있다. 예전엔 박스 맨 앞에서 글자를 지우면 이 마커가 지워져서, 발행할 때 평범한 인용으로 변신했다. 이제는 박스 머리에서 지우는 동작을 지켜보고, 마커만 어설프게 빠뜨리는 대신 통째로 지워 평범한 인용으로 깔끔히 풀도록 했다.

방지하는 코드는 콜아웃 앞 부분에서만 작동한다.

```ts src/scripts/milkdown-editor.ts
handleKeyDown(view, event) {
  if (event.key !== 'Backspace' && event.key !== 'Delete') return false;
  if (view.composing || event.isComposing) return false; // 조합 중엔 손대지 않는다
  // 커서가 콜아웃 머리에 있을 때만 머리를 통째로 지워 콜아웃을 해제한다
  if (eatsBack || eatsFwd) return drop(removeFrom, removeTo); // [!code highlight]
  return false; // [!code highlight]
}
```

마지막 `return false`가 가장 중요하다. 오직 마커가 깨질 수 있는 앞 부분에서만 끼어들어 콜아웃을 깔끔히 해제한다.

빌드는 어느 쪽이든 멀쩡히 통과한다. 그래서 이런 부분일수록 [[wysiwyg-editor]]에서처럼 여러 시선으로 들여다보는 적대적인 리뷰를 한 번 더 돌렸다. 슬래시는 한 번, 콜아웃은 세 번을 돌고 나서야 본 코드에 합쳐지게 되었다.

## 결론

쓰는 화면은 또 한 결 편해졌다. 슬래시로 추가하고, 보이는 대로 고치고, 발행은 예전 그대로다. 각 블록이 실제로 어떻게 보이는지는 [[markdown-styleguide]]에 모아 두었다. 결국 이번에도 글쓰기를 가로막는 마찰을 한껏 더 걷어냈다. 🌱
