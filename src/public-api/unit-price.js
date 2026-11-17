// 손님 호실 분양금액 (시안 r62 A안 확정 2026-11-18): 신규분양 대상 호실의 매입보장가 한 개만
//   대상 = 계약자DB 계약조건 빈칸 · 전환상태 계약완료 · 신규입주 아님 (그 밖 = 분양전환 완료 세대, 금액 없음)
//   혜택가 · 임대보증금 · 필요금액은 보내지 않음 (직원 화면만). 가격표를 공개 폴더에 넣지 않고 호실마다 서버에서
import { J } from '../lib/http.js';
import { UNIT } from '../core/units.js';
import { priceOf } from '../core/price.js';

export async function unitPrice(env, id) {
  if (!UNIT[id]) return J({ ok: false, err: 'notfound' }, 404);
  const db = env.DB;
  const u = await db.prepare("SELECT json_extract(data, '$.cond') AS c FROM units WHERE id = ?").bind(id).first();
  const c = await db.prepare('SELECT status FROM unit_conv WHERE unit_id = ?').bind(id).first();
  const done = !!(u && u.c && u.c !== '-') || !!(c && ['계약완료', '신규입주'].includes(c.status));
  const p = priceOf(id);
  return J({ ok: true, id, open: !done && !!(p && p.hedge), hedge: !done && p ? p.hedge : null }, 200);
}
