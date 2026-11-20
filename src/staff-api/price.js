// 분양가표 (R3-5, 시안 r3-price 확정 2026-11-13) — 로그인한 직원 누구나 (손님 API 에는 없음)
//   GET /api/staff/prices          → 300세대 10.16 혜택가 · 매입보장가 · 임대보증금 · 필요금액 · 가벽 · 테라스 · 전세연장
//   GET /api/staff/prices/101-401  → 한 세대
import { J } from '../lib/http.js';
import { ALL_PRICES, priceOf } from '../core/price.js';

// 전세연장 세대 = 현재 임대차 보증금(인상 금액, 만원 → 원)을 lease 로 붙임 (2026-11-21 대표) — dep(고객DB 처음 금액)은 그대로
async function leaseDeps(db) {
  try {
    const r = (await db.prepare("SELECT t.unit_id, t.deposit FROM tenancies t JOIN units u ON u.id = t.unit_id WHERE t.is_current = 1 AND t.deleted_at IS NULL AND t.deposit > 0 AND json_extract(u.data, '$.cond') = '전세연장'").all()).results || [];
    const o = {}; r.forEach(x => { o[x.unit_id] = Number(x.deposit) * 1e4; }); return o;
  } catch (e) { return {}; }
}
const withLease = (p, L) => p && L[p.id] ? Object.assign({}, p, { lease: L[p.id], needLease: Math.max(p.benefit - L[p.id], 0) }) : p;

export async function staffPrice(req, env, url) {
  if (req.method !== 'GET') return J({ ok: false, err: 'notfound' }, 404);
  const L = await leaseDeps(env.DB);
  const m = url.pathname.match(/^\/api\/staff\/prices\/(\d+-\d+)$/);
  if (m) { const p = priceOf(m[1]); return p ? J({ ok: true, price: withLease(p, L) }) : J({ ok: false, err: 'notfound' }, 404); }
  return J({ ok: true, rows: ALL_PRICES().map(p => withLease(p, L)) });
}
