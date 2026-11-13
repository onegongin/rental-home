// KPI 보드 (R3-1, 시안 r3-kpi 확정 2026-11-13) — 직원 누구나 (숫자 · 호실 · 담당만)
//   GET /api/staff/kpi?days=30  → 세대별 상태 · 담당 · 마지막 상담, 미상담 세대, 상담 활동, 담당자별, 오늘 · 내일 예약방문
//   예약방문의 신규고객 이름은 card.raw 없으면 가림
import { J } from '../lib/http.js';
import { can } from '../core/permissions.js';
import { maskName } from '../core/mask.js';
import { buildKpi } from '../core/kpi.js';
import { kpiRows } from '../repo/kpi.js';
import { pendingLeads } from '../repo/consult.js';

export async function staffKpi(req, env, url, u) {
  if (req.method !== 'GET') return J({ ok: false, err: 'notfound' }, 404);
  const days = [14, 30, 60].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
  const k = buildKpi(await kpiRows(env.DB), Date.now(), days);
  k.books = k.books.map(b => ({ id: b.id, kind: b.kind, unit: b.unit, at: b.at, day: b.day, mgr: b.mgr, name: b.kind === 'new' ? (can(u, 'card.raw', { writer: b.writer, mgr: b.mgr }) ? b.name : maskName(b.name)) : '' }));
  k.leads = (await pendingLeads(env.DB)).length;
  return J(Object.assign({ ok: true }, k));
}
