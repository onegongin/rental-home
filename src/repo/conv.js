// 세대 전환 상태 · 공개 세대 저장 (R2) — 직원용. 손님용 읽기는 repo/public-units.js
import { pubRow, canPub } from '../core/conv.js';

export async function listConv(db) {
  const conv = (await db.prepare('SELECT unit_id, status, move_out, memo, at, by FROM unit_conv').all()).results || [];
  const pub = (await db.prepare('SELECT unit_id, at, by FROM public_units').all()).results || [];
  return { conv, pub };
}

export const getConv = (db, id) => db.prepare('SELECT * FROM unit_conv WHERE unit_id = ?').bind(id).first();
export const isPubUnit = async (db, id) => !!(await db.prepare('SELECT 1 FROM public_units WHERE unit_id = ?').bind(id).first());

// 상태 저장. 공개 중인데 공개할 수 없는 상태가 되면 바로 내림 → true 돌려줌
//   done_at: 계약완료 · 신규입주가 된 시각 (그 사이를 오갈 땐 그대로, 벗어나면 지움) — 일일업무보고 10.16 이전/이후 · 금일계약
const DONE = ['계약완료', '신규입주'];
export async function setConv(db, id, v, by, now = Date.now()) {
  const old = await getConv(db, id);
  const keep = old && DONE.includes(old.status) && old.done_at;   // 계약완료 ↔ 신규입주 사이를 오가면 완료 시각 · 바로 전 상태 유지
  const done_at = DONE.includes(v.status) ? (keep ? old.done_at : now) : null;
  const done_from = DONE.includes(v.status) ? (keep ? old.done_from : (old && old.status) || null) : null;   // 청구서 '구분' (R3-3)
  await db.prepare('INSERT INTO unit_conv (unit_id, status, move_out, memo, at, by, done_at, done_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (unit_id) DO UPDATE SET status = excluded.status, move_out = excluded.move_out, memo = excluded.memo, at = excluded.at, by = excluded.by, done_at = excluded.done_at, done_from = excluded.done_from')
    .bind(id, v.status, v.move_out, v.memo, now, by, done_at, done_from).run();
  if (!(await isPubUnit(db, id))) return false;
  if (!canPub(v.status)) { await db.prepare('DELETE FROM public_units WHERE unit_id = ?').bind(id).run(); return true; }
  const r = pubRow(id, v.status);   // 공실 ↔ 퇴거확정(매물동의) 사이로 바뀌면 구분만 새로
  await db.prepare('UPDATE public_units SET kind = ? WHERE unit_id = ?').bind(r.kind, id).run();
  return false;
}

// 상담카드 진행상태 → 전환 상태 (R2 상담카드). 퇴거일 · 메모는 그대로 두고 상태만 (move_out 을 주면 그것도)
export async function syncConv(db, id, status, by, move_out) {
  const old = (await getConv(db, id)) || {};
  const v = { status, move_out: move_out || old.move_out || null, memo: old.memo || null };
  return { old: old.status || null, off: await setConv(db, id, v, by) };
}

// 공개 켜기 · 내리기. 켤 때 상태가 공개 불가면 'status' 돌려줌
export async function setPub(db, id, on, by, now = Date.now()) {
  if (!on) { await db.prepare('DELETE FROM public_units WHERE unit_id = ?').bind(id).run(); return 'ok'; }
  const c = await getConv(db, id), r = c && pubRow(id, c.status);
  if (!r) return 'status';
  await db.prepare('INSERT INTO public_units (unit_id, dong, band, type, kind, exclusive, at, by) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (unit_id) DO UPDATE SET kind = excluded.kind, at = excluded.at, by = excluded.by')
    .bind(id, r.dong, r.band, r.type, r.kind, r.exclusive, now, by).run();
  return 'ok';
}
