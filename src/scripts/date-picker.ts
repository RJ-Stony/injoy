/**
 * /write 발행일 선택용 커스텀 달력.
 * 브라우저 기본 date 입력은 OS·로케일에 따라 모양이 제각각이라
 * ("2026-06-12 ()" 같은 빈 요일 표기 포함) 토큰 기반의 일관된 달력으로 대체한다.
 * - 숨은 input[type=hidden]이 값(YYYY-MM-DD)의 단일 출처 — 기존 폼 로직은 그대로 동작
 * - 선택 시 input에 'input' 이벤트를 쏴서 점검(lint)도 즉시 반응한다
 */
export interface DatePickerHandle {
  /** 값(YYYY-MM-DD)을 바꾸고 라벨·달력을 갱신한다 */
  set(value: string): void;
}

interface DatePickerOptions {
  input: HTMLInputElement;
  trigger: HTMLButtonElement;
  panel: HTMLElement;
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

const parseISO = (value: string): { y: number; m: number; d: number } | null => {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
};

export const todayISO = (): string => {
  const now = new Date();
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
};

const formatLabel = (value: string): string => {
  const p = parseISO(value);
  if (!p) return '날짜 선택';
  const dow = DOW[new Date(p.y, p.m - 1, p.d).getDay()];
  return `${p.y}년 ${p.m}월 ${p.d}일 (${dow})`;
};

export function createDatePicker({ input, trigger, panel }: DatePickerOptions): DatePickerHandle {
  const today = parseISO(todayISO())!;
  let view = { y: today.y, m: today.m }; // 달력이 보여 주는 연·월
  let open = false;

  const label = trigger.querySelector<HTMLElement>('.date-label') ?? trigger;

  const updateLabel = () => {
    label.textContent = formatLabel(input.value);
  };

  const renderPanel = () => {
    panel.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'dp-head';
    const title = document.createElement('span');
    title.className = 'dp-title';
    title.textContent = `${view.y}년 ${view.m}월`;
    const nav = (dir: -1 | 1, text: string, labelText: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dp-nav';
      b.textContent = text;
      b.setAttribute('aria-label', labelText);
      b.addEventListener('click', () => {
        const next = view.m + dir;
        view = next < 1 ? { y: view.y - 1, m: 12 } : next > 12 ? { y: view.y + 1, m: 1 } : { y: view.y, m: next };
        renderPanel();
      });
      return b;
    };
    head.append(nav(-1, '‹', '이전 달'), title, nav(1, '›', '다음 달'));

    const grid = document.createElement('div');
    grid.className = 'dp-grid';
    for (const d of DOW) {
      const cell = document.createElement('span');
      cell.className = 'dp-dow';
      cell.textContent = d;
      grid.appendChild(cell);
    }

    const first = new Date(view.y, view.m - 1, 1).getDay();
    const days = new Date(view.y, view.m, 0).getDate();
    const selected = input.value;
    for (let i = 0; i < first; i++) {
      grid.appendChild(document.createElement('span'));
    }
    for (let d = 1; d <= days; d++) {
      const iso = toISO(view.y, view.m, d);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dp-day';
      b.textContent = String(d);
      if (iso === toISO(today.y, today.m, today.d)) b.classList.add('today');
      if (iso === selected) {
        b.classList.add('selected');
        b.setAttribute('aria-current', 'date');
      }
      b.addEventListener('click', () => {
        setValue(iso);
        close();
        trigger.focus();
      });
      grid.appendChild(b);
    }

    const foot = document.createElement('div');
    foot.className = 'dp-foot';
    const todayBtn = document.createElement('button');
    todayBtn.type = 'button';
    todayBtn.className = 'dp-today';
    todayBtn.textContent = '오늘';
    todayBtn.addEventListener('click', () => {
      setValue(todayISO());
      close();
      trigger.focus();
    });
    foot.appendChild(todayBtn);

    panel.append(head, grid, foot);
  };

  const onDocPointerDown = (ev: PointerEvent) => {
    const t = ev.target as Node;
    if (!panel.contains(t) && !trigger.contains(t)) close();
  };
  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      close();
      trigger.focus();
    }
  };

  const openPanel = () => {
    const p = parseISO(input.value);
    view = p ? { y: p.y, m: p.m } : { y: today.y, m: today.m };
    renderPanel();
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    open = true;
    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('keydown', onKeyDown);
  };

  const close = () => {
    if (!open) return;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    open = false;
    document.removeEventListener('pointerdown', onDocPointerDown);
    document.removeEventListener('keydown', onKeyDown);
  };

  const setValue = (value: string) => {
    input.value = value;
    updateLabel();
    if (open) renderPanel();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  trigger.addEventListener('click', () => (open ? close() : openPanel()));

  updateLabel();
  return { set: setValue };
}
