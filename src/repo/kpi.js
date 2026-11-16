// KPI 보드 자료 읽기 (R3-1) — 직원용. 개인정보 칸(이름 · 연락처 · 메모)은 읽지 않음, 예약방문의 신규고객 이름만 (가리기는 staff-api)
import { dashCards, asConsults } from './dash-cards.js';

export async function kpiRows(db) {
  const all = async (sql) => (await db.prepare(sql).all()).results || [];
  const [conv, dc, pub] = await Promise.all([
    all('SELECT unit_id, status, at FROM unit_conv'),
    dashCards(db),
    all('SELECT kind FROM public_units')
  ]);
  // 상담카드(대시보드)로 하나로 (2026-11-17 대표: 분양전환상담 카드 삭제) — 이름 · 담당 · 예약방문 · 계약할 호실만
  const { consults, logs } = asConsults(dc);
  const cards = consults.map(c => ({ id: c.id, kind: c.kind, unit_id: c.unit_id, name: c.name, progress: c.progress, mgr: c.mgr, writer: c.writer, at: c.at, book: c.book, contractUnit: c.contractUnit }));
  return { conv, cards, logs, pub };
}
