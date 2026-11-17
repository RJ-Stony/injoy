import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 통계 화면에 보여 줄 방문 수치를 빌드할 때 GA4에서 받아 온다(Google Analytics Data API).
 * 열쇠(서비스 계정 키, JSON)는 배포에서는 환경 변수 GA4_SA_KEY로, 로컬에서는 ~/.injoy/ga-key.json에서 읽는다.
 * 열쇠가 없거나 요청이 실패하면 null을 돌려주고, 통계 화면은 그 구역을 숨긴다(빌드는 깨지지 않는다).
 */

/** GA4 속성 ID(비밀이 아니다). 관리 → 속성 세부정보에 보인다 */
const PROPERTY = '564825050';
const DAYS = 28;
/** 예전 계수기에서 옮겨 온 다음 날. 이날부터 GA4가 센 값을 예전 값에 더한다(src/utils/views.ts) */
const SINCE = '2026-11-18';

export interface Traffic {
  days: number;
  users: number;
  views: number;
  sessions: number;
  /** 날짜별 방문자와 조회 수. 방문이 없던 날도 0으로 채운다 */
  daily: { date: string; users: number; views: number }[];
  pages: { path: string; views: number }[];
  sources: { name: string; sessions: number }[];
}

interface Key {
  client_email: string;
  private_key: string;
}

function loadKey(): Key | null {
  const local = path.join(os.homedir(), '.injoy', 'ga-key.json');
  const raw = process.env.GA4_SA_KEY || (fs.existsSync(local) ? fs.readFileSync(local, 'utf8') : '');
  if (!raw.trim()) return null;
  const key = JSON.parse(raw) as Key;
  return key.client_email && key.private_key ? key : null;
}

const b64 = (v: string | Buffer) => Buffer.from(v).toString('base64url');

/** 서비스 계정의 서명으로 한 시간짜리 읽기 전용 토큰을 받는다 */
async function accessToken(key: Key): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64(
    JSON.stringify({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 600,
    }),
  );
  const sign = crypto.createSign('RSA-SHA256').update(`${head}.${claim}`).sign(key.private_key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${claim}.${b64(sign)}`,
    }),
  });
  if (!res.ok) throw new Error(`토큰 발급 실패 ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

interface Row {
  dimensionValues?: { value: string }[];
  metricValues: { value: string }[];
}

async function reports(requests: object[]): Promise<Row[][] | null> {
  const key = loadKey();
  if (!key) return null;
  const token = await accessToken(key);
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:batchRunReports`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) throw new Error(`보고서 요청 실패 ${res.status}`);
  const body = (await res.json()) as { reports: { rows?: Row[] }[] };
  return body.reports.map((r) => r.rows ?? []);
}
const num = (row: Row | undefined, i: number) => Number(row?.metricValues[i]?.value ?? 0);

/** 옮긴 날 뒤로 쌓인 전체 방문 수와 글별 조회 수(글의 슬러그 → 조회 수) */
export interface Lifetime {
  sessions: number;
  views: Map<string, number>;
}
let lifeCache: Promise<Lifetime | null> | undefined;
export function getLifetime(): Promise<Lifetime | null> {
  return (lifeCache ??= loadLifetime().catch((e) => {
    console.warn(`[ga] 누적 수치를 받지 못해 예전 값만 보여 준다: ${(e as Error).message}`);
    return null;
  }));
}
async function loadLifetime(): Promise<Lifetime | null> {
  // 시작하는 날이 아직 오지 않았으면 물을 것이 없다(GA4는 앞선 시작 날짜를 거절한다)
  if (new Date().toISOString().slice(0, 10) < SINCE) return { sessions: 0, views: new Map() };
  const dateRanges = [{ startDate: SINCE, endDate: 'today' }];
  const got = await reports([
    { dateRanges, metrics: [{ name: 'sessions' }] },
    { dateRanges, dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }], limit: 5000 },
  ]);
  if (!got) return null;
  const views = new Map<string, number>();
  for (const row of got[1]) {
    // 주소가 글(/posts/<슬러그>/)인 것만 센다. 같은 글이 주소 표기만 달리 잡힌 것은 합친다
    const slug = decodeURIComponent(row.dimensionValues![0].value).match(/\/posts\/([^/]+)\/?$/)?.[1];
    if (slug) views.set(slug, (views.get(slug) ?? 0) + num(row, 0));
  }
  return { sessions: num(got[0][0], 0), views };
}

let cache: Promise<Traffic | null> | undefined;
export function getTraffic(): Promise<Traffic | null> {
  return (cache ??= load().catch((e) => {
    console.warn(`[ga] 방문 수치를 받지 못해 통계 화면에서 그 구역을 숨긴다: ${(e as Error).message}`);
    return null;
  }));
}

async function load(): Promise<Traffic | null> {
  const dateRanges = [{ startDate: `${DAYS - 1}daysAgo`, endDate: 'today' }];
  const metric = (name: string) => ({ name });
  const got = await reports([
    { dateRanges, metrics: ['activeUsers', 'screenPageViews', 'sessions'].map(metric) },
    { dateRanges, dimensions: [{ name: 'date' }], metrics: ['activeUsers', 'screenPageViews'].map(metric) },
    {
      dateRanges,
      dimensions: [{ name: 'pagePath' }],
      metrics: [metric('screenPageViews')],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 30,
    },
    {
      dateRanges,
      dimensions: [{ name: 'sessionSource' }],
      metrics: [metric('sessions')],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 6,
    },
  ]);
  if (!got) return null;
  const [total, byDate, byPage, bySource] = got;

  // 방문이 없던 날은 응답에 없다. 28일을 모두 채워 그래프의 가로가 날짜와 맞게 한다
  const seen = new Map(byDate.map((r) => [r.dimensionValues![0].value, r]));
  const daily = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(Date.now() - (DAYS - 1 - i) * 86400000);
    const id = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const row = seen.get(id);
    return { date: `${id.slice(4, 6)}.${id.slice(6)}`, users: num(row, 0), views: num(row, 1) };
  });

  return {
    days: DAYS,
    users: num(total[0], 0),
    views: num(total[0], 1),
    sessions: num(total[0], 2),
    daily,
    pages: byPage.map((r) => ({ path: r.dimensionValues![0].value, views: num(r, 0) })),
    sources: bySource.map((r) => ({ name: r.dimensionValues![0].value, sessions: num(r, 0) })),
  };
}
