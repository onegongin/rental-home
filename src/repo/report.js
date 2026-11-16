// 일일업무보고 읽기 · 저장 (R3-2) — 대표 · 관리자 · 권한자 전용 API 에서만 부름
import { parse } from './kv.js';
import { dashCards, asConsults } from './dash-cards.js';

export async function reportRows(db) {
  const all = async sql => (await db.prepare(sql).all()).results || [];
  const [conv, dc] = await Promise.all([all('SELECT unit_id, status, done_at FROM unit_conv'), dashCards(db)]);
  // 상담카드(대시보드)로 하나로 (2026-11-17 대표: 분양전환상담 카드 삭제)
  const { consults, logs } = asConsults(dc);
  const cards = consults.map(c => ({ id: c.id, kind: c.kind, name: c.name, progress: c.progress, book: c.book, intUnits: c.intUnits, ctype: c.ctype }));
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
