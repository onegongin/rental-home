// 공개 세대 읽기 — 게스트 API 전용 (R2). 공개용 사본(public_units)만, 호수(unit_id) · 누가 · 언제는 읽지 않음
export async function listPubGuest(db) {
  // 계약자DB 계약조건이 생겼거나(분양전환 계약 · 전세연장) 전환상태가 계약완료 · 신규입주면 손님에게 안 보임 (시안 r46) — 호수 · 계약자는 읽어 오지 않음
  return (await db.prepare("SELECT p.dong, p.band, p.type, p.kind, p.exclusive, p.deal FROM public_units p LEFT JOIN units u ON u.id = p.unit_id LEFT JOIN unit_conv c ON c.unit_id = p.unit_id WHERE coalesce(json_extract(u.data, '$.cond'), '') IN ('', '-') AND coalesce(c.status, '') NOT IN ('계약완료', '신규입주')").all()).results || [];
}
