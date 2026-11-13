// 엑셀 내보내기용 읽기 (설계서 13.1) — 대표 · 관리자만 부르는 곳. 직원 API 밖으로는 쓰지 않는다
const parse = v => { try { return JSON.parse(v); } catch (e) { return null; } };
const all = async (db, sql, ...a) => (await db.prepare(sql).bind(...a).all()).results || [];

// 상담카드 전부 (지운 카드 'null' · 숨김 삭제(deleted) 는 뺌)
export async function cards(db) {
  return (await all(db, "SELECT k, v FROM kv WHERE s = 'c'")).map(r => parse(r.v)).filter(v => v && typeof v === 'object' && !v.deleted);
}

// 관심등록 원본 = 게스트 카드가 처음 들어왔을 때 모습 (직원이 나중에 고치기 전)
export async function firstVersions(db, ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 90) {
    const p = ids.slice(i, i + 90);
    const r = await all(db, "SELECT k, v FROM hist WHERE id IN (SELECT MIN(id) FROM hist WHERE s = 'c' AND k IN (" + p.map(() => '?').join(',') + ') GROUP BY k)', ...p);
    r.forEach(x => { out[x.k] = parse(x.v); });
  }
  return out;
}

// 세대 + 지금 소유자
export const units = db => all(db, `SELECT u.id, u.dong, u.ho, u.floor, u.type, u.block, u.occupancy, u.checked_at, p.name, p.phone, p.carrier, p.contacts, o.share, o.since, o.cause
  FROM units u LEFT JOIN unit_owners o ON o.unit_id = u.id AND o.is_current = 1 AND o.deleted_at IS NULL LEFT JOIN persons p ON p.id = o.person_id
  WHERE u.deleted_at IS NULL ORDER BY u.dong, u.ho`);

// 지금 임대차 (이사 나간 지난 계약은 includePast 일 때만)
export const tenancies = (db, includePast) => all(db, `SELECT t.*, u.dong, u.ho, u.type, p.name, p.phone FROM tenancies t JOIN units u ON u.id = t.unit_id LEFT JOIN persons p ON p.id = t.person_id
  WHERE t.deleted_at IS NULL` + (includePast ? '' : ' AND t.is_current = 1') + ' ORDER BY t.end_date, u.dong, u.ho');

export const listings = db => all(db, `SELECT l.*, u.dong, u.ho, u.type FROM listings l JOIN units u ON u.id = l.unit_id WHERE l.deleted_at IS NULL ORDER BY l.created_at DESC`);
