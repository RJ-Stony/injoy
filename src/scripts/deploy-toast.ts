/**
 * 배포 완료 토스트 — '글 보러 가기'로 /write를 떠나도 배포(Actions) 완료를 알려 준다.
 *
 * /write에서 발행하면 localStorage에 '대기 중 배포'(injoy-pending-deploy)를 남긴다.
 * 이 함수는 모든 페이지에서 한 번 돌며, 그 기록이 있으면 Actions를 조용히 폴링해
 * 완료되는 순간 화면 하단 가운데에 토스트를 띄운다(결국: 어느 페이지에 있든 반영 완료를 알림).
 *
 * 기록도 토큰도 발행한 작성자 브라우저에만 있으므로 방문자에겐 아무 일도 일어나지 않는다(비용 0).
 * /write 자체에서는 인라인 진행 표시(write.astro의 trackDeploy)가 담당하므로 여기선 건너뛴다.
 */
const KEY = 'injoy-pending-deploy';
const TOASTED_KEY = 'injoy-deploy-toasted'; // 같은 발행(sha)을 여러 탭이 중복 토스트하지 않게 하는 표식
const TOKEN_KEY = 'injoy-gh-token';
const API = 'https://api.github.com';
const REPO = 'RJ-Stony/injoy';
const TTL = 20 * 60 * 1000; // 20분 지난 기록은 (이미 반영됐을 테니) 조용히 버린다

interface Pending {
  sha: string;
  url: string;
  title: string;
  verb: '발행' | '수정';
  ts: number;
}

type DeployResult = boolean | 'superseded' | null;

export function watchPendingDeploy(): void {
  // /write는 인라인 진행 표시가 담당 — 중복 폴링·중복 토스트 방지
  if (/\/write\/?$/.test(location.pathname)) return;

  let pending: Pending | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    pending = JSON.parse(raw) as Pending;
  } catch {
    return;
  }
  if (!pending?.sha) return;
  if (Date.now() - (pending.ts ?? 0) > TTL) {
    clearRecordIfSha(pending.sha);
    return;
  }

  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch {
    /* 비공개 모드 등 — 비인증으로 폴링 */
  }

  const p = pending;
  pollDeploy(p.sha, token).then((result) => {
    // 내가 폴링한 그 발행 기록일 때만 지운다 — 그 사이 더 최신 발행이 기록을 덮어썼으면 보존(다중 탭 경합).
    clearRecordIfSha(p.sha);
    if (result !== true && result !== false) return; // null(시간 초과)·'superseded'(더 최신 발행)는 조용히
    // 여러 탭이 같은 sha를 동시에 폴링해도 토스트는 한 번만(작성자 다중 탭 가드).
    if (alreadyToasted(p.sha)) return;
    markToasted(p.sha);
    if (result === true) {
      const lead = p.verb === '수정' ? '수정한 글이' : '새 글이';
      showToast(`<span class="tossface">🌱</span> ${lead} 사이트에 반영됐어요`, { href: p.url, title: p.title }, 'status');
    } else {
      // 실패는 드물고 중요 — assertive로 알리고 자동으로 사라지지 않게(닫기 전까지 유지).
      showToast('⚠ 커밋은 됐지만 배포가 실패했어요. Actions 로그를 확인해 주세요.', null, 'alert');
    }
  });
}

/** 저장된 기록의 sha가 내가 폴링한 sha와 같을 때만 지운다(더 최신 발행 기록은 건드리지 않음). */
function clearRecordIfSha(sha: string): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    if ((JSON.parse(raw) as Pending)?.sha === sha) localStorage.removeItem(KEY);
  } catch {
    localStorage.removeItem(KEY); // 깨진 기록은 정리
  }
}

const alreadyToasted = (sha: string): boolean => {
  try {
    return localStorage.getItem(TOASTED_KEY) === sha;
  } catch {
    return false;
  }
};
const markToasted = (sha: string): void => {
  try {
    localStorage.setItem(TOASTED_KEY, sha);
  } catch {
    /* 무시 */
  }
};

/** Actions 런 결과만 조용히 폴링 — write.astro의 waitForDeploy와 같은 판정·시간 한도(최대 5분). */
async function pollDeploy(sha: string, token: string | null): Promise<DeployResult> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000)); // ~5초 간격, 최대 5분(인라인 4분 이상)
    try {
      const res = await fetch(`${API}/repos/${REPO}/actions/runs?head_sha=${sha}&per_page=1`, {
        headers,
      });
      if (!res.ok) continue;
      const data = await res.json();
      const run = data.workflow_runs?.[0];
      if (!run || run.status !== 'completed') continue;
      // 취소·건너뜀은 실패가 아니라 '더 최신 발행으로 대체됨'.
      if (run.conclusion === 'cancelled' || run.conclusion === 'skipped') return 'superseded';
      return run.conclusion === 'success';
    } catch {
      /* 일시 오류 무시 */
    }
  }
  return null;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * 하단 가운데 토스트. role='status'(성공)는 ~8초 자동 사라짐, role='alert'(실패)는 닫기 전까지 유지.
 * 접근성: 빈 라이브영역을 먼저 body에 붙이고 다음 프레임에 내용을 주입해야 스크린리더가 안정적으로 낭독한다.
 */
function showToast(
  titleHtml: string,
  link: { href: string; title: string } | null,
  role: 'status' | 'alert',
): void {
  const toast = document.createElement('div');
  toast.className = 'injoy-toast';
  toast.setAttribute('role', role);

  let timer = 0;
  const dismiss = () => {
    if (timer) clearTimeout(timer);
    toast.classList.remove('in');
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 320);
  };

  const fill = () => {
    const body = document.createElement('div');
    body.className = 'injoy-toast-body';
    const title = document.createElement('span');
    title.className = 'injoy-toast-title';
    title.innerHTML = titleHtml;
    body.appendChild(title);
    if (link) {
      const a = document.createElement('a');
      a.className = 'injoy-toast-link';
      a.href = link.href;
      a.title = link.title;
      a.innerHTML =
        `<span class="injoy-toast-name">${escapeHtml(link.title)}</span>` +
        `<span class="injoy-toast-go">&nbsp;· 보러 가기 →</span>`;
      body.appendChild(a);
    }
    toast.appendChild(body);

    const x = document.createElement('button');
    x.className = 'injoy-toast-x';
    x.type = 'button';
    x.setAttribute('aria-label', '닫기');
    x.textContent = '×';
    x.addEventListener('click', dismiss);
    toast.appendChild(x);

    requestAnimationFrame(() => toast.classList.add('in'));
    if (role !== 'alert') timer = window.setTimeout(dismiss, 8000);
  };

  // 빈 라이브영역 먼저 → 다음 프레임에 내용 주입(낭독 신뢰성)
  document.body.appendChild(toast);
  requestAnimationFrame(fill);
}
