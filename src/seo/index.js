// 검색 노출 주소 (P6) — 게스트 누구나. 공개용 사본(public_listings)만 읽는다
//   /sitemap.xml · /rss.xml · /listings · /listings/{거래} · /listings/{매물번호} · /{INDEXNOW_KEY}.txt
//   + 안내 페이지 /plan · /plan/{타입} · /price · /dongho · /location (guide.js, 시안 seo-pages 확정 2026-11-05)
//   주소 기준은 SITE_URL (도메인이 정해지면 wrangler.jsonc vars 한 줄만 바꿈)
//   IndexNow: 공개 · 수정 · 비공개 순간 네이버 · Bing 에 '이 주소 바뀜' 알림 — INDEXNOW_KEY 비밀값이 있을 때만 (검색 등록 뒤 켬)
import { listingPage, listPage, gonePage, sitemap, rss, DEAL } from './pages.js';
import { isGuidePath, guideUrls, planIndex, planPage, pricePage, donghoPage, locationPage } from './guide.js';

const parse = v => { try { return JSON.parse(v); } catch (e) { return []; } };
const rowsOf = async (db, deal) => ((await db.prepare("SELECT * FROM public_listings WHERE ? = '' OR deal = ? ORDER BY urgent DESC, at DESC LIMIT 500").bind(deal || '', deal || '').all()).results || []);
export const baseOf = (env, url) => String(env.SITE_URL || (url ? url.origin : '')).replace(/\/$/, '');
const ULID = /^[0-9A-Z]{26}$/;

export const isSeoPath = (p, env) => isGuidePath(p.replace(/\/$/, '')) || p === '/sitemap.xml' || p === '/rss.xml' || p === '/listings' || p.startsWith('/listings/') || (!!env.INDEXNOW_KEY && p === '/' + env.INDEXNOW_KEY + '.txt');

const out = (text, type, status = 200, cache = 'no-cache') => new Response(text, { status, headers: { 'content-type': type + '; charset=utf-8', 'cache-control': cache } });
const HTML = 'text/html', XML = 'application/xml';

export async function seoApi(req, env, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return out('', 'text/plain', 405);
  const db = env.DB, p = url.pathname.replace(/\/$/, '') || '/', base = baseOf(env, url);
  if (env.INDEXNOW_KEY && p === '/' + env.INDEXNOW_KEY + '.txt') return out(env.INDEXNOW_KEY, 'text/plain');
  if (p === '/sitemap.xml') return out(sitemap(base, await rowsOf(db), guideUrls()), XML, 200, 'public, max-age=300');
  if (p === '/plan') return out(planIndex(base), HTML, 200, 'public, max-age=300');
  if (p.startsWith('/plan/')) { const h = planPage(base, p.slice(6), await rowsOf(db)); return h ? out(h, HTML) : out(gonePage(base), HTML, 404); }
  if (p === '/price') return out(pricePage(base), HTML, 200, 'public, max-age=300');
  if (p === '/dongho') return out(donghoPage(base), HTML, 200, 'public, max-age=300');
  if (p === '/location') return out(locationPage(base), HTML, 200, 'public, max-age=300');
  if (p === '/rss.xml') return out(rss(base, await rowsOf(db)), 'application/rss+xml', 200, 'public, max-age=300');
  if (p === '/listings') return out(listPage(base, await rowsOf(db)), HTML);
  const k = p.slice('/listings/'.length);
  if (DEAL[k]) return out(listPage(base, await rowsOf(db, k), k), HTML);
  if (ULID.test(k)) {
    const r = await db.prepare('SELECT * FROM public_listings WHERE id = ?').bind(k).first();
    // 공개 사본에 없으면 끝났거나 내린 매물 → 410 (영구 삭제 — 검색 결과에서 빠지게)
    return r ? out(listingPage(base, r), HTML) : out(gonePage(base), HTML, 410);
  }
  return out(gonePage(base), HTML, 404);
}

// ── IndexNow ────────────────────────────────────────
export const INDEXNOW = ['https://searchadvisor.naver.com/indexnow', 'https://api.indexnow.org/indexnow'];
// 바뀐 매물 → 그 매물 주소 + 목록 주소들. 기록은 seo_pings 표 (광고 탭 '검색 노출' 칸)
export async function seoPing(env, rows, why) {
  const key = env.INDEXNOW_KEY, base = baseOf(env);
  if (!key || !base) return 0;
  const urls = [...new Set(rows.flatMap(r => [base + '/listings/' + r.id, base + '/listings/' + r.deal]).concat([base + '/listings']))];
  const host = new URL(base).host, payload = JSON.stringify({ host, key, keyLocation: base + '/' + key + '.txt', urlList: urls });
  const job = Promise.all((env.INDEXNOW_API ? [env.INDEXNOW_API] : INDEXNOW).map(async to => {
    let status = 0;
    try { status = (await fetch(to, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: payload })).status; } catch (e) { status = 0; }
    await env.DB.prepare('INSERT INTO seo_pings (at, target, urls, why, status) VALUES (?, ?, ?, ?, ?)').bind(Date.now(), new URL(to).host, JSON.stringify(urls), String(why || '').slice(0, 60), status).run();
  })).catch(e => console.log('indexnow', e && e.message));
  if (env.ctx && env.ctx.waitUntil) env.ctx.waitUntil(job); else await job;
  return urls.length;
}

// 직원 광고 탭 '검색 노출' 칸
export async function seoStatus(env, url) {
  const db = env.DB, n = await db.prepare('SELECT COUNT(*) n, MAX(updated) u FROM public_listings').first();
  const pings = ((await db.prepare('SELECT at, target, urls, why, status FROM seo_pings ORDER BY id DESC LIMIT 12').all()).results || []).map(x => Object.assign(x, { urls: parse(x.urls) }));
  return { base: baseOf(env, url), indexnow: !!env.INDEXNOW_KEY, listings: n ? n.n : 0, updated: n ? n.u : null, pings };
}
