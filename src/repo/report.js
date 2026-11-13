// 일일업무보고 읽기 · 저장 (R3-2) — 대표 · 관리자 · 권한자 전용 API 에서만 부름
import { parse } from './kv.js';

export async function reportRows(db) {
  const all = async sql => (await db.prepare(sql).all()).results || [];
  const [conv, logs, cards] = await Promise.all([
    all('SELECT unit_id, status, done_at FROM unit_conv'),
    all('SELECT l.consult_id, l.date, l.at, l.channel, l.memo, c.kind FROM consult_logs l JOIN consults c ON c.id = l.consult_id WHERE c.deleted_at IS NULL'),
    all('SELECT id, kind, name, progress, data FROM consults WHERE deleted_at IS NULL')
  ]);
  cards.forEach(c => { const d = parse(c.data) || {}; c.book = d.book || null; c.intUnits = Array.isArray(d.intUnits) ? d.intUnits : []; c.ctype = d.ctype || ''; delete c.data; });
  return { conv, logs, cards };
}

export async function getReport(db, date) {
  const r = await db.prepare('SELECT * FROM daily_reports WHERE date = ?').bind(date).first();
  return r ? { data: parse(r.data), saved_at: r.saved_at, saved_by: r.saved_by } : null;
}
// 그날 전 마지막 저장 보고서 (근무인원 · 기준일 · 명일 업무를 이어받음)
export async function prevReport(db, date) {
  const r = await db.prepare('SELECT data FROM daily_reports WHERE date < ? ORDER BY date DESC LIMIT 1').bind(date).first();
  return r ? parse(r.data) : null;
}
export async function reportDates(db) {
  return ((await db.prepare('SELECT date, saved_at, saved_by FROM daily_reports ORDER BY date DESC LIMIT 400').all()).results || []);
}
export async function saveReport(db, date, data, by, now = Date.now()) {
  await db.prepare('INSERT INTO daily_reports (date, data, saved_at, saved_by) VALUES (?, ?, ?, ?) ON CONFLICT (date) DO UPDATE SET data = excluded.data, saved_at = excluded.saved_at, saved_by = excluded.saved_by')
    .bind(date, JSON.stringify(data), now, by).run();
}
