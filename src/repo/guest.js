import { ulid } from '../lib/id.js';
import { DEALS, termsOf, faceOf } from '../core/listings.js';
import { UNIT } from '../core/units.js';

// R2 (설계서 10.1): 게스트 '내 집 내놓기' → 거래 유형마다 매물 '확인중' 추가 (담당 미배정, 소유자 확인 전 공개 불가)
//   '새 줄 추가'만 — 매물 · 고객 표는 읽지 않는다
export async function insertGuestListings(db, card) {
  if (!card || card.kind !== 'owner' || !UNIT[card.unit] || !card.trades) return 0;
  const now = Date.now(), st = [];
  for (const deal of Object.keys(DEALS)) {
    if (!card.trades[deal]) continue;
    const id = ulid(), row = Object.assign({ id, unit_id: card.unit, deal, status: '확인중', pub: 'off', source: 'guest', card_id: card.id, writer: '게스트 등록', mgmt_items: '[]', at: now, created_at: now, ver: 1 }, faceOf(UNIT[card.unit].type), termsOf(deal, card.trades[deal]));
    const k = Object.keys(row);
    st.push(db.prepare('INSERT INTO listings (' + k.join(', ') + ') VALUES (' + k.map(() => '?').join(', ') + ')').bind(...k.map(x => row[x] ?? null)));
    st.push(db.prepare('INSERT INTO listing_events (listing_id, at, who, act, detail) VALUES (?, ?, ?, ?, ?)').bind(id, now, '게스트', '확인중', '관심등록 내 집 내놓기 · ' + DEALS[deal]));
  }
  if (st.length) await db.batch(st);
  return st.length / 2;
}

// 게스트 등록 저장 — '새 카드 추가'만. 읽기 · 수정 함수는 여기 두지 않는다 (public-api 전용)
export async function insertGuestCard(db, card) {
  const v = JSON.stringify(card), at = Date.now(), sv = at * 1000 + Math.floor(Math.random() * 999);
  await db.batch([
    db.prepare('INSERT INTO kv (s, k, v, at, by, sv) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (s, k) DO NOTHING').bind('c', card.id, v, at, '게스트', sv),
    db.prepare('INSERT INTO hist (s, k, v, at, by, sv) VALUES (?, ?, ?, ?, ?, ?)').bind('c', card.id, v, at, '게스트', sv)
  ]);
}

// 공개 매물 중개요청 저장 (2026-11-02) — '새 줄 추가'만. 확인 · 목록은 repo/broker.js (직원 쪽)
export function insertBroker(db, r) {
  const now = Date.now();
  return db.batch([
    db.prepare('INSERT INTO broker_reqs (id, listing_id, cid, name, phone, msg, label, ip, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(r.id, r.listing_id, r.cid, r.name, r.phone, r.msg || '', r.label || '', r.ip || '', now),
    db.prepare('INSERT INTO listing_events (listing_id, at, who, act, detail) VALUES (?, ?, ?, ?, ?)').bind(r.listing_id, now, '게스트', '중개요청 접수', '손님 ' + r.shown + ' · 공개 댓글')
  ]);
}
