// 공개 세대 읽기 — 게스트 API 전용 (R2). 공개용 사본(public_units)만, 호수(unit_id) · 누가 · 언제는 읽지 않음
export async function listPubGuest(db) {
  return (await db.prepare('SELECT dong, band, type, kind, exclusive FROM public_units').all()).results || [];
}
