// 일일업무보고 (R3-2, 시안 r3-daily 확정 2026-11-13) — 대표 · 관리자 · 권한자만 (기존 사이트와 같음)
//   GET  /api/staff/report?date=2026-11-13  → 저장본(있으면) + 지금 자료로 새로 센 값(fresh) + 저장된 날짜 목록
//   POST /api/staff/report { date, data }   → 저장 (같은 날 다시 저장하면 덮어씀)
import { J, body, ip, device } from '../lib/http.js';
import { can } from '../core/permissions.js';
import { buildReport, cleanReport } from '../core/report.js';
import { reportRows, getReport, prevReport, reportDates, saveReport } from '../repo/report.js';
import { audit } from '../repo/audit.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

export async function staffReport(req, env, url, u) {
  const db = env.DB;
  if (!can(u, 'report.use')) return J({ ok: false, err: 'perm', msg: '일일업무보고는 대표 · 관리자 · 권한자만 볼 수 있습니다' }, 403);

  if (req.method === 'GET') {
    const date = url.searchParams.get('date') || today();
    if (!DATE.test(date) || date > today()) return J({ ok: false, err: 'input' }, 400);
    const [saved, prev, dates] = await Promise.all([getReport(db, date), prevReport(db, date), reportDates(db)]);
    // 기준일: 주소의 cutoff(화면에서 바꾼 값) → 그날 저장본 → 직전 저장본 → 2026-10-16
    const cut = url.searchParams.get('cutoff') || (saved && saved.data && saved.data.cutoff) || '';
    return J({ ok: true, date, today: today(), saved, fresh: buildReport(await reportRows(db), date, prev, cut), dates });
  }

  if (req.method === 'POST') {
    const b = await body(req) || {};
    if (!DATE.test(b.date || '') || b.date > today()) return J({ ok: false, err: 'input' }, 400);
    const data = cleanReport(b.data, b.date);
    if (!data || JSON.stringify(data).length > 60000) return J({ ok: false, err: 'input' }, 400);
    await saveReport(db, b.date, data, u.name);
    await audit(db, { who: u.name, act: '일일업무보고 저장', target: b.date, ip: ip(req), dev: device(req) });
    return J({ ok: true });
  }
  return J({ ok: false, err: 'notfound' }, 404);
}
