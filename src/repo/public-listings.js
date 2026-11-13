// 공개 매물 읽기 — 게스트 API 전용. 공개용 사본(public_listings)만 읽는다 (매물 원본 · 고객 · 소유자 표는 읽지 않음)
const parse = v => { try { return JSON.parse(v); } catch (e) { return []; } };

export async function listPublic(db, deal) {
  const r = await db.prepare("SELECT * FROM public_listings WHERE ? = '' OR deal = ? ORDER BY urgent DESC, at DESC LIMIT 300").bind(deal, deal).all();
  return (r.results || []).map(x => Object.assign({}, x, { urgent: !!x.urgent, mgmt_items: parse(x.mgmt_items) }));
}

// 최근 거래완료 (30일) — 거래완료 사본(public_done)만 읽음. 날짜는 순서에만 쓰고 보내지 않음
export async function listDone(db, now = Date.now()) {
  const r = await db.prepare('SELECT deal, type, block, kind, exclusive FROM public_done WHERE done_at >= ? ORDER BY done_at DESC LIMIT 30').bind(now - 30 * 864e5).all();
  return r.results || [];
}

export const isPublic = async (db, id) => !!(await db.prepare('SELECT 1 FROM public_listings WHERE id = ?').bind(id).first());
