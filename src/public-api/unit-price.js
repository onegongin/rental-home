// 손님 호실 분양금액 — 공개 동호배치표 (시안 r74 A안 확정 2026-11-24 대표):
//   모든 호실 = '분양전환 완료' (금액 안 보냄). 분양 호실을 손님이 구분하지 못하게 — 판매는 '현재 매물'에 직원이 골라 공개한 물건으로만
//   예전 (시안 r62 · r69): 신규분양 대상 호실만 매입보장가 · 관리 호실(pubSold) 스위치 — 다시 열려면 git 기록 참고
import { J } from '../lib/http.js';
import { UNIT } from '../core/units.js';

export async function unitPrice(env, id) {
  if (!UNIT[id]) return J({ ok: false, err: 'notfound' }, 404);
  return J({ ok: true, id, open: false, hedge: null }, 200);
}
