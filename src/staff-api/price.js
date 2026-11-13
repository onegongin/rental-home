// 분양가표 (R3-5, 시안 r3-price 확정 2026-11-13) — 로그인한 직원 누구나 (손님 API 에는 없음)
//   GET /api/staff/prices          → 300세대 10.16 혜택가 · 매입보장가 · 임대보증금 · 필요금액 · 가벽 · 테라스 · 전세연장
//   GET /api/staff/prices/101-401  → 한 세대
import { J } from '../lib/http.js';
import { ALL_PRICES, priceOf } from '../core/price.js';

export function staffPrice(req, env, url) {
  if (req.method !== 'GET') return J({ ok: false, err: 'notfound' }, 404);
  const m = url.pathname.match(/^\/api\/staff\/prices\/(\d+-\d+)$/);
  if (m) { const p = priceOf(m[1]); return p ? J({ ok: true, price: p }) : J({ ok: false, err: 'notfound' }, 404); }
  return J({ ok: true, rows: ALL_PRICES() });
}
