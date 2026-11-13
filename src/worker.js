// 단지 사이트 서버 (Cloudflare Worker + D1, 단지 정보는 public/daelasoo/data/site.json) — 주소 나누기만
// /api/* 만 이 코드가 처리하고, 나머지 화면 파일은 public 폴더에서 그대로 나갑니다.
//   /api/public/*  게스트 (로그인 없음)        → src/public-api/
//   /api/auth/*    기기 등록 · 로그인          → src/auth/
//   /api/staff/*   직원 (로그인 필요)          → src/staff-api/
//   /api/admin/*   직원 관리 · 감사기록        → src/staff-api/admin.js
//   /sitemap.xml · /rss.xml · /listings/*  검색로봇용 (공개 매물로 자동 생성) → src/seo/
import { J, sameOrigin } from './lib/http.js';
import { init } from './repo/schema.js';
import { repo, openDb } from './repo/index.js';
import { publicApi } from './public-api/index.js';
import { authApi, currentUser } from './auth/index.js';
import { staffApi } from './staff-api/index.js';
import { adminApi } from './staff-api/admin.js';
import { morning } from './notify/morning.js';
import { autoBackup } from './backup/index.js';
import { isSeoPath, seoApi } from './seo/index.js';
import { popCleanup } from './popups/index.js';

// 단지 주소 앞머리 = SITE_URL 의 경로 (예: /daelasoo). 검색용 주소는 그 아래에서만 만든다 — 맨 앞 / 는 rental-home 첫 화면
const basePath = env => { try { return new URL(env.SITE_URL).pathname.replace(/\/$/, ''); } catch (e) { return ''; } };
// /daelasoo/plan → /plan (앞머리가 없으면 그대로, 앞머리 밖 주소면 null)
export const subPath = (p, bp) => !bp ? p : (p === bp || p.startsWith(bp + '/')) ? (p.slice(bp.length) || '/') : null;

// 검색용 HTML 페이지 속 href="/…" · src="/…" 를 단지 앞머리 아래로 (/plan → /daelasoo/plan). 주소 전체(https://…)와 //… 는 그대로
export async function withBase(res, bp) {
  if (!bp || !/text\/html/.test(res.headers.get('content-type') || '')) return res;
  const h = (await res.text()).replace(/\b(href|src)="\/(?!\/)/g, '$1="' + bp + '/');
  return new Response(h, { status: res.status, headers: res.headers });
}

export default {
  async fetch(req, env0, ctx) {
    const url = new URL(req.url), p = url.pathname, sp = subPath(p, basePath(env0)), seo = sp !== null && isSeoPath(sp, env0);
    if (!p.startsWith('/api/') && !seo) return env0.ASSETS.fetch(req);
    const conn = openDb(env0);
    if (!conn) return J({ ok: false, err: 'DB 연결 없음 (wrangler.jsonc 의 d1_databases 또는 DB_DRIVER · SUPABASE_DB_URL 확인)' }, 500);
    const env = withDb(env0, ctx, conn);
    try { return await handle(req, env, url, p, seo, sp); }
    finally { env.ctx.done(); }
  },

  // 정해진 시간 자동 실행 (wrangler.jsonc triggers) — 매일 08:30 아침 요약 (UTC 23:30) · 03:00 자동 백업 (UTC 18:00)
  async scheduled(event, env0, ctx) {
    const conn = openDb(env0);
    if (!conn) return;
    const env = withDb(env0, ctx, conn);
    try {
      await init(env.DB);
      await repo(env).ready();
      // 03:00 = 자동 백업 + 팝업 정리 (기간 끝난 팝업 · 안 쓰는 그림/첨부 지움)
      env.ctx.waitUntil(event.cron === '0 18 * * *' ? autoBackup(env).finally(() => popCleanup(env).catch(() => {})) : morning(env, { by: '자동' }));
    } finally { env.ctx.done(); }
  }
};

// env.DB = 이번 요청의 DB · env.ctx = 알림을 응답 뒤에 보내는 ctx. 뒷일까지 다 끝나면 DB 연결을 닫음 (Supabase)
function withDb(env0, ctx, conn) {
  const jobs = [];
  const c = {
    waitUntil: pr => { jobs.push(pr); },
    done: () => ctx.waitUntil((async () => { for (let i = 0; i < jobs.length; i++) await Promise.resolve(jobs[i]).catch(() => {}); await conn.close(); })())
  };
  return Object.assign({}, env0, { ctx: c, DB: conn.db });
}

async function handle(req, env, url, p, seo, sp) {
  await init(env.DB);
  await repo(env).ready();
  if (seo) { const u2 = new URL(url); u2.pathname = sp; return withBase(await seoApi(req, env, u2), basePath(env)); }   // 사이트맵 · RSS · 매물 검색용 페이지 (앞머리 뗀 주소로)
  if (req.method !== 'GET' && !sameOrigin(req, url)) return J({ ok: false, err: 'origin' }, 403);

  if (p.startsWith('/api/public/')) return publicApi(req, env, url);
  if (p.startsWith('/api/auth/')) return authApi(req, env, url);

  const u = await currentUser(req, env);
  if (!u) return J({ ok: false, err: 'auth' }, 401);
  if (u.mustChange) return J({ ok: false, err: 'mustChange' }, 403);
  if (p.startsWith('/api/staff/')) return staffApi(req, env, url, u);
  if (p.startsWith('/api/admin/')) return adminApi(req, env, url, u);
  return J({ ok: false, err: 'notfound' }, 404);
}
