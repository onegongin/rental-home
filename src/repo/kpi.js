// KPI 보드 자료 읽기 (R3-1) — 직원용. 개인정보 칸(이름 · 연락처 · 메모)은 읽지 않음, 예약방문의 신규고객 이름만 (가리기는 staff-api)
import { parse } from './kv.js';

export async function kpiRows(db) {
  const all = async (sql) => (await db.prepare(sql).all()).results || [];
  const [conv, cards, logs, pub] = await Promise.all([
    all('SELECT unit_id, status, at FROM unit_conv'),
    all('SELECT id, kind, unit_id, name, progress, mgr, writer, data, at FROM consults WHERE deleted_at IS NULL'),
    all('SELECT l.consult_id, l.date, l.at, l.channel, c.kind, c.unit_id, c.mgr FROM consult_logs l JOIN consults c ON c.id = l.consult_id WHERE c.deleted_at IS NULL'),
    all('SELECT kind FROM public_units')
  ]);
  // data 에서는 예약방문 · 계약할 호실만 꺼냄
  cards.forEach(c => { const d = parse(c.data) || {}; c.book = d.book || null; c.contractUnit = d.contractUnit || null; delete c.data; });
  return { conv, cards, logs, pub };
}
