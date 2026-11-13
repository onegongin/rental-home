// 공개 매물 중개요청 (2026-11-02, 시안 preview/broker-request 확정)
//   읽기 · 확인은 직원 쪽(staff-api)만. 게스트 쪽 '새 줄 추가'는 repo/guest.js insertBroker
const COLS = 'id, listing_id, cid, name, phone, msg, label, at, claim_by, claim_at';

export async function listBroker(db, limit = 100) {
  const r = await db.prepare('SELECT ' + COLS + ' FROM broker_reqs ORDER BY at DESC LIMIT ?').bind(limit).all();
  return r.results || [];
}

export const getBroker = (db, id) => db.prepare('SELECT ' + COLS + ' FROM broker_reqs WHERE id = ?').bind(id).first();

// 첫 확인: 아직 아무도 확인 안 했을 때만 바뀜 (동시에 눌러도 한 명만)
export async function claimBroker(db, id, who) {
  const r = await db.prepare('UPDATE broker_reqs SET claim_by = ?, claim_at = ? WHERE id = ? AND claim_by IS NULL').bind(who, Date.now(), id).run();
  return !!(r.meta && r.meta.changes);
}
